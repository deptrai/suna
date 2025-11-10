/**
 * Side Panel Footer Component
 * 
 * Footer với action buttons for side panel.
 * Story 12.2: Side Panel Layout & Structure
 */

import { Button } from '@/components/ui/button';

interface SidePanelFooterProps {
  onGenerateReport?: () => void;
  actions?: React.ReactNode;
  isGeneratingReport?: boolean;
  reportError?: string | null;
}

export function SidePanelFooter({ 
  onGenerateReport, 
  actions, 
  isGeneratingReport = false,
  reportError 
}: SidePanelFooterProps) {
  return (
    <div className="flex flex-col gap-2">
      {reportError && (
        <div className="text-sm text-destructive bg-destructive/10 p-2 rounded-md">
          {reportError}
        </div>
      )}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {actions}
        </div>
        <div className="flex items-center gap-2">
          {onGenerateReport && (
            <Button 
              onClick={onGenerateReport} 
              variant="default"
              disabled={isGeneratingReport}
            >
              {isGeneratingReport ? 'Generating...' : 'Generate Full Report'}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

