export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface RiskFactor {
  code: string;
  label: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

export interface ContractRiskResult {
  success: boolean;
  address?: string;
  chain?: string;
  risk_level?: RiskLevel;
  risk_score?: number;
  top_factors?: RiskFactor[];
  checked_at?: string;
  sources?: string[];
  stale?: boolean;
  error?: string;
}

export function riskColorClass(level: RiskLevel | undefined): { bg: string; text: string; border: string } {
  switch (level) {
    case 'LOW':      return { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/30' };
    case 'MEDIUM':   return { bg: 'bg-amber-500/10',   text: 'text-amber-400',   border: 'border-amber-500/30' };
    case 'HIGH':     return { bg: 'bg-orange-500/10',  text: 'text-orange-400',  border: 'border-orange-500/30' };
    case 'CRITICAL': return { bg: 'bg-rose-500/10',    text: 'text-rose-400',    border: 'border-rose-500/30' };
    default:         return { bg: 'bg-muted',           text: 'text-muted-foreground', border: 'border-border' };
  }
}

export function severityColorClass(sev: string): string {
  switch (sev) {
    case 'critical': return 'text-rose-400';
    case 'high':     return 'text-orange-400';
    case 'medium':   return 'text-amber-400';
    default:         return 'text-blue-400';
  }
}

export function severityDescription(sev: string): string {
  switch (sev) {
    case 'critical': return 'Critical: immediate financial risk — likely scam, honeypot, or rug-pull pattern';
    case 'high':     return 'High: significant red flag — proceed only with strong conviction and small size';
    case 'medium':   return 'Medium: notable concern — review carefully before interacting';
    case 'low':      return 'Low: minor signal — generally acceptable, but be aware';
    default:         return 'Risk severity unknown';
  }
}

export function relativeTimeFrom(iso: string | undefined): string {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '';
  const diffMs = Date.now() - then;
  if (diffMs < 0) return 'just now';
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}

export function shortAddr(addr: string): string {
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}
