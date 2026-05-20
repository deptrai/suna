'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import JSON5 from 'json5';
import { Loader2, Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/components/AuthProvider';
import { CodeEditor } from '@/components/file-editors/code-editor';
import { Button } from '@/components/ui/button';
import { INITIAL_TEMPLATE } from './strategy-editor';
import { ComparisonVisualizer } from './comparison-visualizer';
import { BacktestResultVisualizer } from './result-visualizer';
import {
  BacktestError,
  submitBacktestMulti,
  streamRun,
  type MultiSubmitItem,
  type RunResponse,
} from '@/lib/backtest-api';

type Tab = { id: string; label: string; content: string };
type TabStatus = 'idle' | 'running' | 'done' | 'failed' | 'timeout';

const KEY_PREFIX = 'chainlens:backtest:multi-draft:';
const DEBOUNCE_MS = 500;
const TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_TABS = 5;

function keyFor(accountId: string): string {
  return `${KEY_PREFIX}${accountId}`;
}

function makeTab(index: number): Tab {
  return { id: `strat-${crypto.randomUUID()}`, label: `Strategy ${index}`, content: INITIAL_TEMPLATE };
}

export function MultiBacktestStrategyEditorClient() {
  const { user } = useAuth();
  const [tabs, setTabs] = useState<Tab[]>(() => [makeTab(1)]);
  const [activeTabId, setActiveTabId] = useState<string>('');
  const [statuses, setStatuses] = useState<Record<string, TabStatus>>({});
  const [jsonErrors, setJsonErrors] = useState<Record<string, string | null>>({});
  const [executing, setExecuting] = useState(false);
  const [executingByTab, setExecutingByTab] = useState<Record<string, boolean>>({});
  const [submissions, setSubmissions] = useState<MultiSubmitItem[]>([]);
  const [runs, setRuns] = useState<Record<string, { run: RunResponse | null; timeout?: boolean; job_id?: string }>>({});
  const [promotedTabId, setPromotedTabId] = useState<string | null>(null);
  const [editingTabId, setEditingTabId] = useState<string | null>(null);

  const streamRefs = useRef<Map<string, { close: () => void }>>(new Map());
  const abortRefs = useRef<Map<string, AbortController>>(new Map());
  const saveDebounce = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const mountedRef = useRef(true);

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

  useEffect(() => () => {
    mountedRef.current = false;
    clearTimeout(saveDebounce.current);
    abortRefs.current.forEach((ctrl) => ctrl.abort());
    streamRefs.current.forEach((s) => s.close());
  }, []);

  const safeSetStatuses = useCallback(
    (updater: (prev: Record<string, TabStatus>) => Record<string, TabStatus>) => {
      if (!mountedRef.current) return;
      setStatuses(updater);
    },
    [],
  );
  const safeSetRuns = useCallback(
    (updater: (prev: Record<string, { run: RunResponse | null; timeout?: boolean; job_id?: string }>) => Record<string, { run: RunResponse | null; timeout?: boolean; job_id?: string }>) => {
      if (!mountedRef.current) return;
      setRuns(updater);
    },
    [],
  );

  const persist = useCallback((nextTabs: Tab[], nextActive: string) => {
    if (!user?.id) return;
    clearTimeout(saveDebounce.current);
    saveDebounce.current = setTimeout(() => {
      try {
        sessionStorage.setItem(
          keyFor(user.id),
          JSON.stringify({ tabs: nextTabs, activeTabId: nextActive, savedAt: Date.now() }),
        );
      } catch {}
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
    setTabs((prev) => {
      if (prev.length >= MAX_TABS) return prev;
      const next = [...prev, makeTab(prev.length + 1)];
      const nextActive = next[next.length - 1].id;
      setActiveTabId(nextActive);
      persist(next, nextActive);
      return next;
    });
  }, [persist]);

  const removeTab = useCallback((id: string) => {
    if (tabs.length <= 1) return;
    if (!confirm('Remove this strategy tab?')) return;
    setTabs((prev) => {
      if (prev.length <= 1) return prev;
      const next = prev.filter((t) => t.id !== id);
      const nextActive = activeTabId === id ? next[0].id : activeTabId;
      setActiveTabId(nextActive);
      persist(next, nextActive);
      return next;
    });
  }, [activeTabId, persist, tabs.length]);

  const closeAllStreams = useCallback(() => {
    abortRefs.current.forEach((ctrl) => ctrl.abort());
    streamRefs.current.forEach((s) => s.close());
    abortRefs.current.clear();
    streamRefs.current.clear();
    if (mountedRef.current) {
      setExecutingByTab({});
      setExecuting(false);
    }
  }, []);

  const runAll = useCallback(async () => {
    closeAllStreams();
    const payloads: Array<{ tab_id: string; payload: Record<string, unknown> }> = [];
    for (const tab of tabs) {
      try {
        payloads.push({ tab_id: tab.id, payload: JSON5.parse(tab.content) as Record<string, unknown> });
      } catch {
        toast.error(`Invalid JSON5 in ${tab.label}`);
        return;
      }
    }

    setExecuting(true);
    setStatuses(Object.fromEntries(tabs.map((t) => [t.id, 'running'])) as Record<string, TabStatus>);
    setRuns({});

    const markTerminal = (tabId: string) => {
      setExecutingByTab((prev) => {
        const next = { ...prev, [tabId]: false };
        const anyStillRunning = Object.values(next).some(Boolean);
        if (!anyStillRunning && mountedRef.current) setExecuting(false);
        return next;
      });
    };

    try {
      const result = await submitBacktestMulti(payloads);
      setSubmissions(result.submissions);
      setExecutingByTab(
        Object.fromEntries(result.submissions.map((s) => [s.tab_id, s.status === 'accepted'])) as Record<string, boolean>,
      );

      // Open all SSE streams. Await each `streamRun()` resolution so the stream handle
      // is registered in `streamRefs` BEFORE the next iteration / before any
      // synchronous SSE events could fire — closes the .then-microtask race.
      await Promise.all(
        result.submissions.map(async (sub) => {
          if (sub.status !== 'accepted' || !sub.job_id) {
            safeSetStatuses((prev) => ({ ...prev, [sub.tab_id]: 'failed' }));
            markTerminal(sub.tab_id);
            return;
          }
          const ctrl = new AbortController();
          abortRefs.current.set(sub.tab_id, ctrl);
          try {
            const stream = await streamRun(
              sub.job_id,
              {
                onPhaseB: (data) => {
                  safeSetRuns((prev) => ({ ...prev, [sub.tab_id]: { run: data, job_id: sub.job_id } }));
                  safeSetStatuses((prev) => ({ ...prev, [sub.tab_id]: 'done' }));
                  markTerminal(sub.tab_id);
                },
                onFailed: (data) => {
                  safeSetRuns((prev) => ({ ...prev, [sub.tab_id]: { run: data, job_id: sub.job_id } }));
                  safeSetStatuses((prev) => ({ ...prev, [sub.tab_id]: 'failed' }));
                  markTerminal(sub.tab_id);
                },
                onTimeout: () => {
                  safeSetRuns((prev) => ({ ...prev, [sub.tab_id]: { run: null, timeout: true, job_id: sub.job_id } }));
                  safeSetStatuses((prev) => ({ ...prev, [sub.tab_id]: 'timeout' }));
                  markTerminal(sub.tab_id);
                },
                onError: () => {
                  safeSetStatuses((prev) => ({ ...prev, [sub.tab_id]: 'failed' }));
                  markTerminal(sub.tab_id);
                },
              },
              ctrl.signal,
            );
            streamRefs.current.set(sub.tab_id, stream);
          } catch {
            safeSetStatuses((prev) => ({ ...prev, [sub.tab_id]: 'failed' }));
            markTerminal(sub.tab_id);
          }
        }),
      );
    } catch (e) {
      if (e instanceof BacktestError) toast.error(e.message);
      else toast.error('Run all failed');
      // Submit failed entirely — clear executing immediately.
      if (mountedRef.current) setExecuting(false);
    }
  }, [closeAllStreams, tabs, safeSetStatuses, safeSetRuns]);

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
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTabId(tab.id)}
            onDoubleClick={() => setEditingTabId(tab.id)}
            className={`px-3 py-1.5 rounded-md border text-sm ${activeTabId === tab.id ? 'bg-secondary' : ''}`}
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
            {tabs.length > 1 && (
              <span
                role="button"
                onClick={(e) => {
                  e.stopPropagation();
                  removeTab(tab.id);
                }}
                className="ml-2 inline-flex align-middle"
              >
                <X className="h-3 w-3" />
              </span>
            )}
          </button>
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
          }}
          onCancelAll={closeAllStreams}
        />
      )}

      {promotedTabId && runs[promotedTabId]?.run && (
        <div className="space-y-2">
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
