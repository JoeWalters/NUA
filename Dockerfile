# Use the official Node.js image as the base image
FROM node:18-alpine

# Install system dependencies needed by our enhanced startup script
RUN apk add --no-cache curl bash

# Create app user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nuaapp -u 1001 -G nodejs

# Create and change to the app directory
WORKDIR /usr/src/app

# Copy package files for better Docker layer caching
COPY package*.json ./
COPY server/package*.json ./server/

# Install ALL dependencies first (needed for building)
RUN npm ci

# Install server dependencies (all deps needed for Prisma generation)
WORKDIR /usr/src/app/server
RUN npm ci

# Generate Prisma client (needs to be done before prune)
RUN npx prisma generate

# Remove server dev dependencies
RUN npm prune --production

# Copy application code
WORKDIR /usr/src/app
COPY . .

# Build the frontend application (do this before changing ownership)
RUN npm run build

# Remove dev dependencies after build to reduce image size
RUN npm prune --production

# Make all script files executable and set up proper permissions
RUN chmod +x /usr/src/app/server/scripts/*.sh && \
    chmod +x /usr/src/app/server/scripts/*.js && \
    mkdir -p /usr/src/app/server/config/server_logs && \
    mkdir -p /usr/src/app/server/config && \
    chown -R nuaapp:nodejs /usr/src/app

# Add health check using our new endpoint
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:4323/health || exit 1

# Switch to non-root user for security
USER nuaapp

# Set environment variables for production
ENV NODE_ENV=production
ENV LOG_LEVEL=INFO
ENV UNIFI_RETRY_ATTEMPTS=5
ENV UNIFI_RETRY_DELAY=5000

# Expose the port
EXPOSE 4323

# Use our enhanced startup script
CMD ["/usr/src/app/server/scripts/docker-startup.sh"]