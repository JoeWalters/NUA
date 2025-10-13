// Enhanced logging utility for structured error handling
const fs = require('fs');
const path = require('path');

class Logger {
    constructor() {
        this.logLevels = {
            ERROR: 0,
            WARN: 1,
            INFO: 2,
            DEBUG: 3
        };
        
        this.currentLevel = process.env.LOG_LEVEL ? 
            this.logLevels[process.env.LOG_LEVEL.toUpperCase()] || this.logLevels.INFO :
            this.logLevels.INFO;
            
        this.logsDir = path.join(__dirname, '../config/server_logs');
        this.ensureLogsDirectory();
    }
    
    ensureLogsDirectory() {
        if (!fs.existsSync(this.logsDir)) {
            try {
                fs.mkdirSync(this.logsDir, { recursive: true });
            } catch (error) {
                console.error('Failed to create logs directory:', error);
            }
        }
    }
    
    formatMessage(level, message, metadata = {}) {
        const timestamp = new Date().toISOString();
        const logEntry = {
            timestamp,
            level,
            message,
            ...metadata,
            pid: process.pid
        };
        
        return JSON.stringify(logEntry);
    }
    
    writeToFile(level, formattedMessage) {
        try {
            const filename = level === 'ERROR' ? 'error.log' : 'app.log';
            const filepath = path.join(this.logsDir, filename);
            
            fs.appendFileSync(filepath, formattedMessage + '\n');
        } catch (error) {
            console.error('Failed to write log to file:', error);
        }
    }
    
    log(level, message, metadata = {}) {
        if (this.logLevels[level] > this.currentLevel) {
            return;
        }
        
        const formattedMessage = this.formatMessage(level, message, metadata);
        
        // Console output with colors
        const colors = {
            ERROR: '\x1b[31m', // Red
            WARN: '\x1b[33m',  // Yellow
            INFO: '\x1b[36m',  // Cyan
            DEBUG: '\x1b[37m'  // White
        };
        
        const reset = '\x1b[0m';
        const color = colors[level] || colors.INFO;
        
        console.log(`${color}[${level}]${reset} ${message}`, metadata.error ? metadata.error : '');
        
        // Write to file
        this.writeToFile(level, formattedMessage);
    }
    
    error(message, error = null, metadata = {}) {
        this.log('ERROR', message, { 
            ...metadata, 
            error: error ? {
                message: error.message,
                stack: error.stack,
                name: error.name
            } : undefined
        });
    }
    
    warn(message, metadata = {}) {
        this.log('WARN', message, metadata);
    }
    
    info(message, metadata = {}) {
        this.log('INFO', message, metadata);
    }
    
    debug(message, metadata = {}) {
        this.log('DEBUG', message, metadata);
    }
}

// Error handling utility functions
class ErrorHandler {
    static async handleAsync(fn) {
        return async (...args) => {
            try {
                return await fn(...args);
            } catch (error) {
                logger.error(`Async operation failed in ${fn.name || 'anonymous function'}`, error);
                throw error;
            }
        };
    }
    
    static wrapRoute(fn) {
        return async (req, res, next) => {
            try {
                await fn(req, res, next);
            } catch (error) {
                logger.error(`Route error: ${req.method} ${req.path}`, error, {
                    method: req.method,
                    path: req.path,
                    userAgent: req.get('User-Agent'),
                    ip: req.ip
                });
                
                if (!res.headersSent) {
                    res.status(500).json({
                        error: 'Internal server error',
                        message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong',
                        timestamp: new Date().toISOString()
                    });
                }
                next(error);
            }
        };
    }
    
    static handleCriticalError(error, context = 'Unknown') {
        logger.error(`Critical error in ${context}`, error, { critical: true });
        
        // For critical errors, we might want to restart the service
        // or at least notify monitoring systems
        console.error('💥 CRITICAL ERROR DETECTED 💥');
        console.error(`Context: ${context}`);
        console.error(`Error: ${error.message}`);
        console.error(`Stack: ${error.stack}`);
        
        // You could add monitoring/alerting here
        // e.g., send to Sentry, notify Slack, etc.
    }
    
    static setupGlobalErrorHandlers() {
        // Handle uncaught exceptions
        process.on('uncaughtException', (error) => {
            ErrorHandler.handleCriticalError(error, 'Uncaught Exception');
            logger.error('Uncaught Exception - shutting down gracefully...', error);
            
            setTimeout(() => {
                process.exit(1);
            }, 5000); // Give 5 seconds for cleanup
        });
        
        // Handle unhandled promise rejections
        process.on('unhandledRejection', (reason, promise) => {
            const error = reason instanceof Error ? reason : new Error(String(reason));
            ErrorHandler.handleCriticalError(error, 'Unhandled Promise Rejection');
            logger.error('Unhandled Promise Rejection', error, { promise: promise.toString() });
        });
        
        // Handle warning events
        process.on('warning', (warning) => {
            logger.warn(`Process warning: ${warning.message}`, {
                name: warning.name,
                stack: warning.stack
            });
        });
    }
}

// Create singleton logger instance
const logger = new Logger();

module.exports = { 
    logger, 
    ErrorHandler,
    Logger
};