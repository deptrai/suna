'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import JSON5 from 'json5';
import { Loader2, Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/components/AuthProvider';
import { CodeEditor } from '@/components/file-editors/code-editor';
import { Button } from '@/components/ui/button';
import { INITIAL_TEMPLATE } from './strategy-editor';
function escapeReplacement(value: string): string {
  return value.replace(/\$/g, '$$$$');
}
function applyContextToTemplate(
  template: string,
  asset?: string,
  timeframe?: string,
): string {
  let out = template;
  if (asset) {
    out = out.replace(
      /"assets":\s*\["[^"]+"\]/,
      `"assets": ["${escapeReplacement(asset)}"]`,
    );
  }
  if (timeframe) {
    out = out.replace(
      /"timeframe":\s*"[^"]+"/,
      `"timeframe": "${escapeReplacement(timeframe)}"`,
    );
  }
  return out;
}
import { ComparisonVisualizer } from './comparison-visualizer';
import { BacktestResultVisualizer } from './result-visualizer';
import { type RunResponse } from '@/lib/backtest-api';
import { useMultiBacktestRun } from './use-multi-backtest-run';

type Tab = { id: string; label: string; content: string };

const KEY_PREFIX = 'chainlens:backtest:multi-draft:';
const DEBOUNCE_MS = 500;
const TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_TABS = 5;

function keyFor(accountId: string): string {
  return `${KEY_PREFIX}${accountId}`;
}

function makeTab(index: number, content = INITIAL_TEMPLATE): Tab {
  return { id: `strat-${crypto.randomUUID()}`, label: `Strategy ${index}`, content };
}

function normalizePayload(
  payload: Record<string, unknown>,
): { payload: Record<string, unknown>; rewrites: string[] } {
  const normalized = structuredClone(payload) as Record<string, unknown>;
  const rewrites: string[] = [];
  const sim = normalized.simulation_environment as Record<string, unknown> | undefined;
  if (sim) {
    if (typeof sim.exchange === 'string' && sim.exchange.toLowerCase() === 'binance') {
      sim.exchange = 'okx';
      rewrites.push('exchange:binance→okx');
    }
    if (typeof sim.instrument_type === 'string') {
      const it = sim.instrument_type.toUpperCase();
      const nextIt = it === 'FUTURES' ? 'PERPETUAL' : it;
      if (sim.instrument_type !== nextIt) rewrites.push(`instrument_type:${sim.instrument_type}→${nextIt}`);
      sim.instrument_type = nextIt;
    }
    if (typeof sim.historical_range === 'string') {
      const n = Number.parseInt(sim.historical_range, 10);
      sim.historical_range = Number.isFinite(n) ? Math.min(Math.max(n, 1), 730) : 90;
    } else if (typeof sim.historical_range === 'number') {
      sim.historical_range = Math.min(Math.max(sim.historical_range, 1), 730);
    }
  }
  return { payload: normalized, rewrites };
}

