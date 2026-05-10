export const EVM_ADDRESS = /^0x[a-fA-F0-9]{40}$/;
export const SOL_ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export const ALLOWED_EVM_CHAINS = [
  'ethereum',
  'arbitrum',
  'base',
  'polygon',
  'bsc',
  'avalanche',
  'optimism',
] as const;

export type EvmChain = (typeof ALLOWED_EVM_CHAINS)[number];

export function detectChain(address: string): 'evm' | 'solana' | 'unknown' {
  if (EVM_ADDRESS.test(address)) return 'evm';
  if (SOL_ADDRESS.test(address)) return 'solana';
  return 'unknown';
}

export function normalizeAddress(address: string, chain: string): string {
  if (chain === 'solana') return address;
  return address.toLowerCase();
}
