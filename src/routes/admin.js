// src/routes/admin.js
/**
 * ADMIN ROUTES (dilindungi MASTER_API_KEY)
 *
 * POST   /admin/keys         — Generate & daftarkan key baru
 * GET    /admin/keys         — List semua key
 * DELETE /admin/keys/:label  — Revoke key berdasarkan label
 * GET    /admin/stats        — Statistik server
 */

const express = require("express");
const router = express.Router();
const { body, param, validationResult } = require("express-validator");

const {
  generateApiKey,
  registerKey,
  revokeKey,
  listKeys,
} = require("../utils/keyStore");
const { getStats } = require("../utils/sessionManager");
const config = require("../config");
const logger = require("../utils/logger");

// ─── Master Key Auth ──────────────────────────────────────────────────────────

function masterAuth(req, res, next) {
  if (!config.auth.masterApiKey) {
    return res.status(503).json({
      success: false,
      error: "MASTER_KEY_NOT_CONFIGURED",
      message: "MASTER_API_KEY belum diset di environment.",
    });
  }

  const providedKey =
    req.headers["x-master-key"] ||
    req.headers["x-api-key"];

  if (!providedKey || providedKey !== config.auth.masterApiKey) {
    logger.warn(`Admin auth failed dari IP ${req.ip}`);
    return res.status(403).json({
      success: false,
      error: "FORBIDDEN",
      message: "Master key tidak valid.",
    });
  }

  next();
}

router.use(masterAuth);

// ─── POST /admin/keys — Generate key baru ─────────────────────────────────────

router.post(
  "/keys",
  [
    body("label")
      .notEmpty().withMessage("label diperlukan")
      .isString().trim()
      .isLength({ min: 1, max: 50 })
      .matches(/^[a-zA-Z0-9_-]+$/)
      .withMessage("Label hanya boleh alfanumerik, underscore, dan dash"),

    body("expiresInDays")
      .optional()
      .isInt({ min: 1, max: 3650 })
      .withMessage("expiresInDays harus antara 1 dan 3650"),
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { label, expiresInDays = null } = req.body;

    const newKey = generateApiKey();
    const keyData = registerKey(newKey, label, expiresInDays);

    logger.info(`Admin: Key generated for [${label}] by IP ${req.ip}`);

    res.status(201).json({
      success: true,
      message: "API key berhasil dibuat. Simpan key ini — tidak akan ditampilkan lagi!",
      apiKey: newKey,
      label: keyData.label,
      createdAt: keyData.createdAt,
      expiresAt: keyData.expiresAt,
    });
  }
);

// ─── GET /admin/keys — List semua key ────────────────────────────────────────

router.get("/keys", (req, res) => {
  const keys = listKeys();

  res.json({
    success: true,
    total: keys.length,
    keys: keys.map((k) => ({
      label: k.label,
      isActive: k.isActive,
      createdAt: k.createdAt,
      expiresAt: k.expiresAt,
      requestCount: k.requestCount,
      lastUsedAt: k.lastUsedAt,
    })),
  });
});

// ─── DELETE /admin/keys/revoke — Revoke key ───────────────────────────────────

router.post(
  "/keys/revoke",
  [
    body("apiKey")
      .notEmpty().withMessage("apiKey diperlukan")
      .isString().trim(),
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { apiKey } = req.body;
    const result = revokeKey(apiKey);

    if (!result) {
      return res.status(404).json({
        success: false,
        error: "KEY_NOT_FOUND",
        message: "API key tidak ditemukan.",
      });
    }

    logger.info(`Admin: Key revoked by IP ${req.ip}`);

    res.json({
      success: true,
      message: "API key berhasil direvoke.",
    });
  }
);

// ─── GET /admin/stats — Statistik ────────────────────────────────────────────

router.get("/stats", (req, res) => {
  const sessionStats = getStats();
  const keys = listKeys();

  res.json({
    success: true,
    server: {
      uptime: process.uptime(),
      environment: config.server.env,
      nodeVersion: process.version,
      memoryMB: (process.memoryUsage().heapUsed / 1_048_576).toFixed(2),
    },
    sessions: sessionStats,
    keys: {
      total: keys.length,
      active: keys.filter((k) => k.isActive).length,
      expired: keys.filter((k) => !k.isActive).length,
    },
  });
});

module.exports = router;
