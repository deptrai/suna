'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import JSON5 from 'json5';
import { Loader2, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/components/AuthProvider';
import { CodeEditor } from '@/components/file-editors/code-editor';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { BacktestResultVisualizer } from './result-visualizer';
import {
  submitBacktest,
  pollRun,
  streamRun,
  BacktestError,
  type RunResponse,
} from '@/lib/backtest-api';

const DRAFT_KEY_PREFIX = 'chainlens:backtest:draft:';
const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const DEBOUNCE_MS = 500;
const POLL_MAX_MS = 30_000;

export const INITIAL_TEMPLATE = `{
  // Backtest BTC-USDT SPOT strategy with 90-day historical data
  "simulation_environment": {
    "exchange": "okx",
    "instrument_type": "SPOT", // SPOT | PERPETUAL — for SPOT, leverage must be <= 1.0
    "initial_capital": "15000",
    "historical_range": 90, // days, integer
    "trading_fees": "0.001",
    "slippage_tolerance": "0.002"
  },
  "risk_management": {
    "max_drawdown_percentage": "0.15", // 0.0 - 1.0
    "position_sizing": "0.2",           // 0.0 - 1.0 of capital per trade
    "stop_loss": "0.05",
    "take_profit": "0.15"
  },
  "context_rules": {
    "assets": ["BTC-USDT"],
    "timeframe": "4h",                  // pattern: ^\\d+[mhdwM]$ (e.g. 15m, 1h, 4h, 1d)
    "indicators": ["SMA_20", "SMA_50"],
    "natural_language_rules": "Long when 20-SMA crosses above 50-SMA, exit on reverse cross."
    // "executable_code": "..."         // optional Python strategy (string-escaped)
  },
  "execution_flags": {
    "enable_monte_carlo_stress_test": false,
    "enable_rl_optimization": false
  }
}`;

export function getDraftKey(accountId: string): string {
  return `${DRAFT_KEY_PREFIX}${accountId}`;
}

export function loadDraft(accountId: string): string | null {
  if (!accountId) return null;
  try {
    const raw = localStorage.getItem(getDraftKey(accountId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return null;
    const { content, savedAt } = parsed as { content?: unknown; savedAt?: unknown };
    if (typeof content !== 'string' || typeof savedAt !== 'number') return null;
    if (Date.now() - savedAt > DRAFT_TTL_MS) {
      localStorage.removeItem(getDraftKey(accountId));
      return null;
    }
    return content;
  } catch {
    return null;
  }
}

export type SaveDraftResult = 'ok' | 'quota' | 'unavailable';

export function saveDraft(accountId: string, content: string): SaveDraftResult {
  if (!accountId) return 'unavailable';
  try {
    localStorage.setItem(
      getDraftKey(accountId),
      JSON.stringify({ content, savedAt: Date.now() }),
    );
    return 'ok';
  } catch (e) {
    if (
      e instanceof DOMException &&
      (e.name === 'QuotaExceededError' || e.code === 22)
    ) {
      return 'quota';
    }
    return 'unavailable';
  }
}

export function BacktestStrategyEditorClient() {
  const { user } = useAuth();
  const router = useRouter();

  const [content, setContent] = useState(INITIAL_TEMPLATE);
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [isPolling, setIsPolling] = useState(false);
  const [result, setResult] = useState<RunResponse | null>(null);
  const [error, setError] = useState<{ status: number; message: string } | null>(null);
  const [showInsufficientCredits, setShowInsufficientCredits] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  // Story 5.3: per-phase loading label
  const [loadingPhase, setLoadingPhase] = useState<'data_loading' | 'simulation_running' | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  // Story 5.3: track active SSE stream so we can close on unmount / new submit
  const streamRef = useRef<{ close: () => void } | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const quotaWarnedRef = useRef(false);

  // Load draft once user auth resolves
  useEffect(() => {
    if (user?.id) {
      const draft = loadDraft(user.id);
      if (draft) setContent(draft);
    }
  }, [user?.id]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearTimeout(debounceRef.current);
      abortRef.current?.abort();
      streamRef.current?.close();
    };
  }, []);

  const handleChange = useCallback(
    (value: string) => {
      setContent(value);

      // Inline JSON5 validation
      try {
        JSON5.parse(value);
        setJsonError(null);
      } catch (e) {
        setJsonError(e instanceof Error ? e.message : 'Invalid JSON');
      }

      // Debounced localStorage save
      clearTimeout(debounceRef.current);
      const accountId = user?.id;
      if (!accountId) return;
      debounceRef.current = setTimeout(() => {
        const result = saveDraft(accountId, value);
        if (result === 'quota' && !quotaWarnedRef.current) {
          quotaWarnedRef.current = true;
          toast.warning('Browser storage full — draft will not auto-save until space is freed');
        }
      }, DEBOUNCE_MS);
    },
    [user?.id],
  );

  const handleReset = useCallback(() => {
    setContent(INITIAL_TEMPLATE);
    setJsonError(null);
    quotaWarnedRef.current = false;
    if (user?.id) {
      try {
        localStorage.removeItem(getDraftKey(user.id));
      } catch {}
    }
    setResetOpen(false);
  }, [user?.id]);

  const handleSubmit = useCallback(async () => {
    setError(null);
    setShowInsufficientCredits(false);
    setResult(null);

    // Strip JSON5 comments and parse
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON5.parse(content) as Record<string, unknown>;
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Invalid JSON';
      setJsonError(msg);
      toast.error('Fix JSON errors before submitting');
      return;
    }

    // Abort any in-flight request + close any in-flight stream before starting a new one
    abortRef.current?.abort();
    streamRef.current?.close();
    streamRef.current = null;
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setIsExecuting(true);
    setIsPolling(false);
    setLoadingPhase(null);

    let submittedJobId: string | undefined;

    try {
      const submitResult = await submitBacktest(parsed, ctrl.signal);
      submittedJobId = submitResult.job_id;
      setIsPolling(true);
      setLoadingPhase('data_loading');

      // Story 5.3 — replace polling with SSE stream
      await new Promise<void>((resolve, reject) => {
        let resolved = false;
        const finish = () => {
          if (resolved) return;
          resolved = true;
          resolve();
        };
        streamRun(
          submitResult.job_id,
          {
            onDataLoading: () => {
              setLoadingPhase('data_loading');
            },
            onPhaseA: (data) => {
              setLoadingPhase('simulation_running');
              setResult(data);
            },
            onPhaseB: (data) => {
              setResult(data);
              finish();
            },
            onFailed: (data) => {
              setResult(data);
              finish();
            },
            onTimeout: () => {
              toast.warning(
                submittedJobId
                  ? `Backtest đang chạy nền. Job ID: ${submittedJobId}. Retry với params nhỏ hơn hoặc disable Monte Carlo.`
                  : 'Backtest đang chạy nền. Retry với params nhỏ hơn hoặc disable Monte Carlo.',
              );
              finish();
            },
            onError: (err) => {
              if (ctrl.signal.aborted) return;
              if (resolved) return;
              resolved = true;
              reject(err);
            },
          },
          ctrl.signal,
        )
          .then((s) => {
            // Only claim streamRef if this submit's controller is still the active one.
            // Prevents a slow #1 from overwriting streamRef set by a rapid resubmit #2.
            if (ctrl.signal.aborted || abortRef.current !== ctrl) {
              s.close();
              return;
            }
            streamRef.current = s;
          })
          .catch((err) => {
            if (!resolved) {
              resolved = true;
              reject(err);
            }
          });

        ctrl.signal.addEventListener(
          'abort',
          () => {
            // Close THIS submit's stream (when .then has resolved by now), not whatever
            // streamRef currently points at — which may already belong to a newer submit.
            if (abortRef.current === ctrl) {
              streamRef.current?.close();
              streamRef.current = null;
            }
            if (!resolved) {
              resolved = true;
              resolve();
            }
          },
          { once: true },
        );
      });
    } catch (err) {
      if (ctrl.signal.aborted) return;

      if (err instanceof BacktestError) {
        if (err.status === 401) {
          router.push('/auth');
          return;
        }
        if (err.status === 402) {
          setShowInsufficientCredits(true);
          return;
        }
        if (err.status === 403) {
          setError({
            status: 403,
            message: 'Vibe-Trading service đang config — liên hệ support',
          });
          return;
        }
        setError({ status: err.status, message: err.message });
        return;
      }

      setError({ status: 503, message: err instanceof Error ? err.message : 'Unexpected error' });
    } finally {
      if (!ctrl.signal.aborted) {
        setIsExecuting(false);
        setIsPolling(false);
        setLoadingPhase(null);
        abortRef.current = null;
        streamRef.current = null;
      }
    }
  }, [content, router]);

  const isJsonValid = jsonError === null;
  // Story 5.3: button label progresses through SSE event phases
  let buttonLabel: string;
  if (!isExecuting) {
    buttonLabel = 'Run Backtest';
  } else if (!isPolling) {
    buttonLabel = 'Submitting...';
  } else if (loadingPhase === 'simulation_running') {
    buttonLabel = 'Running simulation...';
  } else if (loadingPhase === 'data_loading') {
    buttonLabel = 'Loading data...';
  } else {
    buttonLabel = 'Running...';
  }
  const showRetry = error?.status === 503 || error?.status === 500;

  return (
    <div className="flex flex-col gap-6">
      {/* Header row */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <h2 className="text-xl font-semibold">Strategy Editor</h2>
          {jsonError && (
            <span className="text-xs text-red-500 bg-red-50 dark:bg-red-900/20 px-2 py-1 rounded-md truncate max-w-xs">
              {jsonError}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setResetOpen(true)}
            disabled={isExecuting}
          >
            <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
            Reset
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={handleSubmit}
            disabled={isExecuting || !isJsonValid}
            className="min-w-[130px]"
          >
            {isExecuting ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" />
                {buttonLabel}
              </>
            ) : (
              buttonLabel
            )}
          </Button>
        </div>
      </div>

      {isExecuting && (
        <p className="text-xs text-muted-foreground -mt-4">
          Backtest typically takes 5–30s
        </p>
      )}

      {/* Insufficient credits banner */}
      {showInsufficientCredits && (
        <div className="rounded-lg border border-amber-200 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 p-4">
          <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
            Bạn cần thêm credits để chạy backtest
          </p>
          <Link
            href="/credits-explained"
            className="text-xs text-amber-700 dark:text-amber-400 underline underline-offset-2 mt-1 inline-block"
          >
            Xem credits →
          </Link>
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div className="rounded-lg border border-red-200 dark:border-red-700 bg-red-50 dark:bg-red-900/20 p-4 flex items-start justify-between gap-3">
          <p className="text-sm text-red-700 dark:text-red-400">{error.message}</p>
          {showRetry && (
            <Button variant="outline" size="sm" onClick={handleSubmit} className="flex-shrink-0">
              Retry
            </Button>
          )}
        </div>
      )}

      {/* Editor */}
      <div className="rounded-xl overflow-hidden border border-border" style={{ height: 480 }}>
        <CodeEditor
          content={content}
          fileName="backtest.json"
          language="json"
          onChange={handleChange}
          showHeader={false}
          readOnly={isExecuting}
          showLineNumbers
        />
      </div>

      <p className="text-xs text-muted-foreground -mt-4">
        Để chạy custom Python strategy, paste code vào{' '}
        <code className="font-mono bg-muted px-1 py-0.5 rounded text-xs">
          context_rules.executable_code
        </code>{' '}
        (string-escaped)
      </p>

      {/* Result placeholder */}
      {result && <BacktestResultVisualizer result={result} onRetry={handleSubmit} />}

      <AlertDialog open={resetOpen} onOpenChange={setResetOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset to default template?</AlertDialogTitle>
            <AlertDialogDescription>
              Your current edits will be lost. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleReset}>Reset</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
