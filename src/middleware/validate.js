// src/middleware/validate.js
/**
 * VALIDASI INPUT
 * Menggunakan express-validator untuk validasi & sanitasi body request.
 */

const { body, param, validationResult } = require("express-validator");

/**
 * Ambil hasil validasi, return error jika ada
 */
function handleValidation(req, res, next) {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: "VALIDATION_ERROR",
      message: "Input tidak valid.",
      details: errors.array().map((e) => ({
        field: e.path,
        message: e.msg,
      })),
    });
  }

  next();
}

// ─── Aturan validasi per endpoint ────────────────────────────────────────────

/**
 * POST /api/akinator/start
 * Body: { language?, region? }
 */
const validateStart = [
  body("language")
    .optional()
    .isString()
    .trim()
    .isLength({ min: 2, max: 10 })
    .matches(/^[a-zA-Z_-]+$/)
    .withMessage("Language harus string alfabet 2-10 karakter"),

  body("region")
    .optional()
    .isString()
    .trim()
    .isLength({ min: 2, max: 10 })
    .matches(/^[a-zA-Z_-]+$/)
    .withMessage("Region harus string alfabet 2-10 karakter"),

  body("childMode")
    .optional()
    .isBoolean()
    .withMessage("childMode harus boolean"),

  handleValidation,
];

/**
 * POST /api/akinator/answer
 * Body: { sessionId, answer }
 * answer: 0=ya, 1=tidak, 2=tidak tau, 3=mungkin, 4=mungkin tidak
 */
const validateAnswer = [
  body("sessionId")
    .notEmpty()
    .withMessage("sessionId diperlukan")
    .isUUID(4)
    .withMessage("sessionId harus UUID v4 yang valid"),

  body("answer")
    .notEmpty()
    .withMessage("answer diperlukan")
    .isInt({ min: 0, max: 4 })
    .withMessage("answer harus integer 0-4 (0=ya, 1=tidak, 2=tidak tau, 3=mungkin, 4=mungkin tidak)"),

  handleValidation,
];

/**
 * POST /api/akinator/back
 * Body: { sessionId }
 */
const validateBack = [
  body("sessionId")
    .notEmpty()
    .withMessage("sessionId diperlukan")
    .isUUID(4)
    .withMessage("sessionId harus UUID v4 yang valid"),

  handleValidation,
];

/**
 * POST /api/akinator/win
 * Body: { sessionId }
 */
const validateWin = [
  body("sessionId")
    .notEmpty()
    .withMessage("sessionId diperlukan")
    .isUUID(4)
    .withMessage("sessionId harus UUID v4 yang valid"),

  handleValidation,
];

/**
 * DELETE /api/akinator/session/:sessionId
 */
const validateSessionParam = [
  param("sessionId")
    .notEmpty()
    .isUUID(4)
    .withMessage("sessionId di URL harus UUID v4 yang valid"),

  handleValidation,
];

module.exports = {
  validateStart,
  validateAnswer,
  validateBack,
  validateWin,
  validateSessionParam,
};
