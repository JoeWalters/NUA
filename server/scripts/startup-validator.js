#!/usr/bin/env node
/**
 * NUA Application Startup Validator
 * Validates environment and dependencies before starting the main application
 */

const fs = require('fs');
const path = require('path');

class StartupValidator {
    constructor() {
        this.errors = [];
        this.warnings = [];
    }

    log(level, message) {
        const timestamp = new Date().toISOString();
        const colors = {
            ERROR: '\x1b[31m',
            WARN: '\x1b[33m', 
            INFO: '\x1b[36m',
            SUCCESS: '\x1b[32m'
        };
        const reset = '\x1b[0m';
        
        console.log(`${colors[level] || colors.INFO}[${level}] ${timestamp} - ${message}${reset}`);
    }

    checkNodeVersion() {
        const nodeVersion = process.version;
        const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0]);
        
        if (majorVersion < 16) {
            this.errors.push(`Node.js version ${nodeVersion} is not supported. Required: >= 16.x`);
        } else if (majorVersion < 18) {
            this.warnings.push(`Node.js version ${nodeVersion} is old. Recommended: >= 18.x`);
        } else {
            this.log('SUCCESS', `Node.js version ${nodeVersion} ✓`);
        }
    }

    checkRequiredFiles() {
        const requiredFiles = [
            'package.json',
            'app.js',
            'schema.prisma',
            'globalSettings.js'
        ];

        for (const file of requiredFiles) {
            if (!fs.existsSync(path.join(__dirname, file))) {
                this.errors.push(`Required file missing: ${file}`);
            } else {
                this.log('SUCCESS', `Required file exists: ${file} ✓`);
            }
        }
    }

    checkDirectories() {
        const requiredDirs = [
            'config',
            'Routes',
            'server_util_funcs'
        ];

        for (const dir of requiredDirs) {
            const dirPath = path.join(__dirname, dir);
            if (!fs.existsSync(dirPath)) {
                this.errors.push(`Required directory missing: ${dir}`);
            } else {
                this.log('SUCCESS', `Required directory exists: ${dir} ✓`);
            }
        }

        // Create logs directory if it doesn't exist
        const logsDir = path.join(__dirname, 'config', 'server_logs');
        if (!fs.existsSync(logsDir)) {
            try {
                fs.mkdirSync(logsDir, { recursive: true });
                this.log('INFO', `Created logs directory: ${logsDir}`);
            } catch (error) {
                this.warnings.push(`Could not create logs directory: ${error.message}`);
            }
        }
    }

    checkEnvironmentVariables() {
        const recommendedEnvVars = {
            'NODE_ENV': 'production',
            'LOG_LEVEL': 'INFO',
            'UNIFI_RETRY_ATTEMPTS': '5',
            'UNIFI_RETRY_DELAY': '5000'
        };

        for (const [varName, defaultValue] of Object.entries(recommendedEnvVars)) {
            if (!process.env[varName]) {
                process.env[varName] = defaultValue;
                this.log('INFO', `Set default environment variable: ${varName}=${defaultValue}`);
            } else {
                this.log('SUCCESS', `Environment variable set: ${varName}=${process.env[varName]} ✓`);
            }
        }
    }

    checkDependencies() {
        try {
            const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));
            const nodeModulesExists = fs.existsSync(path.join(__dirname, 'node_modules'));
            
            if (!nodeModulesExists) {
                this.errors.push('node_modules directory not found. Run: npm install');
                return;
            }

            // Check critical dependencies
            const criticalDeps = ['express', '@prisma/client', 'node-schedule'];
            for (const dep of criticalDeps) {
                const depPath = path.join(__dirname, 'node_modules', dep);
                if (!fs.existsSync(depPath)) {
                    this.errors.push(`Critical dependency missing: ${dep}`);
                } else {
                    this.log('SUCCESS', `Critical dependency installed: ${dep} ✓`);
                }
            }
        } catch (error) {
            this.errors.push(`Could not validate dependencies: ${error.message}`);
        }
    }

    checkDatabaseSchema() {
        const schemaPath = path.join(__dirname, 'schema.prisma');
        if (fs.existsSync(schemaPath)) {
            try {
                const schemaContent = fs.readFileSync(schemaPath, 'utf8');
                if (schemaContent.includes('generator client') && schemaContent.includes('datasource db')) {
                    this.log('SUCCESS', 'Prisma schema structure valid ✓');
                } else {
                    this.warnings.push('Prisma schema may be incomplete');
                }
            } catch (error) {
                this.warnings.push(`Could not validate schema: ${error.message}`);
            }
        }
    }

    checkMemoryAvailable() {
        const freeMemory = process.memoryUsage().heapUsed / 1024 / 1024;
        const totalMemory = require('os').totalmem() / 1024 / 1024 / 1024;
        
        if (totalMemory < 0.5) {
            this.warnings.push(`Low system memory: ${totalMemory.toFixed(1)}GB available`);
        } else {
            this.log('SUCCESS', `System memory: ${totalMemory.toFixed(1)}GB ✓`);
        }
    }

    async validate() {
        this.log('INFO', '🔍 Starting NUA Application validation...');
        
        this.checkNodeVersion();
        this.checkRequiredFiles();
        this.checkDirectories();
        this.checkEnvironmentVariables();
        this.checkDependencies();
        this.checkDatabaseSchema();
        this.checkMemoryAvailable();

        // Report results
        if (this.errors.length > 0) {
            this.log('ERROR', '❌ Validation failed with errors:');
            this.errors.forEach(error => this.log('ERROR', `  • ${error}`));
            return false;
        }

        if (this.warnings.length > 0) {
            this.log('WARN', '⚠️ Validation completed with warnings:');
            this.warnings.forEach(warning => this.log('WARN', `  • ${warning}`));
        }

        this.log('SUCCESS', '✅ Validation completed successfully');
        return true;
    }
}

// Run validation if called directly
if (require.main === module) {
    const validator = new StartupValidator();
    validator.validate().then(isValid => {
        process.exit(isValid ? 0 : 1);
    }).catch(error => {
        console.error('Validation error:', error);
        process.exit(1);
    });
}

module.exports = StartupValidator;