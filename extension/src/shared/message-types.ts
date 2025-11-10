/**
 * Message Types for Extension
 * 
 * Defines message types for communication between content script, side panel, và background worker.
 * Story 13.4: Background Worker API Coordination
 */

/**
 * Message to open side panel với coin info
 */
export interface OpenSidePanelWithCoinMessage {
  type: 'OPEN_SIDE_PANEL_WITH_COIN';
  coinInfo: {
    name: string;
    symbol?: string;
    price?: number;
  };
}

/**
 * Legacy message type for backward compatibility
 */
export interface AnalyzeCoinMessage {
  type: 'ANALYZE_COIN';
  coin: string;
}

/**
 * Message to fetch coin analysis data
 */
export interface FetchCoinAnalysisMessage {
  type: 'FETCH_COIN_ANALYSIS';
  coinInfo: {
    name: string;
    symbol?: string;
    price?: number;
  };
}

/**
 * Coin selected message (for side panel)
 */
export interface CoinSelectedMessage {
  type: 'COIN_SELECTED';
  coinInfo: {
    name: string;
    symbol?: string;
    price?: number;
  };
}

/**
 * Message to generate report
 */
export interface GenerateReportMessage {
  type: 'GENERATE_REPORT';
  coinInfo: {
    name: string;
    symbol?: string;
    price?: number;
  };
}

/**
 * Union type for all message types
 */
export type ExtensionMessage =
  | OpenSidePanelWithCoinMessage
  | AnalyzeCoinMessage
  | FetchCoinAnalysisMessage
  | CoinSelectedMessage
  | GenerateReportMessage;

/**
 * Response format for messages
 */
export interface MessageResponse {
  success: boolean;
  data?: any;
  error?: string;
}

