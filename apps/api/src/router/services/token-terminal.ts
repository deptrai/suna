import { config } from '../../config';
import { logger } from '../../lib/logger';

const TIMEOUT_MS = 15_000;
const MIN_REQUEST_INTERVAL_MS = 100; // throttle while keeping tests fast
let lastReqAt = 0;

async function throttle() {
  const wait = Math.max(0, MIN_REQUEST_INTERVAL_MS - (Date.now() - lastReqAt));
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastReqAt = Date.now();
}

export class TokenTerminalUnconfiguredError extends Error { constructor() { super('Token Terminal API key not configured'); this.name = 'TokenTerminalUnconfiguredError'; } }
export class TokenTerminalProjectRedirectError extends Error { constructor() { super('Token Terminal project renamed (308)'); this.name = 'TokenTerminalProjectRedirectError'; } }
export class TokenTerminalInvalidQueryError extends Error { constructor() { super('Invalid Token Terminal query (400)'); this.name = 'TokenTerminalInvalidQueryError'; } }
export class TokenTerminalPaymentRequiredError extends Error { constructor() { super('Token Terminal API subscription invalid/inactive (402)'); this.name = 'TokenTerminalPaymentRequiredError'; } }
export class TokenTerminalForbiddenError extends Error { constructor() { super('Token Terminal access forbidden (403)'); this.name = 'TokenTerminalForbiddenError'; } }
export class TokenTerminalRateLimitError extends Error { constructor() { super('Token Terminal rate limit hit (429)'); this.name = 'TokenTerminalRateLimitError'; } }
export class TokenTerminalProviderError extends Error { constructor(public status: number, msg: string) { super(msg); this.name = 'TokenTerminalProviderError'; } }

function ensureConfigured() {
  if (!config.TOKEN_TERMINAL_API_KEY) throw new TokenTerminalUnconfiguredError();
}

async function ttGet(path: string, query?: Record<string, string>): Promise<any> {
  ensureConfigured();
  await throttle();

  const base = config.TOKEN_TERMINAL_API_BASE_URL.replace(/\/+$/, '');
  const url = new URL(`${base}${path}`);
  if (query) Object.entries(query).forEach(([k, v]) => { if (v) url.searchParams.set(k, v); });

  let res: Response;
  try {
    res = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${config.TOKEN_TERMINAL_API_KEY}`,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err: any) {
    throw new TokenTerminalProviderError(0, err?.name === 'TimeoutError' ? 'Token Terminal request timed out' : 'Token Terminal network error');
  }

  if (res.status === 308) throw new TokenTerminalProjectRedirectError();
  if (res.status === 400) throw new TokenTerminalInvalidQueryError();
  if (res.status === 402) throw new TokenTerminalPaymentRequiredError();
  if (res.status === 403) throw new TokenTerminalForbiddenError();
  if (res.status === 429) throw new TokenTerminalRateLimitError();
  if (res.status >= 500) throw new TokenTerminalProviderError(res.status, `Token Terminal provider error ${res.status}`);
  if (!res.ok) throw new TokenTerminalProviderError(res.status, `Token Terminal HTTP ${res.status}`);

  try {
    return await res.json();
  } catch {
    throw new TokenTerminalProviderError(res.status, 'Token Terminal returned invalid JSON');
  }
}

export async function fetchTokenTerminalMetrics(): Promise<Array<{ metricId: string; metricName: string; description?: string | null; url?: string | null; metadata?: Record<string, unknown> }>> {
  const raw = await ttGet('/metrics');
  const rows = Array.isArray(raw?.data) ? raw.data : Array.isArray(raw) ? raw : [];
  return rows.map((r: any) => ({
    metricId: String(r.metric_id ?? r.id ?? r.slug ?? '').trim(),
    metricName: String(r.metric_name ?? r.name ?? r.slug ?? '').trim(),
    description: r.description ?? null,
    url: r.url ?? null,
    metadata: r,
  })).filter((r: any) => r.metricId);
}

export async function fetchTokenTerminalProjects(): Promise<Array<{ projectId: string; projectName: string; symbol?: string | null; marketSector?: string | null; websiteUrl?: string | null; tokenAddresses?: string[]; metadata?: Record<string, unknown> }>> {
  const raw = await ttGet('/projects');
  const rows = Array.isArray(raw?.data) ? raw.data : Array.isArray(raw) ? raw : [];
  return rows.map((r: any) => ({
    projectId: String(r.project_id ?? r.id ?? r.slug ?? '').trim(),
    projectName: String(r.project_name ?? r.name ?? r.slug ?? '').trim(),
    symbol: r.symbol ?? null,
    marketSector: r.market_sector ?? r.sector ?? null,
    websiteUrl: r.website_url ?? r.website ?? null,
    tokenAddresses: Array.isArray(r.token_addresses) ? r.token_addresses.map((x: any) => String(x)) : [],
    metadata: r,
  })).filter((r: any) => r.projectId);
}

export async function fetchMetricData(metricId: string, opts: { projectIds?: string[]; start?: string; end?: string } = {}): Promise<Array<{ projectId: string; projectName?: string | null; metricId: string; metricName?: string | null; timestamp: string; value: number | null; rawValue: string | null }>> {
  const q: Record<string, string> = {};
  if (opts.projectIds?.length) q.project_ids = opts.projectIds.join(',');
  if (opts.start) q.start = opts.start;
  if (opts.end) q.end = opts.end;

  const raw = await ttGet(`/metrics/${encodeURIComponent(metricId)}`, q);
  const rows = Array.isArray(raw?.data) ? raw.data : Array.isArray(raw) ? raw : [];

  return rows.map((r: any) => {
    const val = r.value ?? r.metric_value ?? null;
    return {
      projectId: String(r.project_id ?? r.project ?? '').trim(),
      projectName: r.project_name ?? null,
      metricId,
      metricName: r.metric_name ?? null,
      timestamp: String(r.timestamp ?? r.date ?? new Date().toISOString()),
      value: val === null || val === undefined ? null : Number(val),
      rawValue: val === null || val === undefined ? null : String(val),
    };
  }).filter((r: any) => r.projectId);
}

export function canCallTokenTerminal(): boolean {
  return Boolean(config.TOKEN_TERMINAL_API_KEY);
}

export function sanitizeTokenTerminalError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err ?? 'unknown error');
  if (config.TOKEN_TERMINAL_API_KEY && msg.includes(config.TOKEN_TERMINAL_API_KEY)) {
    return msg.split(config.TOKEN_TERMINAL_API_KEY).join('[REDACTED]');
  }
  return msg;
}

export function logTokenTerminalSkip(reason: string) {
  logger.info('[token-terminal] worker disabled/skipped', { reason });
}
