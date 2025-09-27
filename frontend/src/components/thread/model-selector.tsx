'use client';

import React, { useState, useMemo } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuPortal,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Cpu, Check, ChevronDown, ExternalLink, Loader2, Brain } from 'lucide-react';
import type { ModelOption } from '@/hooks/use-model-selection';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

export type SubscriptionStatus = 'no_subscription' | 'active';

type ModelSelectorProps = {
  selectedModel: string;
  onModelChange: (modelId: string) => void;
  modelOptions: ModelOption[];
  subscriptionStatus: SubscriptionStatus;
  canAccessModel: (modelId: string) => boolean;
  refreshCustomModels?: () => void;
  onUpgradeRequest?: () => void;
  className?: string;
  compact?: boolean;
};

export const ModelSelector: React.FC<ModelSelectorProps> = ({
  selectedModel,
  onModelChange,
  modelOptions,
  canAccessModel,
  subscriptionStatus,
  onUpgradeRequest,
  className,
  compact = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);

  // Group models by provider
  const groupedModels = useMemo(() => {
    const groups: Record<string, ModelOption[]> = {};
    
    modelOptions.forEach((model) => {
      const provider = model.provider || 'Other';
      if (!groups[provider]) {
        groups[provider] = [];
      }
      groups[provider].push(model);
    });

    // Sort models within each group by priority (higher first) then by name
    Object.keys(groups).forEach(provider => {
      groups[provider].sort((a, b) => {
        if (a.priority !== b.priority) {
          return (b.priority || 0) - (a.priority || 0);
        }
        return a.name.localeCompare(b.name);
      });
    });

    return groups;
  }, [modelOptions]);

  // Find selected model info
  const selectedModelInfo = modelOptions.find(m => m.id === selectedModel);
  const isAutoMode = selectedModel?.includes('Auto') || selectedModel?.includes('🤖');

  const handleModelSelect = (modelId: string) => {
    onModelChange(modelId);
    setIsOpen(false);
  };

  const getModelDisplayName = (model: ModelOption) => {
    if (model.recommended) {
      return `${model.name} (Recommended)`;
    }
    return model.name;
  };

  const getModelIcon = (model: ModelOption) => {
    if (model.name.includes('Auto') || model.name.includes('🤖')) {
      return <Brain className="w-4 h-4 text-blue-500" />;
    }
    return <Cpu className="w-4 h-4" />;
  };

  const renderModelItem = (model: ModelOption) => {
    const hasAccess = canAccessModel(model.id);
    const isSelected = selectedModel === model.id;

    return (
      <DropdownMenuItem
        key={model.id}
        onClick={() => hasAccess && handleModelSelect(model.id)}
        className={cn(
          "flex items-center justify-between gap-2 px-3 py-2 cursor-pointer",
          !hasAccess && "opacity-50 cursor-not-allowed",
          isSelected && "bg-accent",
          model.recommended && "border-l-2 border-l-blue-500"
        )}
        disabled={!hasAccess}
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {getModelIcon(model)}
          <div className="flex flex-col min-w-0">
            <span className={cn(
              "text-sm font-medium truncate",
              model.recommended && "text-blue-600 dark:text-blue-400"
            )}>
              {getModelDisplayName(model)}
            </span>
            {model.description && (
              <span className="text-xs text-muted-foreground truncate">
                {model.description}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {model.recommended && (
            <span className="text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 px-1.5 py-0.5 rounded">
              Recommended
            </span>
          )}
          {isSelected && <Check className="w-4 h-4 text-green-500" />}
          {!hasAccess && subscriptionStatus === 'no_subscription' && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <ExternalLink className="w-3 h-3 text-muted-foreground" />
                </TooltipTrigger>
                <TooltipContent>
                  <p>Upgrade required</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      </DropdownMenuItem>
    );
  };

  return (
    <div className={cn("flex items-center", className)}>
      <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size={compact ? "sm" : "default"}
            className={cn(
              "flex items-center gap-2 min-w-0 max-w-[200px]",
              isAutoMode && "border-blue-200 bg-blue-50 dark:bg-blue-950/30 dark:border-blue-800"
            )}
          >
            {selectedModelInfo ? getModelIcon(selectedModelInfo) : <Cpu className="w-4 h-4" />}
            <span className="truncate text-sm">
              {selectedModelInfo ? selectedModelInfo.name : 'Select Model'}
            </span>
            <ChevronDown className="w-4 h-4 flex-shrink-0" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent 
          align="start" 
          className="w-80 max-h-96 overflow-y-auto"
          sideOffset={4}
        >
          {Object.entries(groupedModels).map(([provider, models]) => (
            <div key={provider}>
              {Object.keys(groupedModels).length > 1 && (
                <>
                  <div className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    {provider}
                  </div>
                  <DropdownMenuSeparator />
                </>
              )}
              {models.map(renderModelItem)}
              {Object.keys(groupedModels).length > 1 && <DropdownMenuSeparator />}
            </div>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
};
