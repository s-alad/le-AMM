#!/bin/bash
set -e

LOG_PATH="$1"
: > "$LOG_PATH"

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
node "$REPO_ROOT/sequencer/host/dist/index.js" 2>&1 | stdbuf -oL tee -a "$LOG_PATH"