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

# Validate Prisma setup
log "🔍 Validating Prisma setup..."
if [ ! -f "$SCHEMA_PATH" ]; then
    log "❌ Prisma schema file not found at $SCHEMA_PATH"
    exit 1
fi
log "✅ Prisma schema found: $SCHEMA_PATH"

# Check if migrations directory exists
MIGRATIONS_DIR="${BASE_LOC}/migrations"
if [ ! -d "$MIGRATIONS_DIR" ]; then
    log "⚠️ Migrations directory not found at $MIGRATIONS_DIR"
    log "📁 Creating migrations directory..."
    mkdir -p "$MIGRATIONS_DIR"
else
    MIGRATION_COUNT=$(find "$MIGRATIONS_DIR" -maxdepth 1 -type d -name "[0-9]*" | wc -l)
    log "✅ Migrations directory found with $MIGRATION_COUNT migration(s)"
fi

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
        log "Using development database initialization with auto-migration"
        log "🔧 Running: npm run db (generates migrations automatically)"
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
    
    # Always check for and apply pending migrations first
    log "🔍 Checking for pending migrations..."
    MIGRATION_STATUS_OUTPUT=$(timeout 60 npx prisma migrate status --schema="$SCHEMA_PATH" 2>&1) || {
        log "⚠️ Migration status check failed, proceeding anyway..."
    }
    
    # Check if there are pending migrations to apply
    if echo "$MIGRATION_STATUS_OUTPUT" | grep -q "pending"; then
        log "� Pending migrations detected! Applying migrations..."
        if ! timeout 120 npx prisma migrate deploy --schema="$SCHEMA_PATH"; then
            log "❌ Migration deployment failed"
            exit 1
        fi
        log "✅ Pending migrations applied successfully"
    elif echo "$MIGRATION_STATUS_OUTPUT" | grep -q "up to date"; then
        log "✅ Database schema is reported as up to date by Prisma"
        
        # However, old databases may not have the DeviceGroup table even though migrations claim to be up to date
        # This happens when the DeviceGroup migration is newer than the database was created
        log "🔧 Verifying DeviceGroup table exists..."
        DEVICE_GROUP_EXISTS=$(sqlite3 ./config/nodeunifi.db "SELECT name FROM sqlite_master WHERE type='table' AND name='DeviceGroup';" 2>&1 || echo "")
        
        if [ -z "$DEVICE_GROUP_EXISTS" ]; then
            log "⚠️ DeviceGroup table NOT FOUND - database is older than DeviceGroup feature"
            log "🔧 Running prisma migrate reset to rebuild database with all current migrations..."
            
            # Use migrate reset to rebuild the database
            if timeout 180 npx prisma migrate reset --force --schema="$SCHEMA_PATH" 2>&1 > /tmp/migrate_reset.log; then
                log "✅ Database successfully reset and rebuilt"
            else
                log "⚠️ Migrate reset encountered issues, output:"
                cat /tmp/migrate_reset.log | head -20 | while read line; do log "  $line"; done
                log "🔧 Attempting standard deploy..."
                timeout 120 npx prisma migrate deploy --schema="$SCHEMA_PATH" || true
            fi
            
            # Verify again
            DEVICE_GROUP_EXISTS=$(sqlite3 ./config/nodeunifi.db "SELECT name FROM sqlite_master WHERE type='table' AND name='DeviceGroup';" 2>&1 || echo "")
            if [ -z "$DEVICE_GROUP_EXISTS" ]; then
                log "❌ CRITICAL: DeviceGroup table is still missing!"
                log "❌ Database migration failed - exiting"
                exit 1
            else
                log "✅ DeviceGroup table now confirmed in database"
            fi
        else
            log "✅ DeviceGroup table confirmed to exist"
        fi
    else
        log "ℹ️ Migration status: $MIGRATION_STATUS_OUTPUT"
    fi
fi

# Force regenerate Prisma client after all migration operations
log "🔧 Regenerating Prisma client to ensure all models are loaded..."
if ! timeout 60 npx prisma generate --schema="$SCHEMA_PATH"; then
    log "⚠️ Prisma regeneration encountered an issue but continuing..."
else
    log "✅ Prisma client regenerated successfully"
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