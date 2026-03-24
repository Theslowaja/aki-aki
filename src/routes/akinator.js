// src/routes/akinator.js
const express = require("express");
const router = express.Router();
const { Aki } = require("aki-api");

const authMiddleware = require("../middleware/auth");
const { perKeyRateLimiter, sessionCreationLimiter } = require("../middleware/rateLimiter");
const { inputSanitizer } = require("../middleware/security");
const { validateStart, validateAnswer, validateBack, validateWin, validateSessionParam } = require("../middleware/validate");
const sessionManager = require("../utils/sessionManager");
const logger = require("../utils/logger");

router.use(authMiddleware);
router.use(perKeyRateLimiter);
router.use(inputSanitizer);

router.post("/start", sessionCreationLimiter, validateStart, async (req, res) => {
  try {
    const { language = "en", childMode = false } = req.body;
    logger.info(`New game: [${req.keyData.label}] lang=${language}`);

    const aki = new Aki({ region: language, childMode });
    await aki.start();

    const sessionId = sessionManager.createSession(req.keyData.keyHash, aki);

    res.status(201).json({
      success: true,
      sessionId,
      question: {
        text: aki.question,
        step: aki.step,
        progression: parseFloat(aki.progression || 0).toFixed(2),
      },
      answers: aki.answers,
      meta: { language, childMode },
    });
  } catch (err) {
    logger.error(`Failed to start akinator: ${err.message}`);
    handleAkinatorError(err, res, "Gagal memulai game Akinator.");
  }
});

router.post("/answer", validateAnswer, async (req, res) => {
  try {
    const { sessionId, answer } = req.body;
    const session = sessionManager.getSession(sessionId);

    if (!session) return res.status(404).json({ success: false, error: "SESSION_NOT_FOUND", message: "Sesi tidak ditemukan atau expired." });
    if (session.keyHash !== req.keyData.keyHash) return res.status(403).json({ success: false, error: "SESSION_FORBIDDEN", message: "Sesi bukan milik key Anda." });
    if (session.isComplete) return res.status(400).json({ success: false, error: "SESSION_COMPLETE", message: "Sesi sudah selesai." });

    const aki = session.akinator;
    await aki.step(parseInt(answer, 10));
    session.questionCount++;

    const progression = parseFloat(aki.progression || 0);
    const shouldGuess = aki.win === true || progression >= 80 || aki.step >= 20;

    const response = { success: true, sessionId, questionCount: session.questionCount, shouldGuess };

    if (shouldGuess) {
      response.message = "Akinator siap menebak! Panggil endpoint /win.";
      response.progression = progression.toFixed(2);
    } else {
      response.question = { text: aki.question, step: aki.step, progression: progression.toFixed(2) };
      response.answers = aki.answers;
    }

    res.json(response);
  } catch (err) {
    logger.error(`Answer error: ${err.message}`);
    handleAkinatorError(err, res, "Gagal memproses jawaban.");
  }
});

router.post("/back", validateBack, async (req, res) => {
  try {
    const { sessionId } = req.body;
    const session = sessionManager.getSession(sessionId);

    if (!session) return res.status(404).json({ success: false, error: "SESSION_NOT_FOUND", message: "Sesi tidak ditemukan." });
    if (session.keyHash !== req.keyData.keyHash) return res.status(403).json({ success: false, error: "SESSION_FORBIDDEN", message: "Sesi bukan milik key Anda." });
    if (session.questionCount <= 0) return res.status(400).json({ success: false, error: "CANNOT_GO_BACK", message: "Tidak ada pertanyaan sebelumnya." });

    const aki = session.akinator;
    await aki.back();
    session.questionCount = Math.max(0, session.questionCount - 1);

    res.json({
      success: true, sessionId, questionCount: session.questionCount,
      question: { text: aki.question, step: aki.step, progression: parseFloat(aki.progression || 0).toFixed(2) },
      answers: aki.answers,
    });
  } catch (err) {
    logger.error(`Back error: ${err.message}`);
    handleAkinatorError(err, res, "Gagal kembali ke pertanyaan sebelumnya.");
  }
});

