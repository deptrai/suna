/**
 * Coin Analysis Component
 * 
 * Displays coin analysis results với name, price, sentiment, và risk score.
 * Story 12.3: Analysis Results Display Component
 */

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AlertCircle, TrendingUp, TrendingDown, Minus, RefreshCw, LogIn } from 'lucide-react';
import { handleApiError, type ErrorRecovery } from '../../shared/error-handler-extension';

export interface CoinAnalysisData {
  name: string;
  symbol?: string;
  price?: number;
  priceChange24h?: number;
  sentiment?: number; // -1 to 1
  sentimentTrend?: 'positive' | 'negative' | 'neutral';
  riskScore?: number; // 0-100 (lower is better)
}

export interface CoinAnalysisProps {
  data?: CoinAnalysisData;
  isLoading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  onLogin?: () => void;
}

/**
 * Format price với currency symbol
 */
function formatPrice(price: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 8,
  }).format(price);
}

/**
 * Format price change percentage
 */
function formatPriceChange(change: number): string {
  const sign = change >= 0 ? '+' : '';
  return `${sign}${change.toFixed(2)}%`;
}

/**
 * Get sentiment label và color
 */
function getSentimentInfo(sentiment: number, trend?: 'positive' | 'negative' | 'neutral') {
  // Use trend if available, otherwise calculate from sentiment
  if (trend) {
    switch (trend) {
      case 'positive':
        return { label: 'Positive', color: 'bg-green-500', textColor: 'text-green-700 dark:text-green-400', icon: TrendingUp };
      case 'negative':
        return { label: 'Negative', color: 'bg-red-500', textColor: 'text-red-700 dark:text-red-400', icon: TrendingDown };
      case 'neutral':
        return { label: 'Neutral', color: 'bg-gray-500', textColor: 'text-gray-700 dark:text-gray-400', icon: Minus };
    }
  }

  // Calculate from sentiment value (-1 to 1)
  if (sentiment > 0.2) {
    return { label: 'Positive', color: 'bg-green-500', textColor: 'text-green-700 dark:text-green-400', icon: TrendingUp };
  } else if (sentiment < -0.2) {
    return { label: 'Negative', color: 'bg-red-500', textColor: 'text-red-700 dark:text-red-400', icon: TrendingDown };
  } else {
    return { label: 'Neutral', color: 'bg-gray-500', textColor: 'text-gray-700 dark:text-gray-400', icon: Minus };
  }
}

/**
 * Get risk score label và color
 */
function getRiskScoreInfo(riskScore: number) {
  // Lower is better (0-100)
  if (riskScore <= 30) {
    return { label: 'Low Risk', color: 'bg-green-500', textColor: 'text-green-700 dark:text-green-400', level: 'low' };
  } else if (riskScore <= 60) {
    return { label: 'Medium Risk', color: 'bg-yellow-500', textColor: 'text-yellow-700 dark:text-yellow-400', level: 'medium' };
  } else {
    return { label: 'High Risk', color: 'bg-red-500', textColor: 'text-red-700 dark:text-red-400', level: 'high' };
  }
}

/**
 * Simple Skeleton component for extension
 */
function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={`animate-pulse bg-muted rounded ${className || ''}`}
    />
  );
}

/**
 * Loading state component
 */
function LoadingState() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-4 w-24 mt-2" />
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-8 w-32" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-6 w-20" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-6 w-24" />
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Error state component với error recovery options
 */
