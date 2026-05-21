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
import {
  tryAcquireRunLock,
  releaseRunLock,
} from '@/components/thread/tool-views/opencode/proposal-store';

type TabStatus = 'idle' | 'running' | 'done' | 'failed' | 'timeout';
type RunMap = Record<string, { run: RunResponse | null; timeout?: boolean; job_id?: string }>;

/**
 * Session-scoped multi-backtest run lifecycle. Pass `sessionId` to opt in to the module-
 * level cross-instance run lock (prevents the editor + chat tool view from both kicking off
 * the same submit and double-billing the user). When omitted, runs proceed unlocked (legacy
 * surfaces, e.g. /dashboard/backtest multi-tab editor where the user is the only operator).
 */
export function useMultiBacktestRun(sessionId?: string) {
  const [statuses, setStatuses] = useState<Record<string, TabStatus>>({});
  const [executing, setExecuting] = useState(false);
  const [executingByTab, setExecutingByTab] = useState<Record<string, boolean>>({});
  const [submissions, setSubmissions] = useState<MultiSubmitItem[]>([]);
  const [runStates, setRunStates] = useState<RunMap>({});

  const streamRefs = useRef<Map<string, { close: () => void }>>(new Map());
  const abortRefs = useRef<Map<string, AbortController>>(new Map());
  const mountedRef = useRef(true);
  const runIdRef = useRef(0);
  const lastPayloadsRef = useRef<Array<{ tab_id: string; payload: Record<string, unknown> }> | null>(null);
  const acquiredLockRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortRefs.current.forEach((ctrl) => ctrl.abort());
      streamRefs.current.forEach((s) => s.close());
      // Release the session run-lock on unmount so a remount can re-acquire — otherwise the
      // lock would leak across navigations and block legitimate subsequent runs.
      if (acquiredLockRef.current && sessionId) {
        releaseRunLock(sessionId);
        acquiredLockRef.current = false;
      }
    };
  }, [sessionId]);

  const closeAllStreams = useCallback(() => {
    abortRefs.current.forEach((ctrl) => ctrl.abort());
    streamRefs.current.forEach((s) => s.close());
    abortRefs.current.clear();
    streamRefs.current.clear();
    // Bump runIdRef so any in-flight async tasks (timeout poll IIFEs) bail when they
    // observe the change before touching state.
    runIdRef.current += 1;
    if (acquiredLockRef.current && sessionId) {
      releaseRunLock(sessionId);
      acquiredLockRef.current = false;
    }
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
  }, [sessionId]);

  const run = useCallback(async (payloads: Array<{ tab_id: string; payload: Record<string, unknown> }>) => {
    // Session-scoped cross-instance lock (Story 5.9.1 D3b): if another hook instance already
    // owns a run for this session, refuse the duplicate to prevent double-billing.
    if (sessionId && !tryAcquireRunLock(sessionId)) {
      return {
        ok: false as const,
        error: new Error('Another multi-backtest is already running for this session. Cancel it first.'),
      };
    }
    if (sessionId) acquiredLockRef.current = true;

    closeAllStreams();
    runIdRef.current += 1;
    const thisRun = runIdRef.current;
    lastPayloadsRef.current = payloads;

    setExecuting(true);
    setStatuses(Object.fromEntries(payloads.map((t) => [t.tab_id, 'running'])) as Record<string, TabStatus>);
    setRunStates({});
    setSubmissions([]);

    const markTerminal = (tabId: string) => {
      setExecutingByTab((prev) => {
        const next = { ...prev, [tabId]: false };
        const anyStillRunning = Object.values(next).some(Boolean);
        if (!anyStillRunning && mountedRef.current) {
          setExecuting(false);
          // All tabs terminal → release the session lock so a follow-up run can proceed.
          if (acquiredLockRef.current && sessionId) {
            releaseRunLock(sessionId);
            acquiredLockRef.current = false;
          }
        }
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
                    } catch (err) {
                      // Restore the original editor's diagnostic breadcrumb — without this
                      // catch, AbortError (normal cancellation) leaks as an unhandled
                      // promise rejection and pollRun failures vanish silently.
                      if (err instanceof Error && err.message !== 'Cancelled') {
                        console.warn(`[multi-backtest] poll fallback failed for tab=${sub.tab_id}:`, err.message);
                      }
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
      // submitBacktestMulti threw before any stream opened → release lock so user can retry.
      if (acquiredLockRef.current && sessionId) {
        releaseRunLock(sessionId);
        acquiredLockRef.current = false;
      }
      return { ok: false as const, error: e instanceof BacktestError ? e : new Error('Run all failed') };
    }
  }, [closeAllStreams, sessionId]);

  // Retry rerun the LAST payloads — used by ComparisonVisualizer's per-row retry button.
  // Returns ok:false if there's nothing to retry, instead of crashing on undefined iteration.
  const retry = useCallback(async () => {
    if (!lastPayloadsRef.current || lastPayloadsRef.current.length === 0) {
      return { ok: false as const, error: new Error('No previous run to retry') };
    }
    return run(lastPayloadsRef.current);
  }, [run]);

  return {
    run,
    cancelAll: closeAllStreams,
    retry,
    submissions,
    statuses,
    runStates,
    executing,
    // Intentionally NOT returning runIdRef — internal ordering primitive; exposing it
    // lets consumers stomp the value and silently break stale-callback bails.
  };
}
