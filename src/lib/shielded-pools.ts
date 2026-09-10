/**
 * Shielded pool registry.
 *
 * Denominations are fixed per pool on purpose: a pool with mixed amounts lets
 * anyone match a withdrawal to a deposit by value, which defeats the point.
 * Fewer, larger pools give a bigger anonymity set than many small ones.
 *
 * `address` is filled in once each pool is deployed on 4663.
 */

export type ShieldedPool = {
  id: string;
  label: string;
  token: `0x${string}`;
  /** Base units. */
  denomination: bigint;
  address: `0x${string}` | null;
  /** Block the pool was deployed at, so event scans do not start from genesis. */
  deployBlock: bigint;
};

export const SHIELDED_POOLS: ShieldedPool[] = [
  {
    id: "eth-0.001",
    label: "0.001 ETH",
    token: "0x0000000000000000000000000000000000000000",
    denomination: 1000000000000000n,
    // Deployed on 4663. Verifier 0xBAe4536F…, hasher 0x1fda72a7…, both
    // confirmed to match the compiled circuit before wiring this in.
    address: "0xFAE178987b368e4C76A71b83E602C5AEC64d1220",
    deployBlock: 59512541n,
  },
];

export const isPoolLive = (p: ShieldedPool) => p.address !== null;
