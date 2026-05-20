'use client';

import * as React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { BacktestStrategyEditorClient } from './strategy-editor';
import { MultiBacktestStrategyEditorClient } from './multi-strategy-editor';
import { shouldCloseContextualModal, shouldRemountEditor } from './contextual-backtest-modal.utils';
import type { RunResponse } from '@/lib/backtest-api';

interface ContextualBacktestModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialCode?: string;
  initialAsset?: string;
  initialTimeframe?: string;
  initialResult?: RunResponse | null;
  onResult?: (result: RunResponse | null) => void;
}

export function ContextualBacktestModal({
  open,
  onOpenChange,
  initialCode,
  initialAsset,
  initialTimeframe,
  initialResult,
  onResult,
}: ContextualBacktestModalProps) {
  // Remount editor only when the source code changes — preserves user edits across re-opens
  const [editorKey, setEditorKey] = React.useState(0);
  const prevCodeRef = React.useRef<string | undefined>(initialCode);
  const [isExecuting, setIsExecuting] = React.useState(false);
  const [mode, setMode] = React.useState<'single' | 'multi'>('single');

  React.useEffect(() => {
    if (shouldRemountEditor(prevCodeRef.current, initialCode)) {
      setEditorKey((prev) => prev + 1);
      prevCodeRef.current = initialCode;
    }
  }, [initialCode]);

  const handleOpenChange = React.useCallback(
    (next: boolean) => {
      // Block accidental dismiss while a backtest is executing — would abort the SSE stream
      const allowed = shouldCloseContextualModal(next, isExecuting, () =>
        window.confirm('A backtest is currently running. Close anyway and abort the run?'),
      );
      if (!allowed) {
        return;
      }
      onOpenChange(next);
    },
    [isExecuting, onOpenChange],
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-6xl w-[95vw] max-h-[95vh] h-[90vh] flex flex-col p-0 overflow-hidden bg-background border-border/50">
        <DialogHeader className="px-6 py-4 border-b border-white/5 flex-shrink-0">
          <DialogTitle className="text-xl flex items-center gap-2">
            <span className="text-violet-400">⚡</span> Contextual Backtest
          </DialogTitle>
          <DialogDescription>
            Review, edit, and run this strategy directly in the Vibe Sandbox.
          </DialogDescription>
          <div className="flex items-center gap-2 pt-2">
            <Button
              type="button"
              size="sm"
              variant={mode === 'single' ? 'default' : 'outline'}
              onClick={() => setMode('single')}
            >
              Single Strategy
            </Button>
            <Button
              type="button"
              size="sm"
              variant={mode === 'multi' ? 'default' : 'outline'}
              onClick={() => setMode('multi')}
            >
              Multi Strategy
            </Button>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {mode === 'single' ? (
            <BacktestStrategyEditorClient
              key={editorKey}
              initialCode={initialCode}
              initialAsset={initialAsset}
              initialTimeframe={initialTimeframe}
              onExecutingChange={setIsExecuting}
              initialResult={initialResult}
              onResult={onResult}
            />
          ) : (
            <MultiBacktestStrategyEditorClient
              initialCode={initialCode}
              initialAsset={initialAsset}
              initialTimeframe={initialTimeframe}
              onExecutingChange={setIsExecuting}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
