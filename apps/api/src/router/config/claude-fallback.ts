/**
 * Shared whitelist for claude-* models that have parity between
 * `epsilon` (v98store via Epsilon router) and `anthropic-proxy`
 * (chainlens-proxy → v98store) providers.
 *
 * Used by both server-side fallback (router + chainlens-proxy)
 * and FE manual retry button to ensure consistent behavior.
 */
export const CLAUDE_FALLBACK_MODELS: readonly string[] = [
  'claude-opus-4-7',
  'claude-sonnet-4-6',
  'claude-haiku-4-5',
  'claude-haiku-4-5-20251001',
];

export function isClaudeFallbackModel(modelId: string): boolean {
  return CLAUDE_FALLBACK_MODELS.includes(modelId);
}

/** Maps each provider to its fallback partner. Symmetric pair. */
export const PROVIDER_PAIR: Record<string, string> = {
  epsilon: 'anthropic-proxy',
  'anthropic-proxy': 'epsilon',
};

/**
 * Loop-guard header — set by the upstream that initiated the fallback,
 * so the partner upstream can skip its own fallback branch and avoid loops.
 */
export const FALLBACK_HEADER = 'X-Fallback-Source';
