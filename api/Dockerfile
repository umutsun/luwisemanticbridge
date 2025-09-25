# Use a standard Node.js image
FROM node:18-alpine

# Set the working directory in the container
WORKDIR /app

# Copy the root package.json and package-lock.json (if available)
COPY package*.json ./

# Install all dependencies from the root package.json
RUN npm install

# Copy the entire application source code into the container
# (.dockerignore will prevent local node_modules, .git, etc. from being copied)
COPY . .

# Expose the port the app runs on
EXPOSE 3000

# The command to run the application directly with Node for simplicity
CMD ["node", "api/server.js"]