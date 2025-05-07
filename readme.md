
### AWS MACHINE SETUP  
- EC2: m8g.xlarge
- vCPU: 4
- AMI:
    - NAME: ami-0c4e709339fa8521a
    - ID: ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-arm64-server-20250305
- Ubuntu Server 24.04 LTS (HVM), SSD Volume Type
- STORAGE:
    - 64 GiB, EBS, General purpose SSD (gp3), 3000 IOPS, Encrypted
- Architecture: arm64
- Virtualization: hvm
- Nitro Enabled
- Firewall:
    - allow all traffic or open relayer ports

### ENCLAVE & NITRO CLI SETUP
- install essentials
    - `sudo apt install -y gcc make git llvm-dev libclang-dev clang`
- install docker
    - https://docs.docker.com/engine/install/debian/
- install & build nitro cli:
    - https://github.com/aws/aws-nitro-enclaves-cli/blob/main/docs/ubuntu_20.04_how_to_install_nitro_cli_from_github_sources.md
- enclave configuration file specs
    ```yaml
    ---
    # Enclave configuration file.
    #
    # How much memory to allocate for enclaves (in MiB).
    memory_mib: 2048
    #
    # How many CPUs to reserve for enclaves.
    cpu_count: 2
    ```

### SETUP
- make a 32-byte secp256k1 private key for the **guardian**
    - `openssl rand -hex 32 > priv.hex`    
- derive the uncompressed public key & address
    - `npx tsx cryptography/src/derive.ts priv.hex`
- clone repo
    - `git clone https://github.com/s-alad/le-AMM.git`
- rename repo
    - `mv le-AMM/ TEE/`
- move build/rebuild script to ~
    - `mv ~/TEE/rebuild.sh ~`
    - `chmod +x rebuild.sh`
- useful:
    - `sudo lsof -i :8080`
    - `sudo kill <pid>`

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

### ATTESTATION
- generate nonce for attestation:
    - `openssl rand -hex 32`
- curl attestation:
    - `curl http://localhost:8080/attest?nonce=77a189b2ac7d22eaebb366e454c8654d999b82785d7c9c275e948d816da8adce --output attest.cbor`
    - replace nonce & localhost with your parameters
- scp attestation:
    - `scp -o IdentitiesOnly=yes -i "TEE.pem" ubuntu@ec2-34-231-171-100.compute-1.amazonaws.com:~/attest.cbor ./`
- validate attestation:
    - https://edgebit.io/attestation/ 
    - https://emn178.github.io/online-tools/base64_decode.html