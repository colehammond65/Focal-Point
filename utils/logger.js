// utils/logger.js
// Winston logger with daily rotation, logs to data/log/
const fsSync = require('fs');
const path = require('path');
const winston = require('winston');
require('winston-daily-rotate-file');

const logDir = path.join(__dirname, '..', 'data', 'log');
if (!fsSync.existsSync(logDir)) {
    fsSync.mkdirSync(logDir, { recursive: true });
}

const transport = new winston.transports.DailyRotateFile({
    dirname: logDir,
    filename: 'focalpoint-%DATE%.log',
    datePattern: 'YYYY-MM-DD',
    zippedArchive: false,
    maxSize: '20m',
    maxFiles: '14d', // keep 14 days
    level: 'info',
});

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
