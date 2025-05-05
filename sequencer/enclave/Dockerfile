FROM node:20-slim
WORKDIR /app

# Copy cryptography module first - copy everything at once
COPY cryptography ./cryptography/

# Build the cryptography module
WORKDIR /app/cryptography
RUN npm ci
RUN npm run build

# Switch back to main app directory
WORKDIR /app

# Copy enclave files
COPY sequencer/enclave/package.json sequencer/enclave/package-lock.json ./
COPY sequencer/enclave/vendor ./vendor

# Install dependencies
RUN npm ci

# Copy source code and config files
COPY sequencer/enclave/tsconfig.json ./
COPY sequencer/enclave/src ./src

# Build the application
RUN npm run build

# Expose the port the app runs on
EXPOSE 4000

# Command to run the application (Use absolute path)
CMD ["/usr/local/bin/node", "/app/dist/index.js"]