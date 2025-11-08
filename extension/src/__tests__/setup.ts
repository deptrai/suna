/**
 * Jest Test Setup
 * 
 * Global test setup và configuration
 */

// Mock chrome APIs for extension testing
global.chrome = {
  runtime: {
    id: 'test-extension-id',
    getManifest: () => ({
      version: '0.1.0-dev',
      name: 'ChainLens Extension',
    }),
  },
  storage: {
    local: {
      get: jest.fn(),
      set: jest.fn(),
      remove: jest.fn(),
    },
  },
  sidePanel: {
    setPanelBehavior: jest.fn(),
  },
} as any;

// Mock window.console for logger tests
global.console = {
  ...console,
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
} as any;

// Setup DOM environment
Object.defineProperty(window, 'performance', {
  value: {
    now: jest.fn(() => Date.now()),
  },
});

