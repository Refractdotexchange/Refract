/**
 * The hidden-amount pool on chain 4663.
 *
 * One pool, every size. There is deliberately no list here: splitting users
 * across denominations is exactly the problem this design removes, so a second
 * entry would be a step backwards rather than a feature.
 */
export const REFRACT_POOL = {
  address: null as `0x${string}` | null,
  /** Block it was deployed at, so scans do not start from genesis. */
  deployBlock: 0n,
};

export const isPoolLive = () => REFRACT_POOL.address !== null;
