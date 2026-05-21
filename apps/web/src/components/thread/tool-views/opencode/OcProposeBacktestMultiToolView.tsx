'use client';

import { useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, XCircle, Wand2 } from 'lucide-react';
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
  // Permissive `caller_tier` — strict z.enum rejects future tier additions and would fail
  // the whole parse for an otherwise-valid proposals payload.
  caller_tier: z.string().optional(),
  unit_cost_credits: z.number().optional(),
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

export function OcProposeBacktestMultiToolView({ toolCall, toolResult, messages }: ToolViewProps) {
  const parsed = useMemo(() => parseOutput(toolResult?.output), [toolResult?.output]);
  const sessionId = String(toolCall.arguments.session_id ?? '');
  const reviseTabId = typeof toolCall.arguments.revise_tab_id === 'string' ? toolCall.arguments.revise_tab_id : undefined;
  const router = useRouter();

  const {
    bySession,
    mergeFreshStack: mergeFresh,
    mergeRevisedProposal: mergeRevise,
    setApproved,
    setEdit,
    setRunStatuses,
    rejectTab,
  } = useProposalStore();
  // Pass sessionId so the hook acquires the cross-instance run lock for this session
  // (Story 5.9.1 D3b) — prevents the dashboard editor + this chat card from both kicking
  // off submit for the same conversation and double-billing.
  const { run, cancelAll, submissions, runStates, statuses, executing } = useMultiBacktestRun(sessionId);

  useEffect(() => {
    if (!sessionId || !parsed?.success || !parsed.proposals || parsed.proposals.length === 0) return;
    if (reviseTabId) {
      // Live-status guard: the store's `mergeRevisedProposal` reads `state.run.statuses`
      // which is updated via a separate `useEffect` (next-render snapshot). The freshest
      // truth is the local `statuses` from the hook — check it BEFORE dispatching merge
      // so we don't clobber a tab whose backtest just started in the current render cycle.
      if (statuses[reviseTabId] === 'running') {
        toast.warning("Cannot revise strategy while it's running — cancel first");
        return;
      }
      const { outcome } = mergeRevise(sessionId, parsed.proposals[0]);
      if (outcome === 'running') {
        toast.warning("Cannot revise strategy while it's running — cancel first");
      } else if (outcome === 'no-match') {
        // Phantom prevention: a revise_tab_id that doesn't match any known proposal would
        // otherwise silently create a card the user never approved. Toast + skip.
        toast.warning(`Revision target "${reviseTabId}" not found in current proposals — ask the agent to regenerate the full stack`);
      }
      return;
    }
    mergeFresh(sessionId, parsed.proposals);
  }, [sessionId, reviseTabId, parsed, mergeFresh, mergeRevise, statuses]);

  // Refresh hydration: previous implementation walked the `messages` prop to find prior
  // tool results, but the renderer adapter doesn't pass `messages` to ToolViewProps —
  // making that path dead code. Replaced with Zustand `persist` middleware on the store,
  // which auto-saves to sessionStorage and rehydrates on mount. No effect needed here.
  void messages; // legacy prop accepted for compatibility; not used

  useEffect(() => {
    if (!sessionId) return;
    setRunStatuses(sessionId, statuses);
  }, [sessionId, statuses, setRunStatuses]);

  const state = bySession[sessionId];
  // After Story 5.9.1 D4a, rejecting a card removes it from `state.proposals` outright, so
  // we no longer need the local `hiddenTabs` set. Fall back to the parsed result only for
  // first-render before the store hydration effect commits.
  const proposals = state?.proposals ?? parsed?.proposals ?? [];
  const canRun = isRunAllReady(state ?? { proposals: [], approved: {}, edits: {}, run: null });

  if (!parsed || parsed.success === false) {
    return <div className="rounded-md border border-red-500/30 p-3 text-sm text-red-400">{parsed?.error ?? 'Failed to parse proposal result'}</div>;
  }

  const focusAndPrefillInput = (prefix: string) => {
    // Scope to the chat textarea explicitly — `document.querySelector('textarea')` can match
    // ANY textarea (modal/drawer/dashboard editor) and silently corrupt that surface.
    const ta = document.querySelector(
      'textarea[data-session-chat-stop-scope="true"]',
    ) as HTMLTextAreaElement | null;
    if (!ta) {
      toast.error('Chat input not found — type the revision request manually.');
      return;
    }
    ta.focus();
    // React tracks the native value setter on controlled inputs; assigning `.value = ...`
    // directly bypasses the tracker so React's onChange never fires. Use the prototype
    // setter to push the change through React's controlled-input pipeline.
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
    if (setter) {
      setter.call(ta, prefix);
    } else {
      ta.value = prefix;
    }
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  };

  const getValue = (item: ProposalItem, keyPath: Array<string>, fallback = ''): string => {
    let target: any = item.payload;
    for (const key of keyPath) target = target?.[key];
    if (target === undefined || target === null) return fallback;
    return String(target);
  };

  // Build the patch for a single field with the CURRENT cumulative edit state. Spreading
  // `item.payload.simulation_environment` (the original) into every patch loses prior edits
  // to other fields under the same parent key — Capital then Range would drop Capital. This
  // helper merges into `state.edits[tab_id]?.[parentKey]` first so successive edits compose.
  const updateField = (item: ProposalItem, parentKey: string, field: string, value: unknown) => {
    const currentPayloadParent = ((item.payload as any)?.[parentKey] ?? {}) as Record<string, unknown>;
    const currentEditsParent = ((state?.edits[item.tab_id] as any)?.[parentKey] ?? {}) as Record<string, unknown>;
    setEdit(sessionId, item.tab_id, {
      [parentKey]: { ...currentPayloadParent, ...currentEditsParent, [field]: value },
    });
  };

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
            <div className="grid grid-cols-2 gap-2 text-xs">
              <label className="flex items-center gap-1">Capital
                <input type="number" className="w-full rounded border border-border bg-background px-2 py-1"
                  defaultValue={getValue(item, ['simulation_environment', 'initial_capital'])}
                  onChange={(e) => updateField(item, 'simulation_environment', 'initial_capital', e.currentTarget.value)}
                />
              </label>
              <label className="flex items-center gap-1">Range
                <input type="number" min={1} max={730} className="w-full rounded border border-border bg-background px-2 py-1"
                  defaultValue={getValue(item, ['simulation_environment', 'historical_range'])}
                  onChange={(e) => updateField(item, 'simulation_environment', 'historical_range', Number(e.currentTarget.value || 90))}
                />
              </label>
              <label className="flex items-center gap-1">Position %
                <input type="number" min={0} max={100} className="w-full rounded border border-border bg-background px-2 py-1"
                  defaultValue={String(Math.round(Number(getValue(item, ['risk_management', 'position_sizing'], '0')) * 100))}
                  onChange={(e) => updateField(item, 'risk_management', 'position_sizing', String(Number(e.currentTarget.value || 0) / 100))}
                />
              </label>
              <label className="flex items-center gap-1">Timeframe
                <select className="w-full rounded border border-border bg-background px-2 py-1"
                  defaultValue={getValue(item, ['context_rules', 'timeframe'], '4h')}
                  onChange={(e) => updateField(item, 'context_rules', 'timeframe', e.currentTarget.value)}
                >
                  {['1m', '5m', '15m', '1h', '4h', '1d', '1w'].map((tf) => <option key={tf} value={tf}>{tf}</option>)}
                </select>
              </label>
              <label className="flex items-center gap-1">Stop loss %
                <input type="number" min={0} max={100} className="w-full rounded border border-border bg-background px-2 py-1"
                  defaultValue={String(Math.round(Number(getValue(item, ['risk_management', 'stop_loss'], '0')) * 100))}
                  onChange={(e) => updateField(item, 'risk_management', 'stop_loss', String(Number(e.currentTarget.value || 0) / 100))}
                />
              </label>
              <label className="flex items-center gap-1">Take profit %
                <input type="number" min={0} max={100} className="w-full rounded border border-border bg-background px-2 py-1"
                  defaultValue={String(Math.round(Number(getValue(item, ['risk_management', 'take_profit'], '0')) * 100))}
                  onChange={(e) => updateField(item, 'risk_management', 'take_profit', String(Number(e.currentTarget.value || 0) / 100))}
                />
              </label>
            </div>
            <div className="text-xs text-muted-foreground">
              Assets: {((item.payload as any)?.context_rules?.assets ?? []).join(', ')} · Indicators: {((item.payload as any)?.context_rules?.indicators ?? []).join(', ') || 'n/a'}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant={approved ? 'default' : 'outline'} onClick={() => setApproved(sessionId, item.tab_id, !approved)}>
                <CheckCircle2 className="size-3.5 mr-1" />
                {approved ? 'Approved' : 'Approve'}
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => rejectTab(sessionId, item.tab_id)}>
                <XCircle className="size-3.5 mr-1" />
                Reject
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => focusAndPrefillInput(`Revise strategy "${item.summary}": `)}>
                <Wand2 className="size-3.5 mr-1" />
                Ask agent to change…
              </Button>
            </div>
          </div>
        );
      })}
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs text-muted-foreground">
          Approved: {Object.values(state?.approved ?? {}).filter(Boolean).length}
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" size="sm" disabled={!canRun || (parsed.caller_tier === 'tier1')} onClick={async () => {
            if (!state) return;
            const payloads = buildApprovedPayloads(state);
            if (payloads.length < 2) return;
            await run(payloads);
          }}>
            {executing ? 'Running…' : `Run All Approved (${Object.values(state?.approved ?? {}).filter(Boolean).length})`}
          </Button>
          {executing && <Button type="button" size="sm" variant="outline" onClick={cancelAll}>Cancel All</Button>}
        </div>
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
          onPromote={(tabId) => {
            // Wire Promote to the dashboard backtest page so the user can deep-dive on a
            // single strategy with the full single-mode UX. Stub onPromote was a dead
            // button visible to users with no feedback when clicked.
            const tab = proposals.find((p) => p.tab_id === tabId);
            if (!tab) return;
            try {
              sessionStorage.setItem(
                'chainlens:backtest:promote-from-chat',
                JSON.stringify({ tab_id: tabId, payload: tab.payload, summary: tab.summary }),
              );
            } catch {
              // Storage may be unavailable (private mode); navigation still works as a fallback.
            }
            router.push('/dashboard/backtest?from=chat-promote');
          }}
          onCancelAll={cancelAll}
          // Use the human-readable summary as the chart legend label — previously passed
          // tab_id (e.g. "strat-1") which is meaningless in the comparison view.
          tabLabels={Object.fromEntries(proposals.map((p) => [p.tab_id, p.summary]))}
        />
      )}
    </div>
  );
}
