import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { streamSSE } from 'hono/streaming';
import { z } from 'zod';
import {
  submitBacktestJob,
  getBacktestRun,
  proposeBacktestStrategies,
  VibeTradingAuthError,
  VibeTradingForbiddenError,
  VibeTradingNotFoundError,
  VibeTradingDownstreamError,
} from '../services/vibe-trading';
import { checkCredits, deductToolCredits, resolveAccountTier } from '../services/billing';
import { deductCredits as deductCreditsRepo, refundCredits as refundCreditsRepo } from '../../repositories/credits';
import { claimOrAssertShadowOwnership, ShadowOwnershipError } from '../services/shadow-ownership';
import { config, getToolCost } from '../../config';
import type { AppContext } from '../../types';
import { VibeTradingJobSchema } from '../services/vibe-trading-schema';

const TOOL = 'vibe_trading_backtest';

const SESSION_ID = z.string().max(128).regex(/^[A-Za-z0-9_-]+$/).optional();
const VibeTradingMultiBacktestSchema = z.object({
  strategies: z
    .array(
      z.object({
        tab_id: z.string().min(1).max(128),
        payload: VibeTradingJobSchema,
      }),
    )
    .min(2, 'between 2 and 5 strategies required')
    .max(5, 'between 2 and 5 strategies required')
    .refine(
      (arr) => new Set(arr.map((s) => s.tab_id)).size === arr.length,
      { message: 'tab_id values must be unique across strategies' },
    ),
  session_id: SESSION_ID,
});
const ProposeMultiBacktestSchema = z.object({
  // Bound asset to a sensible charset; prevents DoS via huge strings and the brittle
  // `includes('-')` exchange split from silently mis-routing odd inputs like "BTC USDT".
  asset: z.string().min(1).max(32).regex(/^[A-Z0-9]{1,16}([-.][A-Z0-9]{1,16})?$/, 'invalid asset format'),
  count: z.number().int().min(2).max(5).optional(),
  // Bound hint length to prevent DoS through `.toLowerCase().includes()` scoring.
  hint: z.string().max(512).optional(),
  revise_tab_id: z.string().min(1).max(128).optional(),
  timeframe: z.string().regex(/^\d+[mhdwHMD]$/).optional(),
  // Reuse the SESSION_ID constraint shape from the file (charset + length) — was previously
  // unbounded `min(1)` which allowed 10MB session_id to bloat Map keys + log injection.
  session_id: z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/, 'invalid session_id'),
});

export const vibeTrading = new Hono<{ Variables: AppContext }>();
const SHADOW_ID_RE = /^shadow_[0-9a-f]{8}$/;
const proposeRouteRateLimit = new Map<string, number[]>();
const PROPOSE_RATE_LIMIT_WINDOW_MS = 60_000;
const PROPOSE_RATE_LIMIT_MAX = 10;

vibeTrading.post('/jobs', async (c) => {
  const accountId = c.get('accountId');

  const body = await c.req.json().catch(() => null);
  if (body === null) throw new HTTPException(400, { message: 'Invalid JSON body' });

  const parsed = VibeTradingJobSchema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const msg = first
      ? `${first.path.join('.') || 'body'} — ${first.message}`
      : 'Invalid request body';
    throw new HTTPException(400, { message: msg });
  }

  const { session_id, ...payload } = parsed.data;

  // Tier-bypass log (parity Story 3.3 tx-simulator post-patches)
  const ua = (c.req.header('user-agent') ?? '').replace(/[\r\n\t]/g, ' ').slice(0, 80);
  console.log(
    `[TIER-BYPASS-SUSPECT] vibe_trading_backtest hit account=${accountId} ua="${ua}"`,
  );

  const credit = await checkCredits(accountId);
  if (!credit.hasCredits) throw new HTTPException(402, { message: 'Insufficient credits' });

  let result;
  try {
    result = await submitBacktestJob(payload);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Vibe-Trading unavailable';
    return c.json({ success: false, error: msg, cost: 0 }, 503);
  }

  const cost = getToolCost(TOOL, 0);
  try {
    await deductToolCredits(
      accountId,
      TOOL,
      0,
      `Backtest job: ${payload.context_rules.assets.join(',')}`,
      session_id,
    );
  } catch (e) {
    console.warn(`[EPSILON][billing-failure] tool=${TOOL} account=${accountId} err=${e instanceof Error ? e.message : String(e)}`);
  }

  return c.json({ success: true, cost, ...result });
});

