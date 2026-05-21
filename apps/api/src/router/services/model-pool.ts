import { config } from '../../config';

export type PoolType = 'free' | 'premium' | 'free-think' | 'premium-think';

let freeIdx = 0;
let premiumIdx = 0;
let freeThinkIdx = 0;
let premiumThinkIdx = 0;

function getPool(pool: PoolType): string[] {
  let raw: string;
  switch (pool) {
    case 'free':         raw = config.FREE_MODEL_POOL ?? ''; break;
    case 'premium':      raw = config.PREMIUM_MODEL_POOL ?? ''; break;
    case 'free-think':
      // Fallback: claude-haiku via chainlens-proxy if no dedicated pool configured
      raw = config.FREE_THINK_MODEL_POOL || 'claude-haiku-4-5-20251001';
      break;
    case 'premium-think':
      // Fallback: claude-sonnet via chainlens-proxy if no dedicated pool configured
      raw = config.PREMIUM_THINK_MODEL_POOL || 'claude-sonnet-4-6';
      break;
  }
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

/** Compile-time exhaustiveness guard for PoolType switch statements. */
function assertNever(pool: never): never {
  throw new Error(`Unhandled pool type: ${String(pool)}`);
}

export function pickModel(pool: PoolType): string {
  const list = getPool(pool);
  if (list.length === 0) throw new Error(`Empty model pool: ${pool}`);

  // F6: wrap index to prevent integer overflow on long-running servers
  switch (pool) {
    case 'free': {
      const idx = freeIdx % list.length;
      freeIdx = idx + 1 >= list.length ? 0 : idx + 1;
      return list[idx];
    }
    case 'premium': {
      const idx = premiumIdx % list.length;
      premiumIdx = idx + 1 >= list.length ? 0 : idx + 1;
      return list[idx];
    }
    case 'free-think': {
      const idx = freeThinkIdx % list.length;
      freeThinkIdx = idx + 1 >= list.length ? 0 : idx + 1;
      return list[idx];
    }
    case 'premium-think': {
      const idx = premiumThinkIdx % list.length;
      premiumThinkIdx = idx + 1 >= list.length ? 0 : idx + 1;
      return list[idx];
    }
    // F15: exhaustiveness check — compile error if PoolType gains a new variant
    default: return assertNever(pool);
  }
}

export function poolForTier(tier: string): 'free' | 'premium' {
  return tier === 'free' ? 'free' : 'premium';
}

/** Whether a pool type requires the think/reasoning proxy path */
export function isThinkPool(pool: PoolType): boolean {
  return pool === 'free-think' || pool === 'premium-think';
}

/** Budget tokens to pass to the think endpoint for this pool */
export function thinkBudgetTokens(pool: PoolType): number {
  return pool === 'free-think'
    ? (config.FREE_THINK_BUDGET_TOKENS ?? 5000)
    : (config.PREMIUM_THINK_BUDGET_TOKENS ?? 10000);
}

/** Priority-ordered list of model IDs for a non-think pool.
 *  First entry = highest priority. Used by the failover loop in llm.ts.
 *  Order is determined by the comma-separated env var (FREE_MODEL_POOL, PREMIUM_MODEL_POOL). */
export function getOrderedPool(pool: PoolType): string[] {
  return getPool(pool);
}

export function resetPoolCounters() {
  freeIdx = 0;
  premiumIdx = 0;
  freeThinkIdx = 0;
  premiumThinkIdx = 0;
}

/**
 * F13/F14: Validate pool env config at boot.
 * Warns if think-mode fallback model IDs are not in the MODELS registry
 * (would result in zero billing context for those models).
 * Logs only — does not throw, so misconfiguration doesn't break startup.
 */
export function validatePoolConfig(): void {
  // Lazy-require to avoid circular dep: model-pool → models
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { MODELS } = require('../config/models') as { MODELS: Record<string, unknown> };

  const warnIfMissing = (modelId: string, context: string) => {
    if (!Object.prototype.hasOwnProperty.call(MODELS, modelId)) {
      console.warn(
        `[LLM] Boot warning: ${context} model '${modelId}' not in MODELS registry — ` +
        `billing/context will use live pricing fallback or zero.`,
      );
    }
  };

  // Validate think-mode pools (F13)
  const freeThinkRaw = config.FREE_THINK_MODEL_POOL || 'claude-haiku-4-5-20251001';
  for (const m of freeThinkRaw.split(',').map((s) => s.trim()).filter(Boolean)) {
    warnIfMissing(m, 'FREE_THINK_MODEL_POOL');
  }
  const premiumThinkRaw = config.PREMIUM_THINK_MODEL_POOL || 'claude-sonnet-4-6';
  for (const m of premiumThinkRaw.split(',').map((s) => s.trim()).filter(Boolean)) {
    warnIfMissing(m, 'PREMIUM_THINK_MODEL_POOL');
  }

  // Validate hardcoded fallback IDs (F14)
  warnIfMissing('claude-haiku-4-5-20251001', 'FREE_THINK hardcoded fallback');
  warnIfMissing('claude-sonnet-4-6', 'PREMIUM_THINK hardcoded fallback');
}
