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

/**
 * Forward a chat completion request to the chainlens-proxy (Anthropic-compatible)
 * with extended thinking enabled. Used for epsilon/free-think and epsilon/premium-think.
 *
 * Injects:
 *   - `thinking: { type: 'enabled', budget_tokens }` — enables reasoning tokens
 *   - `temperature: 1` — required by Anthropic for extended thinking
 *   - `X-Fallback-Source` — loop-guard header so chainlens-proxy won't re-route back
 *
 * @param body      Request body with model already resolved to a Claude model ID
 * @param budgetTokens  Max reasoning tokens to spend (5000 for free, 10000 for premium)
 */
export async function proxyToThinkEndpoint(
  body: Record<string, unknown>,
  budgetTokens: number,
): Promise<Response> {
  if (!config.ANTHROPIC_PROXY_URL || !config.ANTHROPIC_PROXY_API_KEY) {
    throw new Error('[LLM] Think mode requires ANTHROPIC_PROXY_URL and ANTHROPIC_PROXY_API_KEY to be set');
  }

  // F9: warn if caller set a temperature that will be overridden
  if (body.temperature !== undefined && body.temperature !== 1) {
    console.warn(
      `[LLM] Think: overriding temperature ${body.temperature} → 1 (Anthropic extended thinking requirement)`,
    );
  }

  // F8: budget_tokens must be < max_tokens; clamp to avoid Anthropic 400
  let effectiveBudget = budgetTokens;
  if (typeof body.max_tokens === 'number' && body.max_tokens > 0 && effectiveBudget >= body.max_tokens) {
    effectiveBudget = Math.max(1, Math.floor(body.max_tokens * 0.8));
    console.warn(
      `[LLM] Think: budget_tokens (${budgetTokens}) >= max_tokens (${body.max_tokens}); clamped to ${effectiveBudget}`,
    );
  }

  const thinkBody = {
    ...body,
    // Extended thinking params (Anthropic API)
    thinking: { type: 'enabled', budget_tokens: effectiveBudget },
    temperature: 1,  // Anthropic requires temp=1 when thinking is enabled
  };

  // F12: strip all trailing slashes (not just one)
  const url = `${config.ANTHROPIC_PROXY_URL.replace(/\/+$/, '')}/chat/completions`;
  const modelId = body.model as string;
  console.log(`[LLM] Think proxy → chainlens-proxy: ${modelId} (budget=${effectiveBudget})`);

  // F4: add timeout + structured error for network failures
  // F7: add loop-guard header to prevent chainlens-proxy re-routing back here
  try {
    return await fetch(url, {
      method: 'POST',
      signal: AbortSignal.timeout(120_000), // 2 min — thinking requests are slow
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.ANTHROPIC_PROXY_API_KEY}`,
        [FALLBACK_HEADER]: FALLBACK_SOURCE_TAG, // F7: loop guard
      },
      body: JSON.stringify(thinkBody),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`[LLM] Think proxy request failed (${modelId}): ${msg}`);
  }
}

export interface UsageInfo {
  promptTokens: number;
  completionTokens: number;
  cachedTokens: number;
  cacheWriteTokens: number;
}

/**
 * Extract usage from a non-streaming response body.
 *
 * Handles two response shapes:
 * - OpenAI/OpenRouter: `prompt_tokens` / `completion_tokens`
 * - Anthropic (think path via chainlens-proxy): `input_tokens` / `output_tokens`
 *
 * Includes cache metrics from prompt_tokens_details when available.
 */
export function extractUsage(responseBody: any): UsageInfo | null {
  if (!responseBody?.usage) return null;
  const u = responseBody.usage;
  const details = u.prompt_tokens_details;
  return {
    // F2: accept both OpenAI and Anthropic field names
    promptTokens: u.prompt_tokens ?? u.input_tokens ?? 0,
    completionTokens: u.completion_tokens ?? u.output_tokens ?? 0,
    cachedTokens: details?.cached_tokens ?? 0,
    cacheWriteTokens: details?.cache_write_tokens ?? 0,
  };
}

// Re-export model functions
export { getModel, getAllModels, resolveOpenRouterId } from '../config/models';
