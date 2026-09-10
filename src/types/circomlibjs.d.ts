/**
 * circomlibjs ships no types. Only the surface this project uses is declared,
 * deliberately narrow so a wrong call is caught here rather than at runtime
 * inside the hasher.
 */
declare module "circomlibjs" {
  export type PoseidonField = {
    toString(value: unknown, radix?: number): string;
  };
  export type Poseidon = ((inputs: (bigint | number | string)[]) => unknown) & {
    F: PoseidonField;
  };
  export function buildPoseidon(): Promise<Poseidon>;
  export const poseidonContract: {
    generateABI(nInputs: number): unknown[];
    createCode(nInputs: number): string;
  };
}
