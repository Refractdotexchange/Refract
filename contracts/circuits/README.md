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

## Running your own contribution

```bash
./ceremony.sh "your name or handle"
```

That adds your randomness to the proving key, verifies the result against the
circuit, rebuilds `src/Verifier.sol` and the browser artefact, and regenerates
the proof fixtures so `forge test` stays green.

The random number it generates is toxic waste: anyone holding a copy can forge
withdrawals. The script keeps it in memory, never writes it to disk and never
prints it. Close the terminal afterwards.

Run it on more than one machine, or hand it to people you know and have them
run it too. **The pool is safe as long as any single contributor's randomness
is gone**, so every extra contribution only adds security. A contributor cannot
weaken the setup even if they try, which is why accepting a contribution from
someone you do not know costs you nothing.

Publish the contribution hashes the script prints. That is what lets anyone
check the history rather than take your word for it.

## About the trusted setup

Groth16 needs a per-circuit ceremony. Whoever runs it can forge proofs if they
keep their toxic waste, which for a pool holding user funds means **forging
withdrawals**.

For mainnet this has to be a multi-party ceremony with published contributions.
A setup run by one person on one laptop is fine for testing and weak for real
deposits, not because that person is dishonest but because nobody else can
verify the waste is gone. With several contributors the claim becomes checkable:
compromise would require all of them to have cheated and coordinated.

The contributions currently in this key are local test runs. **Replace them
before any real deposit.**
