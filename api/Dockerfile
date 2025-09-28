# Use a specific Node.js version for reproducibility
FROM node:18-alpine

# Set the working directory inside the container
WORKDIR /app

# Copy package.json and package-lock.json
COPY api/package*.json ./

# Install production dependencies for the API
RUN npm install --production

# Copy API server files
COPY api/ ./

# Copy shared modules
COPY src/shared/ ./src/shared/

# Expose the port the app runs on
EXPOSE 8083

# Command to run the application, pointing to the correct path
CMD ["node", "server.js"]