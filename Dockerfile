# Multi-stage build for New API Price Sync Tool

# Stage 1: Build frontend
FROM node:20-alpine AS frontend-builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY packages/web/package*.json ./packages/web/
COPY packages/shared/package*.json ./packages/shared/

# Install dependencies
RUN npm ci

# Copy source code
COPY packages/web ./packages/web
COPY packages/shared ./packages/shared

# Build frontend
RUN npm run build -w packages/web

# Stage 2: Build backend
FROM node:20-alpine AS backend-builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY packages/server/package*.json ./packages/server/
COPY packages/shared/package*.json ./packages/shared/

# Install dependencies
RUN npm ci

# Copy source code
COPY packages/server ./packages/server
COPY packages/shared ./packages/shared

# Build backend
RUN npm run build -w packages/server

# Stage 3: Production image
FROM node:20-alpine

WORKDIR /app

# Install production dependencies only
COPY package*.json ./
COPY packages/server/package*.json ./packages/server/
COPY packages/shared/package*.json ./packages/shared/

RUN npm ci --only=production

# Copy built files
COPY --from=backend-builder /app/packages/server/dist ./packages/server/dist
COPY --from=backend-builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=frontend-builder /app/packages/web/dist ./packages/web/dist

# Create data directory
RUN mkdir -p /app/data

# Expose port
EXPOSE 3001

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3001

# Start server
CMD ["node", "packages/server/dist/index.js"]
