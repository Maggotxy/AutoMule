const winston = require('winston');
const path = require('path');
const fs = require('fs');
const EventEmitter = require('events');

const logDir = path.join(__dirname, '../../logs');

if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

const logEvents = new EventEmitter();

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp({
      format: 'YYYY-MM-DD HH:mm:ss'
    }),
    winston.format.errors({ stack: true }),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
      let msg = `${timestamp} [${level.toUpperCase()}]: ${message}`;
      if (Object.keys(meta).length > 0) {
        msg += ` ${JSON.stringify(meta)}`;
      }
      return msg;
    })
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ timestamp, level, message, ...meta }) => {
          let msg = `${timestamp} [${level}]: ${message}`;
          if (Object.keys(meta).length > 0) {
            msg += ` ${JSON.stringify(meta)}`;
          }
          return msg;
        })
      )
    }),
    new winston.transports.File({
      filename: path.join(logDir, 'error.log'),
      level: 'error',
      maxsize: 10485760,
      maxFiles: 5
    }),
    new winston.transports.File({
      filename: path.join(logDir, 'combined.log'),
      maxsize: 10485760,
      maxFiles: 10
    })
  ]
});

// Emit structured logs for the web UI (and other observers).
const originalLog = logger.log.bind(logger);
logger.log = (...args) => {
  try {
    if (args.length === 1 && args[0] && typeof args[0] === 'object') {
      const { level, message, timestamp, ...meta } = args[0];
      logEvents.emit('log', {
        timestamp: timestamp || new Date().toISOString(),
        level,
        message: String(message ?? ''),
        meta
      });
    } else {
      const [level, message, meta] = args;
      logEvents.emit('log', {
        timestamp: new Date().toISOString(),
        level,
        message: String(message ?? ''),
        meta: meta && typeof meta === 'object' ? meta : {}
      });
    }
  } catch {
    // ignore
  }

  return originalLog(...args);
};

logger.events = logEvents;
module.exports = logger;
