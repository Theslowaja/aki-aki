// src/middleware/auth.js
/**
 * MIDDLEWARE AUTENTIKASI API KEY
 *
 * Key bisa dikirim via:
 *  - Header: X-API-Key: aki_xxx
 *  - Bearer token: Authorization: Bearer aki_xxx
 *
 * TIDAK disarankan via query string (terekspos di log server).
 */

const { validateKey } = require("../utils/keyStore");
const logger = require("../utils/logger");

function authMiddleware(req, res, next) {
  // Ekstrak key dari header
  let apiKey =
    req.headers["x-api-key"] ||
    extractBearerToken(req.headers["authorization"]);

  if (!apiKey) {
    return res.status(401).json({
      success: false,
      error: "UNAUTHORIZED",
      message: "API key diperlukan. Kirim via header X-API-Key atau Authorization: Bearer <key>",
    });
  }

  // Bersihkan whitespace
  apiKey = apiKey.trim();

  // Validasi format dasar (prefix: aki_)
  if (!apiKey.startsWith("aki_")) {
    logger.warn(`Auth: format key tidak valid dari IP ${req.ip}`);
    return res.status(401).json({
      success: false,
      error: "INVALID_KEY_FORMAT",
      message: "Format API key tidak valid.",
    });
  }

  // Validasi ke store
  const keyData = validateKey(apiKey);

  if (!keyData) {
    logger.warn(`Auth: key tidak valid dari IP ${req.ip}`);
    return res.status(403).json({
      success: false,
      error: "FORBIDDEN",
      message: "API key tidak valid, expired, atau sudah direvoke.",
    });
  }

  // Attach keyData ke request untuk digunakan di handler
  req.keyData = keyData;

  logger.debug(`Auth OK: [${keyData.label}] dari ${req.ip}`);
  next();
}

/**
 * Ekstrak token dari header Authorization: Bearer <token>
 */
function extractBearerToken(authHeader) {
  if (!authHeader) return null;
  const parts = authHeader.split(" ");
  if (parts.length === 2 && parts[0].toLowerCase() === "bearer") {
    return parts[1];
  }
  return null;
}

module.exports = authMiddleware;
