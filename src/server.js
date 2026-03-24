// src/server.js
/**
 * ══════════════════════════════════════════════════
 *   AKINATOR API MIDDLEWARE
 *   Secure • Rate-Limited • API Key Protected
 * ══════════════════════════════════════════════════
 *
 * Arsitektur keamanan berlapis:
 *  1. Helmet     — Security headers HTTP
 *  2. CORS       — Whitelist origin
 *  3. Global RL  — Rate limit per IP (anti-bot/scanner)
 *  4. Auth       — Validasi API key
 *  5. Key RL     — Rate limit per API key (fairness)
 *  6. Session RL — Rate limit create session (extra ketat)
 *  7. Validation — Sanitasi & validasi semua input
 */

"use strict";

const express = require("express");
const config = require("./config");
const logger = require("./utils/logger");
const { startCleanupJob } = require("./utils/sessionManager");

// ─── Middleware ───────────────────────────────────────────────────────────────
const {
  helmetMiddleware,
  corsMiddleware,
  corsErrorHandler,
  requestLogger,
  globalErrorHandler,
} = require("./middleware/security");
const { globalRateLimiter } = require("./middleware/rateLimiter");

// ─── Routes ───────────────────────────────────────────────────────────────────
const akinatorRoutes = require("./routes/akinator");
const adminRoutes = require("./routes/admin");

// ─── App Setup ────────────────────────────────────────────────────────────────
const app = express();

// Trust proxy (penting jika dibalik Nginx/load balancer)
// Ganti '1' dengan jumlah proxy layer Anda
app.set("trust proxy", 1);

// ─── Middleware Global ────────────────────────────────────────────────────────

// 1. Security headers
app.use(helmetMiddleware);

// 2. CORS
app.use(corsMiddleware);
app.use(corsErrorHandler);

// 3. Body parser (dengan limit size — anti DoS)
app.use(express.json({ limit: "10kb" }));
app.use(express.urlencoded({ extended: false, limit: "10kb" }));

// 4. Request logger
app.use(requestLogger);

// 5. Global rate limiter (per IP)
app.use(globalRateLimiter);

// ─── Routes ───────────────────────────────────────────────────────────────────

// Health check (public, no auth)
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    environment: config.server.env,
  });
});

// Akinator API
app.use("/api/akinator", akinatorRoutes);

// Admin (master key protected)
app.use("/admin", adminRoutes);

// API docs ringkas
app.get("/", (req, res) => {
  res.json({
    name: "Akinator API Middleware",
    version: "1.0.0",
    endpoints: {
      health: "GET /health",
      game: {
        start:   "POST /api/akinator/start",
        answer:  "POST /api/akinator/answer",
        back:    "POST /api/akinator/back",
        win:     "POST /api/akinator/win",
        session: "GET  /api/akinator/session/:id",
        delete:  "DELETE /api/akinator/session/:id",
      },
      admin: {
        generateKey: "POST   /admin/keys",
        listKeys:    "GET    /admin/keys",
        revokeKey:   "POST   /admin/keys/revoke",
        stats:       "GET    /admin/stats",
      },
    },
    auth: {
      userKey: "Header: X-API-Key: aki_xxx  atau  Authorization: Bearer aki_xxx",
      adminKey: "Header: X-Master-Key: <master_key>",
    },
    answers: {
      "0": "Ya",
      "1": "Tidak",
      "2": "Tidak tahu",
      "3": "Mungkin",
      "4": "Mungkin tidak",
    },
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: "NOT_FOUND",
    message: `Route ${req.method} ${req.path} tidak ditemukan.`,
  });
});

// Global error handler
app.use(globalErrorHandler);

// ─── Start Server ─────────────────────────────────────────────────────────────

function startServer() {
  // Mulai cleanup sesi expired setiap 5 menit
  startCleanupJob(5 * 60 * 1000);

  app.listen(config.server.port, () => {
    logger.info("══════════════════════════════════════════");
    logger.info("  Akinator API Middleware — Running");
    logger.info(`  Port : ${config.server.port}`);
    logger.info(`  Env  : ${config.server.env}`);
    logger.info(`  Redis: ${config.redis.use ? "Enabled" : "In-memory fallback"}`);
    logger.info("══════════════════════════════════════════");
    logger.info("  Endpoints:");
    logger.info(`  → GET  http://localhost:${config.server.port}/`);
    logger.info(`  → GET  http://localhost:${config.server.port}/health`);
    logger.info(`  → POST http://localhost:${config.server.port}/api/akinator/start`);
    logger.info("══════════════════════════════════════════");

    if (config.server.isDev) {
      logger.info("  ⚠️  Mode: Development");
      logger.info("  Buat API key pertama:");
      logger.info("  $ node scripts/generate-key.js");
    }
  });
}

startServer();

module.exports = app;