export function MultiBacktestStrategyEditorClient({
  initialCode,
  initialAsset,
  initialTimeframe,
  onExecutingChange,
}: {
  initialCode?: string;
  initialAsset?: string;
  initialTimeframe?: string;
  onExecutingChange?: (executing: boolean) => void;
} = {}) {
  const { user } = useAuth();
  const [tabs, setTabs] = useState<Tab[]>(() => {
    const base = initialCode || applyContextToTemplate(INITIAL_TEMPLATE, initialAsset, initialTimeframe);
    return [makeTab(1, base)];
  });
  const [activeTabId, setActiveTabId] = useState<string>('');
  const [jsonErrors, setJsonErrors] = useState<Record<string, string | null>>({});
  const [promotedTabId, setPromotedTabId] = useState<string | null>(null);
  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const promotedViewRef = useRef<HTMLDivElement | null>(null);

  const saveDebounce = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const mountedRef = useRef(true);
  const quotaWarnedRef = useRef(false);
  const normalizeWarnedRef = useRef(false);
  const {
    run,
    cancelAll,
    submissions,
    statuses,
    runStates: runs,
    executing,
  } = useMultiBacktestRun();

  useEffect(() => {
    if (!activeTabId && tabs[0]) setActiveTabId(tabs[0].id);
  }, [activeTabId, tabs]);

  useEffect(() => {
    if (!user?.id) return;
    try {
      const raw = sessionStorage.getItem(keyFor(user.id));
      if (!raw) return;
      const parsed = JSON.parse(raw) as { tabs?: Tab[]; activeTabId?: string; savedAt?: number };
      if (!parsed.savedAt || Date.now() - parsed.savedAt > TTL_MS) return;
      if (Array.isArray(parsed.tabs) && parsed.tabs.length > 0) {
        setTabs(parsed.tabs.slice(0, MAX_TABS));
        setActiveTabId(parsed.activeTabId || parsed.tabs[0].id);
      }
    } catch {}
  }, [user?.id]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clearTimeout(saveDebounce.current);
    };
  }, []);

  useEffect(() => {
    onExecutingChange?.(executing);
  }, [executing, onExecutingChange]);

  useEffect(() => {
    if (!promotedTabId) return;
    requestAnimationFrame(() => {
      promotedViewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }, [promotedTabId]);

  const persist = useCallback((nextTabs: Tab[], nextActive: string) => {
    if (!user?.id) return;
    clearTimeout(saveDebounce.current);
    saveDebounce.current = setTimeout(() => {
      try {
        sessionStorage.setItem(
          keyFor(user.id),
          JSON.stringify({ tabs: nextTabs, activeTabId: nextActive, savedAt: Date.now() }),
        );
      } catch {
        // Parity Story 5.2 quotaWarnedRef: silent fallback after first user notice so
        // we don't spam toasts when sessionStorage is full or unavailable (private mode).
        if (!quotaWarnedRef.current) {
          quotaWarnedRef.current = true;
          toast.warning('Multi-strategy drafts could not be saved (storage full or unavailable). Edits stay in this session only.');
        }
      }
    }, DEBOUNCE_MS);
  }, [user?.id]);

  const activeTab = useMemo(() => tabs.find((t) => t.id === activeTabId) ?? tabs[0], [tabs, activeTabId]);

  const setTabContent = useCallback((id: string, value: string) => {
    setTabs((prev) => {
      const next = prev.map((t) => (t.id === id ? { ...t, content: value } : t));
      persist(next, activeTabId || id);
      return next;
    });
    try {
      JSON5.parse(value);
      setJsonErrors((prev) => ({ ...prev, [id]: null }));
    } catch (e) {
      setJsonErrors((prev) => ({ ...prev, [id]: e instanceof Error ? e.message : 'Invalid JSON5' }));
    }
  }, [activeTabId, persist]);

  const renameTab = useCallback((id: string, label: string) => {
    setTabs((prev) => {
      const next = prev.map((t) => (t.id === id ? { ...t, label: label.trim() || t.label } : t));
      persist(next, activeTabId || id);
      return next;
    });
  }, [activeTabId, persist]);

  const addTab = useCallback(() => {
    // Compute next state outside `setTabs` so side-effects (setActiveTabId, persist)
    // don't fire twice under React 18 StrictMode (which invokes updaters twice in dev).
    if (tabs.length >= MAX_TABS) return;
    const next = [...tabs, makeTab(tabs.length + 1)];
    const nextActive = next[next.length - 1].id;
    setTabs(next);
    setActiveTabId(nextActive);
    persist(next, nextActive);
  }, [tabs, persist]);

  const removeTab = useCallback((id: string) => {
    if (tabs.length <= 1) return;
    if (!confirm('Remove this strategy tab?')) return;
    const next = tabs.filter((t) => t.id !== id);
    if (next.length === 0) return;
    const nextActive = activeTabId === id ? next[0].id : activeTabId;
    setTabs(next);
    setActiveTabId(nextActive);
    persist(next, nextActive);
  }, [activeTabId, persist, tabs]);

  const closeAllStreams = useCallback(() => {
    cancelAll();
    toast.info('Cancelled active streams and local polling');
  }, [cancelAll]);

  const runAll = useCallback(async () => {
    const payloads: Array<{ tab_id: string; payload: Record<string, unknown> }> = [];
    const allRewrites = new Set<string>();
    for (const tab of tabs) {
      try {
        const parsed = JSON5.parse(tab.content) as Record<string, unknown>;
        const result = normalizePayload(parsed);
        payloads.push({ tab_id: tab.id, payload: result.payload });
        result.rewrites.forEach((r) => allRewrites.add(r));
      } catch {
        toast.error(`Invalid JSON5 in ${tab.label}`);
        return;
      }
    }
    // Surface normalization rewrites loudly the first time so users understand why
    // backtest results differ from what they wrote (Binance prices → OKX prices).
    if (allRewrites.size > 0 && !normalizeWarnedRef.current) {
      normalizeWarnedRef.current = true;
      toast.warning(`Payload coerced for engine compatibility: ${Array.from(allRewrites).join(', ')}`);
    }

    const result = await run(payloads);
    if (!result.ok) {
      toast.error(result.error.message);
    }
  }, [tabs, run]);

  const anyInvalid = tabs.some((t) => !!jsonErrors[t.id]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Multi-Strategy Editor</h2>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={addTab} disabled={tabs.length >= MAX_TABS || executing}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Add Strategy
          </Button>
          <Button size="sm" onClick={runAll} disabled={executing || anyInvalid || tabs.length < 2}>
            {executing ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-2" />Running...</> : 'Run All'}
          </Button>
          <Button variant="outline" size="sm" onClick={closeAllStreams}>Cancel All</Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {tabs.map((tab) => (
          // a11y: tab pill uses inline-flex container with sibling buttons, NOT a
          // nested <button><span role="button"/></button> (invalid HTML, screen
          // readers can't reach the close action).
          <div
            key={tab.id}
            className={`inline-flex items-center gap-1 px-1 py-0.5 rounded-md border text-sm ${activeTabId === tab.id ? 'bg-secondary' : ''}`}
          >
            <button
              type="button"
              onClick={() => setActiveTabId(tab.id)}
              onDoubleClick={() => setEditingTabId(tab.id)}
              className="px-2 py-1 rounded"
            >
              {editingTabId === tab.id ? (
                <input
                  autoFocus
                  defaultValue={tab.label}
                  onBlur={(e) => {
                    renameTab(tab.id, e.currentTarget.value);
                    setEditingTabId(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      renameTab(tab.id, (e.target as HTMLInputElement).value);
                      setEditingTabId(null);
                    }
                  }}
                  className="w-28 rounded border border-border bg-background px-1 text-xs"
                />
              ) : (
                <>{tab.label} · {statuses[tab.id] ?? 'idle'}</>
              )}
            </button>
            {tabs.length > 1 && (
              <button
                type="button"
                aria-label={`Remove ${tab.label}`}
                onClick={() => removeTab(tab.id)}
                className="inline-flex items-center justify-center rounded p-0.5 hover:bg-destructive/10"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="rounded-xl overflow-hidden border border-border" style={{ height: 420 }}>
        {tabs.map((tab) => (
          <div key={tab.id} className={tab.id === activeTabId ? 'h-full' : 'hidden'}>
            <CodeEditor
              content={tab.content}
              fileName={`${tab.label}.json`}
              language="json"
              onChange={(value) => setTabContent(tab.id, value)}
              showHeader={false}
              readOnly={executing}
              showLineNumbers
            />
          </div>
        ))}
      </div>

      {submissions.length > 0 && (
        <ComparisonVisualizer
          submissions={submissions}
          runStates={runs}
          tabLabels={Object.fromEntries(tabs.map((t) => [t.id, t.label]))}
          onRetry={(tabId) => {
            const tab = tabs.find((t) => t.id === tabId);
            if (!tab) return;
            setActiveTabId(tabId);
            toast.info(`Retry ${tab.label}: click Run All again`);
          }}
          onPromote={(tabId) => {
            setPromotedTabId(tabId);
            setActiveTabId(tabId);
            toast.success(`Promoted ${tabs.find((t) => t.id === tabId)?.label ?? tabId}`);
          }}
          onCancelAll={closeAllStreams}
        />
      )}

      {promotedTabId && runs[promotedTabId]?.run && (
        <div ref={promotedViewRef} className="space-y-2 rounded-lg border border-border p-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">Single Strategy View</h3>
            <Button variant="outline" size="sm" onClick={() => setPromotedTabId(null)}>
              Back to comparison
            </Button>
          </div>
          <BacktestResultVisualizer result={runs[promotedTabId].run as RunResponse} onRetry={runAll} />
        </div>
      )}
    </div>
  );
}
