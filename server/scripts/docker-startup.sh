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
    
    # Auto-migration strategy based on environment
    if [ "${AUTO_MIGRATE}" == "true" ] || [ "${NODE_ENV}" == "development" ]; then
        log "🔧 Auto-migration enabled - checking for schema changes..."
        
        # Check if schema differs from database
        DIFF_OUTPUT=$(timeout 60 npx prisma db diff --from-migrations ./migrations --to-schema-datamodel ./schema.prisma 2>&1) || {
            log "⚠️ Schema diff check failed, proceeding with standard migration..."
        }
        
        if echo "$DIFF_OUTPUT" | grep -q "No difference"; then
            log "✅ Schema matches database - no migration needed"
        else
            log "🔄 Schema changes detected, auto-generating migration..."
            
            # Generate timestamp for migration name
            MIGRATION_NAME="auto_migration_$(date +%Y%m%d_%H%M%S)"
            
            # Auto-generate migration
            AUTO_MIGRATION_OUTPUT=$(timeout 120 npx prisma migrate dev --name "$MIGRATION_NAME" --schema="$SCHEMA_PATH" 2>&1) || {
                log "⚠️ Auto-migration failed, falling back to manual deployment..."
                log "📄 Auto-migration output: $AUTO_MIGRATION_OUTPUT"
                
                # Fallback to migrate deploy
                if ! timeout 120 npx prisma migrate deploy --schema="$SCHEMA_PATH"; then
                    log "❌ Fallback migration deployment also failed"
                    exit 1
                fi
            }
            
            if echo "$AUTO_MIGRATION_OUTPUT" | grep -q "migration"; then
                log "✅ Auto-migration completed: $MIGRATION_NAME"
                log "📄 Migration details: $AUTO_MIGRATION_OUTPUT"
            fi
        fi
    else
        # Standard production migration approach
        log "🔧 Using standard migration deployment (production mode)..."
        
        # Check and apply any pending migrations with enhanced error handling
        log "🔍 Checking for pending migrations..."
        MIGRATION_STATUS_OUTPUT=$(timeout 60 npx prisma migrate status --schema="$SCHEMA_PATH" 2>&1) || {
            log "⚠️ Migration status check failed, output: $MIGRATION_STATUS_OUTPUT"
            log "🔧 Attempting migration deployment anyway..."
        }
        
        # Log migration status for debugging
        if echo "$MIGRATION_STATUS_OUTPUT" | grep -q "Database schema is up to date"; then
            log "✅ Database schema is already up to date"
        elif echo "$MIGRATION_STATUS_OUTPUT" | grep -q "pending migration"; then
            log "🔄 Pending migrations detected, applying them..."
        else
            log "🔍 Migration status unclear, proceeding with deployment to ensure consistency"
        fi
        
        log "🔧 Applying any pending migrations..."
        MIGRATION_OUTPUT=$(timeout 120 npx prisma migrate deploy --schema="$SCHEMA_PATH" 2>&1) || {
            log "❌ Migration deployment failed"
            log "📄 Migration output: $MIGRATION_OUTPUT"
            exit 1
        }
        
        # Log successful migration details
        if echo "$MIGRATION_OUTPUT" | grep -q "migration(s) have been applied"; then
            log "✅ New migrations applied successfully"
            log "📄 Migration details: $MIGRATION_OUTPUT"
        elif echo "$MIGRATION_OUTPUT" | grep -q "No pending migrations"; then
            log "✅ No pending migrations found - database is current"
        else
            log "✅ Migration deployment completed"
        fi
    fi
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