#!/bin/bash

LOG_DIR="$HOME"
ENCLAVE_LOG="$LOG_DIR/enclave.log"
HOST_LOG="$LOG_DIR/host.log"

set -x

cd ~

# reset logs
: > "$ENCLAVE_LOG"
: > "$HOST_LOG"

cd ~/TEE

git pull

echo "--- building sequencer-enclave ---"
docker build -f sequencer/enclave/Dockerfile -t sequencer-enclave:latest .

cd ~

# describe enclaves
echo "--- describing enclaves ---"
ENCLAVE_INFO=$(nitro-cli describe-enclaves)
echo "$ENCLAVE_INFO"

# terminate existing enclave
if [[ "$ENCLAVE_INFO" != "[]" ]]; then
  ENCLAVE_ID=$(echo "$ENCLAVE_INFO" | grep -o '"EnclaveID": "[^"]*"' | head -1 | cut -d'"' -f4)
  if [[ ! -z "$ENCLAVE_ID" ]]; then
    echo "--- terminating existing enclave: $ENCLAVE_ID ---"
    nitro-cli terminate-enclave --enclave-id "$ENCLAVE_ID"
  fi
fi

# build the new enclave
echo "--- building enclave ---"
nitro-cli build-enclave --docker-uri sequencer-enclave:latest --output-file sequencer.eif

# start enclave in background and log output
echo "--- starting enclave ---"
nitro-cli run-enclave --cpu-count 2 --memory 2000 --enclave-cid 16 --eif-path sequencer.eif --attach-console > "$ENCLAVE_LOG" 2>&1 &

# Wait until enclave is ready
echo "--- waiting for enclave to come online ---"
while ! grep -q "\[SEQ\] ONLINE" "$ENCLAVE_LOG"; do
  sleep 1
done
echo "--- enclave is online ---"

# start host using run.sh script and log output
echo "--- starting host with run.sh ---"
cd ~/TEE
chmod +x sequencer/host/run.sh
sequencer/host/run.sh "$HOST_LOG" > /dev/null &
cd ~

# wait briefly to ensure processes are started
sleep 2

# multitail
if ! command -v multitail &> /dev/null; then
  echo "multitail not found — installing via apt..."
  sudo apt-get update && sudo apt-get install -y multitail
fi

echo "--- sane terminal ---"
stty -a
stty sane
stty -a 

echo "--- displaying logs. Press 'q' in log window to exit. ---"
multitail -s 2 "$ENCLAVE_LOG" "$HOST_LOG"