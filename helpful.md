### ENCLAVE
- `docker build -t sequencer:latest .`  
- `nitro-cli build-enclave --docker-uri sequencer:latest --output-file sequencer.eif`  
- `nitro-cli run-enclave --cpu-count 2 --memory 2000 --enclave-cid 16 --eif-path sequencer.eif --debug-mode --attach-console`  
- `nitro-cli describe-enclaves`  
- `nitro-cli terminate-enclave --enclave-id`  

### GENERAL
- `sudo lsof -i :8080`
- `sudo kill <pid>`