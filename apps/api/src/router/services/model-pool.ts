import { config } from '../../config';

let freeIdx = 0;
let premiumIdx = 0;

function getPool(pool: 'free' | 'premium'): string[] {
  const raw = pool === 'free' ? config.FREE_MODEL_POOL : config.PREMIUM_MODEL_POOL;
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

export function pickModel(pool: 'free' | 'premium'): string {
  const list = getPool(pool);
  if (list.length === 0) throw new Error(`Empty model pool: ${pool}`);

  if (pool === 'free') {
    const model = list[freeIdx % list.length];
    freeIdx += 1;
    return model;
  }

  const model = list[premiumIdx % list.length];
  premiumIdx += 1;
  return model;
}

export function poolForTier(tier: string): 'free' | 'premium' {
  return tier === 'free' ? 'free' : 'premium';
}

export function resetPoolCounters() {
  freeIdx = 0;
  premiumIdx = 0;
}
