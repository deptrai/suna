/**
 * Side Panel Entry Point
 * 
 * This is the main entry point for the side panel React application.
 * Story 12.2: Side Panel Layout & Structure
 * Story 12.4: React Query Integration
 */

import './sidepanel.css';
import { createRoot } from 'react-dom/client';
import { useState, useEffect, lazy, Suspense } from 'react';
import { SidePanelLayout } from './components/SidePanelLayout';
import { SidePanelContent } from './components/SidePanelContent';
import { SidePanelFooter } from './components/SidePanelFooter';
import { ReactQueryProvider } from './providers/ReactQueryProvider';
import { useCoinAnalysis } from './hooks/useCoinAnalysis';
import { useAuthState } from './hooks/useAuthState';
import { createSupabaseClient } from '../shared/supabase-extension';
import { generateReportViaApi, openReportInNewTab } from '../shared/report-extension';
import { handleApiError, isAuthenticationError } from '../shared/error-handler-extension';
import { Button } from '@/components/ui/button';
import type { CoinAnalysisData } from './components/CoinAnalysis';
import { logBrowserInfo } from '../shared/browser-compat';

// Lazy load heavy components for better initial load performance
const CoinAnalysis = lazy(() => import('./components/CoinAnalysis').then(module => ({ default: module.CoinAnalysis })));
const LoginForm = lazy(() => import('./components/LoginForm').then(module => ({ default: module.LoginForm })));
const ChatInterface = lazy(() => import('./components/ChatInterface').then(module => ({ default: module.ChatInterface })));

function SidePanelApp() {
  // Authentication state
  const { user, isLoading: authLoading } = useAuthState();
  
  const [coinInfo, setCoinInfo] = useState<{
    name?: string;
    symbol?: string;
    price?: number;
  }>({});

  // Report generation state
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);

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

  const handleGenerateReport = async () => {
    setIsGeneratingReport(true);
    setReportError(null);

    try {
      // Get coin info from current state hoặc analysis data
      const coinName = coinInfo.name || analysisData?.name;
      const symbol = coinInfo.symbol || analysisData?.symbol;
      const price = coinInfo.price || analysisData?.price;

      if (!coinName) {
        setReportError('No coin selected. Please select a coin to generate a report.');
        setIsGeneratingReport(false);
        return;
      }

      // Generate report URL via API (or local generation)
      const reportUrl = await generateReportViaApi({
        name: coinName,
        symbol,
        price,
      });

      // Open new tab với report URL
      await openReportInNewTab(reportUrl);
    } catch (error) {
      const errorMessage = error instanceof Error 
        ? error.message 
        : 'Failed to generate report. Please try again.';
      setReportError(errorMessage);
      console.error('Error generating report:', error);
    } finally {
      setIsGeneratingReport(false);
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

  const handleLogout = async () => {
    try {
      const supabase = await createSupabaseClient();
      await supabase.auth.signOut();
      // Auth state will update automatically via onAuthStateChange in useAuthState
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  // Format error message for display using error handler
  const errorMessage = queryError
    ? (() => {
        try {
          const errorObj = queryError instanceof Error ? queryError : new Error(String(queryError));
          const errorInfo = handleApiError(errorObj, { operation: 'analyze coin' });
          return errorInfo.userMessage;
        } catch {
          return queryError instanceof Error ? queryError.message : 'Analysis failed';
        }
      })()
    : null;

  // Show loading state while checking auth
  if (authLoading) {
    return (
      <SidePanelLayout title="ChainLens Coin Analysis" onClose={handleClose}>
        <SidePanelContent>
          <div className="flex items-center justify-center h-full min-h-[400px]">
            <div className="text-muted-foreground">Loading...</div>
          </div>
        </SidePanelContent>
      </SidePanelLayout>
    );
  }

  // Show login form if not authenticated
  if (!user) {
    return (
      <SidePanelLayout title="ChainLens Coin Analysis" onClose={handleClose}>
        <SidePanelContent>
          <Suspense fallback={
            <div className="flex items-center justify-center min-h-[400px]">
              <div className="text-sm text-muted-foreground">Loading...</div>
            </div>
          }>
            <LoginForm onLoginSuccess={() => {
              // Auth state will update automatically via useAuthState hook
            }} />
          </Suspense>
        </SidePanelContent>
      </SidePanelLayout>
    );
  }

  // Show authenticated content - Chat Interface (Story 15.1)
  return (
    <Suspense fallback={
      <SidePanelLayout title="ChainLens Coin Analysis" onClose={handleClose}>
        <SidePanelContent>
          <div className="flex items-center justify-center min-h-[400px]">
            <div className="text-sm text-muted-foreground">Loading chat interface...</div>
          </div>
        </SidePanelContent>
      </SidePanelLayout>
    }>
      <ChatInterface
        onClose={handleClose}
        coinInfo={coinInfo.name ? coinInfo : undefined}
      />
    </Suspense>
  );
}

function SidePanelAppWithProvider() {
  // Measure initial load time for performance monitoring
  useEffect(() => {
    // Log browser compatibility info (Story 14.4)
    logBrowserInfo();
    
    const loadStartTime = performance.now();
    return () => {
      const loadTime = performance.now() - loadStartTime;
      if (loadTime > 2000) {
        console.warn(`[Performance] Side panel load time: ${loadTime.toFixed(2)}ms (target: < 2000ms)`);
      } else {
        console.log(`[Performance] Side panel load time: ${loadTime.toFixed(2)}ms`);
      }
    };
  }, []);

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


