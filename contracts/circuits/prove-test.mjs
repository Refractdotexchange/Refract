// End-to-end check: build a real note, a real Merkle path, a real Groth16
// proof, and confirm snarkjs verifies it. If this passes, the circuit and the
// contract's tree agree.
import { buildPoseidon } from 'circomlibjs';
import * as snarkjs from 'snarkjs';
import { writeFileSync } from 'fs';
import { keccak256, toHex } from 'viem';

const F = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
const LEVELS = 20;
const poseidonBuilt = await buildPoseidon();
const H = (xs) => BigInt(poseidonBuilt.F.toString(poseidonBuilt(xs)));

// Same zeros derivation the contract uses in its constructor.
const zeros = [BigInt(keccak256(toHex('refract.shielded.v1'))) % F];
for (let i = 1; i < LEVELS; i++) zeros.push(H([zeros[i-1], zeros[i-1]]));

const rand = () => { let o=0n; for (const b of crypto.getRandomValues(new Uint8Array(31))) o=(o<<8n)|BigInt(b); return o; };

const nullifier = rand(), secret = rand();
const commitment = H([nullifier, secret]);
const nullifierHash = H([nullifier]);

// A small tree with our note plus a few decoys.
const leaves = [rand()%F, commitment, rand()%F, rand()%F];
const index = 1;

const pathElements = [], pathIndices = [];
let level = leaves.slice(), idx = index;
for (let i = 0; i < LEVELS; i++) {
  const isRight = idx % 2 === 1;
  const sib = isRight ? idx-1 : idx+1;
  pathElements.push(sib < level.length ? level[sib] : zeros[i]);
  pathIndices.push(isRight ? 1 : 0);
  const next = [];
  for (let j = 0; j < level.length; j += 2)
    next.push(H([level[j], j+1 < level.length ? level[j+1] : zeros[i]]));
  level = next.length ? next : [zeros[i+1] ?? zeros[i]];
  idx >>= 1;
}
const root = level[0];

const recipient = BigInt('0x1111111111111111111111111111111111111111');
const input = {
  root: root.toString(), nullifierHash: nullifierHash.toString(),
  recipient: recipient.toString(), relayer: '0', fee: '0', refund: '0',
  nullifier: nullifier.toString(), secret: secret.toString(),
  pathElements: pathElements.map(String), pathIndices: pathIndices.map(String),
};

console.time('  proof generated in');
const { proof, publicSignals } = await snarkjs.groth16.fullProve(
  input, 'withdraw_js/withdraw.wasm', 'withdraw_final.zkey');
console.timeEnd('  proof generated in');

const vk = JSON.parse(await import('fs').then(m => m.readFileSync('verification_key.json', 'utf8')));
const ok = await snarkjs.groth16.verify(vk, publicSignals, proof);
console.log('  snarkjs verify   :', ok ? 'VALID' : 'INVALID');

// Tamper check: a forged recipient must fail.
const bad = [...publicSignals]; bad[2] = '999';
console.log('  tampered proof   :', await snarkjs.groth16.verify(vk, bad, proof) ? 'ACCEPTED (BAD!)' : 'rejected');

// Save calldata so the Solidity verifier can be tested against the same proof.
const cd = await snarkjs.groth16.exportSolidityCallData(proof, publicSignals);
const flat = cd.replace(/[\[\]"\s]/g, '').split(',').filter(Boolean);
writeFileSync('../artifacts/proof-fixture.json', JSON.stringify({ flat }, null, 2));
// The browser test checks the same maths through the same verifier, so it can
// share this fixture until a fresh browser-side capture replaces it.
writeFileSync('../artifacts/browser-proof.json', JSON.stringify({ flat }, null, 2));
console.log('  fixtures saved for the on-chain tests');
process.exit(0);
