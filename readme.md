
### AWS MACHINE SETUP  
- EC2
- M8g XLarge
- Storage Encryption
- Nitro Enabled

### ENCLAVE
- https://github.com/aws/aws-nitro-enclaves-cli/blob/main/docs/ubuntu_20.04_how_to_install_nitro_cli_from_github_sources.md

### ATTEST  
- generate nonce: `openssl rand -hex 32`
- `curl http://localhost:8080/attest?nonce=77a189b2ac7d22eaebb366e454c8654d999b82785d7c9c275e948d816da8adce --output attest.cbor`
- `scp -o IdentitiesOnly=yes -i "TEE.pem" ubuntu@ec2-34-231-171-100.compute-1.amazonaws.com:~/attest.cbor ./`

### ATTESTATION
- https://edgebit.io/attestation/ 
- https://emn178.github.io/online-tools/base64_decode.html

### RUN
0. contract/.env
    - SEPOLIA_RPC_URL=
    - SEQUENCER_PRIV_HEX=
1. npx hardhat ignition deploy ignition/modules/TEEAMM.ts --network sepolia
2. run enclave
3. contract/GUARDIAN.script.ts
    - contract address
    - enclave public key
4. host/.env
    - SEPOLIA_RPC_URL=
    - GUARDIAN_PRIVATE_KEY= (sam as SEQUENCER_PRIV_HEX)
    - TEEAMM_CONTRACT_ADDRESS=
3. 