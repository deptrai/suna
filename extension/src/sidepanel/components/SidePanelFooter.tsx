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
}

export function SidePanelFooter({ onGenerateReport, actions }: SidePanelFooterProps) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        {actions}
      </div>
      <div className="flex items-center gap-2">
        {onGenerateReport && (
          <Button onClick={onGenerateReport} variant="default">
            Generate Full Report
          </Button>
        )}
      </div>
    </div>
  );
}

