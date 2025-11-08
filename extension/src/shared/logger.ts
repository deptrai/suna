/**
 * Logging Utility
 * 
 * Provides structured logging với levels (debug, info, warn, error)
 * và automatically disables debug logs in production builds.
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LoggerConfig {
  level: LogLevel;
  enableDebug: boolean;
  enableColors: boolean;
}

class Logger {
  private config: LoggerConfig;

  constructor() {
    // Determine if we're in production
    // In extension context, we check chrome.runtime manifest
    let isProduction = false;
    try {
      if (typeof process !== 'undefined' && process.env && process.env.NODE_ENV === 'production') {
        isProduction = true;
      } else if (typeof chrome !== 'undefined' && chrome.runtime) {
        const manifest = chrome.runtime.getManifest();
        // Assume production if version doesn't contain 'dev' or 'test'
        isProduction = !manifest.version.includes('dev') && !manifest.version.includes('test');
      }
    } catch (e) {
      // Default to development if we can't determine
      isProduction = false;
    }

    this.config = {
      level: isProduction ? 'info' : 'debug',
      enableDebug: !isProduction,
      enableColors: typeof window !== 'undefined' && typeof console !== 'undefined',
    };
  }

  /**
   * Debug log - only shown in development
   */
  debug(message: string, ...args: any[]): void {
    if (!this.config.enableDebug || !this.shouldLog('debug')) {
      return;
    }
    
    if (this.config.enableColors && typeof console !== 'undefined') {
      console.log(`%c[DEBUG] ${message}`, 'color: gray; font-size: 12px;', ...args);
    } else if (typeof console !== 'undefined') {
      console.log(`[DEBUG] ${message}`, ...args);
    }
  }

  /**
   * Info log - shown in all environments
   */
  info(message: string, ...args: any[]): void {
    if (!this.shouldLog('info') || typeof console === 'undefined') {
      return;
    }
    
    if (this.config.enableColors) {
      console.log(`%c[INFO] ${message}`, 'color: blue; font-size: 13px;', ...args);
    } else {
      console.log(`[INFO] ${message}`, ...args);
    }
  }

  /**
   * Warn log - shown in all environments
   */
  warn(message: string, ...args: any[]): void {
    if (!this.shouldLog('warn') || typeof console === 'undefined') {
      return;
    }
    
    if (this.config.enableColors) {
      console.warn(`%c[WARN] ${message}`, 'color: orange; font-size: 13px; font-weight: bold;', ...args);
    } else {
      console.warn(`[WARN] ${message}`, ...args);
    }
  }

  /**
   * Error log - always shown
   */
  error(message: string, error?: Error | unknown, ...args: any[]): void {
    if (!this.shouldLog('error') || typeof console === 'undefined') {
      return;
    }
    
    if (this.config.enableColors) {
      console.error(`%c[ERROR] ${message}`, 'color: red; font-size: 14px; font-weight: bold;', error, ...args);
      if (error instanceof Error && error.stack) {
        console.error('%cStack trace:', 'color: red; font-size: 12px;', error.stack);
      }
    } else {
      console.error(`[ERROR] ${message}`, error, ...args);
      if (error instanceof Error && error.stack) {
        console.error('Stack trace:', error.stack);
      }
    }
  }

  /**
   * Check if log level should be logged
   */
  private shouldLog(level: LogLevel): boolean {
    const levels: LogLevel[] = ['debug', 'info', 'warn', 'error'];
    return levels.indexOf(level) >= levels.indexOf(this.config.level);
  }

  /**
   * Set log level
   */
  setLevel(level: LogLevel): void {
    this.config.level = level;
  }

  /**
   * Enable/disable debug logs
   */
  setDebugEnabled(enabled: boolean): void {
    this.config.enableDebug = enabled;
  }

  /**
   * Check if debug is enabled (for external checks)
   */
  isDebugEnabled(): boolean {
    return this.config.enableDebug;
  }
}

// Export singleton instance
export const logger = new Logger();

// Export logger class for testing
export { Logger, type LogLevel };

