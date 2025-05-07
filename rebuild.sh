#!/bin/bash

# Set log paths
LOG_DIR="$HOME"
ENCLAVE_LOG="$LOG_DIR/enclave.log"
HOST_LOG="$LOG_DIR/host.log"

set -x

# Reset logs
: > "$ENCLAVE_LOG"
: > "$HOST_LOG"

# Install required tools if missing
install_if_missing() {
  if ! command -v "$1" &>/dev/null; then
    echo "$1 not found — installing..."
    sudo apt-get update && sudo apt-get install -y "$1"
  fi
}

install_if_missing tmux
install_if_missing ccze

# Pull latest code and build enclave container
cd ~/TEE
git pull
echo "--- building sequencer-enclave ---"
docker build -f sequencer/enclave/Dockerfile -t sequencer-enclave:latest .

cd ~

# Terminate existing enclave if running
echo "--- describing enclaves ---"
ENCLAVE_INFO=$(nitro-cli describe-enclaves)
echo "$ENCLAVE_INFO"

if [[ "$ENCLAVE_INFO" != "[]" ]]; then
  ENCLAVE_ID=$(echo "$ENCLAVE_INFO" | grep -o '"EnclaveID": "[^"]*"' | head -1 | cut -d'"' -f4)
  if [[ ! -z "$ENCLAVE_ID" ]]; then
    echo "--- terminating existing enclave: $ENCLAVE_ID ---"
    nitro-cli terminate-enclave --enclave-id "$ENCLAVE_ID"
  fi
fi

# Build new enclave
echo "--- building enclave ---"
nitro-cli build-enclave --docker-uri sequencer-enclave:latest --output-file sequencer.eif

# Run enclave in background, log output
echo "--- starting enclave ---"
nitro-cli run-enclave --cpu-count 2 --memory 2000 --enclave-cid 16 --eif-path sequencer.eif --attach-console > "$ENCLAVE_LOG" 2>&1 &

# Wait for enclave to go online
echo "--- waiting for enclave to come online ---"
while ! grep -q "\[SEQ\] ONLINE" "$ENCLAVE_LOG"; do
  sleep 1
done
echo "--- enclave is online ---"

# Start host script and log output
echo "--- starting host with run.sh ---"
cd ~/TEE
sequencer/host/run.sh "$HOST_LOG" &
cd ~

sleep 2  # let logs start flowing

# Launch logs in a tmux session with colorization
SESSION="enclave_host_logs"

# Clean up any previous session
tmux kill-session -t "$SESSION" 2>/dev/null || true

# Start new tmux session
tmux new-session -d -s "$SESSION" \
  "tail -f '$ENCLAVE_LOG' | ccze -A || tail -f '$ENCLAVE_LOG'"

tmux split-window -h \
  "tail -f '$HOST_LOG' | ccze -A || tail -f '$HOST_LOG'"

tmux select-layout even-horizontal
tmux attach -t "$SESSION"
