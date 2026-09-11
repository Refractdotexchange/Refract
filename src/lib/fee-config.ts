/**
 * The fee router on chain 4663.
 *
 * Both shares are immutable on the deployed contract and are restated here
 * only so the interface can explain itself without a call: 20% of the surplus
 * routing found, and half of that owed back to the volume that earned it.
 */
export const FEE_ROUTER = {
  address: "0x8F173b21c91678059f7Edfa2B3A4f2df82B8bA0e" as `0x${string}` | null,
  deployBlock: 60451737n,
  surplusFeeBps: 2000,
  cashbackBps: 5000,
};

export const isFeeRouterLive = () => FEE_ROUTER.address !== null;
