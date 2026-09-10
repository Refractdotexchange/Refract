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
    id: "eth-0.1",
    label: "0.1 ETH",
    token: "0x0000000000000000000000000000000000000000",
    denomination: 100000000000000000n,
    address: null,
    deployBlock: 0n,
  },
  {
    id: "eth-1",
    label: "1 ETH",
    token: "0x0000000000000000000000000000000000000000",
    denomination: 1000000000000000000n,
    address: null,
    deployBlock: 0n,
  },
  {
    id: "eth-10",
    label: "10 ETH",
    token: "0x0000000000000000000000000000000000000000",
    denomination: 10000000000000000000n,
    address: null,
    deployBlock: 0n,
  },
];

export const isPoolLive = (p: ShieldedPool) => p.address !== null;
