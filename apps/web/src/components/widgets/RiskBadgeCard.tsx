'use client';

import React from 'react';
import { ShieldCheck, ShieldAlert, AlertCircle, AlertTriangle, CheckCircle, Info } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  type ContractRiskResult,
  riskColorClass,
  severityColorClass,
  severityDescription,
  relativeTimeFrom,
  shortAddr,
} from './risk-badge-utils';
import { Skeleton } from '@/components/ui/skeleton';

interface RiskBadgeCardProps {
  data: ContractRiskResult | null;
  isLoading?: boolean;
  errorMessage?: string;
}

export function RiskBadgeCard({ data, isLoading, errorMessage }: RiskBadgeCardProps) {
  if (isLoading) {
    return (
      <Card className="flex border border-white/10 shadow-2xl rounded-xl flex-col overflow-hidden bg-black/40 backdrop-blur-xl">
        <CardContent className="p-4 space-y-4">
          <div className="flex items-center justify-between">
            <Skeleton className="h-16 w-1/2 rounded-lg" />
            <Skeleton className="h-16 w-1/4 rounded-lg" />
          </div>
          <Skeleton className="h-6 w-full max-w-[200px]" />
          <div className="space-y-2">
            <Skeleton className="h-10 w-full rounded-md" />
            <Skeleton className="h-10 w-full rounded-md" />
          </div>
        </CardContent>
      </Card>
    );
  }

  // Error UI shows when (a) explicit errorMessage from caller, (b) data missing, or
  // (c) data.success === false. A truthy errorMessage WITH a valid data.success=true
  // is treated as a soft warning — render data normally, caller can surface message
  // elsewhere if needed (currently no callers depend on this combination).
  const isError = !data || data.success === false || (!!errorMessage && !data?.success);

  if (isError || !data) {
    return (
      <Card className="flex border border-white/10 shadow-2xl rounded-xl flex-col overflow-hidden bg-black/40 backdrop-blur-xl">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <AlertCircle className="h-5 w-5 flex-shrink-0 text-rose-500" />
            <span>{errorMessage ?? data?.error ?? 'Risk check unavailable'}</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  const colors = riskColorClass(data.risk_level);

  return (
    <Card className="flex border border-white/10 shadow-2xl rounded-xl flex-col overflow-hidden bg-black/40 backdrop-blur-xl">
      <CardContent className="p-4 space-y-4">
        {data.stale && (
          <div className="flex items-center gap-1.5 text-amber-400 text-xs bg-amber-400/10 border border-amber-400/20 rounded-md px-2 py-1 mb-2">
            <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
            <span>⚠️ Cached data — upstream may be unavailable</span>
          </div>
        )}

        {/* Risk level badge */}
        <div className={`rounded-xl border ${colors.border} ${colors.bg} p-4 flex items-center justify-between`}>
          <div className="flex items-center gap-3">
            <ShieldCheck className={`h-8 w-8 ${colors.text}`} />
            <div>
              <p className={`text-2xl font-bold ${colors.text}`}>{data.risk_level}</p>
              <p className="text-sm text-muted-foreground">Risk Level</p>
            </div>
          </div>
          <div className="text-right">
            <p className={`text-4xl font-mono font-bold ${colors.text}`}>{data.risk_score ?? 0}</p>
            <p className="text-sm text-muted-foreground">/ 100</p>
          </div>
        </div>

        {/* Address + chain */}
        <div className="flex items-center gap-2 flex-wrap">
          <code className="text-xs font-mono text-muted-foreground bg-muted/50 px-2 py-1 rounded">
            {data.address ? shortAddr(data.address) : ''}
          </code>
          {data.chain && (
            <Badge variant="outline" className="text-xs h-6 capitalize">
              {data.chain}
            </Badge>
          )}
        </div>

        {/* Top risk factors */}
        {data.top_factors && data.top_factors.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground font-medium">Risk Factors</p>
            <TooltipProvider>
              <div className="grid gap-2">
                {data.top_factors.map((factor, i) => (
                  <Tooltip key={i}>
                    <TooltipTrigger asChild>
                      <div className="flex items-center gap-2 rounded-lg border border-white/5 bg-white/5 px-3 py-2 cursor-default hover:bg-white/10 transition-colors">
                        <span className={`text-xs font-semibold uppercase ${severityColorClass(factor.severity)}`}>
                          {factor.severity}
                        </span>
                        <span className="text-sm text-foreground flex-1 truncate">{factor.label}</span>
                        <Info className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-xs">
                      <p className="text-xs">{severityDescription(factor.severity)}</p>
                    </TooltipContent>
                  </Tooltip>
                ))}
              </div>
            </TooltipProvider>
          </div>
        )}

        {/* Sources + timestamp */}
        {(data.sources && data.sources.length > 0) || data.checked_at ? (
          <div className="flex items-center justify-between text-xs text-muted-foreground/60 pt-2 border-t border-white/5">
            <span>{data.sources && data.sources.length > 0 ? `Sources: ${data.sources.join(' · ')}` : ''}</span>
            {data.checked_at && (
              <span>{relativeTimeFrom(data.checked_at)}</span>
            )}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
