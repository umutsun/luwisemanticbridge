# Use the official Node.js 20 Alpine image as a base
FROM node:20-alpine

# Set the working directory in the container
WORKDIR /app

# Copy package.json and package-lock.json to the container's working directory
COPY package*.json ./

# Install production dependencies
RUN npm install --production --legacy-peer-deps

# Copy all files to the container's working directory
COPY . ./

# Expose the port the app runs on
EXPOSE 8083

# Create config directory and symlink before running the app
RUN mkdir -p /config && \
    ln -sf /app/config/config.json /config/config.json

# The command to run the application
CMD ["node", "server.js"]