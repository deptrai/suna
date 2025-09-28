# =====================================================
# ChainLens Core - Production Dockerfile
# Multi-stage build with security best practices
# =====================================================

# Build stage
FROM node:18-alpine AS builder

# Set working directory
WORKDIR /app

# Install build dependencies and security updates
RUN apk update && apk upgrade && \
    apk add --no-cache python3 make g++ && \
    rm -rf /var/cache/apk/*

# Copy package files first for better layer caching
COPY package*.json ./
COPY tsconfig*.json ./
COPY nest-cli.json ./

# Install ALL dependencies (including dev dependencies for build)
RUN npm ci && npm cache clean --force

# Copy source code
COPY src/ ./src/

# Build the application
RUN npm run build

# Remove dev dependencies after build
RUN npm prune --production

# =====================================================
# Production stage - Distroless for maximum security
FROM node:18-alpine AS production

# Security updates and minimal packages
RUN apk update && apk upgrade && \
    apk add --no-cache dumb-init && \
    rm -rf /var/cache/apk/*

# Create app user with specific UID/GID for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S chainlens -u 1001 -G nodejs

# Set working directory
WORKDIR /app

# Copy package files and install production dependencies only
COPY package*.json ./
RUN npm ci --only=production --no-audit --no-fund && \
    npm cache clean --force

# Copy built application from builder stage
COPY --from=builder --chown=chainlens:nodejs /app/dist ./dist
COPY --from=builder --chown=chainlens:nodejs /app/node_modules ./node_modules

# Copy necessary runtime files
COPY --chown=chainlens:nodejs src/migrations ./src/migrations

# Create logs directory with proper permissions
RUN mkdir -p logs tmp && \
    chown -R chainlens:nodejs logs tmp && \
    chmod 755 logs tmp

# Set environment variables for production
ENV NODE_ENV=production \
    PORT=3006 \
    LOG_LEVEL=info \
    NODE_OPTIONS="--max-old-space-size=512" \
    NPM_CONFIG_LOGLEVEL=warn

# Expose port
EXPOSE 3006

# Switch to non-root user for security
USER chainlens

# Health check with improved reliability
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD node -e "const http=require('http');const req=http.request({hostname:'localhost',port:3006,path:'/api/v1/health',timeout:5000},(res)=>{process.exit(res.statusCode===200?0:1)});req.on('error',()=>process.exit(1));req.end();"

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start the application
CMD ["node", "dist/main.js"]

# Labels for better container management
LABEL maintainer="ChainLens Team" \
      version="1.0.0" \
      description="ChainLens Core API Gateway" \
      org.opencontainers.image.source="https://github.com/chainlens/crypto-services" \
      org.opencontainers.image.vendor="ChainLens" \
      org.opencontainers.image.title="ChainLens Core" \
      org.opencontainers.image.description="API Gateway and orchestrator for crypto analysis services"
