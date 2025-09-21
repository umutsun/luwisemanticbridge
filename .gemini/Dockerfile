# Gemini Backend Development Sandbox
FROM node:18-alpine

# Install build dependencies
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    git \
    curl \
    bash \
    postgresql-client

# Set working directory
WORKDIR /workspace

# Install global npm packages
RUN npm install -g \
    typescript \
    ts-node \
    nodemon \
    @types/node \
    npm-check-updates \
    concurrently

# Create sandbox user (non-root)
RUN addgroup -g 1002 -S gemini && \
    adduser -u 1002 -S gemini -G gemini

# Set up workspace directories
RUN mkdir -p /workspace/backend /workspace/.gemini/logs /workspace/shared && \
    mkdir -p /workspace/backend/{src,tests,dist,uploads} && \
    chown -R gemini:gemini /workspace

# Copy sandbox configuration
COPY .gemini/sandbox-config.json /workspace/.gemini/

# Environment variables
ENV NODE_ENV=development \
    SANDBOX_MODE=true \
    AGENT_NAME=gemini \
    AGENT_ROLE=backend \
    PORT=8080 \
    WS_PORT=8081

# Switch to sandbox user
USER gemini

# Expose ports
EXPOSE 8080 8081

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
    CMD curl -f http://localhost:8080/health || exit 1

# Default command
CMD ["bash"]
