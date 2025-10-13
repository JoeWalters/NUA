#!/bin/bash
###
# Enhanced Docker startup script with better error handling and monitoring
###

set -euo pipefail  # Exit on error, undefined vars, pipe failures

BASE_LOC="/usr/src/app/server/"
SCHEMA_PATH="${BASE_LOC}/schema.prisma"
SERVER_LOGS="${BASE_LOC}/config/server_logs"
HEALTH_CHECK_URL="http://localhost:4323/health"

cd "${BASE_LOC}"

# Function for consistent logging
log() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') [STARTUP] $1"
}

log "🚀 Starting NUA Application startup sequence..."

# Create server_logs folder if it doesn't exist
log "📁 Checking for server_logs directory..."
if [ ! -d "${SERVER_LOGS}" ]; then
    log "📁 Creating server_logs directory"
    mkdir -p "$SERVER_LOGS"
else
    log "📁 server_logs directory already exists"
fi

# Initialize database if it doesn't exist
if [ ! -f ./config/nodeunifi.db ]; then
    log "🗄️ Initializing database..."
    if ! timeout 60 npm run db; then
        log "❌ Database initialization failed or timed out"
        exit 1
    fi
    log "✅ Database initialized successfully"
else
    log "🗄️ Database already exists, skipping initialization"
fi

# Database migration with better error handling
log "🔄 Checking database schema migrations..."
MIGRATION_STATUS=$(timeout 30 npx prisma migrate status --schema=schema.prisma 2>&1) || {
    log "❌ Failed to check migration status"
    exit 1
}

if echo "${MIGRATION_STATUS}" | grep -q "Database schema is up to date!"; then
    log "✅ Database schema is up to date"
else
    log "🔄 Running database migrations..."
    if ! timeout 60 npx prisma migrate deploy --schema="$SCHEMA_PATH"; then
        log "❌ Database migration failed or timed out"
        exit 1
    fi
    log "✅ Database migrations completed successfully"
fi

# Pre-flight checks
log "🔍 Running pre-flight checks..."

# Check available disk space
available_space=$(df /usr/src/app | tail -1 | awk '{print $4}')
if [ "$available_space" -lt 1000000 ]; then  # Less than ~1GB
    log "⚠️ Warning: Low disk space available: ${available_space}KB"
fi

# Check memory usage
available_memory=$(free -m | awk 'NR==2{print $7}')
if [ "$available_memory" -lt 512 ]; then  # Less than 512MB
    log "⚠️ Warning: Low available memory: ${available_memory}MB"
fi

# Start the application
log "🎯 Starting Node.js application..."
exec npm run start