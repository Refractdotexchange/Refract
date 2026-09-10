#!/usr/bin/env bash
#
# Deploys the REFRACT shielded pool to Robinhood Chain (4663).
#
# Run this yourself. --interactive makes forge prompt for the private key, so
# it is never written to a file, an env var, or your shell history.
#
#   ./deploy.sh [denomination_in_wei]
#
# Default denomination is 0.001 ETH. Every deposit in a pool is the same size,
# which is what makes them indistinguishable, so this is fixed at deploy time.

set -euo pipefail
cd "$(dirname "$0")"
export PATH="$HOME/.foundry/bin:$PATH"

RPC="https://rpc.mainnet.chain.robinhood.com"
ROUTER="0x8876789976dEcBfCbBbe364623C63652db8C0904"
TOKEN="0x0000000000000000000000000000000000000000"   # native ETH
DENOM="${1:-1000000000000000}"                        # 0.001 ETH

echo
echo "  Deploying the shielded pool"
echo "  ─────────────────────────────────────────────"
echo "  chain         Robinhood Chain (4663)"
echo "  router        $ROUTER"
echo "  token         native ETH"
printf "  denomination  %s wei (%s ETH)\n" "$DENOM" "$(python3 -c "print(f'{int('$DENOM')/1e18:g}')")"
echo "  est. gas      ~6.4M, roughly 0.001 ETH"
echo "  ─────────────────────────────────────────────"
echo
# Prefer the burner key in .env.local when it exists, so the key is not retyped
# on every run. That file is gitignored and excluded from the Vercel upload.
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

forge create src/DeployShielded.sol:DeployShielded \
  --rpc-url "$RPC" \
  --broadcast \
  "${KEYARG[@]}" \
  --constructor-args "$ROUTER" "$TOKEN" "$DENOM" \
  | tee /tmp/refract-deploy.log

DEPLOYER=$(grep -oE "Deployed to: 0x[a-fA-F0-9]{40}" /tmp/refract-deploy.log | tail -1 | awk '{print $3}')
TXHASH=$(grep -oE "Transaction hash: 0x[a-fA-F0-9]{64}" /tmp/refract-deploy.log | tail -1 | awk '{print $3}')

if [ -z "${DEPLOYER:-}" ]; then
  echo "  Could not read the deployed address. Check the output above." >&2
  exit 1
fi

echo
echo "  Reading the addresses it created…"
POOL=$(cast call "$DEPLOYER" "pool()(address)" --rpc-url "$RPC")
POSEIDON=$(cast call "$DEPLOYER" "poseidon()(address)" --rpc-url "$RPC")
VERIFIER=$(cast call "$DEPLOYER" "verifier()(address)" --rpc-url "$RPC")
ADAPTER=$(cast call "$DEPLOYER" "adapter()(address)" --rpc-url "$RPC")
BLOCK=$(cast receipt "$TXHASH" --rpc-url "$RPC" 2>/dev/null | grep -i "^blockNumber" | awk '{print $2}')

echo
echo "  ─────────────────────────────────────────────"
echo "  pool          $POOL"
echo "  poseidon      $POSEIDON"
echo "  verifier      $VERIFIER"
echo "  adapter       $ADAPTER"
echo "  deployBlock   ${BLOCK:-unknown}"
echo "  ─────────────────────────────────────────────"
echo
echo "  Sanity check:"
cast call "$POOL" "denomination()(uint256)" --rpc-url "$RPC" | xargs -I{} echo "    denomination  {} wei"
cast call "$POOL" "getLastRoot()(bytes32)" --rpc-url "$RPC" | xargs -I{} echo "    initial root  {}"
echo
echo "  Send the pool address and deployBlock back to wire up the frontend."
echo
