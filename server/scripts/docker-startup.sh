#!/bin/bash
###
# Enhanced Docker startup script with better error handling and monitoring
###

set -euo pipefail  # Exit on error, undefined vars, pipe failures

BASE_LOC="/usr/src/app/server"
SCHEMA_PATH="${BASE_LOC}/schema.prisma"
SERVER_LOGS="${BASE_LOC}/config/server_logs"
HEALTH_CHECK_URL="http://localhost:4323/health"
MAX_STARTUP_TIME=120  # seconds

cd "${BASE_LOC}"

# Function for consistent logging
log() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') [STARTUP] $1"
}

# Function to check if a command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to wait for a condition with timeout
wait_for_condition() {
    local description="$1"
    local condition="$2"
    local timeout="${3:-30}"
    
    log "⏳ Waiting for ${description} (timeout: ${timeout}s)..."
    
    for i in $(seq 1 $timeout); do
        if eval "$condition" >/dev/null 2>&1; then
            log "✅ ${description} ready"
            return 0
        fi
        sleep 1
    done
    
    log "❌ ${description} failed to be ready within ${timeout} seconds"
    return 1
}

log "🚀 Starting NUA Application startup sequence..."

# Pre-startup system checks
log "🔍 Running pre-startup system checks..."

# Check Node.js version
if command_exists node; then
    node_version=$(node --version)
    log "📦 Node.js version: ${node_version}"
else
    log "❌ Node.js not found"
    exit 1
fi

# Check npm version
if command_exists npm; then
    npm_version=$(npm --version)
    log "📦 npm version: ${npm_version}"
else
    log "❌ npm not found"
    exit 1
fi

# Check available memory
if command_exists free; then
    available_memory=$(free -m | awk 'NR==2{printf "%.0f", $7}')
    total_memory=$(free -m | awk 'NR==2{printf "%.0f", $2}')
    memory_usage_percent=$(free -m | awk 'NR==2{printf "%.1f", $3*100/$2}')
    log "💾 Memory: ${available_memory}MB available / ${total_memory}MB total (${memory_usage_percent}% used)"
    
    if [ "$available_memory" -lt 256 ]; then
        log "⚠️ Warning: Low available memory: ${available_memory}MB"
    fi
fi

# Check available disk space
if command_exists df; then
    available_space_kb=$(df /usr/src/app | tail -1 | awk '{print $4}')
    available_space_mb=$((available_space_kb / 1024))
    log "💿 Disk space: ${available_space_mb}MB available"
    
    if [ "$available_space_mb" -lt 512 ]; then
        log "⚠️ Warning: Low disk space: ${available_space_mb}MB"
    fi
fi

# Ensure server_logs directory exists (should be created during build)
log "📁 Checking server_logs directory..."
if [ ! -d "${SERVER_LOGS}" ]; then
    log "📁 Attempting to create server_logs directory"
    if mkdir -p "$SERVER_LOGS" 2>/dev/null; then
        log "✅ server_logs directory created"
    else
        log "⚠️ Could not create server_logs directory, but continuing (may already exist or have permission issues)"
        # Try to create parent directory and continue
        mkdir -p "${BASE_LOC}/config" 2>/dev/null || true
    fi
else
    log "✅ server_logs directory already exists"
fi

# Database initialization
if [ ! -f ./config/nodeunifi.db ]; then
    log "🗄️ Database not found. Initializing..."
    if ! timeout 90 npm run db; then
        log "❌ Database initialization failed or timed out"
        exit 1
    fi
    log "✅ Database initialized successfully"
else
    log "🗄️ Database found, skipping initialization"
fi

# Database migration with enhanced error handling
log "🔄 Checking database schema migrations..."

# Check Prisma CLI availability
if ! command_exists npx; then
    log "❌ npx not available"
    exit 1
fi

# Get migration status with timeout
if ! MIGRATION_STATUS=$(timeout 30 npx prisma migrate status --schema="$SCHEMA_PATH" 2>&1); then
    log "❌ Failed to check migration status (timeout or error)"
    log "Migration error output: $MIGRATION_STATUS"
    exit 1
fi

if echo "$MIGRATION_STATUS" | grep -q "Database schema is up to date!"; then
    log "✅ Database schema is up to date"
elif echo "$MIGRATION_STATUS" | grep -q "following migration.*not yet been applied"; then
    log "🔄 Pending migrations detected. Running migrations..."
    if ! timeout 90 npx prisma migrate deploy --schema="$SCHEMA_PATH"; then
        log "❌ Database migration failed or timed out"
        exit 1
    fi
    log "✅ Database migrations completed successfully"
else
    log "⚠️ Unexpected migration status: $MIGRATION_STATUS"
    log "🔄 Attempting to run migrations anyway..."
    if ! timeout 90 npx prisma migrate deploy --schema="$SCHEMA_PATH"; then
        log "❌ Database migration failed or timed out"
        exit 1
    fi
    log "✅ Database migrations completed"
fi

# Generate Prisma client
log "🔧 Generating Prisma client..."
if ! timeout 60 npx prisma generate --schema="$SCHEMA_PATH"; then
    log "❌ Prisma client generation failed or timed out"
    exit 1
fi
log "✅ Prisma client generated successfully"

# Start the application in background
log "🎯 Starting Node.js application..."
npm run start &
APP_PID=$!

# Wait for application to start responding
log "⏳ Waiting for application to become ready..."
sleep 5  # Give the app a moment to start

# Check if the process is still running
if ! kill -0 $APP_PID 2>/dev/null; then
    log "❌ Application process died immediately after startup"
    exit 1
fi

# Wait for health endpoint to respond
app_ready=false
for i in $(seq 1 30); do
    if command_exists curl; then
        if curl -f -s --max-time 5 "$HEALTH_CHECK_URL" >/dev/null 2>&1; then
            log "✅ Application health check passed"
            app_ready=true
            break
        fi
    elif command_exists wget; then
        if wget -q --timeout=5 --tries=1 "$HEALTH_CHECK_URL" -O /dev/null >/dev/null 2>&1; then
            log "✅ Application health check passed"
            app_ready=true
            break
        fi
    else
        # No curl or wget available, just check if process is running
        if kill -0 $APP_PID 2>/dev/null; then
            log "✅ Application process running (health check tools not available)"
            app_ready=true
            break
        fi
    fi
    
    # Check if process is still alive
    if ! kill -0 $APP_PID 2>/dev/null; then
        log "❌ Application process died during startup"
        exit 1
    fi
    
    if [ $i -eq 30 ]; then
        log "⚠️ Application health check timeout, but process is running"
        log "🟡 Proceeding anyway - application may still be initializing"
        app_ready=true
    fi
    
    sleep 2
done

if [ "$app_ready" = true ]; then
    log "🎉 NUA Application startup completed successfully!"
    log "🌐 Application should be available on port 4323"
    log "📊 Health check endpoint: ${HEALTH_CHECK_URL}"
    
    # Final process check and hand over control
    if kill -0 $APP_PID 2>/dev/null; then
        log "🔄 Handing control to application process (PID: $APP_PID)"
        wait $APP_PID
    else
        log "❌ Application process not found"
        exit 1
    fi
else
    log "❌ Application startup failed"
    # Clean up
    kill $APP_PID 2>/dev/null || true
    exit 1
fi