vibeTrading.post('/backtest-multi', async (c) => {
  const accountId = c.get('accountId');
  const body = await c.req.json().catch(() => null);
  if (body === null) throw new HTTPException(400, { message: 'Invalid JSON body' });

  const parsed = VibeTradingMultiBacktestSchema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const path = first?.path ?? [];
    let tabIdHint = '';
    if (typeof path[0] === 'string' && path[0] === 'strategies' && typeof path[1] === 'number') {
      const idx = path[1] as number;
      const tabId = (body as { strategies?: Array<{ tab_id?: unknown }> })?.strategies?.[idx]?.tab_id;
      if (typeof tabId === 'string' && tabId.length > 0) {
        // Sanitize: tab_id is user-supplied; strip control chars + clamp length so it
        // can't poison logs or HTTP response bodies via newline/script injection.
        const safe = tabId.replace(/[\r\n\t]/g, ' ').slice(0, 64);
        tabIdHint = ` [tab=${safe}]`;
      }
    }
    const msg = first
      ? `${path.join('.') || 'body'}${tabIdHint} — ${first.message}`
      : 'Invalid request body';
    throw new HTTPException(400, { message: msg });
  }

  const { strategies, session_id } = parsed.data;
  const count = strategies.length;
  if (count < 2 || count > 5) {
    throw new HTTPException(400, { message: 'between 2 and 5 strategies required' });
  }

  // Tier gate (defense in depth — Story 5.9.1 D2a): the UI disables Run All for tier1, the
  // agent permission denies the tool to free tier, but a browser user can bypass both by hand-
  // crafting an HTTP call. Enforce server-side so billing-sensitive multi-run requires pro+.
  const tier = await resolveAccountTier(accountId);
  if (tier !== 'pro' && tier !== 'enterprise') {
    return c.json(
      { success: false, error: 'Multi-strategy backtest requires Pro — upgrade to run' },
      403,
    );
  }

  const ua = (c.req.header('user-agent') ?? '').replace(/[\r\n\t]/g, ' ').slice(0, 80);
  console.log(
    `[TIER-BYPASS-SUSPECT] vibe_trading_backtest_multi account=${accountId} count=${count} tier=${tier} ua="${ua}"`,
  );

  const unitCost = getToolCost(TOOL, 0);
  const totalCost = count * unitCost;
  // Atomic gate: pass totalCost so DB enforces the threshold per call.
  // Local mode (no DB) returns hasCredits=true with balance=0 — handled by hasCredits check only,
  // matching parity with POST /jobs (line 105).
  const credit = await checkCredits(accountId, totalCost);
  if (!credit.hasCredits) {
    const available = credit.balance ?? 0;
    return c.json(
      {
        success: false,
        error: `Insufficient credits for ${count} strategies (need ${totalCost}, have ${available})`,
      },
      402,
    );
  }

  // Atomic billing pattern (parity Story 5.5 + spec AC2 "Pre-deducts BEFORE any VT submit"):
  // deduct N × cost up-front via atomic_use_credits PG function. This closes the snapshot race
  // where two concurrent requests could both pass checkCredits.
  // If ALL VT submits fail downstream, we log a loud charged-but-no-jobs alert (rare; ops triages).
  const assets = Array.from(
    new Set(
      strategies.flatMap((s) =>
        Array.isArray(s.payload.context_rules.assets) ? s.payload.context_rules.assets : [],
      ),
    ),
  ).join(',');
  let totalDeducted = 0;
  if (config.EPSILON_BILLING_INTERNAL_ENABLED) {
    // Bypass deductToolCredits (which uses getToolCost(toolName, resultCount) and the
    // perResultCost formula doesn't scale tool calls by N) — go direct to atomic_use_credits
    // with the explicit totalCost.
    try {
      const sessionSuffix = session_id ? ` [session:${session_id}]` : '';
      const result = await deductCreditsRepo(
        accountId,
        totalCost,
        `Multi-strategy backtest: ${count} × ${assets || 'assets'}${sessionSuffix}`,
      );
      if (!result.success) {
        return c.json(
          {
            success: false,
            error: result.error || `Insufficient credits for ${count} strategies (need ${totalCost})`,
          },
          402,
        );
      }
      // Trust the repo's reported deduction — never silently substitute the requested
      // totalCost. If `amountDeducted` is undefined the repo contract is broken; treat
      // as 0 deducted to avoid lying to the client.
      totalDeducted = result.amountDeducted ?? 0;
      if (totalDeducted < totalCost) {
        console.warn(
          `[EPSILON][billing-partial-deduct] tool=${TOOL} account=${accountId} requested=${totalCost} actual=${totalDeducted}`,
        );
      }
    } catch (e) {
      console.warn(
        `[EPSILON][billing-failure] tool=${TOOL} account=${accountId} err=${e instanceof Error ? e.message : String(e)}`,
      );
      return c.json({ success: false, error: 'Billing service unavailable' }, 503);
    }
  }

  const settled = await Promise.allSettled(
    strategies.map((item) => submitBacktestJob(item.payload)),
  );
  const successCount = settled.filter((r) => r.status === 'fulfilled').length;
  if (successCount === 0) {
    // All submits failed AFTER atomic deduct — close the orphan loophole by refunding
    // automatically via `atomic_add_credits`. Per spec line 1251, partial failures are
    // still charged (intentional), but all-fail is treated as "no compute happened" so
    // a full refund matches Story 5.5 atomic billing parity. Refund failure is logged
    // loud for ops; the client still sees a 503 either way.
    let refundedAmount = 0;
    let refundError: string | null = null;
    if (config.EPSILON_BILLING_INTERNAL_ENABLED && totalDeducted > 0) {
      try {
        const refund = await refundCreditsRepo(
          accountId,
          totalDeducted,
          `Refund: multi-strategy backtest all-fail (${count} strategies)`,
        );
        if (refund.success) {
          refundedAmount = refund.amountDeducted ?? totalDeducted;
        } else {
          refundError = refund.error ?? 'unknown refund error';
        }
      } catch (e) {
        refundError = e instanceof Error ? e.message : String(e);
      }
    }
    if (refundError || (config.EPSILON_BILLING_INTERNAL_ENABLED && totalDeducted > 0 && refundedAmount === 0)) {
      console.error(
        `[EPSILON][billing-orphan] tool=${TOOL} account=${accountId} charged=$${totalDeducted.toFixed(4)} refunded=$${refundedAmount.toFixed(4)} count=${count} reason=all_vt_submits_failed refund_error=${refundError ?? 'no-op'}`,
      );
    }
    const refunded = refundedAmount > 0;
    return c.json(
      {
        success: false,
        error: refunded
          ? 'All VT submits failed — credits refunded automatically'
          : 'All VT submits failed — credit charged, contact support for refund',
        cost: refunded ? 0 : totalDeducted,
        refunded,
      },
      503,
    );
  }

  const submissions = strategies.map((strategy, idx) => {
    const item = settled[idx];
    if (item.status === 'fulfilled') {
      return {
        tab_id: strategy.tab_id,
        status: 'accepted' as const,
        job_id: item.value.job_id,
      };
    }
    return {
      tab_id: strategy.tab_id,
      status: 'submit_failed' as const,
      error: item.reason instanceof Error ? item.reason.message : 'Submit failed',
    };
  });

  return c.json({
    success: true,
    cost: totalDeducted,
    submissions,
  });
});

