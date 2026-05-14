const SANTIMENT_GRAPHQL_URL = 'https://api.santiment.net/graphql';
const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_RETRIES = 3;
const RETRY_BASE_MS = 30_000;

export interface SantimentMetricPoint {
  datetime: string;
  value: number;
}

export interface SantimentTokenMetrics {
  slug: string;
  socialVolume: SantimentMetricPoint[];
  socialDominance: SantimentMetricPoint[];
  sentimentBalance: SantimentMetricPoint[];
  price: SantimentMetricPoint[];
}

export interface SantimentBatchResult {
  slug: string;
  socialVolume24h: number | null;
  socialVolumeChange24hPct: number | null;
  socialDominancePct: number | null;
  sentimentScore: number | null;
  priceUsd: number | null;
  priceChange24hPct: number | null;
}

function buildQuery(slug: string): string {
  return `{
    socialVolume: getMetric(metric: "social_volume_total") {
      timeseriesData(slug: "${slug}", from: "utc_now-48h", to: "utc_now", interval: "1h") {
        datetime
        value
      }
    }
    socialDominance: getMetric(metric: "social_dominance_total") {
      timeseriesData(slug: "${slug}", from: "utc_now-24h", to: "utc_now", interval: "1h") {
        datetime
        value
      }
    }
    sentimentBalance: getMetric(metric: "sentiment_balance_total") {
      timeseriesData(slug: "${slug}", from: "utc_now-24h", to: "utc_now", interval: "1h") {
        datetime
        value
      }
    }
    price: getMetric(metric: "price_usd") {
      timeseriesData(slug: "${slug}", from: "utc_now-48h", to: "utc_now", interval: "1h") {
        datetime
        value
      }
    }
  }`;
}

function latestValue(points: SantimentMetricPoint[]): number | null {
  if (!points || points.length === 0) return null;
  const last = points[points.length - 1];
  if (!last || !Number.isFinite(last.value)) return null;
  return last.value;
}

function prev24hValue(points: SantimentMetricPoint[]): number | null {
  if (!points || points.length < 2) return null;
  // Points cover 48h at 1h interval — find the point ~24h ago
  const now = Date.now();
  const target = now - 24 * 60 * 60 * 1000;
  let best: SantimentMetricPoint | null = null;
  let bestGap = Infinity;
  for (const p of points) {
    const ts = new Date(p.datetime).getTime();
    const gap = Math.abs(ts - target);
    if (gap < bestGap) {
      best = p;
      bestGap = gap;
    }
  }
  if (!best || !Number.isFinite(best.value)) return null;
  return best.value;
}

function pctChange(current: number | null, prev: number | null): number | null {
  if (current === null || prev === null || !Number.isFinite(current) || !Number.isFinite(prev)) return null;
  if (prev === 0) return null;
  return ((current - prev) / Math.abs(prev)) * 100;
}

async function fetchWithRetry(
  apiKey: string,
  query: string,
  timeoutMs: number,
  attempt = 0,
): Promise<Record<string, { timeseriesData: SantimentMetricPoint[] }>> {
  let response: Response;
  try {
    response = await fetch(SANTIMENT_GRAPHQL_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Apikey ${apiKey}`,
      },
      body: JSON.stringify({ query }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    throw new Error(`Santiment request failed: ${e instanceof Error ? e.message : String(e)}`);
  }

  if (response.status === 429 || response.status >= 500) {
    if (attempt < MAX_RETRIES - 1) {
      const delay = RETRY_BASE_MS * Math.pow(2, attempt);
      await new Promise((r) => setTimeout(r, delay));
      return fetchWithRetry(apiKey, query, timeoutMs, attempt + 1);
    }
    throw new Error(`Santiment API error after ${MAX_RETRIES} retries: ${response.status}`);
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Santiment API error: ${response.status} - ${body || response.statusText}`);
  }

  let json: { data?: Record<string, { timeseriesData: SantimentMetricPoint[] }>; errors?: unknown };
  try {
    json = await response.json() as typeof json;
  } catch (e) {
    throw new Error(`Santiment returned non-JSON: ${e instanceof Error ? e.message : String(e)}`);
  }

  if (json.errors) {
    throw new Error(`Santiment GraphQL errors: ${JSON.stringify(json.errors)}`);
  }

  return json.data ?? {};
}

export async function fetchTokenMetrics(
  slug: string,
  apiKey: string,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<SantimentBatchResult> {
  const query = buildQuery(slug);
  const data = await fetchWithRetry(apiKey, query, timeoutMs);

  const svPoints = data.socialVolume?.timeseriesData ?? [];
  const sdPoints = data.socialDominance?.timeseriesData ?? [];
  const sbPoints = data.sentimentBalance?.timeseriesData ?? [];
  const pricePoints = data.price?.timeseriesData ?? [];

  const svCurrent = latestValue(svPoints);
  const svPrev = prev24hValue(svPoints);
  const priceCurrent = latestValue(pricePoints);
  const pricePrev = prev24hValue(pricePoints);

  return {
    slug,
    socialVolume24h: svCurrent,
    socialVolumeChange24hPct: pctChange(svCurrent, svPrev),
    socialDominancePct: latestValue(sdPoints),
    sentimentScore: latestValue(sbPoints),
    priceUsd: priceCurrent,
    priceChange24hPct: pctChange(priceCurrent, pricePrev),
  };
}
