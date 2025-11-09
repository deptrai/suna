/**
 * Side Panel Layout Component
 * 
 * Provides layout structure với header, content area, và footer.
 * Story 12.2: Side Panel Layout & Structure
 */

import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';

interface SidePanelLayoutProps {
  children: React.ReactNode;
  title?: string;
  onClose?: () => void;
  footerActions?: React.ReactNode;
}

export function SidePanelLayout({
  children,
  title = 'ChainLens Coin Analysis',
  onClose,
  footerActions,
}: SidePanelLayoutProps) {
  const handleClose = () => {
    if (onClose) {
      onClose();
    } else {
      // Default: Close side panel via Chrome API
      if (typeof chrome !== 'undefined' && chrome.sidePanel) {
        // Side panel can be closed by navigating away or using window.close()
        // However, chrome.sidePanel API doesn't have a direct close method
        // The side panel persists by default, so we'll use window.close() as fallback
        window.close();
      }
    }
  };

  return (
    <div className="flex flex-col h-screen w-full bg-background text-foreground">
      {/* Header - Fixed height */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-border bg-card shrink-0 h-14">
        <div className="flex items-center gap-3 min-w-0">
          {/* Logo/Icon placeholder - can be replaced with actual logo */}
          <div className="w-6 h-6 rounded bg-primary/10 flex items-center justify-center shrink-0">
            <span className="text-xs font-bold text-primary">CL</span>
          </div>
          <h1 className="text-lg font-semibold text-foreground truncate">{title}</h1>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleClose}
          className="h-8 w-8 shrink-0"
          title="Close side panel"
        >
          <X className="h-4 w-4" />
        </Button>
      </header>

      {/* Content Area - Scrollable, takes remaining space */}
      <main className="flex-1 overflow-y-auto overflow-x-hidden min-h-0">
        {children}
      </main>

      {/* Footer - Fixed height */}
      {footerActions && (
        <footer className="border-t border-border bg-card shrink-0 px-4 py-3 min-h-[60px] flex items-center">
          {footerActions}
        </footer>
      )}
    </div>
  );
}

