/**
 * Error Handler for Extension
 * 
 * Adapts frontend error handling patterns for extension context.
 * Story 14.2: Comprehensive Error Handling
 */

import { 
  BillingError,
  AgentRunLimitError,
  ProjectLimitError,
  NoAccessTokenAvailableError,
} from '@/lib/api';
import { logger } from './logger';

export interface ApiError extends Error {
  status?: number;
  code?: string;
  details?: any;
  response?: Response;
}

export interface ErrorContext {
  operation?: string;
  resource?: string;
  silent?: boolean;
  showToUser?: boolean; // Whether to show error to user in UI
}

export interface ErrorRecovery {
  action: string;
  label: string;
  onClick?: () => void;
}

/**
 * Get user-friendly message for HTTP status code
 */
const getStatusMessage = (status: number): string => {
  switch (status) {
    case 400:
      return 'Invalid request. Please check your input and try again.';
    case 401:
      return 'Authentication required. Please sign in again.';
    case 403:
      return 'Access denied. You don\'t have permission to perform this action.';
    case 404:
      return 'The requested resource was not found.';
    case 408:
      return 'Request timeout. Please try again.';
    case 409:
      return 'Conflict detected. The resource may have been modified by another user.';
    case 422:
      return 'Invalid data provided. Please check your input.';
    case 429:
      return 'Too many requests. Please wait a moment and try again.';
    case 500:
      return 'Server error. Our team has been notified.';
    case 502:
      return 'Service temporarily unavailable. Please try again in a moment.';
    case 503:
      return 'Service maintenance in progress. Please try again later.';
    case 504:
      return 'Request timeout. The server took too long to respond.';
    default:
      return 'An unexpected error occurred. Please try again.';
  }
};

/**
 * Extract error message from error object
 */
export const extractErrorMessage = (error: any): string => {
  if (error instanceof BillingError) {
    return error.detail?.message || error.message || 'Billing issue detected';
  }

  if (error instanceof AgentRunLimitError) {
    return error.detail?.message || error.message || 'Agent run limit exceeded';
  }

  if (error instanceof ProjectLimitError) {
    return error.detail?.message || error.message || 'Project limit exceeded';
  }

  if (error instanceof NoAccessTokenAvailableError) {
    return 'Authentication required. Please sign in to continue.';
  }

  if (error instanceof Error) {
    return error.message;
  }

  if (error?.response) {
    const status = error.response.status;
    return getStatusMessage(status);
  }

  if (error?.status) {
    return getStatusMessage(error.status);
  }

  if (typeof error === 'string') {
    return error;
  }

  if (error?.message) {
    return error.message;
  }

  if (error?.error) {
    return typeof error.error === 'string' ? error.error : error.error.message || 'Unknown error';
  }

  return 'An unexpected error occurred';
};

/**
 * Check if error should be shown to user
 */
const shouldShowError = (error: any, context?: ErrorContext): boolean => {
  if (context?.silent) {
    return false;
  }
  if (error instanceof BillingError) {
    return false; // Billing errors are handled separately
  }
  if (error instanceof AgentRunLimitError) {
    return false; // Limit errors are handled separately
  }

  if (error?.status === 404 && context?.resource) {
    return false; // 404 for specific resources can be silent
  }

  return true;
};

/**
 * Format error message với context
 */
const formatErrorMessage = (message: string, context?: ErrorContext): string => {
  if (!context?.operation && !context?.resource) {
    return message;
  }

  const parts = [];
  
  if (context.operation) {
    parts.push(`Failed to ${context.operation}`);
  }
  
  if (context.resource) {
    parts.push(context.resource);
  }

  const prefix = parts.join(' ');
  
  if (message.toLowerCase().includes(context.operation?.toLowerCase() || '')) {
    return message;
  }

  return `${prefix}: ${message}`;
};

/**
 * Check if error is a network error
 */
export const isNetworkError = (error: any): boolean => {
  return (
    error?.message?.includes('fetch') ||
    error?.message?.includes('network') ||
    error?.message?.includes('connection') ||
    error?.message?.includes('Failed to fetch') ||
    error?.code === 'NETWORK_ERROR' ||
    error?.name === 'NetworkError' ||
    (!navigator.onLine && typeof navigator !== 'undefined')
  );
};

/**
 * Check if error is an authentication error
 */
