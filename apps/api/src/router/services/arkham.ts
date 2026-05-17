import { config } from '../../config';
import { logger } from '../../lib/logger';

const TIMEOUT_MS = 8000;

// ─── Normalized types ────────────────────────────────────────────────────────

export interface ArkhamEntity {
  id?: string | null;
  name?: string | null;
  type?: string | null;
}

export interface ArkhamAddressLabel {
  address: string;
  chain: string;
  entityId: string | null;
  entityName: string | null;
  entityType: string | null;
  label: string | null;
  tags: string[];
  confidence: number | null;
}

export interface ArkhamHolderEntry {
  address: string;
  balance?: string | null;
  percentage?: number | null;
  entityId: string | null;
  entityName: string | null;
  entityType: string | null;
  tags: string[];
}

export interface ArkhamTokenHoldersResult {
  holders: ArkhamHolderEntry[];
  totalHolders: number | null;
  chain: string;
  tokenAddress: string;
}

// ─── Risk scoring ────────────────────────────────────────────────────────────

export type RiskLevel = 'none' | 'low' | 'medium' | 'high' | 'critical';

interface RiskCategoryDef {
  category: string;
  level: RiskLevel;
  score: number;
}

// Deterministic label/entity-type → risk category mapping.
// Critical/high: known bad actors. Medium: context/warning only.
const RISK_CATEGORY_MAP: Record<string, RiskCategoryDef> = {
  // Critical — confirmed malicious
  hacker: { category: 'hacker', level: 'critical', score: 95 },
  exploiter: { category: 'exploiter', level: 'critical', score: 95 },
  drainer: { category: 'drainer', level: 'critical', score: 90 },
  phishing: { category: 'phishing', level: 'high', score: 85 },
  sanctioned: { category: 'sanctioned', level: 'critical', score: 100 },
  mixer: { category: 'mixer', level: 'high', score: 80 },
  tumbler: { category: 'mixer', level: 'high', score: 80 },
  'stolen funds': { category: 'stolen_funds', level: 'high', score: 85 },
  darkweb: { category: 'darkweb', level: 'high', score: 80 },
  ransomware: { category: 'ransomware', level: 'critical', score: 95 },
  // Medium — context warning, not automatically malicious
  cex: { category: 'cex', level: 'medium', score: 20 },
  exchange: { category: 'cex', level: 'medium', score: 20 },
  vc: { category: 'vc', level: 'medium', score: 15 },
  fund: { category: 'fund', level: 'medium', score: 15 },
  lending: { category: 'lending_protocol', level: 'medium', score: 15 },
  whale: { category: 'whale', level: 'medium', score: 25 },
  'market maker': { category: 'market_maker', level: 'medium', score: 20 },
  protocol: { category: 'protocol', level: 'low', score: 5 },
  bridge: { category: 'bridge', level: 'low', score: 10 },
  treasury: { category: 'treasury', level: 'low', score: 5 },
  miner: { category: 'miner', level: 'low', score: 5 },
};

function matchRiskCategory(input: string | null | undefined): RiskCategoryDef | null {
  if (!input) return null;
  const lower = input.toLowerCase();
  for (const [key, def] of Object.entries(RISK_CATEGORY_MAP)) {
    if (lower.includes(key)) return def;
  }
  return null;
}

export function riskScoreToLevel(score: number): RiskLevel {
  if (score >= 90) return 'critical';
  if (score >= 80) return 'high';
  if (score >= 40) return 'medium';
  if (score >= 10) return 'low';
  return 'none';
}

export function scoreEntity(tags: string[], entityType: string | null | undefined, entityName: string | null | undefined): { riskCategory: string; riskLevel: RiskLevel; riskScore: number } {
  let best: RiskCategoryDef | null = null;
  for (const tag of tags) {
    const match = matchRiskCategory(tag);
    if (match && (best === null || match.score > best.score)) best = match;
  }
  const typeMatch = matchRiskCategory(entityType);
  if (typeMatch && (best === null || typeMatch.score > best.score)) best = typeMatch;
  const nameMatch = matchRiskCategory(entityName);
  if (nameMatch && (best === null || nameMatch.score > best.score)) best = nameMatch;
  return {
    riskCategory: best?.category ?? 'unknown',
    riskLevel: best?.level ?? 'none',
    riskScore: best?.score ?? 0,
  };
}

