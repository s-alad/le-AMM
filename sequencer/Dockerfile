# ─────────────────────────────────────────
# 1) Build stage: compile your TypeScript
# ─────────────────────────────────────────
FROM node:20-bullseye-slim AS builder
WORKDIR /app

# Install dependencies and compile
COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ─────────────────────────────────────────
# 2) Runtime stage: minimal Ubuntu-based image
# ─────────────────────────────────────────
FROM ubuntu:24.04-slim

# Install Node 20 (Ubuntu’s glibc is ≥2.35, so this works)
RUN apt-get update \
 && apt-get install -y curl ca-certificates \
 && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
 && apt-get install -y nodejs \
 && rm -rf /var/lib/apt/lists/*

# Copy in only the built output
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY package.json ./

EXPOSE 4000
CMD ["node", "dist/index.js"]
