# Use a specific Node.js version (20-slim is good)
FROM node:20-slim

# Set the working directory inside the container
WORKDIR /app

# --- Dependency Setup ---
# Copy the cryptography package FIRST. It's needed for the 'npm ci' step below.
# Source is the 'cryptography' dir in the build context (project root)
# Destination is '/app/cryptography' inside the container
COPY cryptography ./cryptography

# Copy the enclave package files and directories
# Source is 'sequencer/enclave/*' in the build context
# Destination is '/app/sequencer/enclave' inside the container
COPY sequencer/enclave ./sequencer/enclave

# Change working directory to the enclave package for npm commands
WORKDIR /app/sequencer/enclave

# --- Install Dependencies ---
# Install dependencies for the enclave package.
# npm will look for package.json in the current WORKDIR (/app/sequencer/enclave).
# It will resolve the "file:../../cryptography" dependency relative to this WORKDIR,
# finding the package at /app/cryptography (which we copied earlier).
RUN npm ci

# --- Build Step ---
# Build the enclave application using its tsconfig.
# tsc will run in /app/sequencer/enclave.
# The tsconfig references '../../cryptography/src', which correctly points to /app/cryptography/src.
# The output will go to '/app/sequencer/enclave/dist' based on your tsconfig's outDir.
RUN npm run build

# --- Runtime ---
# Expose the port the app runs on
EXPOSE 4000

# Command to run the application.
# Note the adjusted path to the built index.js file.
CMD ["/usr/local/bin/node", "/app/sequencer/enclave/dist/index.js"]