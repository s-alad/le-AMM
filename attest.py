import cbor2
import sys
import os
import pprint
import traceback

if len(sys.argv) < 2:
    print(f"usage: python {sys.argv[0]} <file.cbor>")
    sys.exit(1)

filepath = sys.argv[1]

if not os.path.exists(filepath):
    print(f"err: file not found at {filepath}")
    sys.exit(1)

print(f"decoding file: {filepath}")

try:
    with open(filepath, 'rb') as f:
        # attestation doc is typically COSE_Sign1 CBOR structure (array[4])
        # the payload with actual attestation data is the 3rd element (index 2)
        # and is itself CBOR encoded bytes.
        cose_sign1 = cbor2.load(f)
        payload_bytes = cose_sign1[2]
        if not isinstance(payload_bytes, bytes):
            print(f"Error: Expected payload (index 2) to be bytes, but got {type(payload_bytes)}")
            sys.exit(1)
            
        attestation_data = cbor2.loads(payload_bytes)

        print("\n--- Decoded Attestation Data ---")
        pprint.pprint(attestation_data)

        # extract and print PCRs in hex
        if 'pcrs' in attestation_data and isinstance(attestation_data['pcrs'], dict):
            print("\n--- PCR values (Hex) ---")
            for index in sorted(attestation_data['pcrs'].keys()):
                value = attestation_data['pcrs'][index]
                if isinstance(value, bytes):
                    print(f"  PCR{index}: {value.hex()}")
                else:
                    print(f"  PCR{index}: err - value is not bytes ({type(value)})")
        else:
            print("\nPCRs map ('pcrs') not found or not a dictionary in payload.")

except FileNotFoundError:
    print(f"err: file not found at {filepath}")
except Exception as e:
    print(f"err decoding CBOR: {e}")
    traceback.print_exc()