export function computeHolderRiskSummary(holders: ArkhamHolderEntry[]): {
  riskyHolderCount: number;
  riskScore: number;
  riskLevel: RiskLevel;
  riskFactors: Array<{ code: string; label: string; severity: string; evidence: string }>;
} {
  const riskFactors: Array<{ code: string; label: string; severity: string; evidence: string }> = [];
  let riskyCount = 0;
  let maxScore = 0;

  for (const h of holders) {
    const scored = scoreEntity(h.tags, h.entityType, h.entityName);
    if (scored.riskScore >= 80) riskyCount++;
    if (scored.riskScore > maxScore) maxScore = scored.riskScore;
  }

  // Flag concentration risks
  const hackerHolders = holders.filter((h) => {
    const s = scoreEntity(h.tags, h.entityType, h.entityName);
    return s.riskLevel === 'critical' || s.riskLevel === 'high';
  });
  if (hackerHolders.length > 0) {
    riskFactors.push({
      code: 'HIGH_RISK_HOLDER',
      label: 'High-risk entity in top holders',
      severity: 'high',
      evidence: hackerHolders.slice(0, 3).map((h) => h.entityName ?? h.address).join(', '),
    });
  }

  const cexHolders = holders.filter((h) => {
    const s = scoreEntity(h.tags, h.entityType, h.entityName);
    return s.riskCategory === 'cex';
  });
  if (cexHolders.length >= 3) {
    riskFactors.push({
      code: 'CEX_CONCENTRATION',
      label: 'High CEX concentration in top holders',
      severity: 'medium',
      evidence: `${cexHolders.length} CEX wallets in top holders`,
    });
  }

  let riskLevel: RiskLevel = 'none';
  if (maxScore >= 90) riskLevel = 'critical';
  else if (maxScore >= 80) riskLevel = 'high';
  else if (maxScore >= 40) riskLevel = 'medium';
  else if (maxScore >= 10) riskLevel = 'low';

  return { riskyHolderCount: riskyCount, riskScore: maxScore, riskLevel, riskFactors };
}

// ─── Arkham API calls ────────────────────────────────────────────────────────

function arkhamHeaders(): Record<string, string> {
  if (!config.ARKHAM_API_KEY) throw new Error('ARKHAM_API_KEY not configured');
  return {
    'API-Key': config.ARKHAM_API_KEY,
    'Accept': 'application/json',
  };
}

function sanitizeError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  return msg.replace(config.ARKHAM_API_KEY || '__NO_KEY__', '[REDACTED]').slice(0, 300);
}

function sanitizeBody(body: string): string {
  return body.replace(config.ARKHAM_API_KEY || '__NO_KEY__', '[REDACTED]').slice(0, 200);
}

function normalizeHolder(raw: Record<string, unknown>, chain: string): ArkhamHolderEntry {
  const entity = (raw.entity as Record<string, unknown> | undefined) ?? {};
  const tags: string[] = [];
  if (Array.isArray(raw.tags)) {
    for (const t of raw.tags) {
      if (typeof t === 'string') tags.push(t);
      else if (t && typeof t === 'object' && typeof (t as Record<string, unknown>).name === 'string') {
        tags.push((t as Record<string, unknown>).name as string);
      }
    }
  }
  return {
    address: (raw.address as string) ?? '',
    balance: raw.balance != null ? String(raw.balance) : null,
    percentage: typeof raw.percentage === 'number' ? raw.percentage : null,
    entityId: (entity.id as string | null) ?? null,
    entityName: (entity.name as string | null) ?? null,
    entityType: (entity.type as string | null) ?? null,
    tags,
  };
}

