'use client';

import React from 'react';
import { AgentModelSelector } from '@/components/agents/config/model-selector';
import { useModelSelection } from '@/hooks/use-model-selection';
import { Brain } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ExternalModelSelectorProps {
  className?: string;
  compact?: boolean;
}

export function ExternalModelSelector({ 
  className,
  compact = false 
}: ExternalModelSelectorProps) {
  const { 
    selectedModel, 
    handleModelChange,
    isAutoMode,
    getCostSavingsText 
  } = useModelSelection();

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {/* Model Selector */}
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-muted-foreground min-w-0 flex-shrink-0">
          Model:
        </span>
        <div className="flex-1 min-w-0">
          <AgentModelSelector
            value={selectedModel}
            onChange={handleModelChange}
            disabled={false}
            variant="default"
            className="w-full"
          />
        </div>
      </div>

      {/* Auto Mode Indicator */}
      {isAutoMode && isAutoMode(selectedModel) && (
        <div className="flex items-center gap-2 text-xs text-blue-600 bg-blue-50 dark:bg-blue-950/30 dark:text-blue-400 px-3 py-2 rounded-lg border border-blue-200 dark:border-blue-800">
          <Brain className="w-3 h-3 flex-shrink-0" />
          <span className="flex-1 min-w-0">
            🤖 AI chọn model tối ưu • {getCostSavingsText && getCostSavingsText(selectedModel)}
          </span>
        </div>
      )}
    </div>
  );
}
