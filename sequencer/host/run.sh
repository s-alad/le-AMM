#!/bin/bash
set -e

# Working directory setup
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Install cryptography dependencies
echo "Installing cryptography dependencies..."
cd "$REPO_ROOT/cryptography"
npm ci

# Install and build host
echo "Installing host dependencies..."
cd "$REPO_ROOT/sequencer/host"
npm install

echo "Building host..."
npm run build

echo "Starting host..."
node "$REPO_ROOT/sequencer/host/dist/index.js" 