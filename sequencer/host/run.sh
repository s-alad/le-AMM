#!/bin/bash
set -e

LOG_PATH="$1"

# redirect all subsequent stdout and stderr of this entire script to tee.
# tee will append to LOG_PATH AND also print to the original stdout/stderr
exec > >(tee -a "$LOG_PATH") 2>&1

: > "$LOG_PATH"
echo "--- run.sh started at $(date) ---"
echo "--- logging all run.sh output to: $LOG_PATH ---"

# working directory setup
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)" # Assumes TEE is two levels up from run.sh parent
echo "--- SCRIPT_DIR: $SCRIPT_DIR, REPO_ROOT: $REPO_ROOT ---"

# install cryptography dependencies
echo "--- running npm ci in cryptography ----"
cd "$REPO_ROOT/cryptography"
npm ci # Output will now be captured by the exec redirect

# install and build host
echo "--- installing dependencies ---"
cd "$REPO_ROOT/sequencer/host"
npm install # Output will now be captured

# reset port
echo "--- clean port 8080 ---"
PID_PORT=$(sudo lsof -ti TCP:8080 -s TCP:LISTEN || true)
if [ ! -z "$PID_PORT" ]; then
    echo "--- 8080 in use by PID(s): $PID_PORT ---"
    echo "$PID_PORT" | xargs --no-run-if-empty sudo kill -9 2>/dev/null || true
    sleep 1
else
    echo "--- 8080 free. ---"
fi

echo "--- building ---"
npm run build

echo "--- starting node application ---"
node "$REPO_ROOT/sequencer/host/dist/index.js"

echo "--- node application finished or failed to start (if this line is reached immediately after 'starting'). ---"
echo "--- run.sh finished at $(date) ---"