# 1 - Make a 32-byte secp256k1 private key
`openssl rand -hex 32 > priv.hex`                     
# 64-hex-char string
# example → 3e0ca14a…b7d4

# 2 - Derive the uncompressed public key (04 + x + y)
`npx --yes @noble/secp256k1 get-public $(cat priv.hex) > pub.hex`
# example → 04ef65…e19c

# 3 - Derive the Ethereum address (= last 20 bytes of keccak256(pub))
`npx --yes @noble/secp256k1 address $(cat priv.hex) > address.txt`
# example → 0xCe52…E0FA
