import { config } from '../../config';

const SERVICE_TIMEOUT_MS = 28_000;

// Distinct error classes for deploy-time config drift detection
export class VibeTradingAuthError extends Error {
  constructor() {
    super('Invalid VIBE_TRADING_API_KEY — check deploy config (Story 5.0 env injection)');
    this.name = 'VibeTradingAuthError';
  }
}

export class VibeTradingForbiddenError extends Error {
  constructor() {
    super('Vibe-Trading IP whitelist rejected request — ALLOWED_IPS misconfigured (Story 5.0 sandbox-network subnet)');
    this.name = 'VibeTradingForbiddenError';
  }
}

export class VibeTradingNotFoundError extends Error {
  constructor(jobId: string) {
    super(`Run ${jobId} not found (worker may not have created run dir yet — retry)`);
    this.name = 'VibeTradingNotFoundError';
  }
}

export class VibeTradingDownstreamError extends Error {
  constructor(status: number, body: string) {
    super(`Vibe-Trading downstream error ${status}: ${body.slice(0, 200)}`);
    this.name = 'VibeTradingDownstreamError';
  }
}

export interface SubmitJobResponse {
  status: 'accepted';
  job_id: string;
}

// Phase A: worker wrote CSV + metadata.json but not state.json yet
// Phase B: worker wrote state.json (status=success) + artifacts/metrics.csv
export interface BacktestRunResponse {
  run_id: string;
  status: 'success' | 'failed' | 'aborted' | 'unknown' | 'pending';
  reason?: string;
  // Phase B fields — optional until VT 2.3 done
  metrics?: {
    sharpe?: number;
    max_drawdown?: number;
    total_return?: number;
    win_rate?: number;
    [key: string]: unknown;
  } | null;
  equity_curve?: unknown[] | null;
  trade_log?: unknown[] | null;
  planner_output?: unknown;
  strategy_spec?: unknown;
  // Phase A enrichment — forwarded from submit response
  data_summary?: Record<string, unknown>;
}

// Cache submit response data_summary so getBacktestRun can merge it into Phase A response.
// Key: job_id, Value: data_summary from submit response.
// When VT 2.3 done, this cache becomes irrelevant (Phase B response has full metrics).
const dataSummaryCache = new Map<string, Record<string, unknown>>();

function buildHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${config.VIBE_TRADING_API_KEY}`,
  };
}

function vtBaseUrl(): string {
  return (config.VIBE_TRADING_INTERNAL_URL ?? '').replace(/\/+$/, '');
}

/**
 * Submit a backtest job to Vibe-Trading.
 * Returns { status: "accepted", job_id } on success.
 * Throws VibeTradingAuthError (401), VibeTradingForbiddenError (403), VibeTradingDownstreamError (5xx).
 *
 * Phase A enrichment: caches data_summary from submit response so getBacktestRun can merge it.
 * When VT 2.3 marked done, tighten Zod `metrics`/`equity_curve`/`trade_log` from `.optional()` →
 * required for success path. Add Phase B integration test.
 */
export async function submitBacktestJob(
  payload: unknown,
  options: { signal?: AbortSignal } = {},
): Promise<SubmitJobResponse> {
  const signal = options.signal ?? AbortSignal.timeout(SERVICE_TIMEOUT_MS);
  const url = `${vtBaseUrl()}/jobs`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: buildHeaders(),
      body: JSON.stringify(payload),
      signal,
    });
  } catch (e) {
    throw new Error(`Vibe-Trading network error: ${e instanceof Error ? e.message : String(e)}`);
  }

  if (response.status === 401) throw new VibeTradingAuthError();
  if (response.status === 403) throw new VibeTradingForbiddenError();
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new VibeTradingDownstreamError(response.status, body);
  }

  const data = await response.json() as SubmitJobResponse & { data_summary?: Record<string, unknown> };

  // Cache data_summary for Phase A enrichment in getBacktestRun
  if (data.data_summary) {
    dataSummaryCache.set(data.job_id, data.data_summary);
  }

  return { status: data.status, job_id: data.job_id };
}

/**
 * Get backtest run status from Vibe-Trading.
 * Returns { status: "pending", run_id } on 404 (worker not yet created run dir — caller should retry).
 * Merges cached data_summary into Phase A responses.
 */
export async function getBacktestRun(
  jobId: string,
  options: { signal?: AbortSignal } = {},
): Promise<BacktestRunResponse> {
  const signal = options.signal ?? AbortSignal.timeout(SERVICE_TIMEOUT_MS);
  const url = `${vtBaseUrl()}/runs/${jobId}`;

  let response: Response;
  try {
    response = await fetch(url, { headers: buildHeaders(), signal });
  } catch (e) {
    throw new Error(`Vibe-Trading network error: ${e instanceof Error ? e.message : String(e)}`);
  }

  if (response.status === 401) throw new VibeTradingAuthError();
  if (response.status === 403) throw new VibeTradingForbiddenError();
  // 404: worker hasn't created run dir yet — return pending (caller retries)
  if (response.status === 404) return { run_id: jobId, status: 'pending' };
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new VibeTradingDownstreamError(response.status, body);
  }

  const data = await response.json() as BacktestRunResponse;

  // Phase A enrichment: merge cached data_summary if VT response doesn't include it
  const cachedSummary = dataSummaryCache.get(jobId);
  if (data.status === 'unknown' && !data.data_summary && cachedSummary) {
    data.data_summary = cachedSummary;
  }

  return { ...data, run_id: jobId };
}

/**
 * Phase B detection helper.
 * Returns true iff response has status="success" AND metrics populated with sharpe field.
 * Used by tool layer to distinguish Phase B (full results) from Phase A (data load only).
 */
export function isPhaseBResponse(response: BacktestRunResponse): boolean {
  return (
    response.status === 'success' &&
    response.metrics !== null &&
    response.metrics !== undefined &&
    typeof (response.metrics as Record<string, unknown>).sharpe !== 'undefined'
  );
}
