# Deploying the shielded pool with MetaMask

One transaction deploys everything: the Poseidon hasher, the verifier, the
adapter, and the pool, all wired together.

Rehearsed locally first: 6.4M gas, and the resulting pool accepts a deposit and
hashes identically to the circuit.

## Steps

1. Open **remix.ethereum.org**

2. Create a new file `DeployShielded.sol` and paste in the contents of
   `DeployShielded.sol` from this folder.

3. **Solidity Compiler** tab:
   - Compiler `0.8.24`
   - Enable **optimization**, runs `200`
   - Compile. Warnings are fine, errors are not.

4. **Deploy & Run** tab:
   - Environment: **Injected Provider - MetaMask**
   - Confirm MetaMask is on **Robinhood Chain (4663)**
   - Contract: **DeployShielded**

5. Expand the constructor fields and enter:

   ```
   _ROUTER        0x8876789976dEcBfCbBbe364623C63652db8C0904
   _TOKEN         0x0000000000000000000000000000000000000000
   _DENOMINATION  1000000000000000
   ```

   `_TOKEN` zero means native ETH. `_DENOMINATION` is 0.001 ETH in wei: every
   deposit in this pool is that exact size, which is what makes them
   indistinguishable from one another.

6. Click **transact** and confirm in MetaMask. Roughly 0.001 ETH of gas.

7. When it confirms, expand the deployed contract and read the four public
   values. Send back:

   ```
   poseidon   0x…
   verifier   0x…
   adapter    0x…
   pool       0x…   ← this is the one the frontend needs
   ```

   Also note the **block number** of the deploy transaction, so event scanning
   does not have to start from genesis.

## Before depositing anything real

This contract has not been audited, and unlike the custodial vault it has **no
escape hatch**. If there is a bug, deposits are stuck permanently. Test with an
amount you would not mind losing.
