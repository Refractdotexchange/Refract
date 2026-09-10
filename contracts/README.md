# RefractVault

Shielded vault for private swaps on Robinhood Chain (4663).

## Read this first

**This contract is custodial.** Funds are pooled. Individual balances live
off-chain with the operator, which is exactly what makes swaps private: a trade
between two users never touches the chain, so it is invisible to observers, MEV
bots and chain analysis.

The price of that privacy is trust. A normal withdrawal needs a signature from
the operator key. If that key is lost, compromised, or the operator declines to
sign, normal withdrawals stop.

Any interface built on this must say so. Calling it non-custodial would be false.

## What this does that a plain custodial vault does not

Every deposit and withdrawal is recorded on-chain per address. If the operator
stops signing for `escapeDelay`, **any depositor can call `escape()` and recover
up to their own net deposit without permission.**

That is a floor, not exact accounting. Deposit ETH, swap to USDC inside the
vault, and escape returns ETH, because ETH is what the chain can prove you put
in. It exists so an unresponsive operator cannot strand funds forever.

There is also **no owner function that moves user funds.** No sweep, no rescue.
The strongest owner power is rotating the operator key, and that still cannot
pay anyone without a fresh signature.

## Tests

```bash
forge test
```

21 tests pass, covering signature forgery, replay, expiry, amount tampering,
escape locking and unlocking, escape capped at own deposit, partial recovery
when the pool is short, operator rotation, and that the owner cannot drain the
vault. Plus a 256-run fuzz test asserting escape can never pay out more than
was deposited.

## Before mainnet

1. **Audit.** This holds user funds. Non-negotiable.
2. **Operator key in an HSM or KMS**, never in an env var on an app server.
   Compromise of this key means an attacker can authorise withdrawals.
3. **Owner as a multisig**, not an EOA.
4. **Pick the escape delay deliberately.** Seven days is a reasonable default:
   long enough that routine downtime does not trigger a bank run, short enough
   to be a real remedy. It is immutable once deployed.
5. **Test on a fork first**, with real deposits and withdrawals end to end.

## Deploy

```bash
export PATH="$HOME/.foundry/bin:$PATH"

forge create src/RefractVault.sol:RefractVault \
  --rpc-url https://rpc.mainnet.chain.robinhood.com \
  --constructor-args <OPERATOR_ADDRESS> 604800 \
  --interactive
```

`--interactive` prompts for the key rather than taking it from a flag or an env
var, so it does not end up in shell history.

604800 is seven days in seconds.

## The withdrawal ticket

The operator signs an EIP-712 `Withdraw` struct:

```
Withdraw(address user,address token,uint256 amount,uint256 nonce,uint256 deadline)
```

Anyone can submit a valid ticket, so a user is never stuck waiting for the
operator to also pay gas. Each ticket is single-use, keyed by its digest.
