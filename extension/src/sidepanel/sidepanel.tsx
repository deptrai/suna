/**
 * Side Panel Entry Point
 * 
 * This is the main entry point for the side panel React application.
 * Story 12.2: Side Panel Layout & Structure
 */

import './sidepanel.css';
import { createRoot } from 'react-dom/client';
import { SidePanelLayout } from './components/SidePanelLayout';
import { SidePanelContent } from './components/SidePanelContent';
import { SidePanelFooter } from './components/SidePanelFooter';
import { Button } from '@/components/ui/button';

function SidePanelApp() {
  const handleGenerateReport = () => {
    // Placeholder: Will be implemented in future stories
    console.log('Generate report clicked');
  };

  const handleClose = () => {
    // Close side panel
    if (typeof chrome !== 'undefined' && chrome.sidePanel) {
      // Side panel persists by default, so we'll use window.close() as fallback
      window.close();
    }
  };

  return (
    <SidePanelLayout
      title="ChainLens Coin Analysis"
      onClose={handleClose}
      footerActions={
        <SidePanelFooter
          onGenerateReport={handleGenerateReport}
        />
      }
    >
      <SidePanelContent>
        {/* Placeholder content - will be replaced with analysis results in future stories */}
        <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-center text-muted-foreground">
          <div className="space-y-4">
            <div className="w-16 h-16 mx-auto bg-muted rounded-full flex items-center justify-center">
              <span className="text-2xl">🔍</span>
            </div>
            <div>
              <h2 className="text-xl font-semibold text-foreground mb-2">
                Ready for Analysis
              </h2>
              <p className="text-sm">
                Click on a coin name on any crypto website to start analysis.
              </p>
            </div>
          </div>
        </div>
      </SidePanelContent>
    </SidePanelLayout>
  );
}

// Mount React app
const container = document.getElementById('extension-root');
if (!container) {
  throw new Error('Root element #extension-root not found');
}

const root = createRoot(container);
root.render(<SidePanelApp />);


