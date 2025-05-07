1. `docker build -t sequencer:latest .`  
2. `nitro-cli build-enclave --docker-uri sequencer:latest --output-file sequencer.eif`  
3. `nitro-cli run-enclave --cpu-count 2 --memory 2000 --enclave-cid 16 --eif-path sequencer.eif --debug-mode --attach-console`  
5. `nitro-cli describe-enclaves`  
6. `nitro-cli terminate-enclave --enclave-id`  
