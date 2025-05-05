# Use a specific Node.js version (20-slim is good)
FROM node:20-slim

# Set the base working directory inside the container
WORKDIR /app

# --- Dependency Setup ---
# Copy the cryptography package
COPY cryptography ./cryptography

# Copy the enclave package files and directories
COPY sequencer/enclave ./sequencer/enclave

# --- Install Dependencies ---

# << --- ADDED STEPS START --- >>
# First, install dependencies specifically for the cryptography package
# This ensures its own code can find its direct dependencies (@noble/*) during compilation
WORKDIR /app/cryptography
RUN npm ci
# << --- ADDED STEPS END --- >>

# Second, install dependencies for the enclave package.
# This installs enclave's specific dependencies AND links the local @cryptography/core
WORKDIR /app/sequencer/enclave
RUN npm ci

# --- Build Step ---
# WORKDIR is already /app/sequencer/enclave
# Build the enclave application using its tsconfig.
# tsc should now find:
# 1. Enclave source files (./src)
# 2. Cryptography source files (../../cryptography/src via rootDirs)
# 3. @noble/* dependencies needed by cryptography files (via /app/cryptography/node_modules)
# 4. Enclave's own dependencies (via /app/sequencer/enclave/node_modules)
# 5. Imports like '@cryptography/core/decryption' (via tsconfig paths mapping to ../../cryptography/src/*)
RUN npm run build

# --- Runtime ---
# Expose the port the app runs on
EXPOSE 4000

# Command to run the application.
# CMD /usr/local/bin/node /app/sequencer/enclave/dist/sequencer/index.js # Shell form (tried last)
CMD ls -R /app/sequencer/enclave/dist/index.js