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

# Install root dependencies
RUN npm ci --only=production

# Change to server dir and install server dependencies  
WORKDIR /usr/src/app/server
RUN npm ci --only=production

# Go back to root and copy the rest of the application
WORKDIR /usr/src/app
COPY . .

# Make startup script executable
RUN chmod +x /usr/src/app/server/scripts/docker-startup.sh

# Build the frontend application
RUN npm run build

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