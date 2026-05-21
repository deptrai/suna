import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { AppContext } from '../../types';
import { proxyToOpenRouter, proxyToThinkEndpoint, extractUsage, calculateCost, getModel, getAllModels } from '../services/llm';
import { checkCredits, deductLLMCredits, resolveAccountTier } from '../services/billing';
import { pickModel, getOrderedPool, isThinkPool, thinkBudgetTokens, type PoolType } from '../services/model-pool';
import {
  applyActorSpend,
  dollarsToCents,
  getSandboxMemberCapStatus,
} from '../services/member-spend';
import {
  resolveActorFromRequest,
  type ActorContext,
} from '../../shared/actor-context';

const llm = new Hono<{ Variables: AppContext }>();

llm.post('/chat/completions', async (c) => {
  const accountId = c.get('accountId');

  let body: Record<string, unknown>;
  try {
    body = await c.req.json();
  } catch {
    throw new HTTPException(400, { message: 'Invalid JSON body' });
  }

  if (!body.model || typeof body.model !== 'string') {
    throw new HTTPException(400, { message: 'Validation error: model is required' });
  }
  if (!body.messages || !Array.isArray(body.messages) || body.messages.length === 0) {
    throw new HTTPException(400, { message: 'Validation error: messages is required and must be a non-empty array' });
  }

  // Resolve pool model aliases. Virtual IDs exposed to UI:
  //   epsilon/free          → FREE_MODEL_POOL   (fast, cheap)
  //   epsilon/premium       → PREMIUM_MODEL_POOL (fast, smart)
  //   epsilon/free-think    → FREE_THINK_MODEL_POOL  + extended thinking
  //   epsilon/premium-think → PREMIUM_THINK_MODEL_POOL + extended thinking
  // F10: use Map instead of plain object to avoid prototype-chain collision
  //   (body.model === 'constructor' / '__proto__' would match `in` on plain object)
  const POOL_ALIAS = new Map<string, PoolType>([
    ['epsilon/free',          'free'],
    ['epsilon/premium',       'premium'],
    ['epsilon/free-think',    'free-think'],
    ['epsilon/premium-think', 'premium-think'],
  ]);

  let thinkPool: PoolType | null = null;
  let poolType: PoolType | null = null;
  if (POOL_ALIAS.has(body.model)) {
    const pool = POOL_ALIAS.get(body.model)!;

    // F1: gate premium aliases — free-tier accounts may not request paid pools
    if (pool === 'premium' || pool === 'premium-think') {
      const tier = await resolveAccountTier(accountId);
      if (tier === 'free') {
        throw new HTTPException(403, {
          message: 'Premium model access requires a paid plan. Please upgrade to access premium models.',
        });
      }
    }

    if (isThinkPool(pool)) {
      // Think pools: resolve immediately with round-robin (single model per tier, no failover)
      let resolved: string;
      try {
        resolved = pickModel(pool);
      } catch {
        throw new HTTPException(503, {
          message: `Model pool temporarily unavailable (${pool}). Please try again later.`,
        });
      }
      console.log(`[LLM] Pool resolve: ${body.model} → ${resolved}`);
      body = { ...body, model: resolved };
      thinkPool = pool;
    } else {
      // Non-think pools: defer to priority failover loop below
      poolType = pool;
    }
  }

  // modelId assigned AFTER failover so it reflects the winner model ID
  // (set to placeholder here; overwritten after pool resolution below)
  let modelId = body.model as string;
  const isStreaming = body.stream === true;

  // F3: think path uses chainlens-proxy which returns Anthropic SSE format — not
  // OpenAI SSE. extractUsageFromStream reads OpenAI chunks so billing would be
  // silently skipped. Force non-streaming until Anthropic SSE is fully wired.
  if (thinkPool && isStreaming) {
    console.warn('[LLM] Think mode: forcing non-streaming (Anthropic SSE billing not yet implemented)');
    body = { ...body, stream: false };
  }
  // effectiveStreaming: what we actually send downstream (false for think path)
  const effectiveStreaming = thinkPool ? false : isStreaming;

  const sessionId =
    (typeof body.session_id === 'string' ? body.session_id : undefined) ??
    c.req.header('X-Session-ID') ??
    c.get('sandboxId') ??
    c.get('keyId');

  const actor = resolveActor(c);
  if (actor) {
    const status = await getSandboxMemberCapStatus(actor.sandboxId, actor.userId);
    if (status && status.capCents !== null && status.currentCents >= status.capCents) {
      throw new HTTPException(402, {
        message: `Spending cap reached ($${(status.capCents / 100).toFixed(2)} / month). Ask the instance owner to raise or remove the cap.`,
      });
    }
  }

  const creditCheck = await checkCredits(accountId);
  if (!creditCheck.hasCredits) {
    throw new HTTPException(402, { message: creditCheck.message || 'Insufficient credits' });
  }

  // Pass through headers so proxyToOpenRouter can detect the loop-guard
  // (X-Fallback-Source) on fallback retries from chainlens-proxy.
  const requestHeaders: Record<string, string> = {};
  for (const [k, v] of Object.entries(c.req.header())) {
    if (typeof v === 'string') requestHeaders[k.toLowerCase()] = v;
  }

  let response: Response;
  if (poolType) {
    // Priority failover for non-think pool aliases (epsilon/free, epsilon/premium).
    // Candidates are ordered by priority (env var order). Try each in sequence;
    // on 429 or >=500 → next candidate. 4xx (400, 401, 403) are NOT retried.
    const candidates = getOrderedPool(poolType);
    if (candidates.length === 0) {
      throw new HTTPException(503, {
        message: `Model pool temporarily unavailable (${poolType}). Please try again later.`,
      });
    }
    let winner: { response: Response; model: string } | null = null;
    for (const candidate of candidates) {
      try {
        const r = await proxyToOpenRouter(
          { ...body, model: candidate },
          effectiveStreaming,
          requestHeaders,
        );
        if (r.status === 429 || r.status >= 500) {
          console.warn(`[LLM] Pool failover: ${candidate} → ${r.status}, trying next`);
          continue;
        }
        winner = { response: r, model: candidate };
        break;
      } catch (err) {
        console.warn(`[LLM] Pool failover: ${candidate} threw (${(err as Error).message}), trying next`);
      }
    }
    if (!winner) {
      throw new HTTPException(503, {
        message: `All models in pool '${poolType}' are unavailable. Please try again later.`,
      });
    }
    response = winner.response;
    body = { ...body, model: winner.model };
    modelId = winner.model; // update billing ID to reflect winner
    console.log(`[LLM] Pool resolve: epsilon/${poolType} → ${winner.model}`);
  } else if (thinkPool) {
    // Think-mode: route to chainlens-proxy with extended thinking params
    const budget = thinkBudgetTokens(thinkPool);
    response = await proxyToThinkEndpoint(body, budget);
  } else {
    // Direct model (no pool alias): single upstream call
    response = await proxyToOpenRouter(body, effectiveStreaming, requestHeaders);
  }

  const modelConfig = getModel(modelId);

  if (!response.ok) {
    const errorBody = await response.text();
    console.error(`[LLM] OpenRouter error ${response.status}: ${errorBody}`);
    return new Response(errorBody, {
      status: response.status,
      headers: { 'Content-Type': response.headers.get('Content-Type') || 'application/json' },
    });
  }

  if (effectiveStreaming) {
    const upstreamBody = response.body;
    if (!upstreamBody) {
      throw new HTTPException(502, { message: 'No response body from upstream' });
    }

    const [clientStream, billingStream] = upstreamBody.tee();

    extractUsageFromStream(billingStream, modelConfig, modelId, accountId, sessionId, actor);

    return new Response(clientStream, {
      status: response.status,
      headers: {
        'Content-Type': response.headers.get('Content-Type') || 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  }

  const responseBody = await response.json();

  const usage = extractUsage(responseBody);
  if (usage) {
    const cost = calculateCost(modelConfig, usage.promptTokens, usage.completionTokens, usage.cachedTokens, usage.cacheWriteTokens);
    deductLLMCredits(
      accountId,
      modelId,
      usage.promptTokens,
      usage.completionTokens,
      cost,
      sessionId,
    )
      .then((res) => {
        if (res.success && actor && cost > 0) {
          applyActorSpend(actor.sandboxId, actor.userId, dollarsToCents(cost)).catch(
            (err) => console.error('[LLM] Actor spend attribution failed:', err),
          );
        }
      })
      .catch((err) => console.error(`[LLM] Failed to deduct credits for ${modelId}:`, err));
    const cacheInfo = usage.cachedTokens || usage.cacheWriteTokens
      ? ` (cache: ${usage.cachedTokens}read/${usage.cacheWriteTokens}write)`
      : '';
    console.log(`[LLM] ${modelId}: ${usage.promptTokens}/${usage.completionTokens} tokens${cacheInfo}, cost=$${cost.toFixed(6)}`);
  }

  return c.json(responseBody);
});

llm.get('/models', async (c) => {
  const models = getAllModels();

  return c.json({
    object: 'list',
    data: models.map((m) => ({
      id: m.id,
      object: 'model',
      created: Math.floor(Date.now() / 1000),
      owned_by: m.owned_by,
      context_window: m.context_window,
      pricing: m.pricing,
      tier: m.tier,
    })),
  });
});

llm.get('/models/:model', async (c) => {
  const modelId = c.req.param('model');
  const models = getAllModels();
  const model = models.find((m) => m.id === modelId);

  if (!model) {
    throw new HTTPException(404, { message: `Model ${modelId} not found` });
  }

  return c.json({
    id: model.id,
    object: 'model',
    created: Math.floor(Date.now() / 1000),
    owned_by: model.owned_by,
    context_window: model.context_window,
    pricing: model.pricing,
    tier: model.tier,
  });
});

async function extractUsageFromStream(
  stream: ReadableStream<Uint8Array>,
  modelConfig: import('../config/models').ModelConfig,
  modelId: string,
  accountId: string,
  sessionId?: string,
  actor?: ActorContext | null,
) {
  try {
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let lastUsage: { promptTokens: number; completionTokens: number; cachedTokens: number; cacheWriteTokens: number } | null = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ') || line === 'data: [DONE]') continue;
        try {
          const chunk = JSON.parse(line.slice(6));
          if (chunk.usage) {
            const details = chunk.usage.prompt_tokens_details;
            lastUsage = {
              promptTokens: chunk.usage.prompt_tokens ?? 0,
              completionTokens: chunk.usage.completion_tokens ?? 0,
              cachedTokens: details?.cached_tokens ?? 0,
              cacheWriteTokens: details?.cache_write_tokens ?? 0,
            };
          }
        } catch {
        }
      }
    }

    if (lastUsage) {
      const cost = calculateCost(modelConfig, lastUsage.promptTokens, lastUsage.completionTokens, lastUsage.cachedTokens, lastUsage.cacheWriteTokens);
      const deductRes = await deductLLMCredits(
        accountId,
        modelId,
        lastUsage.promptTokens,
        lastUsage.completionTokens,
        cost,
        sessionId,
      );
      if (deductRes.success && actor && cost > 0) {
        applyActorSpend(actor.sandboxId, actor.userId, dollarsToCents(cost)).catch(
          (err) => console.error('[LLM] Actor spend attribution failed:', err),
        );
      }
      const cacheInfo = lastUsage.cachedTokens || lastUsage.cacheWriteTokens
        ? ` (cache: ${lastUsage.cachedTokens}read/${lastUsage.cacheWriteTokens}write)`
        : '';
      console.log(`[LLM] Stream ${modelId}: ${lastUsage.promptTokens}/${lastUsage.completionTokens} tokens${cacheInfo}, cost=$${cost.toFixed(6)}`);
    } else {
      console.warn(`[LLM] Stream ${modelId}: no usage data found in stream — billing skipped`);
    }
  } catch (err) {
    console.error(`[LLM] Error extracting usage from stream for billing:`, err);
  }
}

function resolveActor(c: Parameters<typeof resolveActorFromRequest>[0]): ActorContext | null {
  return resolveActorFromRequest(c, { logPrefix: '[LLM]' });
}

export { llm };
