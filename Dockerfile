# Use the official Node.js image as the base image
FROM node:18

# Set environment variables
ENV NODE_ENV=production
ENV DEBIAN_FRONTEND=noninteractive

# Create and change to the app directory
WORKDIR /usr/src/app

# Copy package files first for better caching
COPY package*.json ./
COPY server/package*.json ./server/

# Copy the rest of the application first
COPY . .

# Make startup script executable
RUN chmod +x /usr/src/app/server/scripts/docker-startup.sh

# Install ALL root dependencies including devDependencies (for Vite)
RUN npm ci

# Change to server dir and install server dependencies (production only)
WORKDIR /usr/src/app/server
RUN npm ci --omit=dev

# Go back to root for build
WORKDIR /usr/src/app

# Build the frontend application using npx to ensure vite is found
RUN npx vite build

# Clean up devDependencies after build to reduce image size
RUN npm prune --omit=dev

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