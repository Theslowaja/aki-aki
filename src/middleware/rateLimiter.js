// src/middleware/rateLimiter.js
/**
 * RATE LIMITER BERLAPIS
 *
 * Layer 1: Per IP  — proteksi global dari bots/scanner
 * Layer 2: Per API Key — fairness antar pengguna
 * Layer 3: Per Key + Endpoint sensitif (create session) — lebih ketat
 */

const rateLimit = require("express-rate-limit");
const config = require("../config");
const logger = require("../utils/logger");
const { hashKey } = require("../utils/keyStore");

// ─── Handler saat limit terlampaui ───────────────────────────────────────────

function onLimitReached(req, res, options) {
  const identifier = req.keyData
    ? `[${req.keyData.label}]`
    : `IP:${req.ip}`;

  logger.warn(
    `Rate limit hit: ${identifier} | ${req.method} ${req.path} | ` +
    `Retry-After: ${Math.ceil(options.windowMs / 1000)}s`
  );
}

function limitHandler(req, res, next, options) {
  onLimitReached(req, res, options);
  res.status(429).json({
    success: false,
    error: "TOO_MANY_REQUESTS",
    message: "Terlalu banyak permintaan. Silakan tunggu sebelum mencoba lagi.",
    retryAfterMs: options.windowMs,
    retryAfterSeconds: Math.ceil(options.windowMs / 1000),
  });
}

// ─── LAYER 1: Global per IP ───────────────────────────────────────────────────

const globalRateLimiter = rateLimit({
  windowMs: config.rateLimit.global.windowMs,
  max: config.rateLimit.global.max,
  standardHeaders: true,   // RateLimit-* headers (RFC 6585)
  legacyHeaders: false,    // Nonaktifkan X-RateLimit-* lama
  handler: limitHandler,
  keyGenerator: (req) => req.ip,
  message: undefined,      // Pakai custom handler
  skip: (req) => {
    // Skip untuk endpoint health check
    return req.path === "/health";
  },
});

// ─── LAYER 2: Per API Key ─────────────────────────────────────────────────────

// In-memory counter per key (sederhana, untuk demo)
// Di production: gunakan Redis dengan sliding window
const keyCounters = new Map();

function perKeyRateLimiter(req, res, next) {
  // Hanya berlaku setelah autentikasi
  if (!req.keyData) return next();

  const key = req.keyData.keyHash;
  const now = Date.now();
  const windowMs = config.rateLimit.perKey.windowMs;
  const maxReq = config.rateLimit.perKey.max;

  // Ambil atau init counter
  if (!keyCounters.has(key)) {
    keyCounters.set(key, { count: 0, windowStart: now });
  }

  const counter = keyCounters.get(key);

  // Reset window jika sudah lewat
  if (now - counter.windowStart > windowMs) {
    counter.count = 0;
    counter.windowStart = now;
  }

  counter.count++;

  // Set headers informatif
  res.setHeader("X-RateLimit-Limit-Key", maxReq);
  res.setHeader("X-RateLimit-Remaining-Key", Math.max(0, maxReq - counter.count));
  res.setHeader(
    "X-RateLimit-Reset-Key",
    Math.ceil((counter.windowStart + windowMs) / 1000)
  );

  if (counter.count > maxReq) {
    const retryAfter = Math.ceil((counter.windowStart + windowMs - now) / 1000);
    logger.warn(
      `Key rate limit: [${req.keyData.label}] exceeded ${maxReq} req/${windowMs/1000}s`
    );
    return res.status(429).json({
      success: false,
      error: "KEY_RATE_LIMIT_EXCEEDED",
      message: `Batas request untuk API key ini terlampaui.`,
      retryAfterSeconds: retryAfter,
    });
  }

  next();
}

// ─── LAYER 3: Session creation (sangat ketat) ─────────────────────────────────

const sessionCounters = new Map();

function sessionCreationLimiter(req, res, next) {
  if (!req.keyData) return next();

  const key = req.keyData.keyHash;
  const now = Date.now();
  const windowMs = config.rateLimit.session.windowMs;
  const maxSessions = config.rateLimit.session.max;

  if (!sessionCounters.has(key)) {
    sessionCounters.set(key, { count: 0, windowStart: now });
  }

  const counter = sessionCounters.get(key);

  if (now - counter.windowStart > windowMs) {
    counter.count = 0;
    counter.windowStart = now;
  }

  counter.count++;

  if (counter.count > maxSessions) {
    const retryAfter = Math.ceil((counter.windowStart + windowMs - now) / 1000);
    logger.warn(
      `Session creation limit: [${req.keyData.label}] exceeded ${maxSessions}/${windowMs/1000}s`
    );
    return res.status(429).json({
      success: false,
      error: "SESSION_CREATION_LIMIT",
      message: `Batas pembuatan sesi baru terlampaui. Gunakan sesi yang ada atau tunggu.`,
      retryAfterSeconds: retryAfter,
    });
  }

  next();
}

// Cleanup counter lama secara periodik (mencegah memory leak)
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of keyCounters) {
    if (now - v.windowStart > config.rateLimit.perKey.windowMs * 2) {
      keyCounters.delete(k);
    }
  }
  for (const [k, v] of sessionCounters) {
    if (now - v.windowStart > config.rateLimit.session.windowMs * 2) {
      sessionCounters.delete(k);
    }
  }
}, 10 * 60 * 1000); // Setiap 10 menit

module.exports = {
  globalRateLimiter,
  perKeyRateLimiter,
  sessionCreationLimiter,
};
