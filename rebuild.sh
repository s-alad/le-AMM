#!/bin/bash

# verbose
set -x

# pull and build
cd ~/TEE
git pull
docker build -f sequencer/enclave/Dockerfile -t sequencer:latest .
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

# build and run the new enclave
echo "--- building enclave ---"
nitro-cli build-enclave --docker-uri sequencer:latest --output-file sequencer.eif
echo "--- enclave starting ---"
nitro-cli run-enclave --cpu-count 2 --memory 2000 --enclave-cid 16 --eif-path sequencer.eif --debug-mode --attach-console