function normalizeAddressLabel(raw: Record<string, unknown>, address: string, chain: string): ArkhamAddressLabel {
  const entity = (raw.arkhamEntity as Record<string, unknown> | undefined) ??
    (raw.entity as Record<string, unknown> | undefined) ?? {};
  const tags: string[] = [];
  const rawTags = (raw.arkhamLabel as Record<string, unknown>)?.tags ?? raw.tags;
  if (Array.isArray(rawTags)) {
    for (const t of rawTags) {
      if (typeof t === 'string') tags.push(t);
      else if (t && typeof t === 'object' && typeof (t as Record<string, unknown>).name === 'string') {
        tags.push((t as Record<string, unknown>).name as string);
      }
    }
  }
  const label = (raw.arkhamLabel as Record<string, unknown>)?.name ?? raw.label;
  return {
    address,
    chain,
    entityId: (entity.id as string | null) ?? null,
    entityName: (entity.name as string | null) ?? null,
    entityType: (entity.type as string | null) ?? null,
    label: typeof label === 'string' ? label : null,
    tags,
    confidence: typeof raw.confidence === 'number' ? raw.confidence : null,
  };
}

export async function fetchArkhamTokenHolders(
  chain: string,
  tokenAddress: string,
  options: { limit?: number } = {},
): Promise<ArkhamTokenHoldersResult> {
  if (!config.ARKHAM_API_KEY) {
    return { holders: [], totalHolders: null, chain, tokenAddress };
  }
  const limit = Math.min(options.limit ?? config.ARKHAM_TOP_HOLDER_LIMIT, 100);
  const url = `${config.ARKHAM_API_BASE_URL}/token/holders/${chain}/${tokenAddress}?groupByEntity=true&limit=${limit}`;
  let res: Response;
  try {
    res = await fetch(url, {
      headers: arkhamHeaders(),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    throw new Error(`Arkham network error: ${sanitizeError(e)}`);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Arkham token holders ${res.status}: ${sanitizeBody(body)}`);
  }
  const data = (await res.json()) as Record<string, unknown>;
  const rawHolders = Array.isArray(data.holders) ? data.holders : (Array.isArray(data) ? data : []);
  const holders = (rawHolders as Record<string, unknown>[]).map((h) => normalizeHolder(h, chain));
  const totalHolders = typeof data.total === 'number' ? data.total : null;
  return { holders, totalHolders, chain, tokenAddress };
}

export async function fetchArkhamAddressIntelligence(
  address: string,
  chain: string,
): Promise<ArkhamAddressLabel> {
  if (!config.ARKHAM_API_KEY) {
    return { address, chain, entityId: null, entityName: null, entityType: null, label: null, tags: [], confidence: null };
  }
  const url = `${config.ARKHAM_API_BASE_URL}/intelligence/address/${address}/all`;
  let res: Response;
  try {
    res = await fetch(url, {
      headers: arkhamHeaders(),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    throw new Error(`Arkham network error: ${sanitizeError(e)}`);
  }
  if (res.status === 404) {
    return { address, chain, entityId: null, entityName: null, entityType: null, label: null, tags: [], confidence: null };
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Arkham address intelligence ${res.status}: ${sanitizeBody(body)}`);
  }
  const data = (await res.json()) as Record<string, unknown>;
  return normalizeAddressLabel(data, address, chain);
}

export async function fetchArkhamBatchAddressIntelligence(
  addresses: string[],
  chain: string,
): Promise<ArkhamAddressLabel[]> {
  if (!config.ARKHAM_API_KEY || addresses.length === 0) return [];
  // Batch up to 100 per call
  const batch = addresses.slice(0, 100);
  const url = `${config.ARKHAM_API_BASE_URL}/intelligence/address/batch/all`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { ...arkhamHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ addresses: batch }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    throw new Error(`Arkham batch network error: ${sanitizeError(e)}`);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    logger.warn('[arkham] batch address intelligence failed', { status: res.status, body: sanitizeBody(body) });
    return [];
  }
  const data = (await res.json()) as Record<string, unknown>;
  const entries = Array.isArray(data.addresses) ? data.addresses : (Array.isArray(data) ? data : []);
  return (entries as Record<string, unknown>[]).map((e) =>
    normalizeAddressLabel(e, (e.address as string) ?? '', chain),
  );
}
