'use client';

import React, { useMemo } from 'react';
import { TrendingUp, TrendingDown, Coins, AlertTriangle, CheckCircle, AlertCircle } from 'lucide-react';
import type { ToolViewProps } from '../types';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ToolViewIconTitle } from '../shared/ToolViewIconTitle';
import { ToolViewFooter } from '../shared/ToolViewFooter';
import { LoadingState } from '../shared/LoadingState';

interface TokenInfoResult {
  success: boolean;
  slug?: string;
  symbol?: string;
  name?: string;
  price_usd?: number;
  market_cap_usd?: number | null;
  volume_24h_usd?: number | null;
  change_24h_pct?: number | null;
  last_updated?: string;
  stale?: boolean;
  error?: string;
}

function formatUsd(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(2)}K`;
  return `${sign}$${abs.toFixed(4)}`;
}

function formatPricePrecise(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  if (n >= 1000) return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (n >= 1) return `$${n.toFixed(4)}`;
  return `$${n.toPrecision(4)}`;
}

function parseOutput(output: unknown): TokenInfoResult | null {
  if (!output) return null;
  const str = typeof output === 'string' ? output : JSON.stringify(output);
  try {
    return JSON.parse(str) as TokenInfoResult;
  } catch {
    return null;
  }
}

export function OcTokenInfoToolView({
  toolCall,
  toolResult,
  assistantTimestamp,
  toolTimestamp,
  isStreaming = false,
}: ToolViewProps) {
  const args = toolCall?.arguments || {};
  const slug = (args.slug as string) ?? '';
  const rawOutput = toolResult?.output;
  const parsed = useMemo(() => parseOutput(rawOutput), [rawOutput]);
  const isError = !parsed?.success || toolResult?.success === false;

  if (isStreaming && !toolResult) {
    return <LoadingState title="Fetching Token Info" subtitle={slug} />;
  }

  const changePct = parsed?.change_24h_pct;
  const isPositive = changePct != null && changePct >= 0;

  return (
    <Card className="gap-0 flex border border-white/10 shadow-none p-0 py-0 rounded-lg flex-col h-full overflow-hidden bg-black/40 backdrop-blur-xl">
      <CardHeader className="h-14 bg-black/30 backdrop-blur-sm border-b border-white/10 p-2 px-4">
        <div className="flex flex-row items-center justify-between">
          <ToolViewIconTitle icon={Coins} title="Token Info" subtitle={parsed?.name ?? slug} />
          {!isStreaming && (
            isError ? (
              <Badge variant="outline" className="h-6 py-0.5 bg-muted text-muted-foreground">
                <AlertCircle className="h-3 w-3 mr-1" />Error
              </Badge>
            ) : (
              <Badge variant="outline" className="h-6 py-0.5 bg-muted">
                <CheckCircle className="h-3 w-3 mr-1 text-emerald-500" />Live
              </Badge>
            )
          )}
        </div>
      </CardHeader>

      <CardContent className="p-3 space-y-3">
        {isError ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            <span>{parsed?.error ?? 'Token info unavailable'}</span>
          </div>
        ) : (
          <>
            {parsed?.stale && (
              <div className="flex items-center gap-1.5 text-amber-400 text-xs bg-amber-400/10 border border-amber-400/20 rounded-md px-2 py-1">
                <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
                <span>⚠️ Cached data — upstream may be unavailable</span>
              </div>
            )}

            <div className="rounded-lg border border-white/10 bg-black/40 backdrop-blur-xl p-3 space-y-2">
              <div className="flex items-baseline justify-between">
                <div>
                  <span className="text-lg font-bold text-white uppercase">{parsed?.symbol ?? ''}</span>
                  {parsed?.name && (
                    <span className="ml-2 text-sm text-muted-foreground uppercase">{parsed.name}</span>
                  )}
                </div>
                <span className="text-xl font-mono font-semibold text-white">
                  {formatPricePrecise(parsed?.price_usd)}
                </span>
              </div>

              {changePct != null && (
                <div className={`flex items-center gap-1 text-sm font-medium ${isPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {isPositive ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                  <span>{isPositive ? '+' : ''}{changePct.toFixed(2)}% 24h</span>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-md border border-white/10 bg-black/20 p-2">
                <p className="text-[10px] text-muted-foreground mb-0.5">Market Cap</p>
                <p className="text-sm font-mono text-white">{formatUsd(parsed?.market_cap_usd)}</p>
              </div>
              <div className="rounded-md border border-white/10 bg-black/20 p-2">
                <p className="text-[10px] text-muted-foreground mb-0.5">24h Volume</p>
                <p className="text-sm font-mono text-white">{formatUsd(parsed?.volume_24h_usd)}</p>
              </div>
            </div>

            {parsed?.last_updated && (
              <p className="text-[10px] text-muted-foreground/50 text-right">
                Updated: {new Date(parsed.last_updated).toLocaleTimeString()}
              </p>
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
