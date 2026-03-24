// src/utils/logger.js
const { createLogger, format, transports } = require("winston");
const config = require("../config");

const { combine, timestamp, colorize, printf, json, errors } = format;

// Format konsol yang rapi
const consoleFormat = printf(({ level, message, timestamp, ...meta }) => {
  let log = `[${timestamp}] ${level}: ${message}`;
  if (Object.keys(meta).length > 0) {
    // Jangan tampilkan stack trace panjang di konsol
    const { stack, ...rest } = meta;
    if (Object.keys(rest).length > 0) {
      log += ` | ${JSON.stringify(rest)}`;
    }
  }
  return log;
});

const logger = createLogger({
  level: config.logging.level,
  format: combine(errors({ stack: true }), timestamp({ format: "HH:mm:ss" })),
  transports: [
    // Konsol
    new transports.Console({
      format: combine(colorize(), consoleFormat),
    }),
  ],
});

// Tambah file transport jika diaktifkan
if (config.logging.toFile) {
  logger.add(
    new transports.File({
      filename: "logs/error.log",
      level: "error",
      format: combine(timestamp(), json()),
    })
  );
  logger.add(
    new transports.File({
      filename: "logs/combined.log",
      format: combine(timestamp(), json()),
    })
  );
}

module.exports = logger;
