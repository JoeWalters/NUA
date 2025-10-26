# Use the official Node.js image as the base image
FROM node:18

# Set environment variables
ENV DEBIAN_FRONTEND=noninteractive

# Create and change to the app directory
WORKDIR /usr/src/app

# Copy package files first for better caching
COPY package*.json ./
COPY server/package*.json ./server/

# Copy Prisma schema and migrations early for better layer caching
COPY server/schema.prisma ./server/
COPY server/migrations/ ./server/migrations/

# Install root dependencies (including devDependencies for build)
# Temporarily set NODE_ENV to development to install all dependencies
ENV NODE_ENV=development
RUN npm ci

# Go back to root and copy the rest of the application
COPY . .

# Make startup script executable
RUN chmod +x /usr/src/app/server/scripts/docker-startup.sh

# Debug: Check if vite is installed
RUN ls -la node_modules/.bin/ | grep vite || echo "Vite not found in .bin"
RUN npm list vite || echo "Vite not in dependencies"

# Build the frontend application (Vite should now be available)
# Use npx to ensure vite is found in node_modules
RUN npx vite build

# Set NODE_ENV back to production for runtime
ENV NODE_ENV=production

# Install server dependencies (but keep Prisma CLI for migrations)
WORKDIR /usr/src/app/server
RUN npm ci

# Ensure Prisma CLI is available for runtime migrations
# We need to keep Prisma in production for migrate deploy command
RUN npm install --save-dev prisma

# Generate Prisma client to ensure it's available
RUN npx prisma generate --schema=./schema.prisma

# Set default environment variables for auto-migration
ENV AUTO_MIGRATE=false
ENV PRISMA_CLI_QUERY_ENGINE_TYPE=binary

# Go back to root
WORKDIR /usr/src/app

# Note: We keep Prisma CLI available for runtime migrations
# This enables both manual and automatic schema deployment in Docker

# Create necessary directories with proper permissions
RUN mkdir -p /usr/src/app/server/config && \
    mkdir -p /usr/src/app/server/config/server_logs && \
    chmod 755 /usr/src/app/server/config && \
    chmod 755 /usr/src/app/server/config/server_logs

# Change to server directory for runtime
WORKDIR /usr/src/app/server

# Expose the port your app runs on
EXPOSE 4323/tcp

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:4323/health || exit 1

# Command to run the application
CMD ["/usr/src/app/server/scripts/docker-startup.sh"]