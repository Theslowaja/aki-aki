// src/utils/keyStore.js
/**
 * KEY STORE
 * Menyimpan API key yang valid beserta metadata-nya.
 * Di production, ganti ini dengan database (PostgreSQL, MongoDB, dll).
 *
 * Struktur key:
 * {
 *   key: string,          // API key hash
 *   label: string,        // Nama/label key
 *   createdAt: Date,
 *   expiresAt: Date|null, // null = tidak expired
 *   isActive: boolean,
 *   requestCount: number, // Total request
 *   lastUsedAt: Date|null,
 * }
 */

const crypto = require("crypto");
const logger = require("./logger");

// In-memory store
// Format: Map<hashedKey, keyData>
const keyStore = new Map();

/**
 * Hash API key menggunakan SHA-256 (tidak simpan plain text)
 */
function hashKey(key) {
  return crypto.createHash("sha256").update(key).digest("hex");
}

/**
 * Generate API key baru yang kuat
 * Format: aki_<32 bytes hex>
 */
function generateApiKey() {
  const raw = crypto.randomBytes(32).toString("hex");
  return `aki_${raw}`;
}

/**
 * Daftarkan key baru ke store
 */
function registerKey(key, label = "default", expiresInDays = null) {
  const hashed = hashKey(key);
  const now = new Date();

  const keyData = {
    keyHash: hashed,
    label,
    createdAt: now,
    expiresAt: expiresInDays
      ? new Date(now.getTime() + expiresInDays * 86_400_000)
      : null,
    isActive: true,
    requestCount: 0,
    lastUsedAt: null,
  };

  keyStore.set(hashed, keyData);
  logger.info(`API key registered: [${label}]`);
  return keyData;
}

/**
 * Validasi key — return keyData jika valid, null jika tidak
 */
function validateKey(key) {
  if (!key || typeof key !== "string") return null;

  const hashed = hashKey(key);
  const keyData = keyStore.get(hashed);

  if (!keyData) return null;
  if (!keyData.isActive) return null;

  // Cek expired
  if (keyData.expiresAt && new Date() > keyData.expiresAt) {
    // Auto-deactivate
    keyData.isActive = false;
    logger.warn(`API key expired and deactivated: [${keyData.label}]`);
    return null;
  }

  // Update usage stats
  keyData.requestCount++;
  keyData.lastUsedAt = new Date();

  return keyData;
}

/**
 * Revoke / nonaktifkan key
 */
function revokeKey(key) {
  const hashed = hashKey(key);
  const keyData = keyStore.get(hashed);
  if (!keyData) return false;

  keyData.isActive = false;
  logger.info(`API key revoked: [${keyData.label}]`);
  return true;
}

/**
 * Ambil semua key (tanpa plain-text key)
 */
function listKeys() {
  return Array.from(keyStore.values()).map(({ keyHash, ...rest }) => rest);
}

module.exports = {
  generateApiKey,
  registerKey,
  validateKey,
  revokeKey,
  listKeys,
  hashKey,
};
