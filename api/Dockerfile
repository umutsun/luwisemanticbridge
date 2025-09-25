# --- First Stage: Builder ---
FROM node:18-alpine AS builder

# Set the working directory
WORKDIR /app

# Copy the root package.json and install all dependencies from there
# This creates a single /app/node_modules that all sub-projects can use
COPY package*.json ./
RUN npm install

# Copy the rest of the project source code
COPY . .

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
