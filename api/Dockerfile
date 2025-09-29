# Use the official Node.js 20 Alpine image as a base
FROM node:20-alpine

# Set the working directory in the container
WORKDIR /app

# Copy package.json and package-lock.json from the 'api' directory to the container's working directory
COPY api/package*.json ./

# Install production dependencies
RUN npm install --production

# Copy all files from the 'api' directory into the container's working directory
COPY api/ ./

# Expose the port the app runs on
EXPOSE 8083

# The command to run the application
CMD ["node", "server.js"]