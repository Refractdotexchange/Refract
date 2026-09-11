/**
 * The hidden-amount pool on chain 4663.
 *
 * One pool, every size. There is deliberately no list here: splitting users
 * across denominations is exactly the problem this design removes, so a second
 * entry would be a step backwards rather than a feature.
 */
export const REFRACT_POOL = {
  /**
   * Redeployed when the pool gained swap: the router is fixed in the
   * constructor, so adding it meant a new address. The previous pool was empty
   * and every note in it was already spent, so nothing was stranded.
   */
  address: "0xf393372F50186C49C4fD860E3FA19afA6B0D75DF" as `0x${string}` | null,
  /** Block it was deployed at, so scans do not start from genesis. */
  deployBlock: 60132710n,
};

export const isPoolLive = () => REFRACT_POOL.address !== null;
