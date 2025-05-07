# SEQUENCER

### HOST (relayer)
in charge of relaying information from & to the enclave via VSOCK as the enclave cannot communicate with the outside world & internet. 

### ENCLAVE (tee)
in charge of ordering and creating transactions, and attesting its honesty.

### ENDPOINTS
- /health
- /info
- /attest
- /swap
- /test-swap