vibeTrading.post('/propose-multi', async (c) => {
  // Rate-limit key fallback: combinedAuth only sets `accountId` on the Epsilon-token path;
  // Supabase-JWT (web) and local-dev users have accountId=undefined. Fall back to `userId`
  // so each user gets their own bucket instead of all web users sharing the `undefined` slot.
  // Final fallback to user-agent prevents global single-bucket collapse for completely
  // anonymous unauth (shouldn't happen behind combinedAuth, but defensive).
  const accountId = c.get('accountId');
  const userId = c.get('userId');
  const rateLimitKey = accountId || userId || `anon:${(c.req.header('user-agent') ?? 'unknown').slice(0, 32)}`;

  const body = await c.req.json().catch(() => null);
  if (body === null) throw new HTTPException(400, { message: 'Invalid JSON body' });

  const parsed = ProposeMultiBacktestSchema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const msg = first
      ? `${first.path.join('.') || 'body'} — ${first.message}`
      : 'Invalid request body';
    throw new HTTPException(400, { message: msg });
  }

  const now = Date.now();
  const history = proposeRouteRateLimit.get(rateLimitKey) ?? [];
  const recent = history.filter((ts) => now - ts < PROPOSE_RATE_LIMIT_WINDOW_MS);
  if (recent.length >= PROPOSE_RATE_LIMIT_MAX) {
    c.header('Retry-After', '60');
    return c.json({ success: false, error: 'Rate limit exceeded. Try again in a minute.' }, 429);
  }
  recent.push(now);
  // Map eviction: delete the entry when no recent timestamps remain, so unique keys don't
  // accumulate indefinitely. (Map.set with empty array would leave a phantom row in memory.)
  if (recent.length === 0) {
    proposeRouteRateLimit.delete(rateLimitKey);
  } else {
    proposeRouteRateLimit.set(rateLimitKey, recent);
  }

  const tier = await resolveAccountTier(accountId);
  // Only emit tier-bypass log on the actual "free tier attempts propose" path, not happy path —
  // happy-path logging would flood logs and dilute the security signal of the prefix.
  if (tier === 'free') {
    const ua = (c.req.header('user-agent') ?? '').replace(/[\r\n\t]/g, ' ').slice(0, 80);
    console.log(
      `[TIER-BYPASS-SUSPECT] propose_backtest_multi free account=${accountId ?? 'jwt-user'} ua="${ua}"`,
    );
  }

  try {
    const result = proposeBacktestStrategies({
      asset: parsed.data.asset,
      count: parsed.data.count ?? 3,
      hint: parsed.data.hint,
      revise_tab_id: parsed.data.revise_tab_id,
      timeframe: parsed.data.timeframe ?? '4h',
      caller_tier: tier,
    });
    return c.json({ success: true, ...result });
  } catch (err) {
    // Log the actual error so template regressions or schema-assert failures don't silently
    // disappear behind a "temporarily unavailable" 503. User still sees the generic message.
    console.error('[propose-multi] strategy generation failed:', err);
    return c.json(
      { success: false, error: 'Strategy generation temporarily unavailable; please try again in a moment' },
      503,
    );
  }
});

