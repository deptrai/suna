'use client';

/**
 * OcVibeTradingSwarmToolView — UI for the `vibe_trading_swarm` OpenCode tool
 * (Story 5.5.1). Parses the wrapper's stdout (progress lines + final markdown
 * report) into a progress strip + report block.
 *
 * Falls back gracefully when stdout doesn't match the expected format
 * (e.g. error JSON from the wrapper's early-exit paths).
 */

import { useMemo } from 'react';
import { Bot, Loader2, CheckCircle2, XCircle, Ban } from 'lucide-react';
import type { ComponentType } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface SwarmProgressLine {
  raw: string;
  kind: 'start' | 'progress' | 'cancelled' | 'error' | 'other';
  agentsDone?: number;
  agentsTotal?: number;
  runId?: string;
}

interface ParsedSwarm {
  lines: SwarmProgressLine[];
  report?: string;
  errorJson?: { success: false; error: string };
}

/**
 * Parse wrapper output. Three shapes:
 *   1. Error JSON early-exit: `{"success":false,"error":"..."}`
 *   2. Progress + `---` + final report markdown
 *   3. Progress only (e.g. cancelled, no report)
 */
function parseSwarmOutput(output: string): ParsedSwarm {
  if (!output) return { lines: [] };

  // Case 1: error JSON
  const trimmed = output.trim();
  if (trimmed.startsWith('{')) {
    try {
      const obj = JSON.parse(trimmed);
      if (obj && obj.success === false && typeof obj.error === 'string') {
        return { lines: [], errorJson: obj };
      }
    } catch {
      // fall through to text parsing
    }
  }

  // Case 2/3: text. Split on `---` to separate progress from report.
  const sepIdx = output.indexOf('\n---\n');
  const progressText = sepIdx >= 0 ? output.slice(0, sepIdx) : output;
  const reportText = sepIdx >= 0 ? output.slice(sepIdx + 5).trim() : undefined;

  const lines: SwarmProgressLine[] = [];
  for (const rawLine of progressText.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith('▶️')) {
      // ▶️ Swarm started: <preset> (run_id: <id>...)
      const idMatch = line.match(/run_id:\s*([a-zA-Z0-9-]+)/);
      lines.push({ raw: line, kind: 'start', runId: idMatch?.[1] });
    } else if (line.startsWith('⏳')) {
      // ⏳ N/M agents complete
      const m = line.match(/(\d+)\s*\/\s*(\d+)/);
      lines.push({
        raw: line,
        kind: 'progress',
        agentsDone: m ? Number(m[1]) : undefined,
        agentsTotal: m ? Number(m[2]) : undefined,
      });
    } else if (line.startsWith('🛑')) {
      lines.push({ raw: line, kind: 'cancelled' });
    } else if (line.startsWith('❌')) {
      lines.push({ raw: line, kind: 'error' });
    } else {
      lines.push({ raw: line, kind: 'other' });
    }
  }

  return { lines, report: reportText && reportText.length > 0 ? reportText : undefined };
}

interface ToolPart {
  state: {
    input?: Record<string, unknown>;
    output?: string;
    status?: string;
    raw?: string;
  } & Record<string, unknown>;
}

interface ToolProps {
  part: ToolPart;
  defaultOpen?: boolean;
  forceOpen?: boolean;
  locked?: boolean;
}

export function OcVibeTradingSwarmToolView({ part }: ToolProps) {
  const status = (part.state.status as string) ?? 'unknown';
  const output = (part.state.output as string) ?? '';
  const input = part.state.input ?? {};
  const preset = (input.preset as string) ?? '';
  const isRunning = status === 'running' || status === 'pending';

  const parsed = useMemo(() => parseSwarmOutput(output), [output]);
  const latestProgress = parsed.lines.findLast?.((l) => l.kind === 'progress') ??
    [...parsed.lines].reverse().find((l) => l.kind === 'progress');
  const hasError = parsed.errorJson != null || parsed.lines.some((l) => l.kind === 'error');
  const wasCancelled = parsed.lines.some((l) => l.kind === 'cancelled');

  return (
    <div className="rounded-lg border border-border/60 bg-card/50 overflow-hidden">
      {/* Header */}
      <div className="px-3 py-2 border-b border-border/40 bg-muted/30 flex items-center gap-2">
        <Bot className="size-4 text-violet-500" />
        <span className="text-sm font-medium">Swarm: {preset || 'unknown preset'}</span>
        <div className="ml-auto flex items-center gap-1.5">
          {isRunning && <Loader2 className="size-3.5 animate-spin text-muted-foreground" />}
          {!isRunning && parsed.report && !hasError && (
            <span className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400 inline-flex items-center gap-1">
              <CheckCircle2 className="size-3" /> Done
            </span>
          )}
          {!isRunning && wasCancelled && (
            <span className="text-[10px] font-medium text-amber-600 dark:text-amber-400 inline-flex items-center gap-1">
              <Ban className="size-3" /> Cancelled
            </span>
          )}
          {!isRunning && hasError && (
            <span className="text-[10px] font-medium text-red-600 dark:text-red-400 inline-flex items-center gap-1">
              <XCircle className="size-3" /> Error
            </span>
          )}
        </div>
      </div>

      {/* Progress strip */}
      {parsed.lines.length > 0 && (
        <div className="px-3 py-2 border-b border-border/40 space-y-1">
          {parsed.lines.map((line, i) => (
            <div key={i} className="text-[12px] font-mono text-foreground/80">
              {line.raw}
            </div>
          ))}
          {latestProgress?.agentsTotal && latestProgress.agentsTotal > 0 && (
            <div className="mt-1.5">
              <div className="h-1 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-violet-500 transition-all"
                  style={{
                    width: `${Math.round(((latestProgress.agentsDone ?? 0) / latestProgress.agentsTotal) * 100)}%`,
                  }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Error JSON fallback */}
      {parsed.errorJson && (
        <div className="px-3 py-2 text-[12px] text-red-600 dark:text-red-400 font-mono">
          {parsed.errorJson.error}
        </div>
      )}

      {/* Final report */}
      {parsed.report && (
        <div className="px-3 py-2.5 max-h-[480px] overflow-auto prose prose-sm dark:prose-invert max-w-none">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{parsed.report}</ReactMarkdown>
        </div>
      )}

      {/* Fallback: no parsed content yet */}
      {parsed.lines.length === 0 && !parsed.errorJson && !parsed.report && (
        <div className="px-3 py-2.5 text-[12px] text-muted-foreground italic">
          {isRunning ? 'Swarm starting…' : 'No output yet.'}
        </div>
      )}
    </div>
  );
}

OcVibeTradingSwarmToolView.displayName = 'OcVibeTradingSwarmToolView';

// Export the type to match the inline registration pattern.
export type OcVibeTradingSwarmToolViewType = ComponentType<ToolProps>;
