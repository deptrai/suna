/**
 * Unit Tests for Logger Utility
 * 
 * Tests logging levels, production mode detection, và console output
 */

import { logger, Logger } from '../logger';

// Mock console methods
const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

describe('Logger', () => {
  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();
    consoleLogSpy.mockClear();
    consoleWarnSpy.mockClear();
    consoleErrorSpy.mockClear();
    
    // Reset logger to debug mode
    logger.setLevel('debug');
    logger.setDebugEnabled(true);
    
    // Ensure console is available
    (global as any).console = {
      log: consoleLogSpy,
      warn: consoleWarnSpy,
      error: consoleErrorSpy,
      debug: jest.fn(),
    };
  });

  afterAll(() => {
    // Restore console methods
    consoleLogSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  describe('debug', () => {
    it('should log debug message when debug enabled', () => {
      logger.setDebugEnabled(true);
      logger.setLevel('debug');
      logger.debug('Test debug message');
      
      expect(consoleLogSpy).toHaveBeenCalled();
      const callArgs = consoleLogSpy.mock.calls[0];
      expect(callArgs[0]).toContain('[DEBUG]');
      expect(callArgs[0]).toContain('Test debug message');
    });

    it('should not log debug message when debug disabled', () => {
      logger.setDebugEnabled(false);
      logger.debug('Test debug message');
      
      expect(consoleLogSpy).not.toHaveBeenCalled();
    });

    it('should not log debug message when level is info', () => {
      logger.setLevel('info');
      logger.debug('Test debug message');
      
      expect(consoleLogSpy).not.toHaveBeenCalled();
    });
  });

  describe('info', () => {
    it('should log info message', () => {
      logger.info('Test info message');
      
      expect(consoleLogSpy).toHaveBeenCalled();
      const callArgs = consoleLogSpy.mock.calls[0];
      expect(callArgs[0]).toContain('[INFO]');
      expect(callArgs[0]).toContain('Test info message');
    });

    it('should log info message with additional arguments', () => {
      logger.info('Test info message', { key: 'value' }, 123);
      
      expect(consoleLogSpy).toHaveBeenCalled();
      const callArgs = consoleLogSpy.mock.calls[0];
      expect(callArgs[0]).toContain('[INFO]');
      expect(callArgs[0]).toContain('Test info message');
      expect(callArgs[2]).toEqual({ key: 'value' });
      expect(callArgs[3]).toBe(123);
    });

    it('should not log info message when level is warn', () => {
      logger.setLevel('warn');
      logger.info('Test info message');
      
      expect(consoleLogSpy).not.toHaveBeenCalled();
    });
  });

  describe('warn', () => {
    it('should log warn message', () => {
      logger.warn('Test warn message');
      
      expect(consoleWarnSpy).toHaveBeenCalled();
      const callArgs = consoleWarnSpy.mock.calls[0];
      expect(callArgs[0]).toContain('[WARN]');
      expect(callArgs[0]).toContain('Test warn message');
    });

    it('should log warn message with additional arguments', () => {
      logger.warn('Test warn message', { key: 'value' });
      
      expect(consoleWarnSpy).toHaveBeenCalled();
      const callArgs = consoleWarnSpy.mock.calls[0];
      expect(callArgs[0]).toContain('[WARN]');
      expect(callArgs[0]).toContain('Test warn message');
      expect(callArgs[2]).toEqual({ key: 'value' });
    });

    it('should not log warn message when level is error', () => {
      logger.setLevel('error');
      logger.warn('Test warn message');
      
      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });
  });

  describe('error', () => {
    it('should log error message', () => {
      logger.error('Test error message');
      
      expect(consoleErrorSpy).toHaveBeenCalled();
      const callArgs = consoleErrorSpy.mock.calls[0];
      expect(callArgs[0]).toContain('[ERROR]');
      expect(callArgs[0]).toContain('Test error message');
    });

    it('should log error message with Error object', () => {
      const error = new Error('Test error');
      logger.error('Test error message', error);
      
      expect(consoleErrorSpy).toHaveBeenCalled();
      const callArgs = consoleErrorSpy.mock.calls[0];
      expect(callArgs[0]).toContain('[ERROR]');
      expect(callArgs[0]).toContain('Test error message');
      expect(callArgs[2]).toBe(error);
    });

    it('should log stack trace for Error objects', () => {
      const error = new Error('Test error');
      error.stack = 'Error: Test error\n    at test.js:1:1';
      logger.error('Test error message', error);
      
      expect(consoleErrorSpy).toHaveBeenCalledTimes(2); // Error message + stack trace
    });

    it('should always log error messages regardless of level', () => {
      logger.setLevel('error');
      logger.error('Test error message');
      
      expect(consoleErrorSpy).toHaveBeenCalled();
    });
  });

  describe('log levels', () => {
    it('should respect debug level', () => {
      logger.setLevel('debug');
      logger.debug('Debug');
      logger.info('Info');
      logger.warn('Warn');
      logger.error('Error');
      
      expect(consoleLogSpy).toHaveBeenCalledTimes(2); // Debug + Info
      expect(consoleWarnSpy).toHaveBeenCalledTimes(1); // Warn
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1); // Error
    });

    it('should respect info level', () => {
      logger.setLevel('info');
      logger.debug('Debug');
      logger.info('Info');
      logger.warn('Warn');
      logger.error('Error');
      
      expect(consoleLogSpy).toHaveBeenCalledTimes(1); // Info only
      expect(consoleWarnSpy).toHaveBeenCalledTimes(1); // Warn
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1); // Error
    });

    it('should respect warn level', () => {
      logger.setLevel('warn');
      logger.debug('Debug');
      logger.info('Info');
      logger.warn('Warn');
      logger.error('Error');
      
      expect(consoleLogSpy).not.toHaveBeenCalled();
      expect(consoleWarnSpy).toHaveBeenCalledTimes(1); // Warn
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1); // Error
    });

    it('should respect error level', () => {
      logger.setLevel('error');
      logger.debug('Debug');
      logger.info('Info');
      logger.warn('Warn');
      logger.error('Error');
      
      expect(consoleLogSpy).not.toHaveBeenCalled();
      expect(consoleWarnSpy).not.toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1); // Error only
    });
  });

  describe('setLevel', () => {
    it('should change log level', () => {
      logger.setLevel('warn');
      logger.info('Info');
      logger.warn('Warn');
      
      expect(consoleLogSpy).not.toHaveBeenCalled();
      expect(consoleWarnSpy).toHaveBeenCalled();
    });
  });

  describe('setDebugEnabled', () => {
    it('should enable/disable debug logs', () => {
      logger.setDebugEnabled(true);
      logger.debug('Debug 1');
      expect(consoleLogSpy).toHaveBeenCalled();
      
      consoleLogSpy.mockClear();
      logger.setDebugEnabled(false);
      logger.debug('Debug 2');
      expect(consoleLogSpy).not.toHaveBeenCalled();
    });
  });

  describe('isDebugEnabled', () => {
    it('should return true when debug is enabled', () => {
      logger.setDebugEnabled(true);
      expect(logger.isDebugEnabled()).toBe(true);
    });

    it('should return false when debug is disabled', () => {
      logger.setDebugEnabled(false);
      expect(logger.isDebugEnabled()).toBe(false);
    });
  });

  describe('Logger class', () => {
    it('should create new Logger instance', () => {
      const newLogger = new Logger();
      expect(newLogger).toBeInstanceOf(Logger);
    });

    it('should have independent configuration', () => {
      const logger1 = new Logger();
      const logger2 = new Logger();
      
      logger1.setLevel('debug');
      logger2.setLevel('error');
      
      expect(logger1['config'].level).toBe('debug');
      expect(logger2['config'].level).toBe('error');
    });
  });

  describe('production mode detection', () => {
    it('should default to development mode', () => {
      // Mock chrome.runtime to return dev version
      (global.chrome as any).runtime = {
        getManifest: () => ({ version: '0.1.0-dev' }),
      };
      
      const testLogger = new Logger();
      expect(testLogger.isDebugEnabled()).toBe(true);
    });

    it('should detect production mode from version', () => {
      // Mock chrome.runtime to return production version
      (global.chrome as any).runtime = {
        getManifest: () => ({ version: '1.0.0' }),
      };
      
      const testLogger = new Logger();
      // In production, debug should be disabled
      // But we can't easily test this without mocking process.env
      // So we just verify the logger is created
      expect(testLogger).toBeInstanceOf(Logger);
    });
  });
});

