'use client';

import React, { useMemo } from 'react';
import { Zap, ExternalLink, AlertCircle, AlertTriangle, CheckCircle, Lock } from 'lucide-react';
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
import { useCurrentAgentTier } from '@/hooks/opencode/use-current-agent-tier';
import { openTabAndNavigate } from '@/stores/tab-store';

interface TxSimResult {
  success: boolean;
  action?: string;
  gas_units?: number | null;
  gas_cost_usd?: number | null;
  gas_cost_native?: string | null;
  expected_outcome?: { token: string; amount: string; value_usd: number | null } | null;
  slippage_bps?: number | null;
  simulation_url?: string | null;
  simulator?: 'tenderly' | 'anvil_fork';
  checked_at?: string;
  stale?: boolean;
  error?: string;
}

function formatSlippage(bps: number | null | undefined): string {
  if (bps == null) return '—';
  return `${(bps / 100).toFixed(2)}%`;
}

function formatGasUsd(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return `$${n.toFixed(4)}`;
}

function parseOutput(output: unknown): TxSimResult | null {
  if (!output) return null;
  const str = typeof output === 'string' ? output : JSON.stringify(output);
  try {
    return JSON.parse(str) as TxSimResult;
  } catch {
    return null;
  }
}

function deriveSimId(url: string | null | undefined): string | null {
  if (!url) return null;
  // Robust against trailing slashes, query strings, and hash fragments.
  // Tenderly URL pattern: https://dashboard.tenderly.co/<acct>/<project>/simulator/<simId>[/?...]
  try {
    const u = new URL(url);
    const segments = u.pathname.split('/').filter(Boolean);
    const last = segments[segments.length - 1];
    return last && last.length > 0 ? last : null;
  } catch {
    // Not a valid URL — fall back to naive split, but strip query/hash/trailing slash
    const cleaned = url.split('#')[0]!.split('?')[0]!.replace(/\/+$/, '');
    const parts = cleaned.split('/');
    const last = parts[parts.length - 1];
    return last && last.length > 0 ? last : null;
  }
}

