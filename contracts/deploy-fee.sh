#!/usr/bin/env bash
#
# Deploys RefractFeeRouter to Robinhood Chain (4663).
#
# Fee and cashback shares are immutable, so they are named here rather than
# passed in: a fee that can be changed later is a fee nobody can reason about.
#
#   surplus fee   20% of what routing beat the V2 baseline by, never of the trade
#   cashback      half of that fee, owed back to the volume that earned it
#
# The collector only ever receives its own half as each trade settles. It has
# no claim on the cashback reserve; see the contract.

set -euo pipefail
cd "$(dirname "$0")"
export PATH="$HOME/.foundry/bin:$PATH"

RPC="https://rpc.mainnet.chain.robinhood.com"
ROUTER="0x8876789976dEcBfCbBbe364623C63652db8C0904"
V2_FACTORY="0x8bcEaA40B9AcdfAedF85AdF4FF01F5Ad6517937f"
WETH="0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73"
SURPLUS_FEE_BPS=2000
CASHBACK_BPS=5000

ENVFILE="../.env.local"
KEY=$(grep "^DEPLOY_PRIVATE_KEY=" "$ENVFILE" | cut -d= -f2)
ADDR=$(grep "^DEPLOY_ADDRESS=" "$ENVFILE" | cut -d= -f2)
COLLECTOR="$ADDR"

echo
echo "  Deploying the fee router"
echo "  ─────────────────────────────────────────────"
echo "  surplus fee   ${SURPLUS_FEE_BPS} bps of the surplus (20%)"
echo "  cashback      ${CASHBACK_BPS} bps of that fee (half)"
echo "  collector     $COLLECTOR"
printf "  balance       %s ETH\n" "$(python3 -c "print(f'{int('$(cast balance "$ADDR" --rpc-url "$RPC")')/1e18:.6f}')")"
echo "  ─────────────────────────────────────────────"
echo

FEE=$(forge create src/RefractFeeRouter.sol:RefractFeeRouter \
  --private-key "$KEY" --rpc-url "$RPC" --broadcast --json \
  --constructor-args "$ROUTER" "$V2_FACTORY" "$WETH" "$SURPLUS_FEE_BPS" "$CASHBACK_BPS" "$COLLECTOR" \
  | python3 -c "import json,sys;print(json.load(sys.stdin)['deployedTo'])")

BLOCK=$(cast block-number --rpc-url "$RPC")
echo "  fee router    $FEE"
echo "  deployBlock   $BLOCK"
echo
echo "  on-chain check:"
echo "    router      $(cast call "$FEE" 'router()(address)' --rpc-url "$RPC")"
echo "    collector   $(cast call "$FEE" 'collector()(address)' --rpc-url "$RPC")"
echo "    surplusFee  $(cast call "$FEE" 'surplusFeeBps()(uint16)' --rpc-url "$RPC") bps"
echo "    cashback    $(cast call "$FEE" 'cashbackBps()(uint16)' --rpc-url "$RPC") bps"
echo
echo "  Put these in src/lib/fee-config.ts:"
echo "    address:     \"$FEE\","
echo "    deployBlock: ${BLOCK}n,"
