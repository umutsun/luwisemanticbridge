# Use a specific Node.js version for reproducibility
FROM node:18-alpine

# Set the working directory inside the container
WORKDIR /app

# Copy package.json and package-lock.json from the 'api' subdirectory
COPY api/package*.json ./

# Install production dependencies for the API
RUN npm install --production

# Copy the entire project context
# The application code will be at /app/api/server.js etc.
COPY . .

# Expose the port the app runs on
EXPOSE 8083

# Command to run the application, pointing to the correct path
CMD ["node", "api/server.js"]