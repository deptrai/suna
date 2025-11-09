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
    <div className="flex items-center justify-end gap-2">
      {actions || (
        <>
          {onGenerateReport && (
            <Button onClick={onGenerateReport} variant="default">
              Generate Full Report
            </Button>
          )}
        </>
      )}
    </div>
  );
}

