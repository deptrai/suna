/**
 * Side Panel Entry Point
 * 
 * This is the main entry point for the side panel React application.
 * Story 12.2: Side Panel Layout & Structure
 */

import './sidepanel.css';
import { createRoot } from 'react-dom/client';
import { useState, useEffect } from 'react';
import { SidePanelLayout } from './components/SidePanelLayout';
import { SidePanelContent } from './components/SidePanelContent';
import { SidePanelFooter } from './components/SidePanelFooter';
import { CoinAnalysis, type CoinAnalysisData } from './components/CoinAnalysis';

function SidePanelApp() {
  const [analysisData, setAnalysisData] = useState<CoinAnalysisData | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Listen for messages from background worker với coin info
  useEffect(() => {
    const handleMessage = (message: any) => {
      if (message.type === 'COIN_ANALYSIS_DATA') {
        setAnalysisData(message.data);
        setIsLoading(false);
        setError(null);
      } else if (message.type === 'COIN_ANALYSIS_LOADING') {
        setIsLoading(true);
        setError(null);
      } else if (message.type === 'COIN_ANALYSIS_ERROR') {
        setError(message.error || 'Analysis failed');
        setIsLoading(false);
      }
    };

    // Listen for messages from background worker
    chrome.runtime.onMessage.addListener(handleMessage);

    // Check for stored coin info on mount (from chrome.storage)
    chrome.storage.local.get(['coinInfo', 'analysisData'], (result) => {
      if (result.coinInfo) {
        // Set initial coin info (will trigger analysis in Story 12.4)
        setAnalysisData({
          name: result.coinInfo.name,
          symbol: result.coinInfo.symbol,
          price: result.coinInfo.price,
        });
      }
      if (result.analysisData) {
        setAnalysisData(result.analysisData);
        setIsLoading(false);
        setError(null);
      }
    });

    return () => {
      chrome.runtime.onMessage.removeListener(handleMessage);
    };
  }, []);

  const handleGenerateReport = () => {
    // Placeholder: Will be implemented in future stories
    console.log('Generate report clicked', analysisData);
  };

  const handleClose = () => {
    // Close side panel
    if (typeof chrome !== 'undefined' && chrome.sidePanel) {
      // Side panel persists by default, so we'll use window.close() as fallback
      window.close();
    }
  };

  const handleRetry = () => {
    // Retry analysis (will be implemented in Story 12.4)
    setError(null);
    setIsLoading(true);
    // Trigger analysis retry
    chrome.runtime.sendMessage({ type: 'RETRY_ANALYSIS' });
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
        {analysisData || isLoading || error ? (
          <CoinAnalysis
            data={analysisData}
            isLoading={isLoading}
            error={error}
            onRetry={handleRetry}
          />
        ) : (
          // Empty state - no coin selected yet
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
        )}
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


