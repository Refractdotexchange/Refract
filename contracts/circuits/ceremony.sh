#!/usr/bin/env bash
#
# Trusted setup contribution for the REFRACT shielded pool.
#
# Run this yourself. It adds your own randomness to the proving key, then
# rebuilds the on-chain verifier and the browser artefact to match.
#
# The number this generates is what people call toxic waste: anyone who keeps a
# copy can forge withdrawals. This script never writes it to disk and never
# prints it. Close the terminal when you are done.
#
#   ./ceremony.sh "your name or handle"
#
# Run it more than once, on different machines or with other people, and the
# pool is safe as long as ANY single contributor's randomness is gone. Each
# extra contribution only ever adds security.

set -euo pipefail
cd "$(dirname "$0")"

NAME="${1:-}"
if [ -z "$NAME" ]; then
  echo "Usage: ./ceremony.sh \"your name or handle\"" >&2
  echo "The name is published with your contribution so it can be attributed." >&2
  exit 1
fi

SNARKJS="../../node_modules/.bin/snarkjs"
[ -x "$SNARKJS" ] || { echo "snarkjs not found. Run npm install in the project root." >&2; exit 1; }

IN="withdraw_final.zkey"
[ -f "$IN" ] || { echo "$IN not found. Compile the circuit first, see README.md." >&2; exit 1; }

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="withdraw_${STAMP}.zkey"

echo
echo "  Contributor : $NAME"
echo "  Input       : $IN"
echo "  Output      : $OUT"
echo

# Randomness comes from the OS CSPRNG and is passed in memory only. It is not
# echoed, not logged, and not written anywhere.
ENTROPY="$(head -c 128 /dev/urandom | base64)"

"$SNARKJS" zkey contribute "$IN" "$OUT" --name="$NAME" -e="$ENTROPY"
unset ENTROPY

echo
echo "  Verifying the new key against the circuit…"
"$SNARKJS" zkey verify withdraw.r1cs pot14_final.ptau "$OUT"

# Promote the contribution and rebuild everything that depends on it.
mv "$OUT" "$IN"
"$SNARKJS" zkey export verificationkey "$IN" verification_key.json
"$SNARKJS" zkey export solidityverifier "$IN" ../src/Verifier.sol
cp "$IN" ../../public/zk/withdraw.zkey
cp verification_key.json ../../public/zk/verification_key.json

# Proofs are bound to the proving key, so every fixture made with the old key
# is now correctly invalid. Regenerate them, otherwise the test suite fails in
# a way that looks like a bug rather than the expected outcome of a ceremony.
echo
echo "  Regenerating proof fixtures for the new key…"
node prove-test.mjs >/dev/null 2>&1 && echo "  fixtures rebuilt" || echo "  WARNING: fixture rebuild failed, run forge test to check"

echo
echo "  ────────────────────────────────────────────────────────────"
echo "  Done. Publish this so anyone can verify the chain of setup:"
echo
"$SNARKJS" zkey verify withdraw.r1cs pot14_final.ptau "$IN" 2>&1 | grep -iE "contribution|hash" | head -20
echo
echo "  Rebuilt: src/Verifier.sol and public/zk/withdraw.zkey"
echo "  Next   : forge test, then redeploy the verifier if it is already live."
echo "  ────────────────────────────────────────────────────────────"
echo