router.post("/win", validateWin, async (req, res) => {
  try {
    const { sessionId } = req.body;
    const session = sessionManager.getSession(sessionId);

    if (!session) return res.status(404).json({ success: false, error: "SESSION_NOT_FOUND", message: "Sesi tidak ditemukan." });
    if (session.keyHash !== req.keyData.keyHash) return res.status(403).json({ success: false, error: "SESSION_FORBIDDEN", message: "Sesi bukan milik key Anda." });

    const aki = session.akinator;
    await aki.win();

    const guesses = aki.answers || [];
    const top = guesses[0];
    sessionManager.completeSession(sessionId);

    res.json({
      success: true, sessionId,
      guess: {
        name: top?.name || "Unknown",
        description: top?.description || "",
        photo: top?.absolute_picture_path || top?.picture_path || null,
        ranking: top?.ranking || null,
        probability: top?.proba ? (parseFloat(top.proba) * 100).toFixed(1) + "%" : null,
      },
      allGuesses: guesses.slice(0, 5).map((g) => ({
        name: g.name, description: g.description,
        photo: g.absolute_picture_path || g.picture_path || null,
        probability: g.proba ? (parseFloat(g.proba) * 100).toFixed(1) + "%" : null,
      })),
      questionCount: session.questionCount,
      message: "Akinator telah menebak! Sesi berakhir.",
    });
  } catch (err) {
    logger.error(`Win error: ${err.message}`);
    handleAkinatorError(err, res, "Gagal mendapatkan tebakan Akinator.");
  }
});

router.get("/session/:sessionId", validateSessionParam, (req, res) => {
  const session = sessionManager.getSession(req.params.sessionId);
  if (!session) return res.status(404).json({ success: false, error: "SESSION_NOT_FOUND", message: "Sesi tidak ditemukan." });
  if (session.keyHash !== req.keyData.keyHash) return res.status(403).json({ success: false, error: "SESSION_FORBIDDEN" });

  res.json({
    success: true,
    session: {
      id: req.params.sessionId,
      createdAt: new Date(session.createdAt).toISOString(),
      expiresAt: new Date(session.expiresAt).toISOString(),
      questionCount: session.questionCount,
      isComplete: session.isComplete,
    },
  });
});

router.delete("/session/:sessionId", validateSessionParam, (req, res) => {
  const session = sessionManager.getSession(req.params.sessionId);
  if (!session) return res.status(404).json({ success: false, error: "SESSION_NOT_FOUND" });
  if (session.keyHash !== req.keyData.keyHash) return res.status(403).json({ success: false, error: "SESSION_FORBIDDEN" });

  sessionManager.destroySession(req.params.sessionId);
  res.json({ success: true, message: `Sesi ${req.params.sessionId} berhasil dihapus.` });
});

function handleAkinatorError(err, res, defaultMessage) {
  const msg = err.message || "";
  if (msg.includes("certificate") || msg.includes("SSL") || msg.includes("TLS")) {
    return res.status(503).json({ success: false, error: "SSL_ERROR", message: "SSL error saat menghubungi Akinator. Pastikan NODE_TLS_REJECT_UNAUTHORIZED=0 diset di entry point (app.js)." });
  }
  if (msg.includes("403") || msg.includes("Cloudflare") || msg.includes("blocked")) {
    return res.status(503).json({ success: false, error: "AKINATOR_BLOCKED", message: "Akinator memblokir request. Coba ganti region atau tunggu sebentar." });
  }
  if (msg.includes("timeout") || msg.includes("ECONNRESET") || msg.includes("ENOTFOUND")) {
    return res.status(503).json({ success: false, error: "AKINATOR_UNAVAILABLE", message: "Server Akinator tidak tersedia. Coba lagi nanti." });
  }
  res.status(500).json({ success: false, error: "AKINATOR_ERROR", message: defaultMessage });
}

module.exports = router;