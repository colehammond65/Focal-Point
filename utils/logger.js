/**
 * @fileoverview Winston logger configuration for the Focal Point application.
 * 
 * This module sets up structured logging with daily file rotation. It provides
 * centralized logging for the application with automatic log rotation, archiving,
 * and both file and console output for development and production environments.
 * 
 * Features:
 * - Daily log rotation with configurable retention
 * - Separate console and file output formats
 * - Configurable log levels (error, warn, info, debug)
 * - Automatic log directory creation
 * - File size and age-based rotation
 * 
 * @author Cole Hammond
 * @version 1.0.0
 */

const fsSync = require('fs');
const path = require('path');
const winston = require('winston');
require('winston-daily-rotate-file');

/** @constant {string} Directory path for storing log files */
const logDir = path.join(__dirname, '..', 'data', 'log');

// Ensure log directory exists
if (!fsSync.existsSync(logDir)) {
    fsSync.mkdirSync(logDir, { recursive: true });
}

/**
 * Daily rotating file transport configuration.
 * Logs are rotated daily, compressed after rotation, and kept for 14 days.
 */
const transport = new winston.transports.DailyRotateFile({
    dirname: logDir,
    filename: 'focalpoint-%DATE%.log',
    datePattern: 'YYYY-MM-DD',
    zippedArchive: false,
    maxSize: '20m',
    maxFiles: '14d', // keep 14 days
    level: 'info',
});

/**
 * Main logger instance with file and console transports.
 * 
 * Provides structured logging with timestamps and level-based filtering.
 * Logs to both rotating files and console for development visibility.
 * 
 * @type {winston.Logger}
 * @example
 * const logger = require('./utils/logger');
 * logger.info('Application started');
 * logger.error('Database connection failed', { error: err });
 */
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.printf(info => `${info.timestamp} [${info.level.toUpperCase()}] ${info.message}`)
    ),
    transports: [
        transport,
        new winston.transports.Console({
            format: winston.format.simple(),
        })
    ],
});

module.exports = logger;