function ErrorState({ 
  error, 
  onRetry,
  onLogin,
}: { 
  error: string | null; 
  onRetry?: () => void;
  onLogin?: () => void;
}) {
  // Parse error để get recovery options
  let errorMessage = error || 'An error occurred while analyzing the coin.';
  let recoveryOptions: ErrorRecovery[] = [];
  
  if (error) {
    try {
      // error is string | null, so we need to convert to Error
      const errorObj: Error = typeof error === 'string' ? new Error(error) : new Error(String(error));
      const errorInfo = handleApiError(errorObj, { operation: 'analyze coin' });
      errorMessage = errorInfo.userMessage;
      recoveryOptions = errorInfo.recovery || [];
    } catch {
      // If error parsing fails, use original error message
    }
  }

  const hasRetry = recoveryOptions.some(r => r.action === 'retry') || onRetry;
  const hasLogin = recoveryOptions.some(r => r.action === 'login') || onLogin;

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex flex-col items-center justify-center text-center space-y-4 py-8">
          <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/20 flex items-center justify-center">
            <AlertCircle className="h-6 w-6 text-red-600 dark:text-red-400" />
          </div>
          <div className="space-y-2">
            <h3 className="text-lg font-semibold text-foreground">Analysis Failed</h3>
            <p className="text-sm text-muted-foreground max-w-md">
              {errorMessage}
            </p>
          </div>
          <div className="flex gap-2 mt-4">
            {hasRetry && (
              <Button
                onClick={onRetry}
                variant="default"
                size="sm"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Retry
              </Button>
            )}
            {hasLogin && (
              <Button
                onClick={onLogin}
                variant="outline"
                size="sm"
              >
                <LogIn className="h-4 w-4 mr-2" />
                Sign In
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Coin Analysis Component
 */
export function CoinAnalysis({ data, isLoading = false, error = null, onRetry, onLogin }: CoinAnalysisProps) {
  // Loading state
  if (isLoading) {
    return <LoadingState />;
  }

  // Error state (only if error is explicitly provided)
  if (error) {
    return <ErrorState error={error} onRetry={onRetry} onLogin={onLogin} />;
  }

  // No data state
  if (!data) {
    return null; // Let parent handle empty state
  }

  // Success state - display analysis results
  const sentimentInfo = data.sentiment !== undefined 
    ? getSentimentInfo(data.sentiment, data.sentimentTrend)
    : null;
  const riskScoreInfo = data.riskScore !== undefined 
    ? getRiskScoreInfo(data.riskScore)
    : null;
  const SentimentIcon = sentimentInfo?.icon || Minus;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-2xl font-bold">
          {data.name}
          {data.symbol && (
            <span className="ml-2 text-lg font-normal text-muted-foreground">
              ({data.symbol})
            </span>
          )}
        </CardTitle>
        <CardDescription>Coin Analysis Results</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Price Section */}
        {data.price !== undefined && (
          <div className="space-y-2">
            <div className="text-sm font-medium text-muted-foreground">Current Price</div>
            <div className="flex items-baseline gap-3">
              <div className="text-3xl font-bold text-foreground">
                {formatPrice(data.price)}
              </div>
              {data.priceChange24h !== undefined && (
                <Badge
                  variant={data.priceChange24h >= 0 ? 'default' : 'destructive'}
                  className="text-sm"
                >
                  {formatPriceChange(data.priceChange24h)}
                </Badge>
              )}
            </div>
          </div>
        )}

        {/* Sentiment Section */}
        {sentimentInfo && (
          <div className="space-y-2">
            <div className="text-sm font-medium text-muted-foreground">Sentiment</div>
            <div className="flex items-center gap-3">
              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full ${sentimentInfo.textColor} bg-opacity-10`}>
                <SentimentIcon className="h-4 w-4" />
                <span className="text-sm font-medium">{sentimentInfo.label}</span>
              </div>
              {data.sentiment !== undefined && (
                <div className="text-sm text-muted-foreground">
                  ({data.sentiment.toFixed(2)})
                </div>
              )}
            </div>
          </div>
        )}

        {/* Risk Score Section */}
        {riskScoreInfo && data.riskScore !== undefined && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium text-muted-foreground">Risk Score</div>
              <Badge
                variant={riskScoreInfo.level === 'low' ? 'default' : riskScoreInfo.level === 'medium' ? 'secondary' : 'destructive'}
                className="text-sm"
              >
                {riskScoreInfo.label}
              </Badge>
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Score: {data.riskScore.toFixed(1)}</span>
                <span className="text-muted-foreground">/ 100</span>
              </div>
              <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-300 ${riskScoreInfo.color} rounded-full`}
                  style={{ width: `${Math.min(data.riskScore, 100)}%` }}
                />
              </div>
              <div className="text-xs text-muted-foreground">
                {riskScoreInfo.level === 'low' && 'Lower scores indicate lower risk'}
                {riskScoreInfo.level === 'medium' && 'Moderate risk level'}
                {riskScoreInfo.level === 'high' && 'Higher scores indicate higher risk'}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