export const isAuthenticationError = (error: any): boolean => {
  return (
    error?.status === 401 ||
    error?.status === 403 ||
    error instanceof NoAccessTokenAvailableError ||
    error?.message?.includes('Not authenticated') ||
    error?.message?.includes('Authentication required') ||
    error?.message?.includes('401') ||
    error?.message?.includes('403')
  );
};

/**
 * Get error recovery suggestions
 */
export const getErrorRecovery = (error: any, context?: ErrorContext): ErrorRecovery[] => {
  const recoveries: ErrorRecovery[] = [];

  if (isNetworkError(error)) {
    recoveries.push({
      action: 'retry',
      label: 'Retry',
    });
    recoveries.push({
      action: 'check-connection',
      label: 'Check Connection',
    });
  }

  if (isAuthenticationError(error)) {
    recoveries.push({
      action: 'login',
      label: 'Sign In',
    });
  }

  if (error?.status === 429) {
    recoveries.push({
      action: 'retry',
      label: 'Retry Later',
    });
  }

  if (error?.status >= 500) {
    recoveries.push({
      action: 'retry',
      label: 'Retry',
    });
  }

  return recoveries;
};

/**
 * Handle API errors
 */
export const handleApiError = (error: any, context?: ErrorContext): {
  message: string;
  userMessage: string;
  isNetworkError: boolean;
  isAuthError: boolean;
  status?: number;
  recovery?: ErrorRecovery[];
} => {
  logger.error('API Error:', error, context);

  const rawMessage = extractErrorMessage(error);
  const formattedMessage = formatErrorMessage(rawMessage, context);
  const networkError = isNetworkError(error);
  const authError = isAuthenticationError(error);
  const shouldShow = shouldShowError(error, context);

  const result = {
    message: formattedMessage,
    userMessage: shouldShow ? formattedMessage : rawMessage,
    isNetworkError: networkError,
    isAuthError: authError,
    status: error?.status || error?.response?.status,
    recovery: getErrorRecovery(error, context),
  };

  // Log error details
  if (networkError) {
    logger.warn('Network error detected:', formattedMessage);
  } else if (authError) {
    logger.warn('Authentication error detected:', formattedMessage);
  } else {
    logger.error('API error:', formattedMessage, error);
  }

  return result;
};

/**
 * Handle network errors specifically
 */
export const handleNetworkError = (error: any, context?: ErrorContext): {
  message: string;
  userMessage: string;
  recovery?: ErrorRecovery[];
} => {
  const isNetwork = isNetworkError(error);

  if (isNetwork) {
    const message = 'Connection error. Please check your internet connection and try again.';
    logger.error('Network error:', message, error);
    
    return {
      message,
      userMessage: message,
      recovery: [
        { action: 'retry', label: 'Retry' },
        { action: 'check-connection', label: 'Check Connection' },
      ],
    };
  }

  // If not a network error, handle as API error
  return handleApiError(error, context);
};

/**
 * Handle authentication errors specifically
 */
export const handleAuthenticationError = (error: any, context?: ErrorContext): {
  message: string;
  userMessage: string;
  recovery?: ErrorRecovery[];
} => {
  const isAuth = isAuthenticationError(error);

  if (isAuth) {
    const message = 'Authentication required. Please sign in to continue.';
    logger.warn('Authentication error:', message, error);
    
    return {
      message,
      userMessage: message,
      recovery: [
        { action: 'login', label: 'Sign In' },
      ],
    };
  }

  // If not an auth error, handle as API error
  return handleApiError(error, context);
};

/**
 * Wrap content script code với error handling
 */
export const wrapContentScript = <T extends (...args: any[]) => any>(
  fn: T,
  context?: ErrorContext
): T => {
  return ((...args: any[]) => {
    try {
      return fn(...args);
    } catch (error) {
      logger.error('Content script error:', error, context);
      
      // Don't break page functionality
      // Just log the error
      const errorInfo = handleApiError(error, { ...context, silent: true });
      
      // Return null or empty result to prevent breaking
      return null;
    }
  }) as T;
};

/**
 * Wrap async content script code với error handling
 */
export const wrapAsyncContentScript = <T extends (...args: any[]) => Promise<any>>(
  fn: T,
  context?: ErrorContext
): T => {
  return (async (...args: any[]) => {
    try {
      return await fn(...args);
    } catch (error) {
      logger.error('Content script async error:', error, context);
      
      // Don't break page functionality
      // Just log the error
      const errorInfo = handleApiError(error, { ...context, silent: true });
      
      // Return null or empty result to prevent breaking
      return null;
    }
  }) as T;
};

