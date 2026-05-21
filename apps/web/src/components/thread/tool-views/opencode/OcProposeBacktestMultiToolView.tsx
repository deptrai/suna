'use client';

import { useEffect, useMemo } from 'react';
import { CheckCircle2 } from 'lucide-react';
import type { ToolViewProps } from '../types';
import { useProposalStore, type ProposalItem, buildApprovedPayloads, isRunAllReady } from './proposal-store';
import { Button } from '@/components/ui/button';
import { useMultiBacktestRun } from '@/components/backtest/use-multi-backtest-run';
import { ComparisonVisualizer } from '@/components/backtest/comparison-visualizer';
import { z } from 'zod';
import { toast } from 'sonner';

const parsedResultSchema = z.object({
  success: z.boolean(),
  proposals: z.array(z.object({
    tab_id: z.string(),
    summary: z.string(),
    strategy_family: z.string(),
    payload: z.record(z.any()),
  })).optional(),
  caller_tier: z.enum(['tier1', 'tier2', 'tier3']).optional(),
  error: z.string().optional(),
});
type ParsedResult = z.infer<typeof parsedResultSchema>;

function parseOutput(output: unknown): ParsedResult | null {
  if (!output) return null;
  const str = typeof output === 'string' ? output : JSON.stringify(output);
  try {
    const parsed = JSON.parse(str);
    return parsedResultSchema.parse(parsed);
  } catch {
    return null;
  }
}

export function OcProposeBacktestMultiToolView({ toolCall, toolResult }: ToolViewProps) {
  const parsed = useMemo(() => parseOutput(toolResult?.output), [toolResult?.output]);
  const sessionId = String(toolCall.arguments.session_id ?? '');
  const reviseTabId = typeof toolCall.arguments.revise_tab_id === 'string' ? toolCall.arguments.revise_tab_id : undefined;

  const {
    bySession,
    mergeFreshStack: mergeFresh,
    mergeRevisedProposal: mergeRevise,
    setApproved,
    setEdit,
  } = useProposalStore();
  const { run, cancelAll, submissions, runStates } = useMultiBacktestRun();

  useEffect(() => {
    if (!sessionId || !parsed?.success || !parsed.proposals || parsed.proposals.length === 0) return;
    if (reviseTabId) {
      const { merged } = mergeRevise(sessionId, parsed.proposals[0]);
      if (!merged) {
        toast.warning("Cannot revise strategy while it's running — cancel first");
      }
      return;
    }
    mergeFresh(sessionId, parsed.proposals);
  }, [sessionId, reviseTabId, parsed, mergeFresh, mergeRevise]);

  const state = bySession[sessionId];
  const proposals = state?.proposals ?? parsed?.proposals ?? [];
  const canRun = isRunAllReady(state ?? { proposals: [], approved: {}, edits: {}, run: null });

  if (!parsed || parsed.success === false) {
    return <div className="rounded-md border border-red-500/30 p-3 text-sm text-red-400">{parsed?.error ?? 'Failed to parse proposal result'}</div>;
  }

  return (
    <div className="rounded-lg border border-border/60 bg-card/50 p-3 space-y-3">
      <div className="text-sm font-medium">Multi-strategy proposals ({proposals.length})</div>
      {parsed.caller_tier === 'tier1' && (
        <div className="text-xs text-amber-500">Tier 2 required to run approved strategies.</div>
      )}
      {proposals.map((item) => {
        const approved = Boolean(state?.approved[item.tab_id]);
        return (
          <div key={item.tab_id} className="rounded-md border border-border/60 p-2 space-y-2">
            <div className="text-sm font-medium">{item.summary}</div>
            <div className="text-xs text-muted-foreground">Family: {item.strategy_family}</div>
            <label className="text-xs text-muted-foreground">
              Initial capital
              <input
                type="number"
                className="ml-2 w-28 rounded border border-border bg-background px-2 py-1 text-xs"
                defaultValue={String((item.payload as any)?.simulation_environment?.initial_capital ?? '')}
                onChange={(e) => {
                  const val = e.currentTarget.value;
                  setEdit(sessionId, item.tab_id, {
                    simulation_environment: {
                      ...(item.payload as any)?.simulation_environment,
                      initial_capital: val,
                    },
                  });
                }}
              />
            </label>
            <Button
              type="button"
              size="sm"
              variant={approved ? 'default' : 'outline'}
              onClick={() => setApproved(sessionId, item.tab_id, !approved)}
            >
              <CheckCircle2 className="size-3.5 mr-1" />
              {approved ? 'Approved' : 'Approve'}
            </Button>
          </div>
        );
      })}
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs text-muted-foreground">
          Approved: {Object.values(state?.approved ?? {}).filter(Boolean).length}
        </div>
        <Button
          type="button"
          size="sm"
          disabled={!canRun}
          onClick={async () => {
            if (!state) return;
            const payloads = buildApprovedPayloads(state);
            await run(payloads);
          }}
        >
          Run All Approved
        </Button>
      </div>
      {submissions.length > 0 && (
        <ComparisonVisualizer
          submissions={submissions}
          runStates={runStates}
          onRetry={async (tabId) => {
            void tabId;
            if (!state) return;
            const payloads = buildApprovedPayloads(state);
            if (payloads.length >= 2) await run(payloads);
          }}
          onPromote={() => {}}
          onCancelAll={cancelAll}
          tabLabels={Object.fromEntries(proposals.map((p) => [p.tab_id, p.tab_id]))}
        />
      )}
    </div>
  );
}
