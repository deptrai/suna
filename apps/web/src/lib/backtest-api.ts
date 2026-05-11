import { getEnv } from '@/lib/env-config';
import { authenticatedFetch, getSupabaseAccessTokenWithRetry } from '@/lib/auth-token';
import { createSSEStream, type SSEStream } from '@/lib/utils/sse-stream';

export interface SubmitResponse {
  success: true;
  cost: number;
  status: 'accepted';
  job_id: string;
  run_id?: string;
}

export interface RunResponse {
  success: true;
  run_id: string;
  status: 'unknown' | 'success' | 'failed';
  reason?: string;
  data_summary?: Record<string, unknown>;
  metrics?: Record<string, unknown>;
  equity_curve?: Array<Record<string, unknown>>;
  trade_log?: Array<Record<string, unknown>>;
}

export type BacktestStatus = 400 | 401 | 402 | 403 | 500 | 503;

export class BacktestError extends Error {
  readonly status: BacktestStatus;
  constructor(status: BacktestStatus, message: string) {
    super(message);
    this.name = 'BacktestError';
    this.status = status;
  }
}

function isSubmitResponse(value: unknown): value is SubmitResponse {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return v.success === true && typeof v.job_id === 'string' && v.job_id.length > 0;
}

async function safeJson(res: Response): Promise<Record<string, unknown>> {
  try {
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function extractMessage(body: Record<string, unknown>, fallback: string): string {
  const candidate = body.error ?? body.message;
  return typeof candidate === 'string' && candidate.length > 0 ? candidate : fallback;
}

export async function submitBacktest(
  payload: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<SubmitResponse> {
  const baseUrl = getEnv().BACKEND_URL;
  const res = await authenticatedFetch(`${baseUrl}/router/vibe-trading/jobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal,
  });

  if (res.status === 401) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('DEV BYPASS: Mocking submitBacktest due to 401');
      return { success: true, cost: 0, status: 'accepted', job_id: 'mock-job-123' };
    }
    throw new BacktestError(401, 'Unauthorized');
  }
  if (res.status === 402) throw new BacktestError(402, 'Insufficient credits');
  if (res.status === 403) throw new BacktestError(403, 'Service not available');

  if (!res.ok) {
    const body = await safeJson(res);
    if (res.status === 503) {
      throw new BacktestError(503, extractMessage(body, 'Service unavailable'));
    }
    if (res.status >= 500) {
      throw new BacktestError(500, extractMessage(body, `Upstream error (${res.status})`));
    }
    throw new BacktestError(400, extractMessage(body, 'Validation failed'));
  }

  const data = await safeJson(res);
  if (!isSubmitResponse(data)) {
    throw new BacktestError(500, 'Malformed response from backend');
  }
  return data;
}

export interface PollOptions {
  intervalMs?: number;
  maxWaitMs?: number;
  signal?: AbortSignal;
}

/**
 * @deprecated Use streamRun() instead. Will be removed in a follow-up story
 * once SSE has soaked in production. Kept as a fallback for environments where
 * SSE is unavailable (e.g., older proxy chains stripping `text/event-stream`).
 */
export async function pollRun(
  jobId: string,
  options: PollOptions = {},
): Promise<RunResponse> {
  const { intervalMs = 2000, maxWaitMs = 30_000 } = options;
  const baseUrl = getEnv().BACKEND_URL;
  const deadline = Date.now() + maxWaitMs;
  const externalSignal = options.signal;

  while (Date.now() < deadline) {
    if (externalSignal?.aborted) throw new Error('Cancelled');

    const res = await authenticatedFetch(
      `${baseUrl}/router/vibe-trading/runs/${jobId}`,
      { signal: externalSignal },
    );

    if (!res.ok) {
      const body = await safeJson(res);
      if (res.status === 401) {
        if (process.env.NODE_ENV === 'development' && jobId === 'mock-job-123') {
          console.warn('DEV BYPASS: Mocking pollRun due to 401');
          return {
            success: true,
            run_id: 'mock-run-123',
            status: 'success',
            data_summary: {
              "Total Return": "45.2%",
              "Sharpe Ratio": 1.8,
              "Max Drawdown": "12.5%",
              "Win Rate": "62%"
            },
            equity_curve: [
              { timestamp: "2024-01-01", value: 10000, benchmark: 10000 },
              { timestamp: "2024-02-01", value: 10500, benchmark: 10200 },
              { timestamp: "2024-03-01", value: 14520, benchmark: 12000 }
            ]
          };
        }
        throw new BacktestError(401, 'Unauthorized');
      }
      if (res.status === 403) throw new BacktestError(403, 'Service not available');
      if (res.status === 503) throw new BacktestError(503, extractMessage(body, 'Service unavailable'));
      if (res.status >= 500) throw new BacktestError(500, extractMessage(body, `Upstream error (${res.status})`));
      throw new BacktestError(400, extractMessage(body, `Poll failed (${res.status})`));
    }

    const data = (await safeJson(res)) as unknown as RunResponse;
    // Terminal states: success, failed, or unknown (Phase A done — worker loaded data)
    // 'pending' means run dir not yet created → keep polling
    if (
      data.status === 'success' ||
      data.status === 'failed' ||
      data.status === 'unknown'
    ) {
      return data;
    }

    const remaining = deadline - Date.now();
    if (remaining <= 0) break;

    await new Promise<void>((resolve, reject) => {
      const tid = setTimeout(resolve, Math.min(intervalMs, remaining));
      const onAbort = () => {
        clearTimeout(tid);
        reject(new Error('Cancelled'));
      };
      externalSignal?.addEventListener('abort', onAbort, { once: true });
    });
  }

  throw new Error('timeout');
}

// ─── SSE streaming (Story 5.3) ──────────────────────────────────────────────

export type StreamEventName = 'data_loading' | 'phase_a' | 'phase_b' | 'failed' | 'timeout';

export interface StreamRunCallbacks {
  onDataLoading?: (data: RunResponse) => void;
  onPhaseA?: (data: RunResponse) => void;
  onPhaseB?: (data: RunResponse) => void;
  onFailed?: (data: RunResponse & { reason?: string }) => void;
  onTimeout?: (data: { run_id: string; reason?: string }) => void;
  onError?: (error: Error) => void;
}

/**
 * Open an SSE connection to `/router/vibe-trading/runs/:jobId/stream` and dispatch
 * named events to typed callbacks. Returns the underlying SSEStream so the caller
 * can `close()` explicitly (or pass an AbortSignal that aborts on unmount).
 *
 * Errors:
 * - Connection failure (non-2xx response) → onError(Error). UI must surface, not retry silently.
 * - Malformed event data (JSON parse failure) → swallowed per-event (other events keep flowing).
 * - signal.abort() → stream closes cleanly without invoking callbacks.
 */
export async function streamRun(
  jobId: string,
  callbacks: StreamRunCallbacks,
  signal?: AbortSignal,
): Promise<SSEStream> {
  const baseUrl = getEnv().BACKEND_URL;
  const token = await getSupabaseAccessTokenWithRetry();
  if (!token) {
    callbacks.onError?.(new BacktestError(401, 'No auth token available'));
    // Return a no-op stream so the caller's lifecycle expectations hold.
    return {
      connect: () => {},
      close: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
    };
  }

  const parseAndDispatch = <T,>(rawData: string, handler?: (data: T) => void) => {
    if (!handler) return;
    try {
      const parsed = JSON.parse(rawData) as T;
      handler(parsed);
    } catch {
      // Malformed event payload — keep stream alive, surface via onError once.
      callbacks.onError?.(new BacktestError(500, 'Malformed SSE event payload'));
    }
  };

  const stream = createSSEStream({
    url: `${baseUrl}/router/vibe-trading/runs/${jobId}/stream`,
    token,
    signal,
    onError: (err) => callbacks.onError?.(err),
  });

  stream.addEventListener('data_loading', (data) =>
    parseAndDispatch<RunResponse>(data, callbacks.onDataLoading),
  );
  stream.addEventListener('phase_a', (data) =>
    parseAndDispatch<RunResponse>(data, callbacks.onPhaseA),
  );
  stream.addEventListener('phase_b', (data) => {
    parseAndDispatch<RunResponse>(data, callbacks.onPhaseB);
    // phase_b is terminal — close the stream proactively even though the server already did.
    stream.close();
  });
  stream.addEventListener('failed', (data) => {
    parseAndDispatch<RunResponse & { reason?: string }>(data, callbacks.onFailed);
    stream.close();
  });
  stream.addEventListener('timeout', (data) => {
    parseAndDispatch<{ run_id: string; reason?: string }>(data, callbacks.onTimeout);
    stream.close();
  });
  // heartbeat events have no data — ignore.

  stream.connect();
  return stream;
}
