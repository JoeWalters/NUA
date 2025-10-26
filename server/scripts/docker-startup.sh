#!/bin/bash
###
# Docker startup script with enhanced logging and error handling
###

set -e  # Exit on any error

BASE_LOC="/usr/src/app/server/"
SCHEMA_PATH="${BASE_LOC}/schema.prisma"
BACKUP_SCHEMA_PATH="${BASE_LOC}/config/schema_backup.prisma"
SERVER_LOGS="${BASE_LOC}/config/server_logs"

# Enhanced logging function
log() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') [STARTUP] $1"
}

log "🚀 Starting NUA Application startup sequence..."
log "📋 NUA Application v2.2.0"
log "🏷️ Version Tag: $(date '+%Y%m%d%H%M%S')"
log "🐳 Container Started: $(date -u '+%Y-%m-%d %H:%M:%S') UTC"

cd "${BASE_LOC}"

log "🔍 Running pre-startup system checks..."
log "📦 Node.js version: $(node --version)"
log "📦 npm version: $(npm --version)"

# Memory and disk space checks
MEMORY_INFO=$(free -m | awk 'NR==2{printf "%.0fMB available / %.0fMB total (%.1f%% used)", $7, $2, $3*100/$2}')
DISK_INFO=$(df -BM /usr/src/app | awk 'NR==2{print $4}' | sed 's/M/MB/')
log "💾 Memory: ${MEMORY_INFO}"
log "💿 Disk space: ${DISK_INFO} available"

# Create server_logs folder if it doesn't exist
log "📁 Checking server_logs directory..."
if [ ! -d "${SERVER_LOGS}" ]; then
    log "⚠️ server_logs directory missing, will attempt creation but application can continue without it"
    if ! mkdir -p "${SERVER_LOGS}" 2>/dev/null; then
        log "📁 Using fallback logging (directory creation failed)"
        log "⚠️ Logging directory not writable, logs may go to stdout only"
    else
        log "✅ server_logs directory created successfully"
    fi
else
    log "✅ server_logs directory exists and is accessible"
fi

# Database initialization with better error handling
log "🗄️ Checking database..."
log "Environment: ${NODE_ENV:-development}"
log "Working directory: $(pwd)"
log "Database path: ./config/nodeunifi.db"

# Create config directory if it doesn't exist
mkdir -p ./config

if [ ! -f ./config/nodeunifi.db ]; then
    log "🗄️ Database not found. Initializing..."
    if [ "${NODE_ENV}" == "production" ]; then
        log "Using production database initialization (migrate deploy)"
        log "🔧 Running: npx prisma generate && npx prisma migrate deploy"
        
        # Generate Prisma client first
        log "🔧 Generating Prisma client..."
        if ! timeout 60 npx prisma generate --schema="$SCHEMA_PATH"; then
            log "❌ Prisma client generation failed or timed out"
            exit 1
        fi
        log "✅ Prisma client generated successfully"
        
        # Deploy migrations
        if ! timeout 120 npx prisma migrate deploy --schema="$SCHEMA_PATH"; then
            log "❌ Database migration failed or timed out"
            exit 1
        fi
        log "✅ Database migration completed successfully"
    else
        log "Using development database initialization"
        log "🔧 Running: npm run db"
        if ! timeout 120 npm run db; then
            log "❌ Database initialization failed or timed out"
            exit 1
        fi
        log "✅ Database initialized successfully"
    fi
else
    log "🗄️ Database exists. Checking migration status..."
    
    # Ensure Prisma client is generated
    log "🔧 Ensuring Prisma client is up to date..."
    if ! timeout 60 npx prisma generate --schema="$SCHEMA_PATH"; then
        log "❌ Prisma client generation failed"
        exit 1
    fi
    log "✅ Prisma client ready"
    
    # Check and apply any pending migrations
    log "🔍 Checking for pending migrations..."
    if ! timeout 60 npx prisma migrate status --schema="$SCHEMA_PATH"; then
        log "⚠️ Unable to check migration status, attempting deploy anyway..."
    fi
    
    log "🔧 Applying any pending migrations..."
    if ! timeout 120 npx prisma migrate deploy --schema="$SCHEMA_PATH"; then
        log "❌ Migration deployment failed"
        exit 1
    fi
    log "✅ Database migrations up to date"
fi

log "🔧 Final system checks..."
# Verify database connectivity
log "🗄️ Testing database connection..."
if ! timeout 30 node -e "
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.\$connect()
  .then(() => {
    console.log('Database connection successful');
    process.exit(0);
  })
  .catch((e) => {
    console.error('Database connection failed:', e.message);
    process.exit(1);
  });
"; then
    log "❌ Database connection test failed"
    exit 1
fi
log "✅ Database connection verified"

log "🚀 All checks passed! Starting NUA application..."
log "📱 Application will be available on port 4323"
log "🔄 Starting with: npm run start"

exec npm run start