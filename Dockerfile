# Use the official Node.js image as the base image
FROM node:18

# Create and change to the app directory
WORKDIR /usr/src/app

# Copy the application code
COPY . .

# # Copy package.json and package-lock.json files
# COPY package*.json ./

# Install app dependencies
RUN npm i

# Change to server dir
WORKDIR /usr/src/app/server

# Install server dependencies
RUN npm i

# Initiate Prisma DB
RUN npm run db

# Change to app dir
WORKDIR /usr/src/app

# Build app
RUN npm run build

WORKDIR /usr/src/app/server

# Expose the port your app runs on
EXPOSE 4323

# Command to run the application
# CMD ["npm", "run", "start"]
CMD ["./scripts/startup.sh"]
