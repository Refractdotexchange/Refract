set -e
export PATH="$HOME/.foundry/bin:$HOME/.cargo/bin:$PATH"
cd /Users/shaan/PLAY/prism
pkill -f "anvil --port 8548" 2>/dev/null || true
sleep 1
anvil --port 8548 --silent > /tmp/anvil3.log 2>&1 &
sleep 5
cd contracts
PK=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
R=http://localhost:8548
BC=$(python3 -c "import json;print(json.load(open('artifacts/Poseidon2.json'))['bytecode'])")
HASHER=$(cast send --private-key $PK --rpc-url $R --create "$BC" --json | python3 -c "import json,sys;print(json.load(sys.stdin)['contractAddress'])")
VERIFIER=$(forge create src/JoinSplitVerifier.sol:JoinSplitVerifier --private-key $PK --rpc-url $R --broadcast --json | python3 -c "import json,sys;print(json.load(sys.stdin)['deployedTo'])")
ADAPTER=$(forge create src/JoinSplitAdapter.sol:JoinSplitAdapter --private-key $PK --rpc-url $R --broadcast --json --constructor-args $VERIFIER | python3 -c "import json,sys;print(json.load(sys.stdin)['deployedTo'])")
POOL=$(forge create src/RefractPool.sol:RefractPool --private-key $PK --rpc-url $R --broadcast --json --constructor-args $ADAPTER $HASHER | python3 -c "import json,sys;print(json.load(sys.stdin)['deployedTo'])")
echo "$POOL" > /tmp/pool_addr.txt
echo "fresh pool at $POOL"
cd ..
npx tsx ./scripts/e2e-shielded.mts
