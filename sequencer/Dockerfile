# ─────────────────────────────────────────
# Stage 1: Builder (compile your TS)
# ─────────────────────────────────────────
FROM node:20-bullseye-slim AS builder
WORKDIR /app

# 1. Bring in only the files needed to install deps & build
COPY package.json package-lock.json tsconfig.json ./
RUN npm ci

# 2. Copy your .ts source and build it into /app/dist
COPY src ./src
RUN npm run build

# ─────────────────────────────────────────
# Stage 2: Runtime (Ubuntu with glibc ≥ 2.28)
# ─────────────────────────────────────────
FROM ubuntu:24.04
RUN apt-get update \
 && apt-get install -y curl ca-certificates \
 && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
 && apt-get install -y nodejs \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 3. Copy in your compiled JS (dist/) and metadata
COPY --from=builder /app/dist ./dist
COPY package.json .

# 4. Expose & start
EXPOSE 4000
CMD ["node", "dist/index.js"]
