// src/utils/sessionManager.js
/**
 * SESSION MANAGER
 * Mengelola sesi game Akinator per pengguna.
 * Setiap sesi terikat ke API key.
 *
 * Di production: simpan di Redis agar scalable.
 */

const { v4: uuidv4 } = require("uuid");
const config = require("../config");
const logger = require("./logger");

// Map<sessionId, sessionData>
const sessions = new Map();

// Map<keyHash, Set<sessionId>> — tracking sessions per key
const keySessionIndex = new Map();

/**
 * Buat sesi baru
 */
function createSession(keyHash, akinatorInstance) {
  // Cek limit sesi per key
  const keySessions = keySessionIndex.get(keyHash) || new Set();
  if (keySessions.size >= config.session.maxPerKey) {
    // Hapus sesi terlama
    const oldest = findOldestSession(keySessions);
    if (oldest) destroySession(oldest);
  }

  const sessionId = uuidv4();
  const now = Date.now();

  const sessionData = {
    id: sessionId,
    keyHash,
    akinator: akinatorInstance,
    createdAt: now,
    lastActivityAt: now,
    expiresAt: now + config.session.ttlSeconds * 1000,
    questionCount: 0,
    isComplete: false,
  };

  sessions.set(sessionId, sessionData);

  // Index ke key
  if (!keySessionIndex.has(keyHash)) {
    keySessionIndex.set(keyHash, new Set());
  }
  keySessionIndex.get(keyHash).add(sessionId);

  logger.debug(`Session created: ${sessionId} (key: ${keyHash.slice(0, 8)}...)`);
  return sessionId;
}

/**
 * Ambil sesi berdasarkan ID, validasi TTL
 */
function getSession(sessionId) {
  const session = sessions.get(sessionId);
  if (!session) return null;

  // Cek expired
  if (Date.now() > session.expiresAt) {
    destroySession(sessionId);
    return null;
  }

  // Update last activity & perpanjang TTL
  session.lastActivityAt = Date.now();
  session.expiresAt = Date.now() + config.session.ttlSeconds * 1000;

  return session;
}

/**
 * Hapus sesi
 */
function destroySession(sessionId) {
  const session = sessions.get(sessionId);
  if (!session) return;

  // Hapus dari index
  const keySessions = keySessionIndex.get(session.keyHash);
  if (keySessions) {
    keySessions.delete(sessionId);
    if (keySessions.size === 0) keySessionIndex.delete(session.keyHash);
  }

  sessions.delete(sessionId);
  logger.debug(`Session destroyed: ${sessionId}`);
}

/**
 * Tandai sesi sebagai complete
 */
function completeSession(sessionId) {
  const session = sessions.get(sessionId);
  if (session) session.isComplete = true;
}

/**
 * Cari sesi terlama dari set sessionId
 */
function findOldestSession(sessionIds) {
  let oldest = null;
  let oldestTime = Infinity;

  for (const id of sessionIds) {
    const s = sessions.get(id);
    if (s && s.createdAt < oldestTime) {
      oldestTime = s.createdAt;
      oldest = id;
    }
  }
  return oldest;
}

/**
 * Cleanup background — hapus sesi expired secara periodik
 */
function startCleanupJob(intervalMs = 5 * 60 * 1000) {
  setInterval(() => {
    const now = Date.now();
    let cleaned = 0;

    for (const [id, session] of sessions) {
      if (now > session.expiresAt) {
        destroySession(id);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.info(`Session cleanup: removed ${cleaned} expired session(s). Active: ${sessions.size}`);
    }
  }, intervalMs);
}

/**
 * Stats untuk monitoring
 */
function getStats() {
  return {
    activeSessions: sessions.size,
    activeKeys: keySessionIndex.size,
  };
}

module.exports = {
  createSession,
  getSession,
  destroySession,
  completeSession,
  startCleanupJob,
  getStats,
};
