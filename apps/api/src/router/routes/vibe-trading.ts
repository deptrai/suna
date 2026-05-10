import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import { submitBacktestJob, getBacktestRun, VibeTradingDownstreamError } from '../services/vibe-trading';
import { checkCredits, deductToolCredits } from '../services/billing';
import { getToolCost } from '../../config';
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
      historical_range: z.number().int().min(1).max(3650), // Pydantic ge=1, le=3650
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
      timeframe: z.string().regex(/^\d+[mhdwM]$/), // Pydantic pattern — accepts 1m/2h/1w/1M
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

vibeTrading.post('/jobs', async (c) => {
  const accountId = c.get('accountId');

  const body = await c.req.json().catch(() => null);
  if (body === null) throw new HTTPException(400, { message: 'Invalid JSON body' });

  const parsed = VibeTradingJobSchema.safeParse(body);
  if (!parsed.success) throw new HTTPException(400, { message: parsed.error.message });

  const { session_id, ...payload } = parsed.data;

  // Tier-bypass log (parity Story 3.3 tx-simulator post-patches)
  console.log(
    `[TIER-BYPASS-SUSPECT] vibe_trading_backtest hit account=${accountId} ua="${(c.req.header('user-agent') ?? '').slice(0, 80)}"`,
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
