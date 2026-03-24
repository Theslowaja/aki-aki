// src/config.js
require("dotenv").config();

const config = {
  server: {
    port: parseInt(process.env.PORT, 10) || 3000,
    env: process.env.NODE_ENV || "development",
    isDev: (process.env.NODE_ENV || "development") === "development",
  },

  auth: {
    masterApiKey: process.env.MASTER_API_KEY || null,
  },

  rateLimit: {
    // Per IP - proteksi global
    global: {
      windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 60_000,
      max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) || 30,
    },
    // Per API Key
    perKey: {
      windowMs: parseInt(process.env.KEY_RATE_LIMIT_WINDOW_MS, 10) || 60_000,
      max: parseInt(process.env.KEY_RATE_LIMIT_MAX, 10) || 50,
    },
    // Khusus create session (lebih ketat)
    session: {
      windowMs: parseInt(process.env.SESSION_RATE_LIMIT_WINDOW_MS, 10) || 60_000,
      max: parseInt(process.env.SESSION_RATE_LIMIT_MAX, 10) || 5,
    },
  },

  session: {
    ttlSeconds: parseInt(process.env.SESSION_TTL_SECONDS, 10) || 3600,
    maxPerKey: parseInt(process.env.MAX_SESSIONS_PER_KEY, 10) || 10,
  },

  redis: {
    url: process.env.REDIS_URL || "redis://localhost:6379",
    use: process.env.USE_REDIS === "true",
  },

  cors: {
    allowedOrigins: (process.env.ALLOWED_ORIGINS || "*")
      .split(",")
      .map((o) => o.trim()),
  },

  logging: {
    level: process.env.LOG_LEVEL || "info",
    toFile: process.env.LOG_TO_FILE === "true",
  },
};

// Validasi config kritis
function validateConfig() {
  const warnings = [];

  if (!config.auth.masterApiKey) {
    warnings.push(
      "⚠️  MASTER_API_KEY tidak diset! Set di .env sebelum production."
    );
  }

  if (config.server.env === "production") {
    if (config.cors.allowedOrigins.includes("*")) {
      warnings.push("⚠️  CORS diset ke '*' di production — tidak disarankan!");
    }
    if (!config.redis.use) {
      warnings.push(
        "⚠️  USE_REDIS=false di production — rate limit tidak persistent!"
      );
    }
  }

  warnings.forEach((w) => console.warn(w));
}

validateConfig();

module.exports = config;
