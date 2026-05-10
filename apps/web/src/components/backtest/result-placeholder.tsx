'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { CodeEditor } from '@/components/file-editors/code-editor';
import type { RunResponse } from '@/lib/backtest-api';

interface BacktestResultPlaceholderProps {
  result: RunResponse;
}

export function BacktestResultPlaceholder({ result }: BacktestResultPlaceholderProps) {
  const [open, setOpen] = useState(true);
  const content = JSON.stringify(result, null, 2);

  return (
    // TODO(Story 5.3): replace with KPI cards + Equity Curve chart
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex items-center gap-2 text-sm font-semibold text-foreground/90 hover:text-foreground transition-colors mb-2">
        {open ? (
          <ChevronDown className="h-4 w-4" />
        ) : (
          <ChevronRight className="h-4 w-4" />
        )}
        Backtest Results
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="h-64 rounded-lg overflow-hidden border border-border">
          <CodeEditor
            content={content}
            fileName="result.json"
            language="json"
            readOnly
            showHeader={false}
            showLineNumbers
          />
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
