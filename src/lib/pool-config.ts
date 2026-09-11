/**
 * The hidden-amount pool on chain 4663.
 *
 * One pool, every size. There is deliberately no list here: splitting users
 * across denominations is exactly the problem this design removes, so a second
 * entry would be a step backwards rather than a feature.
 */
export const REFRACT_POOL = {
  address: "0xFd0F36c806F598557D5bDb18c829962eb5D5431F" as `0x${string}` | null,
  /** Block it was deployed at, so scans do not start from genesis. */
  deployBlock: 59918731n,
};

export const isPoolLive = () => REFRACT_POOL.address !== null;
