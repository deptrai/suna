/**
 * FE counterpart of `apps/api/src/router/config/claude-fallback.ts`.
 * Keep these two files in sync.
 *
 * Used by `TurnErrorDisplay` to decide if a retry-with-other-provider
 * button should be shown when an LLM error matches a fallback-eligible model.
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

export const PROVIDER_PAIR: Record<string, string> = {
  epsilon: 'anthropic-proxy',
  'anthropic-proxy': 'epsilon',
};

export function getFallbackProvider(providerId: string): string | null {
  return PROVIDER_PAIR[providerId] ?? null;
}