export function OcTxSimulationToolView({
  toolCall,
  toolResult,
  assistantTimestamp,
  toolTimestamp,
  isStreaming = false,
  sessionId: sessionIdProp,
}: ToolViewProps & { sessionId?: string }) {
  // Prefer sessionId from view props (canonical session context); fall back to tool args
  // only if the renderer adapter didn't propagate it.
  const sessionIdFromArgs = (toolCall?.arguments as any)?.session_id as string | undefined;
  const tier = useCurrentAgentTier(sessionIdProp ?? sessionIdFromArgs);
  const rawOutput = toolResult?.output;
  const parsed = useMemo(() => parseOutput(rawOutput), [rawOutput]);
  const isError = !parsed?.success || toolResult?.success === false;
  // Tier 3 (Enterprise, Epic 8) inherits Tier 2 sandbox capabilities + privacy features.
  const isTier2 = tier === 'tier2' || tier === 'tier3';

  if (isStreaming && !toolResult) {
    return <LoadingState title="Simulating Transaction" subtitle="Estimating gas and outcome…" />;
  }

  const simId = deriveSimId(parsed?.simulation_url);
  // Sandbox button is enabled only when (a) the agent tier permits AND (b) we have a
  // simulation ID. Anvil-fork mode returns `simulation_url: null` → no sim ID → disable.
  const canRunSandbox = isTier2 && !!simId;

  function handleSandbox() {
    if (!simId) return;
    openTabAndNavigate({
      id: `page:/sandbox/${simId}`,
      type: 'page',
      href: `/sandbox/${simId}`,
      title: `Sandbox · ${parsed?.action ?? 'Simulation'}`,
    });
  }

  return (
    <Card className="gap-0 flex border border-white/10 shadow-none p-0 py-0 rounded-lg flex-col h-full overflow-hidden bg-black/40 backdrop-blur-xl">
      <CardHeader className="h-14 bg-black/30 backdrop-blur-sm border-b border-white/10 p-2 px-4">
        <div className="flex flex-row items-center justify-between">
          <ToolViewIconTitle icon={Zap} title="Tx Simulation" subtitle={parsed?.action ?? 'Transaction'} />
          {!isStreaming && (
            isError ? (
              <Badge variant="outline" className="h-6 py-0.5 bg-muted text-muted-foreground">
                <AlertCircle className="h-3 w-3 mr-1" />Error
              </Badge>
            ) : (
              <Badge variant="outline" className="h-6 py-0.5 bg-muted">
                <CheckCircle className="h-3 w-3 mr-1 text-emerald-500" />
                {parsed?.simulator === 'tenderly' ? 'Tenderly' : 'Fork'}
              </Badge>
            )
          )}
        </div>
      </CardHeader>

      <CardContent className="p-3 space-y-3">
        {isError ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            <span>{parsed?.error ?? 'Simulation unavailable'}</span>
          </div>
        ) : (
          <>
            {parsed?.stale && (
              <div className="flex items-center gap-1.5 text-amber-400 text-xs bg-amber-400/10 border border-amber-400/20 rounded-md px-2 py-1">
                <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
                <span>⚠️ Cached data — upstream may be unavailable</span>
              </div>
            )}

            {/* Gas estimates */}
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-md border border-white/10 bg-black/20 p-2">
                <p className="text-[10px] text-muted-foreground mb-0.5">Gas Cost (USD)</p>
                <p className="text-sm font-mono text-white">{formatGasUsd(parsed?.gas_cost_usd)}</p>
              </div>
              <div className="rounded-md border border-white/10 bg-black/20 p-2">
                <p className="text-[10px] text-muted-foreground mb-0.5">Gas Units</p>
                <p className="text-sm font-mono text-white">{parsed?.gas_units?.toLocaleString() ?? '—'}</p>
              </div>
            </div>

            {/* Expected outcome */}
            {parsed?.expected_outcome && (
              <div className="rounded-md border border-white/10 bg-black/20 p-2">
                <p className="text-[10px] text-muted-foreground mb-0.5">Expected Outcome</p>
                <p className="text-sm font-mono text-white">
                  {parsed.expected_outcome.amount} {parsed.expected_outcome.token}
                  {parsed.expected_outcome.value_usd != null && (
                    <span className="text-muted-foreground ml-2">(${parsed.expected_outcome.value_usd.toFixed(2)})</span>
                  )}
                </p>
              </div>
            )}

            {/* Slippage */}
            {parsed?.slippage_bps != null && (
              <p className="text-xs text-muted-foreground">
                Slippage: <span className="text-foreground font-mono">{formatSlippage(parsed.slippage_bps)}</span>
              </p>
            )}

            {/* Simulation URL + Run in Sandbox button */}
            <div className="flex items-center gap-2 flex-wrap">
              {parsed?.simulation_url && (
                <a
                  href={parsed.simulation_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors"
                >
                  <ExternalLink className="h-3 w-3" />
                  View on {parsed.simulator === 'tenderly' ? 'Tenderly' : 'Explorer'}
                </a>
              )}

              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={canRunSandbox ? handleSandbox : undefined}
                      disabled={!canRunSandbox}
                      className={`flex items-center gap-1.5 text-xs px-3 py-1 rounded-full border transition-all ${
                        canRunSandbox
                          ? 'border-violet-400 text-violet-300 bg-violet-500/10 hover:bg-violet-500/20 cursor-pointer'
                          : 'border-white/10 text-white/30 bg-transparent cursor-not-allowed'
                      }`}
                    >
                      {!canRunSandbox && <Lock className="h-3 w-3" />}
                      Run in Sandbox
                    </button>
                  </TooltipTrigger>
                  {!canRunSandbox && (
                    <TooltipContent side="top">
                      <p className="text-xs">
                        {!isTier2
                          ? 'Run in Sandbox is a Tier 2 feature'
                          : 'Sandbox unavailable for this simulator (RPC fallback mode — Tenderly required)'}
                      </p>
                    </TooltipContent>
                  )}
                </Tooltip>
              </TooltipProvider>
            </div>

            {parsed?.checked_at && (
              <p className="text-[10px] text-muted-foreground/50 text-right">
                Simulated: {new Date(parsed.checked_at).toLocaleTimeString()}
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
