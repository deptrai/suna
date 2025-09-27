# =====================================================
# OnChain Analysis Service - Production Dockerfile
# =====================================================

# Build stage
FROM node:18-alpine AS builder

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache python3 make g++

# Copy package files
COPY package*.json ./
COPY tsconfig*.json ./

# Install dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy source code
COPY src/ ./src/

# Build the application
RUN npm run build

# =====================================================
# Production stage
FROM node:18-alpine AS production

# Create app user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S onchain -u 1001

WORKDIR /app

# Install production dependencies only
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

# Copy built application
COPY --from=builder --chown=onchain:nodejs /app/dist ./dist

# Create logs directory
RUN mkdir -p logs && chown onchain:nodejs logs

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3001
ENV SERVICE_NAME=onchain-analysis
ENV LOG_LEVEL=info

# Expose port
EXPOSE 3001

# Switch to non-root user
USER onchain

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3001/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

# Start the application
CMD ["node", "dist/main.js"]
