# Use the official Node.js image as the base image
FROM node:18

# Create and change to the app directory
WORKDIR /usr/src/app

# Copy the application code
COPY . .

# # Copy package.json and package-lock.json files
# COPY package*.json ./

# Install dependencies
RUN npm i

WORKDIR /usr/src/app/server

RUN npm i

# Expose the port your app runs on
EXPOSE 4323

# Command to run the application
CMD ["npm", "run", "start"]
