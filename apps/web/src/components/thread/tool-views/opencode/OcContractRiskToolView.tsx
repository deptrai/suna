'use client';

import React, { useMemo } from 'react';
import { ShieldCheck, ShieldAlert, AlertCircle, AlertTriangle, CheckCircle, Info } from 'lucide-react';
import type { ToolViewProps } from '../types';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ToolViewIconTitle } from '../shared/ToolViewIconTitle';
import { ToolViewFooter } from '../shared/ToolViewFooter';
import { LoadingState } from '../shared/LoadingState';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

interface RiskFactor {
  code: string;
  label: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

interface ContractRiskResult {
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

function riskColorClass(level: RiskLevel | undefined): { bg: string; text: string; border: string } {
  switch (level) {
    case 'LOW':      return { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/30' };
    case 'MEDIUM':   return { bg: 'bg-amber-500/10',   text: 'text-amber-400',   border: 'border-amber-500/30' };
    case 'HIGH':     return { bg: 'bg-orange-500/10',  text: 'text-orange-400',  border: 'border-orange-500/30' };
    case 'CRITICAL': return { bg: 'bg-rose-500/10',    text: 'text-rose-400',    border: 'border-rose-500/30' };
    default:         return { bg: 'bg-muted',           text: 'text-muted-foreground', border: 'border-border' };
  }
}

function severityColorClass(sev: string): string {
  switch (sev) {
    case 'critical': return 'text-rose-400';
    case 'high':     return 'text-orange-400';
    case 'medium':   return 'text-amber-400';
    default:         return 'text-blue-400';
  }
}

function severityDescription(sev: string): string {
  switch (sev) {
    case 'critical': return 'Critical: immediate financial risk — likely scam, honeypot, or rug-pull pattern';
    case 'high':     return 'High: significant red flag — proceed only with strong conviction and small size';
    case 'medium':   return 'Medium: notable concern — review carefully before interacting';
    case 'low':      return 'Low: minor signal — generally acceptable, but be aware';
    default:         return 'Risk severity unknown';
  }
}

function relativeTimeFrom(iso: string | undefined): string {
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

function shortAddr(addr: string): string {
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function parseOutput(output: unknown): ContractRiskResult | null {
  if (!output) return null;
  const str = typeof output === 'string' ? output : JSON.stringify(output);
  try {
    return JSON.parse(str) as ContractRiskResult;
  } catch {
    return null;
  }
}

export function OcContractRiskToolView({
  toolCall,
  toolResult,
  assistantTimestamp,
  toolTimestamp,
  isStreaming = false,
}: ToolViewProps) {
  const args = toolCall?.arguments || {};
  const address = (args.address as string) ?? '';
  const rawOutput = toolResult?.output;
  const parsed = useMemo(() => parseOutput(rawOutput), [rawOutput]);
  const isError = !parsed?.success || toolResult?.success === false;

  if (isStreaming && !toolResult) {
    return <LoadingState title="Checking Contract Risk" subtitle={shortAddr(address)} />;
  }

  const colors = riskColorClass(parsed?.risk_level);

  return (
    <Card className="gap-0 flex border border-white/10 shadow-none p-0 py-0 rounded-lg flex-col h-full overflow-hidden bg-black/40 backdrop-blur-xl">
      <CardHeader className="h-14 bg-black/30 backdrop-blur-sm border-b border-white/10 p-2 px-4">
        <div className="flex flex-row items-center justify-between">
          <ToolViewIconTitle icon={ShieldAlert} title="Contract Risk" subtitle={shortAddr(address)} />
          {!isStreaming && (
            isError ? (
              <Badge variant="outline" className="h-6 py-0.5 bg-muted text-muted-foreground">
                <AlertCircle className="h-3 w-3 mr-1" />Unavailable
              </Badge>
            ) : (
              <Badge variant="outline" className="h-6 py-0.5 bg-muted">
                <CheckCircle className="h-3 w-3 mr-1 text-emerald-500" />Checked
              </Badge>
            )
          )}
        </div>
      </CardHeader>

      <CardContent className="p-3 space-y-3">
        {isError ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            <span>{parsed?.error ?? 'Risk check unavailable'}</span>
          </div>
        ) : (
          <>
            {parsed?.stale && (
              <div className="flex items-center gap-1.5 text-amber-400 text-xs bg-amber-400/10 border border-amber-400/20 rounded-md px-2 py-1">
                <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
                <span>⚠️ Cached data — upstream may be unavailable</span>
              </div>
            )}

            {/* Risk level badge */}
            <div className={`rounded-lg border ${colors.border} ${colors.bg} p-3 flex items-center justify-between`}>
              <div className="flex items-center gap-2">
                <ShieldCheck className={`h-5 w-5 ${colors.text}`} />
                <div>
                  <p className={`text-lg font-bold ${colors.text}`}>{parsed?.risk_level}</p>
                  <p className="text-xs text-muted-foreground">Risk Level</p>
                </div>
              </div>
              <div className="text-right">
                <p className={`text-2xl font-mono font-bold ${colors.text}`}>{parsed?.risk_score ?? 0}</p>
                <p className="text-xs text-muted-foreground">/ 100</p>
              </div>
            </div>

            {/* Address + chain */}
            <div className="flex items-center gap-2 flex-wrap">
              <code className="text-xs font-mono text-muted-foreground bg-muted/50 px-2 py-0.5 rounded">
                {parsed?.address ? shortAddr(parsed.address) : ''}
              </code>
              {parsed?.chain && (
                <Badge variant="outline" className="text-xs h-5 capitalize">
                  {parsed.chain}
                </Badge>
              )}
            </div>

            {/* Top risk factors */}
            {parsed?.top_factors && parsed.top_factors.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground font-medium">Risk Factors</p>
                <TooltipProvider>
                  {parsed.top_factors.map((factor, i) => (
                    <Tooltip key={i}>
                      <TooltipTrigger asChild>
                        <div className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-2 py-1.5 cursor-default">
                          <span className={`text-xs font-semibold uppercase ${severityColorClass(factor.severity)}`}>
                            {factor.severity}
                          </span>
                          <span className="text-sm text-foreground flex-1 truncate">{factor.label}</span>
                          <Info className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-xs">
                        <p className="text-xs">{severityDescription(factor.severity)}</p>
                      </TooltipContent>
                    </Tooltip>
                  ))}
                </TooltipProvider>
              </div>
            )}

            {/* Sources + timestamp */}
            {parsed?.sources && parsed.sources.length > 0 && (
              <div className="flex items-center justify-between text-[10px] text-muted-foreground/60">
                <span>Sources: {parsed.sources.join(' · ')}</span>
                {parsed?.checked_at && (
                  <span>{relativeTimeFrom(parsed.checked_at)}</span>
                )}
              </div>
            )}
          </>
        )}
      </CardContent>

      <ToolViewFooter
        assistantTimestamp={assistantTimestamp}
        toolTimestamp={toolTimestamp}
        isStreaming={isStreaming}
      />
    </Card>
  );
}
