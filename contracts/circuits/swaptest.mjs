// Compare prove.ts's manual pi_b swap against snarkjs's own exportSolidityCallData.
// If they differ, every browser proof is malformed while node proofs pass.
import * as snarkjs from 'snarkjs';
import { buildPoseidon } from 'circomlibjs';
import { keccak256, toHex } from 'viem';

const F = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
const LEVELS = 20;
const P = await buildPoseidon();
const H = (xs) => BigInt(P.F.toString(P(xs)));
const zeros = [BigInt(keccak256(toHex('refract.shielded.v1'))) % F];
for (let i=1;i<LEVELS;i++) zeros.push(H([zeros[i-1],zeros[i-1]]));
const rand = () => { let o=0n; for (const b of crypto.getRandomValues(new Uint8Array(31))) o=(o<<8n)|BigInt(b); return o; };

const nullifier=rand(), secret=rand();
const commitment=H([nullifier,secret]), nullifierHash=H([nullifier]);
const leaves=[commitment];
const pathElements=[], pathIndices=[];
let level=leaves.slice(), idx=0;
for (let i=0;i<LEVELS;i++){
  const isRight=idx%2===1, sib=isRight?idx-1:idx+1;
  pathElements.push(sib<level.length?level[sib]:zeros[i]);
  pathIndices.push(isRight?1:0);
  const next=[];
  for(let j=0;j<level.length;j+=2) next.push(H([level[j], j+1<level.length?level[j+1]:zeros[i]]));
  level=next.length?next:[zeros[i+1]??zeros[i]];
  idx>>=1;
}
const root=level[0];
const recipient=BigInt('0x3a923c0F9DC7bc45D52009b758C964360FC7Cc73');

const { proof, publicSignals } = await snarkjs.groth16.fullProve({
  root:root.toString(), nullifierHash:nullifierHash.toString(),
  recipient:recipient.toString(), relayer:'0', fee:'0', refund:'0',
  nullifier:nullifier.toString(), secret:secret.toString(),
  pathElements:pathElements.map(String), pathIndices:pathIndices.map(String),
}, 'withdraw_js/withdraw.wasm', 'withdraw_final.zkey');

// prove.ts does this manually:
const mine = {
  a:[BigInt(proof.pi_a[0]),BigInt(proof.pi_a[1])],
  b:[[BigInt(proof.pi_b[0][1]),BigInt(proof.pi_b[0][0])],[BigInt(proof.pi_b[1][1]),BigInt(proof.pi_b[1][0])]],
  c:[BigInt(proof.pi_c[0]),BigInt(proof.pi_c[1])],
};
// snarkjs does this:
const cd = await snarkjs.groth16.exportSolidityCallData(proof, publicSignals);
const n = cd.replace(/[\[\]"\s]/g,'').split(',').filter(Boolean).map(BigInt);

const same = mine.a[0]===n[0] && mine.a[1]===n[1]
  && mine.b[0][0]===n[2] && mine.b[0][1]===n[3]
  && mine.b[1][0]===n[4] && mine.b[1][1]===n[5]
  && mine.c[0]===n[6] && mine.c[1]===n[7];
console.log('  manual swap matches snarkjs:', same ? 'YES' : 'NO  <-- this is the bug');

console.log('  public signals order from snarkjs:');
console.log('    [0] root        ', publicSignals[0]===root.toString() ? 'root' : publicSignals[0].slice(0,12));
console.log('    [1] nullifier   ', publicSignals[1]===nullifierHash.toString() ? 'nullifierHash' : publicSignals[1].slice(0,12));
console.log('    [2] recipient   ', publicSignals[2]===recipient.toString() ? 'recipient' : publicSignals[2].slice(0,12));
console.log('    [3..5]          ', publicSignals.slice(3).join(', '));
process.exit(0);
