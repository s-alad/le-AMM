FROM node:20-bullseye-slim AS builder
# … build your TS app …

FROM ubuntu:24.04

RUN apt-get update \
 && apt-get install -y curl ca-certificates \
 && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
 && apt-get install -y nodejs \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY package.json ./

EXPOSE 4000
CMD ["node","dist/index.js"]
