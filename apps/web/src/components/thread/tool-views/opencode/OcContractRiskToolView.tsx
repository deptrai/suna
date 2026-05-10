'use client';

import React, { useMemo } from 'react';
import { ShieldAlert, AlertCircle, CheckCircle } from 'lucide-react';
import type { ToolViewProps } from '../types';
import { Card, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ToolViewIconTitle } from '../shared/ToolViewIconTitle';
import { ToolViewFooter } from '../shared/ToolViewFooter';
import { LoadingState } from '../shared/LoadingState';
import { RiskBadgeCard } from '@/components/widgets/RiskBadgeCard';
import { type ContractRiskResult, shortAddr } from '@/components/widgets/risk-badge-utils';

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

      <RiskBadgeCard 
        data={parsed} 
        errorMessage={isError ? (parsed?.error ?? 'Risk check unavailable') : undefined} 
      />

      <ToolViewFooter
        assistantTimestamp={assistantTimestamp}
        toolTimestamp={toolTimestamp}
        isStreaming={isStreaming}
      />
    </Card>
  );
}
