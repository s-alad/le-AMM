#!/bin/bash
set -e

LOG_PATH="$1"
: > "$LOG_PATH"

# working directory setup
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# install cryptography dependencies
echo "--- running npm ci in cryptography ----"
cd "$REPO_ROOT/cryptography"
npm ci

# install and build host
echo "--- installing dependancies ---"
cd "$REPO_ROOT/sequencer/host"
npm install

# reset port
echo "--- clean port 8080 ---"
PID_PORT=$(sudo lsof -ti TCP:8080 -s TCP:LISTEN)

if [ ! -z "$PID_PORT" ]; then
    echo "--- 8080 in use by PID(s): $PID_PORT ---"
    echo "$PID_PORT" | xargs --no-run-if-empty sudo kill -9 2>/dev/null || true
    sleep 1
else
    echo "--- 8080 free. ---"
fi

echo "--- building ---"
npm run build

echo "--- starting ---"
node "$REPO_ROOT/sequencer/host/dist/index.js" 2>&1 | tee -a "$LOG_PATH"