vibeTrading.get('/runs/:jobId', async (c) => {
  const jobId = c.req.param('jobId');
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(jobId)) {
    throw new HTTPException(400, { message: 'Invalid job_id format' });
  }

  try {
    const run = await getBacktestRun(jobId);
    return c.json({ success: true, ...run });
  } catch (err) {
    if (err instanceof VibeTradingDownstreamError) {
      return c.json({ success: false, error: err.message }, 503);
    }
    return c.json({ success: false, error: err instanceof Error ? err.message : 'Run query failed' }, 503);
  }
});

vibeTrading.get('/shadow-reports/:shadowId', async (c) => {
  const accountId = c.get('accountId');
  if (!accountId) throw new HTTPException(401, { message: 'Unauthorized' });

  // Story 5.0.2 audit Q2 (2026-05-18): shadow_id is only 32 bits (8 hex chars)
  // — brute-forceable from a Tier 1 sandbox. Gate at Tier 2+ as defense in depth.
  // TODO: when shadow accounts get DB-backed ownership tracking (future story),
  // add `WHERE owner_account_id = ?` check to scope reports to their owner.
  const tier = await resolveAccountTier(accountId);
  if (tier !== 'pro' && tier !== 'enterprise') {
    throw new HTTPException(403, { message: 'Pro tier required for Shadow Account reports' });
  }

  const shadowId = c.req.param('shadowId');
  if (!SHADOW_ID_RE.test(shadowId)) {
    throw new HTTPException(400, { message: 'Invalid shadow_id format' });
  }

  const formatParam = c.req.query('format') ?? 'html';
  const format = z.enum(['html', 'pdf']).safeParse(formatParam);
  if (!format.success) {
    throw new HTTPException(400, { message: 'Invalid format: expected html or pdf' });
  }

  if (!config.VIBE_TRADING_API_KEY) {
    return c.json({ success: false, error: 'Vibe-Trading not configured' }, 503);
  }

  // TOFU ownership claim — first authenticated caller of this shadow_id wins.
  // Mismatched callers receive 403. See packages/db/drizzle/0010_shadow_account_ownership.sql.
  try {
    await claimOrAssertShadowOwnership(accountId, shadowId);
  } catch (err) {
    if (err instanceof ShadowOwnershipError) {
      throw new HTTPException(403, { message: 'Shadow report not owned by this account' });
    }
    throw err;
  }

  const target = `${config.VIBE_TRADING_INTERNAL_URL.replace(/\/+$/, '')}/shadow-reports/${shadowId}?format=${format.data}`;
  let response: Response;
  try {
    response = await fetch(target, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${config.VIBE_TRADING_API_KEY}`,
      },
      signal: AbortSignal.timeout(28_000),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Vibe-Trading unavailable';
    return c.json({ success: false, error: message }, 503);
  }

  if (response.status === 401) throw new HTTPException(401, { message: new VibeTradingAuthError().message });
  if (response.status === 403) throw new HTTPException(403, { message: new VibeTradingForbiddenError().message });
  if (response.status === 404) throw new HTTPException(404, { message: new VibeTradingNotFoundError(shadowId).message });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    return c.json(
      { success: false, error: new VibeTradingDownstreamError(response.status, body).message },
      503,
    );
  }

  const contentType = response.headers.get('content-type') ?? (format.data === 'pdf' ? 'application/pdf' : 'text/html; charset=utf-8');
  return new Response(response.body, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `inline; filename="${shadowId}.${format.data}"`,
    },
  });
});

// ─── SSE stream: GET /runs/:jobId/stream ──
// Story 5.3 — replaces frontend 2s polling. Server-side polls VT every 1s up to 60s,
// emits named events only on state transition (deduped). Heartbeat every 15s.
//
// Event taxonomy:
//   data_loading — VT status: 'pending' (run dir not yet created)
//   phase_a      — VT status: 'unknown' (run dir created, simulation pending)
//   phase_b      — VT status: 'success' with metrics populated
//   failed       — VT status: 'failed' | 'aborted'
//   timeout      — server-side 60s budget exhausted
//   heartbeat    — every 15s, keeps proxy connections alive
//
// Auth is inherited from /vibe-trading/* combinedAuth mount in router/index.ts.
// Billing already deducted in POST /jobs — SSE endpoint is read-only.

export type StreamEventName = 'data_loading' | 'phase_a' | 'phase_b' | 'failed' | 'timeout' | 'heartbeat';

interface RunStateLike {
  status?: string;
  metrics?: unknown;
  data_summary?: unknown;
}

/** Pure mapping function — exported for unit testing. */
export function classifyRunState(run: RunStateLike): StreamEventName | null {
  const status = run.status;
  if (status === 'failed' || status === 'aborted') return 'failed';
  if (status === 'success') {
    const m = run.metrics as Record<string, unknown> | null | undefined;
    // Only phase_b when sharpe is present — VT sometimes returns status=success with empty
    // metrics while the artifact CSV is still being written. Keep polling until sharpe appears.
    if (m && typeof m === 'object' && typeof m.sharpe !== 'undefined') return 'phase_b';
    // status=success but metrics not ready — keep polling
    return 'data_loading';
  }
  // VT uses status='unknown' for the entire Phase A window (run dir created, simulation pending).
  // data_summary is never populated by VT — treat status='unknown' directly as phase_a.
  if (status === 'unknown') return 'phase_a';
  // 'pending' or any unrecognized state → still loading
  return 'data_loading';
}

/** Terminal events close the stream. Exported for unit testing. */
export function isTerminalEvent(event: StreamEventName): boolean {
  return event === 'phase_b' || event === 'failed' || event === 'timeout';
}

// 60s was too aggressive for heavier strategies in multi-run mode and caused
// false timeout states on the UI while backend jobs were still progressing.
const STREAM_BUDGET_MS = 180_000;
const POLL_INTERVAL_MS = 1_000;
const HEARTBEAT_INTERVAL_MS = 15_000;

vibeTrading.get('/runs/:jobId/stream', async (c) => {
  const jobId = c.req.param('jobId');
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(jobId)) {
    throw new HTTPException(400, { message: 'Invalid job_id format' });
  }

  const accountId = c.get('accountId');
  const ua = (c.req.header('user-agent') ?? '').replace(/[\r\n\t]/g, ' ').slice(0, 80);
  console.log(
    `[TIER-BYPASS-SUSPECT] vibe_trading_stream account=${accountId} jobId=${jobId} ua="${ua}"`,
  );

  return streamSSE(c, async (stream) => {
    let prevEvent: StreamEventName | null = null;
    let terminalEmitted = false;
    const deadline = Date.now() + STREAM_BUDGET_MS;

    // Note: stream.aborted fires prematurely on Bun 1.3.x — check only stream.closed.
    const isDone = () => stream.closed;

    const safeWrite = async (payload: { event: string; data: string }): Promise<boolean> => {
      if (isDone()) return false;
      try {
        await stream.writeSSE(payload);
        return true;
      } catch {
        return false;
      }
    };

    await safeWrite({ event: 'heartbeat', data: '' });

    const heartbeat = setInterval(() => {
      if (isDone()) { clearInterval(heartbeat); return; }
      void safeWrite({ event: 'heartbeat', data: '' }).then((ok) => { if (!ok) clearInterval(heartbeat); });
    }, HEARTBEAT_INTERVAL_MS);

    try {
      while (!isDone() && Date.now() < deadline) {
        let run: Awaited<ReturnType<typeof getBacktestRun>>;
        try {
          run = await getBacktestRun(jobId);
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Vibe-Trading downstream error';
          await safeWrite({ event: 'failed', data: JSON.stringify({ success: false, run_id: jobId, status: 'failed', reason: message }) });
          terminalEmitted = true;
          break;
        }

        const event = classifyRunState(run);
        if (event && event !== prevEvent) {
          const wrote = await safeWrite({ event, data: JSON.stringify({ success: true, ...run }) });
          if (!wrote) break;
          prevEvent = event;
          if (isTerminalEvent(event)) { terminalEmitted = true; break; }
        }

        const remaining = deadline - Date.now();
        if (remaining <= 0) break;
        await stream.sleep(Math.min(POLL_INTERVAL_MS, remaining));
      }

      if (!isDone() && !terminalEmitted) {
        const reason =
          prevEvent === null
            ? 'No state observed within budget'
            : `Backtest exceeded ${Math.round(STREAM_BUDGET_MS / 1000)}s server-side budget`;
        await safeWrite({ event: 'timeout', data: JSON.stringify({ success: false, run_id: jobId, reason }) });
      }
    } finally {
      clearInterval(heartbeat);
    }
  });
});

/**
 * Native Bun ReadableStream SSE handler — bypasses Hono middleware pipeline
 * to avoid the Hono CORS middleware header-mutation bug that causes Bun to abort
 * the response body after the first flush. Called directly from Bun.serve fetch().
 */
export function streamVibeTradingSSE(jobId: string, origin: string | null): Response {
  const encoder = new TextEncoder();

  function sseChunk(event: string, data: string): Uint8Array {
    return encoder.encode(`event: ${event}\ndata: ${data}\n\n`);
  }

  let cancelled = false;
  const body = new ReadableStream({
    async start(controller) {
      let prevEvent: StreamEventName | null = null;
      let terminalEmitted = false;
      const deadline = Date.now() + STREAM_BUDGET_MS;

      const isDone = () => cancelled || controller.desiredSize === null;

      const safeEnqueue = (chunk: Uint8Array): boolean => {
        if (isDone()) return false;
        try { controller.enqueue(chunk); return true; }
        catch { return false; }
      };

      safeEnqueue(sseChunk('heartbeat', ''));

      const heartbeat = setInterval(() => {
        if (!safeEnqueue(sseChunk('heartbeat', ''))) clearInterval(heartbeat);
      }, HEARTBEAT_INTERVAL_MS);

      // Brief pause to let the heartbeat chunk flush before the first poll.
      await new Promise<void>((r) => setTimeout(r, 200));

      try {
        while (!isDone() && Date.now() < deadline) {
          let run: Awaited<ReturnType<typeof getBacktestRun>>;
          try {
            run = await getBacktestRun(jobId);
          } catch (err) {
            const message = err instanceof Error ? err.message : 'Vibe-Trading downstream error';
            safeEnqueue(sseChunk('failed', JSON.stringify({ success: false, run_id: jobId, status: 'failed', reason: message })));
            terminalEmitted = true;
            break;
          }

          const event = classifyRunState(run);
          if (event && event !== prevEvent) {
            const ok = safeEnqueue(sseChunk(event, JSON.stringify({ success: true, ...run })));
            if (!ok) break;
            prevEvent = event;
            if (isTerminalEvent(event)) { terminalEmitted = true; break; }
          }

          const remaining = deadline - Date.now();
          if (remaining <= 0) break;
          // Send keep-alive heartbeat every 200ms during the poll sleep to prevent
          // Chrome/Bun from aborting idle ReadableStream bodies (BodyStreamBuffer aborted).
          const sleepMs = Math.min(POLL_INTERVAL_MS, remaining);
          const sleepEnd = Date.now() + sleepMs;
          while (!isDone() && Date.now() < sleepEnd) {
            await new Promise<void>((r) => setTimeout(r, Math.min(200, sleepEnd - Date.now())));
            if (!isDone() && Date.now() < sleepEnd) safeEnqueue(sseChunk('heartbeat', ''));
          }
        }

        if (!isDone() && !terminalEmitted) {
          const reason =
            prevEvent === null
              ? 'No state observed within budget'
              : `Backtest exceeded ${Math.round(STREAM_BUDGET_MS / 1000)}s server-side budget`;
          safeEnqueue(sseChunk('timeout', JSON.stringify({ success: false, run_id: jobId, reason })));
        }
      } finally {
        clearInterval(heartbeat);
        try { controller.close(); } catch { /* already closed */ }
      }
    },
    cancel() { cancelled = true; },
  });

  const headers: Record<string, string> = {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Transfer-Encoding': 'chunked',
  };
  if (origin) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Credentials'] = 'true';
    headers['Vary'] = 'Origin';
  }
  return new Response(body, { headers });
}
