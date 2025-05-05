FROM node:20-slim
WORKDIR /app
# Copy cryptography module first
COPY cryptography/package.json cryptography/package-lock.json ./cryptography/
WORKDIR /app/cryptography
RUN npm ci
COPY cryptography/tsconfig.json ./
COPY cryptography/src ./src
RUN npm run build
# Switch back to main app directory
WORKDIR /app
# Copy dependency files
COPY package.json package-lock.json ./
COPY vendor ./vendor
# Install dependencies
RUN npm ci
# Copy source code and config files
COPY tsconfig.json ./
COPY src ./src
# Build the application
RUN npm run build
# Expose the port the app runs on
EXPOSE 4000
# Command to run the application (Use absolute path)
CMD ["/usr/local/bin/node", "/app/dist/index.js"]