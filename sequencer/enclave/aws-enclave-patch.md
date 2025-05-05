# aws‑nitro‑enclaves‑nsm‑node – ARM Support Port

Added [lacking](https://github.com/wei-rong-1/aws-nitro-enclaves-nsm-node?tab=readme-ov-file#support-os) native binaries for Linux arm64 and macOS arm64 (Apple Silicon) to the original `aws‑nitro‑enclaves‑nsm‑node` package.

## What Was Done 🛠️

| Step | Details |
| ---- | ------- |
| **1. Build binaries** | clone [aws‑nitro‑enclaves‑nsm‑node](https://github.com/wei-rong-1/aws-nitro-enclaves-nsm-node) <br> *macOS* → `yarn napi build --platform --target aarch64-apple-darwin --release` (as PoC for local dev machine)<br>*Linux* → `yarn napi build --platform --target aarch64-unknown-linux-gnu --release` |
| **2. Create per‑platform sub‑packages** | Placed each `.node` file in `npm/<platform>/` and added an 8‑line `package.json` with:<br>`os`, `cpu`, `main`, `files`. |
| **3. Pack tarballs** | `cd npm/darwin-arm64 && npm pack` → `…darwin-arm64.tgz`<br>`cd npm/linux-arm64-gnu && npm pack` → `…linux-arm64-gnu.tgz` |
| **4. Vendor tarballs** | Moved tarballs to `vendor/` and listed them in **`optionalDependencies`** so npm installs the matching binary. |
| **5. Regenerate lockfile** | Ran `npm install` on EC2 to capture the Linux‑arm64 tarball in `package-lock.json`. |

## Challenges & Fixes ⚠️

| Issue | Fix |
| ----- | --- |
| **Loader crash on EC2** – `Cannot find module '…linux-arm64-gnu'` | Binary package wasn’t being installed; solved by adding tarball to `optionalDependencies` and regenerating the lock file on Linux. |
| **`patch‑package` ENOENT** | Learned ``patch-package`` doesn't add new binaries, so support for a new platform can't be patched in; switched to compiled binaries + optional‑deps pattern used by `@napi-rs`. |
| **npm skips platform tarballs in lock** | Re‑created `package-lock.json` on each target platform once; which made `npm ci` is deterministic. |
| **“tarball seems to be corrupted”** | Occurred with zero‑byte tgz in cache; resolved by `npm cache clean --force` then repacking. |
| **local dev env vs remote ec2** | General headaches caused by difference between local Apple arm64 vs remote Linux arm64 - Apple arm worked quickly, Linux arm took a lot of trouble shooting.| 

## Usage
Don't want to manually recompile [aws-nitro-enclaves-nsm-node](https://github.com/wei-rong-1/aws-nitro-enclaves-nsm-node), but need Linux arm? Just copy appropriate file from [vendor/](https://github.com/s-alad/le-AMM/tree/main/sequencer/enclave/vendor)
