import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { streamSSE } from 'hono/streaming';
import { z } from 'zod';
import {
  submitBacktestJob,
  getBacktestRun,
  VibeTradingAuthError,
  VibeTradingForbiddenError,
  VibeTradingNotFoundError,
  VibeTradingDownstreamError,
} from '../services/vibe-trading';
import { checkCredits, deductToolCredits } from '../services/billing';
import { claimOrAssertShadowOwnership, ShadowOwnershipError } from '../services/shadow-ownership';
import { config, getToolCost } from '../../config';
import type { AppContext } from '../../types';

const TOOL = 'vibe_trading_backtest';

const SESSION_ID = z.string().max(128).regex(/^[A-Za-z0-9_-]+$/).optional();

const VibeTradingJobSchema = z
  .object({
    simulation_environment: z.object({
      exchange: z.string().min(1),
      instrument_type: z.enum(['SPOT', 'PERPETUAL']), // NOT 'FUTURES' — verified api_models.py:7-9
      initial_capital: z.string(),
      trading_fees: z.string().optional(),
      slippage_tolerance: z.string().optional(),
      historical_range: z.number().int().min(1).max(730), // Vibe-Trading API actual limit: le=730
      gas_fee_model: z.string().optional(),
      track_impermanent_loss: z.boolean().optional(),
    }),
    risk_management: z.object({
      max_drawdown_percentage: z.string(),
      stop_loss: z.string().optional(),
      take_profit: z.string().optional(),
      position_sizing: z.string(),
      leverage: z.string().optional(),
    }),
    context_rules: z.object({
      assets: z.array(z.string()).min(1),
      timeframe: z.string().regex(/^\d+[mhdwHMD]$/), // Pydantic pattern
      indicators: z.array(z.string()).optional(),
      natural_language_rules: z.string().max(10000).optional(),
      executable_code: z.string().max(50000).optional(),
    }),
    execution_flags: z
      .object({
        enable_monte_carlo_stress_test: z.boolean().optional(),
        enable_rl_optimization: z.boolean().optional(),
      })
      .optional(),
    session_id: SESSION_ID,
  })
  .refine(
    (d) =>
      !(
        d.simulation_environment.instrument_type === 'SPOT' &&
        d.risk_management.leverage &&
        Number(d.risk_management.leverage) > 1.0
      ),
    { message: 'Leverage greater than 1.0 is not supported for SPOT instruments.' },
  );

export const vibeTrading = new Hono<{ Variables: AppContext }>();
const SHADOW_ID_RE = /^shadow_[0-9a-f]{8}$/;

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

const STREAM_BUDGET_MS = 60_000;
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
        const reason = prevEvent === null ? 'No state observed within budget' : 'Backtest exceeded 60s server-side budget';
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
          const reason = prevEvent === null ? 'No state observed within budget' : 'Backtest exceeded 60s server-side budget';
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
