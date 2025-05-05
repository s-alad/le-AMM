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

# Copy enclave files - ensure both files exist
COPY sequencer/enclave/package.json ./
COPY sequencer/enclave/package-lock.json ./
COPY sequencer/enclave/vendor ./vendor

# Use npm install instead of npm ci since there might be an issue with the lock file
RUN npm install

# Copy source code and config files
COPY sequencer/enclave/tsconfig.json ./
COPY sequencer/enclave/src ./src

# Build the application
RUN npm run build

# Expose the port the app runs on
EXPOSE 4000

# Command to run the application (Use absolute path)
CMD ["/usr/local/bin/node", "/app/dist/index.js"]