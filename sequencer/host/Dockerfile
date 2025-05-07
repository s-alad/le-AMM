# Use a specific Node.js version (matching enclave)
FROM node:20-slim

# Set the base working directory inside the container
WORKDIR /app

# --- Dependency Setup ---
# Copy the cryptography package
COPY cryptography ./cryptography

# Copy the host package files and directories
COPY sequencer/host ./sequencer/host

# --- Install Dependencies ---

# First, install dependencies specifically for the cryptography package
WORKDIR /app/cryptography
RUN npm ci

# Second, install dependencies for the host package.
# This installs host's specific dependencies AND links the local @cryptography/core
WORKDIR /app/sequencer/host
RUN npm install

# --- Build Step ---
# Build the host application using its tsconfig.
RUN npm run build

# --- Runtime ---
# Expose the port the app runs on (adjust if host uses a different port)
EXPOSE 8080

# Command to run the application
CMD ["/usr/local/bin/node", "/app/sequencer/host/dist/index.js"] 