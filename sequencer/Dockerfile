# Build stage
FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build
# Use pkg to create a standalone executable
RUN npm install -g pkg
RUN pkg --targets node16-linux-x64 dist/index.js -o app

# Final minimal image
FROM alpine:latest
WORKDIR /app
COPY --from=builder /app/app .
EXPOSE 4000
CMD ["./app"]