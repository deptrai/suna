import { config, EPSILON_MARKUP } from '../../config';
import { getModel, getAllModels, resolveOpenRouterId, type ModelConfig } from '../config/models';
import { isClaudeFallbackModel, FALLBACK_HEADER } from '../config/claude-fallback';

const FALLBACK_SOURCE_TAG = 'epsilon-router';

/**
 * Calculate cost based on token usage and model pricing.
 * When cache metrics are available, uses differential pricing for cached/written tokens.
 *
 * @param markup - Multiplier applied to the raw provider cost.
 *   Defaults to EPSILON_MARKUP (1.2× = 20% markup) when Epsilon provides the key.
 *   Pass PLATFORM_FEE_MARKUP (0.1× = 10% platform fee) for user-owned keys.
 */
export function calculateCost(
  modelConfig: ModelConfig,
  promptTokens: number,
  completionTokens: number,
  cachedTokens: number = 0,
  cacheWriteTokens: number = 0,
  markup: number = EPSILON_MARKUP,
): number {
  // When we have cache metrics and the model has cache pricing, compute differential cost
  if ((cachedTokens > 0 || cacheWriteTokens > 0) && modelConfig.cacheReadPer1M != null) {
    const regularInputTokens = Math.max(0, promptTokens - cachedTokens - cacheWriteTokens);
    const regularInputCost = (regularInputTokens / 1_000_000) * modelConfig.inputPer1M;
    const cacheReadCost = (cachedTokens / 1_000_000) * modelConfig.cacheReadPer1M;
    const cacheWriteCost = (cacheWriteTokens / 1_000_000) * (modelConfig.cacheWritePer1M ?? modelConfig.inputPer1M);
    const outputCost = (completionTokens / 1_000_000) * modelConfig.outputPer1M;
    return (regularInputCost + cacheReadCost + cacheWriteCost + outputCost) * markup;
  }

  // Fallback: flat input pricing (no cache breakdown)
  const inputCost = (promptTokens / 1_000_000) * modelConfig.inputPer1M;
  const outputCost = (completionTokens / 1_000_000) * modelConfig.outputPer1M;
  return (inputCost + outputCost) * markup;
}

/**
 * Forward a chat completion request to OpenRouter as a 1:1 passthrough proxy.
 * Preserves the full request body (tools, tool_choice, response_format, etc).
 *
 * Symmetric fallback: when the model is in the claude whitelist and the
 * primary upstream fails (>=500 or fetch throws), retry once via
 * ANTHROPIC_PROXY_URL (chainlens-proxy → v98store). Skipped when the
 * incoming request already carries `X-Fallback-Source` (loop guard).
 *
 * @returns The raw fetch Response (may be streaming or not).
 */
export async function proxyToOpenRouter(
  body: Record<string, unknown>,
  isStreaming: boolean,
  headers?: Record<string, string>,
): Promise<Response> {
  const modelId = body.model as string;
  const openrouterId = resolveOpenRouterId(modelId);
  const forwardBody = { ...body, model: openrouterId };
  const serializedBody = JSON.stringify(forwardBody);

  const url = `${config.OPENROUTER_API_URL}/chat/completions`;
  const fallbackSource = headers?.[FALLBACK_HEADER.toLowerCase()];
  const canFallback =
    !fallbackSource &&
    isClaudeFallbackModel(modelId) &&
    !!config.ANTHROPIC_PROXY_URL &&
    !!config.ANTHROPIC_PROXY_API_KEY;

  console.log(`[LLM] Proxying to OpenRouter: ${modelId} → ${openrouterId} (stream=${isStreaming}, fallback=${canFallback})`);

  let primary: Response | null = null;
  let primaryErr: unknown = null;
  try {
    primary = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.OPENROUTER_API_KEY}`,
        'HTTP-Referer': config.FRONTEND_URL || 'https://epsilon.ai',
        'X-Title': 'Epsilon',
      },
      body: serializedBody,
    });
  } catch (err) {
    primaryErr = err;
  }

  const primaryStatus = primary?.status ?? 0;
  const shouldFallback =
    canFallback && (primaryErr !== null || primaryStatus >= 500);

  if (!shouldFallback) {
    if (primaryErr) throw primaryErr;
    return primary!;
  }

  console.log(
    `[LLM] Fallback engaged: ${modelId} primary=${primaryStatus || 'throw'} → ANTHROPIC_PROXY_URL`,
  );

  const fallbackUrl = `${config.ANTHROPIC_PROXY_URL.replace(/\/$/, '')}/chat/completions`;
  // Send the user-facing model id (not openrouterId) since chainlens-proxy
  // checks the whitelist on the original claude-* name.
  const fallbackBody = JSON.stringify(body);
  try {
    return await fetch(fallbackUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.ANTHROPIC_PROXY_API_KEY}`,
        [FALLBACK_HEADER]: FALLBACK_SOURCE_TAG,
      },
      body: fallbackBody,
    });
  } catch (err) {
    console.error(`[LLM] Fallback also failed: ${(err as Error).message}`);
    if (primary) return primary; // return original (failed) response so caller logs the upstream error
    throw err;
  }
}

export interface UsageInfo {
  promptTokens: number;
  completionTokens: number;
  cachedTokens: number;
  cacheWriteTokens: number;
}

/**
 * Extract usage from a non-streaming OpenAI-compatible response body.
 * Includes cache metrics from prompt_tokens_details when available.
 */
export function extractUsage(responseBody: any): UsageInfo | null {
  if (!responseBody?.usage) return null;
  const details = responseBody.usage.prompt_tokens_details;
  return {
    promptTokens: responseBody.usage.prompt_tokens ?? 0,
    completionTokens: responseBody.usage.completion_tokens ?? 0,
    cachedTokens: details?.cached_tokens ?? 0,
    cacheWriteTokens: details?.cache_write_tokens ?? 0,
  };
}

// Re-export model functions
export { getModel, getAllModels, resolveOpenRouterId } from '../config/models';
