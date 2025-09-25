# Use the standard Node.js image
FROM node:18-alpine

# Set the working directory
WORKDIR /app

# Copy ALL files from the build context (respecting .dockerignore)
# This assumes node_modules already exists in the context from a local install
COPY . .

# Expose the port
EXPOSE 3000

# Run the server
CMD ["node", "api/server.js"]
