// src/middleware/security.js
/**
 * MIDDLEWARE KEAMANAN
 * - Helmet: security headers
 * - CORS: whitelist origin
 * - Input sanitization: mencegah injection
 * - Request size limit: mencegah DoS
 */

const helmet = require("helmet");
const cors = require("cors");
const config = require("../config");
const logger = require("../utils/logger");

// ─── Helmet (Security Headers) ────────────────────────────────────────────────

const helmetMiddleware = helmet({
  // Content Security Policy
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'"],
      imgSrc: ["'self'"],
      connectSrc: ["'self'"],
    },
  },
  // Prevent clickjacking
  frameguard: { action: "deny" },
  // Hide X-Powered-By
  hidePoweredBy: true,
  // Force HTTPS (aktifkan di production dengan HTTPS)
  hsts: config.server.env === "production"
    ? { maxAge: 31_536_000, includeSubDomains: true, preload: true }
    : false,
  // Prevent MIME sniffing
  noSniff: true,
  // XSS Filter
  xssFilter: true,
  // Referrer Policy
  referrerPolicy: { policy: "strict-origin-when-cross-origin" },
  // Permissions Policy
  permittedCrossDomainPolicies: { permittedPolicies: "none" },
});

// ─── CORS ─────────────────────────────────────────────────────────────────────

const corsMiddleware = cors({
  origin: (origin, callback) => {
    // Izinkan request tanpa origin (Postman, curl, server-to-server)
    if (!origin) return callback(null, true);

    const allowed = config.cors.allowedOrigins;

    // Mode wildcard
    if (allowed.includes("*")) return callback(null, true);

    if (allowed.includes(origin)) {
      return callback(null, true);
    }

    logger.warn(`CORS blocked: origin "${origin}" tidak ada di whitelist`);
    return callback(new Error(`Origin "${origin}" tidak diizinkan oleh CORS policy.`), false);
  },
  methods: ["GET", "POST", "DELETE"],
  allowedHeaders: ["Content-Type", "X-API-Key", "Authorization"],
  exposedHeaders: [
    "X-RateLimit-Limit",
    "X-RateLimit-Remaining",
    "X-RateLimit-Reset",
    "X-RateLimit-Limit-Key",
    "X-RateLimit-Remaining-Key",
  ],
  maxAge: 86_400, // Cache preflight selama 1 hari
});

// ─── Error handler CORS ───────────────────────────────────────────────────────

function corsErrorHandler(err, req, res, next) {
  if (err.message && err.message.includes("CORS")) {
    return res.status(403).json({
      success: false,
      error: "CORS_BLOCKED",
      message: err.message,
    });
  }
  next(err);
}

// ─── Input sanitizer ──────────────────────────────────────────────────────────

/**
 * Sanitasi input dari body/params untuk mencegah injeksi berbahaya.
 * Jika deteksi pola mencurigakan, tolak request.
 */
function inputSanitizer(req, res, next) {
  // Cek semua string input
  const suspicious = checkSuspicious(req.body) || checkSuspicious(req.params) || checkSuspicious(req.query);

  if (suspicious) {
    logger.warn(`Suspicious input dari IP ${req.ip}: ${suspicious}`);
    return res.status(400).json({
      success: false,
      error: "INVALID_INPUT",
      message: "Input mengandung karakter atau pola yang tidak diizinkan.",
    });
  }

  next();
}

function checkSuspicious(obj, depth = 0) {
  if (depth > 5) return null; // Proteksi dari deeply nested objects
  if (!obj || typeof obj !== "object") return null;

  const SUSPICIOUS_PATTERNS = [
    /<script/i,
    /javascript:/i,
    /on\w+\s*=/i,       // Event handlers (onclick=, etc)
    /\$\{/,             // Template injection
    /\.\.\//,           // Path traversal
    /exec\s*\(/i,
    /eval\s*\(/i,
  ];

  for (const [key, val] of Object.entries(obj)) {
    if (typeof val === "string") {
      for (const pattern of SUSPICIOUS_PATTERNS) {
        if (pattern.test(val)) {
          return `Field "${key}" mengandung pola berbahaya: ${pattern}`;
        }
      }
    } else if (typeof val === "object" && val !== null) {
      const nested = checkSuspicious(val, depth + 1);
      if (nested) return nested;
    }
  }

  return null;
}

// ─── Request logger ───────────────────────────────────────────────────────────

function requestLogger(req, res, next) {
  const start = Date.now();

  res.on("finish", () => {
    const duration = Date.now() - start;
    const keyLabel = req.keyData ? `[${req.keyData.label}]` : "[no-key]";

    const logLevel = res.statusCode >= 500
      ? "error"
      : res.statusCode >= 400
      ? "warn"
      : "info";

    logger[logLevel](
      `${req.method} ${req.path} ${res.statusCode} ${duration}ms ${keyLabel} IP:${req.ip}`
    );
  });

  next();
}

// ─── Global error handler ─────────────────────────────────────────────────────

function globalErrorHandler(err, req, res, next) {
  logger.error(`Unhandled error: ${err.message}`, { stack: err.stack });

  // Jangan bocorkan detail error di production
  const isDev = config.server.isDev;

  res.status(500).json({
    success: false,
    error: "INTERNAL_SERVER_ERROR",
    message: "Terjadi kesalahan di server.",
    ...(isDev && { details: err.message, stack: err.stack }),
  });
}

module.exports = {
  helmetMiddleware,
  corsMiddleware,
  corsErrorHandler,
  inputSanitizer,
  requestLogger,
  globalErrorHandler,
};
