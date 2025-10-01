FROM node:18-alpine

# Install dependencies for TypeScript and pgvector
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    pkgconfig \
    postgresql-dev

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source code
COPY . .

# Build TypeScript
RUN npm install -g typescript ts-node
RUN npx tsc

# Expose port
EXPOSE 8083

# Start the application
CMD ["npm", "run", "dev"]