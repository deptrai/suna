'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  BacktestError,
  pollRun,
  streamRun,
  submitBacktestMulti,
  type MultiSubmitItem,
  type RunResponse,
} from '@/lib/backtest-api';

type TabStatus = 'idle' | 'running' | 'done' | 'failed' | 'timeout';
type RunMap = Record<string, { run: RunResponse | null; timeout?: boolean; job_id?: string }>;

export function useMultiBacktestRun() {
  const [statuses, setStatuses] = useState<Record<string, TabStatus>>({});
  const [executing, setExecuting] = useState(false);
  const [executingByTab, setExecutingByTab] = useState<Record<string, boolean>>({});
  const [submissions, setSubmissions] = useState<MultiSubmitItem[]>([]);
  const [runStates, setRunStates] = useState<RunMap>({});

  const streamRefs = useRef<Map<string, { close: () => void }>>(new Map());
  const abortRefs = useRef<Map<string, AbortController>>(new Map());
  const mountedRef = useRef(true);
  const runIdRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortRefs.current.forEach((ctrl) => ctrl.abort());
      streamRefs.current.forEach((s) => s.close());
    };
  }, []);

  const closeAllStreams = useCallback(() => {
    abortRefs.current.forEach((ctrl) => ctrl.abort());
    streamRefs.current.forEach((s) => s.close());
    abortRefs.current.clear();
    streamRefs.current.clear();
    if (mountedRef.current) {
      setExecutingByTab({});
      setExecuting(false);
      setStatuses((prev) => {
        const next: Record<string, TabStatus> = { ...prev };
        for (const [tabId, st] of Object.entries(prev)) {
          if (st === 'running') next[tabId] = 'idle';
        }
        return next;
      });
    }
  }, []);

  const run = useCallback(async (payloads: Array<{ tab_id: string; payload: Record<string, unknown> }>) => {
    closeAllStreams();
    runIdRef.current += 1;
    const thisRun = runIdRef.current;

    setExecuting(true);
    setStatuses(Object.fromEntries(payloads.map((t) => [t.tab_id, 'running'])) as Record<string, TabStatus>);
    setRunStates({});
    setSubmissions([]);

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

      await Promise.all(
        result.submissions.map(async (sub) => {
          if (sub.status !== 'accepted' || !sub.job_id) {
            setStatuses((prev) => ({ ...prev, [sub.tab_id]: 'failed' }));
            markTerminal(sub.tab_id);
            return;
          }
          const ctrl = new AbortController();
          abortRefs.current.set(sub.tab_id, ctrl);
          if (runIdRef.current !== thisRun) {
            ctrl.abort();
            return;
          }
          try {
            const stream = await streamRun(
              sub.job_id,
              {
                onPhaseB: (data) => {
                  if (runIdRef.current !== thisRun) return;
                  setRunStates((prev) => ({ ...prev, [sub.tab_id]: { run: data, job_id: sub.job_id } }));
                  setStatuses((prev) => ({ ...prev, [sub.tab_id]: 'done' }));
                  markTerminal(sub.tab_id);
                },
                onFailed: (data) => {
                  if (runIdRef.current !== thisRun) return;
                  setRunStates((prev) => ({ ...prev, [sub.tab_id]: { run: data, job_id: sub.job_id } }));
                  setStatuses((prev) => ({ ...prev, [sub.tab_id]: 'failed' }));
                  markTerminal(sub.tab_id);
                },
                onTimeout: () => {
                  if (runIdRef.current !== thisRun) return;
                  setRunStates((prev) => ({ ...prev, [sub.tab_id]: { run: null, timeout: true, job_id: sub.job_id } }));
                  setStatuses((prev) => ({ ...prev, [sub.tab_id]: 'timeout' }));
                  void (async () => {
                    try {
                      const finalRun = await pollRun(sub.job_id as string, {
                        intervalMs: 2500,
                        maxWaitMs: 180_000,
                        signal: ctrl.signal,
                      });
                      if (runIdRef.current !== thisRun) return;
                      setRunStates((prev) => ({
                        ...prev,
                        [sub.tab_id]: { run: finalRun, timeout: false, job_id: sub.job_id },
                      }));
                      setStatuses((prev) => ({
                        ...prev,
                        [sub.tab_id]: finalRun.status === 'success' ? 'done' : 'failed',
                      }));
                    } finally {
                      if (runIdRef.current === thisRun) markTerminal(sub.tab_id);
                    }
                  })();
                },
                onError: () => {
                  if (runIdRef.current !== thisRun) return;
                  setStatuses((prev) => ({ ...prev, [sub.tab_id]: 'failed' }));
                  markTerminal(sub.tab_id);
                },
              },
              ctrl.signal,
            );
            streamRefs.current.set(sub.tab_id, stream);
            if (runIdRef.current !== thisRun) stream.close();
          } catch {
            setStatuses((prev) => ({ ...prev, [sub.tab_id]: 'failed' }));
            markTerminal(sub.tab_id);
          }
        }),
      );
      return { ok: true as const };
    } catch (e) {
      if (mountedRef.current) setExecuting(false);
      return { ok: false as const, error: e instanceof BacktestError ? e : new Error('Run all failed') };
    }
  }, [closeAllStreams]);

  return {
    run,
    cancelAll: closeAllStreams,
    retry: run,
    submissions,
    statuses,
    runStates,
    executing,
    runIdRef,
  };
}
