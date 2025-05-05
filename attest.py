import cbor2
import sys
import os

# Check if filename is provided
if len(sys.argv) < 2:
    print(f"Usage: python {sys.argv[0]} <attestation_doc_file.cbor>")
    sys.exit(1)

filepath = sys.argv[1]

# Check if file exists
if not os.path.exists(filepath):
      print(f"Error: File not found at {filepath}")
      sys.exit(1)

print(f"Decoding file: {filepath}")

try:
    with open(filepath, 'rb') as f:
        # Attestation doc is typically COSE_Sign1 CBOR structure (array[4])
        # The payload with actual attestation data is the 3rd element (index 2)
        # and is itself CBOR encoded bytes.
        cose_sign1 = cbor2.load(f)

        if not isinstance(cose_sign1, list) or len(cose_sign1) != 4:
            print("Error: Does not look like a COSE_Sign1 structure (CBOR Array of 4 elements).")
             # Attempting direct load (might work if not COSE wrapped)
            f.seek(0) # Reset file pointer
            attestation_data = cbor2.load(f)
            print("Warning: Loaded directly, not COSE_Sign1. Structure might differ.")
        else:
            # Decode the payload bytes (element at index 2)
            payload_bytes = cose_sign1[2]
            if not isinstance(payload_bytes, bytes):
                print(f"Error: Expected payload (index 2) to be bytes, but got {type(payload_bytes)}")
                sys.exit(1)
            attestation_data = cbor2.loads(payload_bytes) # Decode the inner CBOR

        print("\n--- Decoded Attestation Data ---")
        # Use pprint for better readability of complex structures
        import pprint
        pprint.pprint(attestation_data)

        # Specifically extract and print PCRs in hex
        if 'pcrs' in attestation_data and isinstance(attestation_data['pcrs'], dict):
            print("\n--- PCR Values (Hex) ---")
            for index in sorted(attestation_data['pcrs'].keys()):
                 value = attestation_data['pcrs'][index]
                 if isinstance(value, bytes):
                     print(f"  PCR{index}: {value.hex()}")
                 else:
                     print(f"  PCR{index}: Error - Value is not bytes ({type(value)})")
        else:
            print("\nPCRs map ('pcrs') not found or not a dictionary in payload.")

except FileNotFoundError:
      print(f"Error: File not found at {filepath}")
except Exception as e:
    print(f"Error decoding CBOR: {e}")
    import traceback
    traceback.print_exc()