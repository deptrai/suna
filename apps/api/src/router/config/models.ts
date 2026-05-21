import { getModelPricing } from './model-pricing';

// =============================================================================
// Model Registry
// =============================================================================

export interface ModelConfig {
  /** The actual model ID to send to OpenRouter */
  openrouterId: string;
  inputPer1M: number;   // Cost per 1M input tokens (USD)
  outputPer1M: number;  // Cost per 1M output tokens (USD)
  contextWindow: number;
  tier: 'free' | 'paid';
  cacheReadPer1M?: number;   // Cost per 1M cached-read tokens (USD)
  cacheWritePer1M?: number;  // Cost per 1M cache-write tokens (USD)
}

/**
 * Epsilon model registry — maps model IDs exposed through the Epsilon provider
 * to their OpenRouter equivalents with pricing.
 *
 * Model IDs use the real provider/model format (e.g. "moonshotai/kimi-k2.5")
 * so users see actual model names, not opaque aliases.
 *
 * Any model NOT in this registry is passed through to OpenRouter as-is
 * with live pricing from models.dev (or zero if unknown).
 */
export const MODELS: Record<string, ModelConfig> = {
  'minimax/minimax-m2.7': {
    openrouterId: 'minimax/minimax-m2.7',
    inputPer1M: 0.30,
    outputPer1M: 1.20,
    contextWindow: 204800,
    tier: 'free',
    cacheReadPer1M: 0.06,
  },
  'z-ai/glm-5-turbo': {
    openrouterId: 'z-ai/glm-5-turbo',
    inputPer1M: 1.20,
    outputPer1M: 4.00,
    contextWindow: 202752,
    tier: 'free',
    cacheReadPer1M: 0.24,
  },
  'moonshotai/kimi-k2.5': {
    openrouterId: 'moonshotai/kimi-k2.5',
    inputPer1M: 0.45,
    outputPer1M: 2.20,
    contextWindow: 262144,
    tier: 'free',
    cacheReadPer1M: 0.225,
  },
  'minimax/minimax-m2.5': {
    openrouterId: 'minimax/minimax-m2.5',
    inputPer1M: 0.20,
    outputPer1M: 1.17,
    contextWindow: 196608,
    tier: 'free',
    cacheReadPer1M: 0.10,
  },
  // ── Pool member models (v98store + potential Zen free-tier) ─────────────────
  // These are the actual model IDs used in FREE_MODEL_POOL / PREMIUM_MODEL_POOL.
  // Registered here so billing cost-tracking works when a failover winner is used.
  // They do NOT appear in the public /models endpoint (excluded by POOL_ALIAS_IDS filter
  // extended to pool members via the getAllModels() exclusion set below).

  // Free pool: OpenCode Zen free-tier model (served via v98store if supported;
  // silent failover to qwen3.6-35b-a3b if v98store doesn't serve this ID).
  'qwen3.6-plus-free': {
    openrouterId: 'qwen3.6-plus-free',
    inputPer1M: 0,
    outputPer1M: 0,
    contextWindow: 131072,
    tier: 'free',
  },
  // Other free-tier Zen models (in POOL env var for future use)
  'deepseek-v4-flash-free': {
    openrouterId: 'deepseek-v4-flash-free',
    inputPer1M: 0,
    outputPer1M: 0,
    contextWindow: 65536,
    tier: 'free',
  },
  'nemotron-3-super-free': {
    openrouterId: 'nemotron-3-super-free',
    inputPer1M: 0,
    outputPer1M: 0,
    contextWindow: 131072,
    tier: 'free',
  },

  // Premium pool additions — priority failover candidates
  'gpt-5.5': {
    openrouterId: 'gpt-5.5',
    inputPer1M: 15.0,
    outputPer1M: 60.0,
    contextWindow: 128000,
    tier: 'paid',
  },
  'claude-opus-4-7': {
    openrouterId: 'anthropic/claude-opus-4-7',
    inputPer1M: 15.0,
    outputPer1M: 75.0,
    contextWindow: 200000,
    tier: 'paid',
  },

  // ── Working free-tier models on v98store proxy ────────────────────────────
  'qwen3.6-35b-a3b': {
    openrouterId: 'qwen3.6-35b-a3b',
    inputPer1M: 0.14,
    outputPer1M: 0.14,
    contextWindow: 131072,
    tier: 'free',
  },
  'llama-3.1-8b': {
    openrouterId: 'llama-3.1-8b',
    inputPer1M: 0.06,
    outputPer1M: 0.06,
    contextWindow: 131072,
    tier: 'free',
  },
  'glm-4.5-air': {
    openrouterId: 'glm-4.5-air',
    inputPer1M: 0.14,
    outputPer1M: 0.14,
    contextWindow: 131072,
    tier: 'free',
  },

  // Opencode-side aliases (from core/epsilon-master/opencode/opencode.jsonc).
  // Opencode's openai-compatible client ships the alias as the model param
  // — e.g. `epsilon/minimax-m27`, not the resolved upstream id — so the
  // router needs to translate them. Without these, every agent call from
  // opencode 400s with "is not a valid model ID" and PM/team hangs at
  // 0 tokens / ready_at=null.
  'epsilon/minimax-m27': {
    openrouterId: 'minimax/minimax-m2.7',
    inputPer1M: 0.30,
    outputPer1M: 1.20,
    contextWindow: 204800,
    tier: 'free',
    cacheReadPer1M: 0.06,
  },
  'epsilon/glm-turbo': {
    openrouterId: 'z-ai/glm-5-turbo',
    inputPer1M: 1.20,
    outputPer1M: 4.00,
    contextWindow: 202752,
    tier: 'free',
    cacheReadPer1M: 0.24,
  },
  'epsilon/kimi': {
    openrouterId: 'moonshotai/kimi-k2.5',
    inputPer1M: 0.45,
    outputPer1M: 2.20,
    contextWindow: 262144,
    tier: 'free',
    cacheReadPer1M: 0.225,
  },
  'epsilon/minimax': {
    openrouterId: 'minimax/minimax-m2.5',
    inputPer1M: 0.20,
    outputPer1M: 1.17,
    contextWindow: 196608,
    tier: 'free',
    cacheReadPer1M: 0.10,
  },
  // ── Pool model aliases (UI-facing) ────────────────────────────────────────
  // "epsilon/free" and "epsilon/premium" are virtual IDs shown in the model
  // picker. llm.ts resolves them to the actual model via pickModel() before
  // proxying, so pricing/contextWindow here are placeholder values only.
  'epsilon/free': {
    openrouterId: 'epsilon/free',  // replaced at runtime by pickModel('free')
    inputPer1M: 0,
    outputPer1M: 0,
    contextWindow: 200000,
    tier: 'free',
  },
  'epsilon/premium': {
    openrouterId: 'epsilon/premium', // replaced at runtime by pickModel('premium')
    inputPer1M: 0,
    outputPer1M: 0,
    contextWindow: 200000,
    tier: 'paid',
  },
  // ── Think-mode pool aliases (UI-facing) ────────────────────────────────────
  // Routed to chainlens-proxy (Anthropic) with extended thinking enabled.
  // Actual model is resolved at runtime via pickModel('free-think'/'premium-think').
  'epsilon/free-think': {
    openrouterId: 'epsilon/free-think',
    inputPer1M: 0,
    outputPer1M: 0,
    contextWindow: 200000,
    tier: 'free',
  },
  'epsilon/premium-think': {
    openrouterId: 'epsilon/premium-think',
    inputPer1M: 0,
    outputPer1M: 0,
    contextWindow: 200000,
    tier: 'paid',
  },

  // ── Think-mode concrete model registry entries (F13/F14) ──────────────────
  // Default fallbacks for FREE_THINK_MODEL_POOL / PREMIUM_THINK_MODEL_POOL.
  // Registered here so getModel() returns correct contextWindow + tier instead
  // of the zero-pricing unknown-model fallback.
  'claude-haiku-4-5-20251001': {
    openrouterId: 'anthropic/claude-haiku-4-5-20251001',
    inputPer1M: 0.80,
    outputPer1M: 4.00,
    contextWindow: 200000,
    tier: 'free',
    cacheReadPer1M: 0.08,
    cacheWritePer1M: 1.00,
  },
  'claude-sonnet-4-6': {
    openrouterId: 'anthropic/claude-sonnet-4-6',
    inputPer1M: 3.00,
    outputPer1M: 15.00,
    contextWindow: 200000,
    tier: 'paid',
    cacheReadPer1M: 0.30,
    cacheWritePer1M: 3.75,
  },
};

