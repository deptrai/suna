/**
 * Side Panel Entry Point
 * 
 * This is the main entry point for the side panel React application.
 * Story 12.2: Side Panel Layout & Structure
 * Story 12.4: React Query Integration
 */

import './sidepanel.css';
import { createRoot } from 'react-dom/client';
import { useState, useEffect } from 'react';
import { SidePanelLayout } from './components/SidePanelLayout';
import { SidePanelContent } from './components/SidePanelContent';
import { SidePanelFooter } from './components/SidePanelFooter';
import { CoinAnalysis, type CoinAnalysisData } from './components/CoinAnalysis';
import { ReactQueryProvider } from './providers/ReactQueryProvider';
import { useCoinAnalysis } from './hooks/useCoinAnalysis';

function SidePanelApp() {
  const [coinInfo, setCoinInfo] = useState<{
    name?: string;
    symbol?: string;
    price?: number;
  }>({});

  // Listen for messages from background worker với coin info
  useEffect(() => {
    const handleMessage = (message: any) => {
      if (message.type === 'COIN_SELECTED') {
        // Update coin info when coin is selected
        setCoinInfo({
          name: message.coinInfo?.name,
          symbol: message.coinInfo?.symbol,
          price: message.coinInfo?.price,
        });
      }
    };

    // Listen for messages from background worker
    chrome.runtime.onMessage.addListener(handleMessage);

    // Check for stored coin info on mount (from chrome.storage)
    chrome.storage.local.get(['coinInfo'], (result) => {
      if (result.coinInfo) {
        setCoinInfo({
          name: result.coinInfo.name,
          symbol: result.coinInfo.symbol,
          price: result.coinInfo.price,
        });
      }
    });

    return () => {
      chrome.runtime.onMessage.removeListener(handleMessage);
    };
  }, []);

  // Use React Query hook for coin analysis
  const {
    data: analysisData,
    isLoading,
    error: queryError,
    refetchAnalysis,
  } = useCoinAnalysis(coinInfo.name, coinInfo.symbol, coinInfo.price, {
    enabled: Boolean(coinInfo.name),
  });

  /**
   * Generate report URL với coin context
   */
  const generateReportUrl = (coinName?: string, symbol?: string): string => {
    // Base URL for reports - defaults to production, can be overridden
    // In production: https://chainlens.so
    // In development: http://localhost:3000
    const baseUrl = typeof window !== 'undefined' && window.location.hostname === 'localhost'
      ? 'http://localhost:3000'
      : 'https://chainlens.so';
    const reportPath = '/reports';
    
    const url = new URL(reportPath, baseUrl);
    
    // Add coin context as query parameters
    if (coinName) {
      url.searchParams.set('coinName', coinName);
    }
    if (symbol) {
      url.searchParams.set('symbol', symbol);
    }
    
    return url.toString();
  };

  const handleGenerateReport = async () => {
    try {
      // Get coin info from current state hoặc analysis data
      const coinName = coinInfo.name || analysisData?.name;
      const symbol = coinInfo.symbol || analysisData?.symbol;

      if (!coinName) {
        // Show error if no coin selected
        console.error('No coin selected for report generation');
        // Could show a toast/notification here
        return;
      }

      // Construct report URL với coin context
      const reportUrl = generateReportUrl(coinName, symbol);

      // Open new tab với report URL
      try {
        await chrome.tabs.create({
          url: reportUrl,
          active: true,
        });
      } catch (error) {
        console.error('Failed to open report tab:', error);
        // Fallback: try opening in current window
        window.open(reportUrl, '_blank');
      }
    } catch (error) {
      console.error('Error generating report:', error);
      // Could show error message to user here
    }
  };

  const handleClose = () => {
    // Close side panel
    if (typeof chrome !== 'undefined' && chrome.sidePanel) {
      // Side panel persists by default, so we'll use window.close() as fallback
      window.close();
    }
  };

  const handleRetry = () => {
    // Retry analysis using React Query refetch
    refetchAnalysis();
  };

  // Format error message for display
  const errorMessage = queryError
    ? queryError instanceof Error
      ? queryError.message
      : 'Analysis failed'
    : null;

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
        {coinInfo.name || isLoading || errorMessage ? (
          <CoinAnalysis
            data={analysisData}
            isLoading={isLoading}
            error={errorMessage}
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

function SidePanelAppWithProvider() {
  return (
    <ReactQueryProvider>
      <SidePanelApp />
    </ReactQueryProvider>
  );
}

// Mount React app
const container = document.getElementById('extension-root');
if (!container) {
  throw new Error('Root element #extension-root not found');
}

const root = createRoot(container);
root.render(<SidePanelAppWithProvider />);


