# Circuits

`withdraw.circom` proves ownership of a shielded note without revealing which
one. The tree depth (20) and the Poseidon parameters must match
`src/RefractShielded.sol` exactly, or every proof the browser builds will be
rejected on-chain.

That match is already covered by a test: `test_onchainPoseidonMatchesJs` checks
the deployed hasher against circomlibjs's reference vector.

## Build

```bash
# 1. Toolchain
cargo install --git https://github.com/iden3/circom.git
npm i -g snarkjs circomlib

# 2. Compile
circom withdraw.circom --r1cs --wasm --sym -l node_modules

# 3. Powers of tau. Use a published ceremony file for anything real; the
#    generated one below is for local testing only and is NOT safe for mainnet.
snarkjs powersoftau new bn128 16 pot16_0000.ptau -v
snarkjs powersoftau contribute pot16_0000.ptau pot16_0001.ptau --name="local" -v
snarkjs powersoftau prepare phase2 pot16_0001.ptau pot16_final.ptau -v

# 4. Circuit-specific setup
snarkjs groth16 setup withdraw.r1cs pot16_final.ptau withdraw_0000.zkey
snarkjs zkey contribute withdraw_0000.zkey withdraw_final.zkey --name="local" -v
snarkjs zkey export verificationkey withdraw_final.zkey verification_key.json

# 5. Emit the Solidity verifier
snarkjs zkey export solidityverifier withdraw_final.zkey ../src/Verifier.sol
```

## About the trusted setup

Groth16 needs a per-circuit ceremony. Whoever runs it can forge proofs if they
keep their toxic waste, which for a pool holding user funds means **forging
withdrawals**.

For mainnet this has to be a multi-party ceremony with published contributions,
so no single participant can cheat. A setup run by one person on one laptop is
fine for testing and unacceptable for real deposits. Publish the transcript.
