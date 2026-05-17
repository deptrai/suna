import { config } from '../../config';

const PER_UPSTREAM_TIMEOUT_MS = 2500;

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface RiskFactor {
  code: string;
  label: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

export interface ContractRiskSnapshot {
  address: string;
  chain: string;
  risk_level: RiskLevel;
  risk_score: number;
  top_factors: RiskFactor[];
  checked_at: string;
  sources: string[];
}

// ── risk_score → risk_level mapping ─────────────────────────────────────────

function scoreToLevel(score: number): RiskLevel {
  if (score <= 30) return 'LOW';
  if (score <= 60) return 'MEDIUM';
  if (score <= 85) return 'HIGH';
  return 'CRITICAL';
}

// ── Chain ID mapping for GoPlus ──────────────────────────────────────────────

const CHAIN_ID_MAP: Record<string, string> = {
  ethereum: '1',
  eth: '1',
  bsc: '56',
  bnb: '56',
  polygon: '137',
  matic: '137',
  arbitrum: '42161',
  optimism: '10',
  base: '8453',
  avalanche: '43114',
  avax: '43114',
  fantom: '250',
  ftm: '250',
};

// ── GoPlus fetch ─────────────────────────────────────────────────────────────

interface GoPlusTokenSecurity {
  [address: string]: {
    is_honeypot?: string;
    buy_tax?: string;
    sell_tax?: string;
    is_mintable?: string;
    is_proxy?: string;
    is_blacklisted?: string;
    owner_percent?: string;
    creator_percent?: string;
    is_open_source?: string;
    is_anti_whale?: string;
    slippage_modifiable?: string;
    can_take_back_ownership?: string;
    hidden_owner?: string;
  };
}

async function fetchGoPlus(
  address: string,
  chainId: string,
  signal: AbortSignal,
): Promise<{ score: number; factors: RiskFactor[]; success: boolean }> {
  const baseUrl = config.GOPLUS_API_URL.replace(/\/+$/, '');
  const url = `${baseUrl}/api/v1/token_security/${chainId}?contract_addresses=${encodeURIComponent(address.toLowerCase())}`;

  let resp: Response;
  try {
    resp = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  } catch {
    return { score: 0, factors: [], success: false };
  }
  if (!resp.ok) return { score: 0, factors: [], success: false };

  let body: { code?: number; result?: GoPlusTokenSecurity };
  try {
    body = (await resp.json()) as { code?: number; result?: GoPlusTokenSecurity };
  } catch {
    return { score: 0, factors: [], success: false };
  }

  const result = body?.result?.[address.toLowerCase()];
  if (!result) return { score: 0, factors: [], success: false };

  const factors: RiskFactor[] = [];
  let score = 0;

  if (result.is_honeypot === '1') { factors.push({ code: 'honeypot', label: 'Honeypot detected', severity: 'critical' }); score += 40; }
  const buyTaxRaw = parseFloat(result.buy_tax ?? '0');
  const sellTaxRaw = parseFloat(result.sell_tax ?? '0');
  const buyTax = Number.isFinite(buyTaxRaw) ? buyTaxRaw : 0;
  const sellTax = Number.isFinite(sellTaxRaw) ? sellTaxRaw : 0;
  if (sellTax > 0.5) { factors.push({ code: 'high_tax', label: `High sell tax (${(sellTax * 100).toFixed(0)}%)`, severity: 'high' }); score += 25; }
  else if (sellTax > 0.1) { factors.push({ code: 'elevated_tax', label: `Elevated sell tax (${(sellTax * 100).toFixed(0)}%)`, severity: 'medium' }); score += 10; }
  if (buyTax > 0.5) { factors.push({ code: 'high_buy_tax', label: `High buy tax (${(buyTax * 100).toFixed(0)}%)`, severity: 'high' }); score += 20; }
  else if (buyTax > 0.1) { factors.push({ code: 'elevated_buy_tax', label: `Elevated buy tax (${(buyTax * 100).toFixed(0)}%)`, severity: 'medium' }); score += 8; }
  if (result.is_mintable === '1') { factors.push({ code: 'mintable', label: 'Token is mintable', severity: 'high' }); score += 20; }
  if (result.hidden_owner === '1') { factors.push({ code: 'hidden_owner', label: 'Hidden owner detected', severity: 'high' }); score += 20; }
  if (result.can_take_back_ownership === '1') { factors.push({ code: 'recoverable_ownership', label: 'Ownership can be reclaimed', severity: 'medium' }); score += 15; }
  if (result.is_open_source === '0') { factors.push({ code: 'unverified', label: 'Contract source not verified', severity: 'medium' }); score += 10; }
  if (result.is_proxy === '1') { factors.push({ code: 'proxy', label: 'Upgradeable proxy contract', severity: 'low' }); score += 5; }

  return { score: Math.min(score, 100), factors, success: true };
}

// ── RugCheck fetch (Solana only) ─────────────────────────────────────────────

interface RugCheckReport {
  score?: number;
  risks?: Array<{ name: string; description: string; level: string; score: number }>;
}

async function fetchRugCheck(
  address: string,
  signal: AbortSignal,
): Promise<{ score: number; factors: RiskFactor[]; success: boolean }> {
  const baseUrl = config.RUGCHECK_API_URL.replace(/\/+$/, '');
  const url = `${baseUrl}/tokens/${encodeURIComponent(address)}/report`;

  let resp: Response;
  try {
    resp = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  } catch {
    return { score: 0, factors: [], success: false };
  }
  if (!resp.ok) return { score: 0, factors: [], success: false };

  let body: RugCheckReport;
  try {
    body = (await resp.json()) as RugCheckReport;
  } catch {
    return { score: 0, factors: [], success: false };
  }

  const factors: RiskFactor[] = (body.risks ?? [])
    .slice(0, 5)
    .map((r) => ({
      code: r.name?.toLowerCase().replace(/\s+/g, '_') ?? 'unknown',
      label: r.description ?? r.name ?? 'Unknown risk',
      severity: (r.level?.toLowerCase() as RiskFactor['severity']) ?? 'medium',
    }));

  return { score: Math.min(body.score ?? 0, 100), factors, success: true };
}

// ── Main export ──────────────────────────────────────────────────────────────

export async function fetchContractRisk(
  address: string,
  chain: string,
  options: { signal?: AbortSignal } = {},
): Promise<ContractRiskSnapshot> {
  const isSolana = chain === 'solana' || chain === 'sol';
  const chainId = CHAIN_ID_MAP[chain.toLowerCase()] ?? '1';

  // Honour caller's signal alongside per-upstream timeout so outer aborts cancel both calls.
  const goPlusSignal = options.signal
    ? AbortSignal.any([options.signal, AbortSignal.timeout(PER_UPSTREAM_TIMEOUT_MS)])
    : AbortSignal.timeout(PER_UPSTREAM_TIMEOUT_MS);
  const rugCheckSignal = options.signal
    ? AbortSignal.any([options.signal, AbortSignal.timeout(PER_UPSTREAM_TIMEOUT_MS)])
    : AbortSignal.timeout(PER_UPSTREAM_TIMEOUT_MS);

  const [goPlusResult, rugCheckResult] = await Promise.allSettled([
    !isSolana ? fetchGoPlus(address, chainId, goPlusSignal) : Promise.resolve({ score: 0, factors: [] as RiskFactor[], success: false }),
    isSolana ? fetchRugCheck(address, rugCheckSignal) : Promise.resolve({ score: 0, factors: [] as RiskFactor[], success: false }),
  ]);

  const goPlus = goPlusResult.status === 'fulfilled' ? goPlusResult.value : { score: 0, factors: [], success: false };
  const rugCheck = rugCheckResult.status === 'fulfilled' ? rugCheckResult.value : { score: 0, factors: [], success: false };

  const sources: string[] = [];
  let combinedScore = 0;
  let allFactors: RiskFactor[] = [];

  if (goPlus.success) { sources.push('GoPlus'); combinedScore = Math.max(combinedScore, goPlus.score); allFactors = allFactors.concat(goPlus.factors); }
  if (rugCheck.success) { sources.push('RugCheck'); combinedScore = Math.max(combinedScore, rugCheck.score); allFactors = allFactors.concat(rugCheck.factors); }

  if (sources.length === 0) {
    throw new Error(`Contract risk check unavailable for ${address} on ${chain}`);
  }

  const topFactors = allFactors
    .sort((a, b) => {
      const order = { critical: 4, high: 3, medium: 2, low: 1 };
      return (order[b.severity] ?? 0) - (order[a.severity] ?? 0);
    })
    .slice(0, 3);

  return {
    address,
    chain,
    risk_level: scoreToLevel(combinedScore),
    risk_score: combinedScore,
    top_factors: topFactors,
    checked_at: new Date().toISOString(),
    sources,
  };
}
