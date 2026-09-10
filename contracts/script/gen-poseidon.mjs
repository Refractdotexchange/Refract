// Generates the Poseidon(2) hasher contract. This is circomlib's audited
// implementation emitted as EVM bytecode, not something hand-written here:
// the Merkle tree must hash identically on-chain and inside the circuit, and
// hand-rolling that is exactly how shielded pools break.
import { poseidonContract, buildPoseidon } from 'circomlibjs';
import { writeFileSync, mkdirSync } from 'fs';

const abi = poseidonContract.generateABI(2);
const bytecode = poseidonContract.createCode(2);

mkdirSync('artifacts', { recursive: true });
writeFileSync('artifacts/Poseidon2.json', JSON.stringify({ abi, bytecode }, null, 2));

// Reference vector so the Solidity side can be checked against JS.
const p = await buildPoseidon();
const h = p.F.toString(p([1n, 2n]));
writeFileSync('artifacts/poseidon-vectors.json', JSON.stringify({
  'poseidon(1,2)': h,
  'poseidon(0,0)': p.F.toString(p([0n, 0n])),
}, null, 2));

console.log('  abi entries :', abi.length);
console.log('  bytecode    :', bytecode.length / 2, 'bytes');
console.log('  poseidon(1,2) =', h);
