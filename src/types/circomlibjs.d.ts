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

/**
 * snarkjs ships no types either. Only groth16.fullProve is used, and it is
 * typed loosely on purpose: the proof shape is converted immediately in
 * prove.ts, so a stricter type here would just be a second place to update.
 */
declare module "snarkjs" {
  export const groth16: {
    fullProve(
      input: Record<string, unknown>,
      wasmPath: string,
      zkeyPath: string,
    ): Promise<{ proof: unknown; publicSignals: string[] }>;
    verify(vk: unknown, publicSignals: string[], proof: unknown): Promise<boolean>;
  };
}