/**
 * Default model for Epsilon-managed contexts (cron, memory, etc.)
 * that need a sensible default without user input.
 */
export const DEFAULT_MODEL_ID = 'minimax/minimax-m2.7';

// =============================================================================
// Model Resolution
// =============================================================================

/**
 * Resolve a user-provided model ID to a ModelConfig.
 *
 * Priority:
 * 1. models.dev live pricing (always current, refreshed every 24h) — pricing only
 * 2. MODELS registry — provides contextWindow, tier, and cache pricing,
 *    and acts as pricing fallback when models.dev hasn't loaded yet or is unknown
 * 3. Zero pricing (billing skipped) if completely unknown
 */
export function getModel(modelId: string): ModelConfig {
  const openrouterId = modelId.startsWith('openrouter/')
    ? modelId.replace('openrouter/', '')
    : modelId;

  const registryEntry = MODELS[modelId] ?? MODELS[openrouterId];

  // models.dev is source of truth for pricing — always wins if available
  const livePricing = getModelPricing(modelId) ?? getModelPricing(openrouterId);

  if (livePricing) {
    return {
      openrouterId,
      // Merge registry metadata with live pricing
      contextWindow: registryEntry?.contextWindow ?? 128000,
      tier: registryEntry?.tier ?? 'paid',
      cacheReadPer1M: registryEntry?.cacheReadPer1M,
      cacheWritePer1M: registryEntry?.cacheWritePer1M,
      // Pricing always from models.dev
      inputPer1M: livePricing.inputPer1M,
      outputPer1M: livePricing.outputPer1M,
    };
  }

  // models.dev unknown — fall back to hardcoded registry prices
  if (registryEntry) {
    return registryEntry;
  }

  return {
    openrouterId,
    inputPer1M: 0,
    outputPer1M: 0,
    contextWindow: 128000,
    tier: 'paid',
  };
}

/**
 * Resolve a model ID to the OpenRouter model ID.
 * This is the ID that gets sent in the request body to OpenRouter.
 */
export function resolveOpenRouterId(modelId: string): string {
  return getModel(modelId).openrouterId;
}

/**
 * Virtual pool alias IDs — internal routing shims, not real selectable models.
 * Excluded from the public /v1/models endpoint (F11).
 */
const POOL_ALIAS_IDS = new Set([
  'epsilon/free',
  'epsilon/premium',
  'epsilon/free-think',
  'epsilon/premium-think',
]);

/**
 * Get all available models for /v1/models endpoint.
 * Excludes virtual pool aliases (epsilon/free, epsilon/premium, etc.) which
 * are internal routing shims and should not appear in the public model list.
 */
export function getAllModels() {
  return Object.entries(MODELS)
    // F11: hide internal pool aliases from public endpoint
    .filter(([id]) => !POOL_ALIAS_IDS.has(id))
    .map(([id, cfg]) => ({
      id,
      object: 'model' as const,
      owned_by: 'epsilon',
      context_window: cfg.contextWindow,
      pricing: {
        input: cfg.inputPer1M,
        output: cfg.outputPer1M,
      },
      tier: cfg.tier,
    }));
}
