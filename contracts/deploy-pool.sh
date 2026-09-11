#!/usr/bin/env bash
#
# Deploys the hidden-amount pool (RefractPool) to Robinhood Chain (4663).
#
# One pool, every size. Unlike the fixed-denomination pool this replaces, the
# amount is not baked in at deploy time, so there is nothing to choose here and
# no reason to ever deploy a second one.
#
#   ./deploy-pool.sh
#
# Prefers the burner key in ../.env.local, which is gitignored and excluded
# from the Vercel upload. Falls back to --interactive so the key is never
# written to a file, an env var, or your shell history.

set -euo pipefail
cd "$(dirname "$0")"
export PATH="$HOME/.foundry/bin:$PATH"

RPC="https://rpc.mainnet.chain.robinhood.com"

echo
echo "  Deploying the hidden-amount pool"
echo "  ─────────────────────────────────────────────"
echo "  chain         Robinhood Chain (4663)"
echo "  amounts       any, hidden inside the note"
echo "  ─────────────────────────────────────────────"
echo

ENVFILE="../.env.local"
if [ -f "$ENVFILE" ] && grep -q "^DEPLOY_PRIVATE_KEY=" "$ENVFILE"; then
  KEY=$(grep "^DEPLOY_PRIVATE_KEY=" "$ENVFILE" | cut -d= -f2)
  ADDR=$(grep "^DEPLOY_ADDRESS=" "$ENVFILE" | cut -d= -f2)
  BAL=$(cast balance "$ADDR" --rpc-url "$RPC" 2>/dev/null || echo 0)
  echo "  deployer      $ADDR"
  printf "  balance       %s ETH\n" "$(python3 -c "print(f'{int('${BAL:-0}')/1e18:.6f}')")"
  echo
  if [ "${BAL:-0}" = "0" ]; then
    echo "  This wallet has no ETH on 4663. Send it about 0.002 ETH and rerun." >&2
    exit 1
  fi
  KEYARG=(--private-key "$KEY")
else
  echo "  No .env.local found. You will be prompted for a private key."
  echo
  KEYARG=(--interactive)
fi

json() { python3 -c "import json,sys;print(json.load(sys.stdin)['$1'])"; }

echo "  1/4  Poseidon hasher (circomlib bytecode)"
BC=$(python3 -c "import json;print(json.load(open('artifacts/Poseidon2.json'))['bytecode'])")
HASHER=$(cast send "${KEYARG[@]}" --rpc-url "$RPC" --create "$BC" --json | json contractAddress)
echo "       $HASHER"

echo "  2/4  Groth16 verifier"
VERIFIER=$(forge create src/JoinSplitVerifier.sol:JoinSplitVerifier \
  "${KEYARG[@]}" --rpc-url "$RPC" --broadcast --json | json deployedTo)
echo "       $VERIFIER"

echo "  3/4  verifier adapter"
ADAPTER=$(forge create src/JoinSplitAdapter.sol:JoinSplitAdapter \
  "${KEYARG[@]}" --rpc-url "$RPC" --broadcast --json --constructor-args "$VERIFIER" | json deployedTo)
echo "       $ADAPTER"

echo "  4/4  pool"
POOL=$(forge create src/RefractPool.sol:RefractPool \
  "${KEYARG[@]}" --rpc-url "$RPC" --broadcast --json --constructor-args "$ADAPTER" "$HASHER" | json deployedTo)
echo "       $POOL"

BLOCK=$(cast block-number --rpc-url "$RPC")

echo
echo "  ─────────────────────────────────────────────"
echo "  pool          $POOL"
echo "  deployBlock   $BLOCK"
echo "  root          $(cast call "$POOL" 'getLastRoot()(bytes32)' --rpc-url "$RPC")"
echo "  leaves        $(cast call "$POOL" 'nextIndex()(uint32)' --rpc-url "$RPC")"
echo "  ─────────────────────────────────────────────"
echo
echo "  Put these in src/lib/pool-config.ts:"
echo "    address:     \"$POOL\","
echo "    deployBlock: ${BLOCK}n,"
echo
