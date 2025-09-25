# --- First Stage: Builder ---
FROM node:18-alpine AS builder

# Set the working directory
WORKDIR /app

# Copy package.json from the api directory to the root
COPY api/package.json ./package.json

# Install dependencies in the root /app directory
# This creates /app/node_modules, making it accessible to all sub-folders
RUN rm -f package-lock.json && npm install

# Copy necessary files and folders from the project root AFTER installing dependencies
COPY api ./api
COPY src ./src
COPY config ./config
COPY ecosystem.config.js ./

# --- Second Stage ---
# Use a clean, small image for the final stage
FROM node:18-alpine

WORKDIR /app

# Copy installed modules and application code from the builder stage
COPY --from=builder /app ./

# Install PM2 globally
RUN npm install pm2 -g

# Expose the port the app runs on
EXPOSE 3000

# The command to run the application using the ecosystem file from the app's root
CMD ["pm2-runtime", "start", "ecosystem.config.js"]
