import { parseAbi } from "viem";

/** The subset of RefractShielded the frontend actually calls. */
export const shieldedPoolAbi = parseAbi([
  "function deposit(bytes32 commitment) payable",
  "function withdraw(uint256[2] a, uint256[2][2] b, uint256[2] c, bytes32 root, bytes32 nullifierHash, address recipient, address relayer, uint256 fee)",
  "function nullifierSpent(bytes32) view returns (bool)",
  "function commitmentExists(bytes32) view returns (bool)",
  "function getLastRoot() view returns (bytes32)",
  "function isKnownRoot(bytes32) view returns (bool)",
  "function nextIndex() view returns (uint32)",
  "function denomination() view returns (uint256)",
  "event Deposit(bytes32 indexed commitment, uint32 leafIndex, uint256 timestamp)",
  /*
   * The custom errors matter as much as the functions. Without them in the ABI
   * viem has no way to turn a revert into words: the node returns a four-byte
   * selector and the user is shown "Internal JSON-RPC error", which says
   * nothing about whether their note is safe.
   */
  "error CommitmentUsed()",
  "error NullifierUsed()",
  "error UnknownRoot()",
  "error BadProof()",
  "error WrongValue()",
  "error TreeFull()",
  "error FeeTooHigh()",
  "error NotInField()",
  "error TransferFailed()",
]);
