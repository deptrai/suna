#!/bin/bash

# 🧪 ChainLens Testing Framework Setup Script
# Implement comprehensive testing infrastructure for production readiness

set -euo pipefail

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] $1${NC}"
}

warn() {
    echo -e "${YELLOW}[WARNING] $1${NC}"
}

error() {
    echo -e "${RED}[ERROR] $1${NC}"
}

# Create testing directories
create_test_structure() {
    log "🏗️ Creating testing directory structure..."
    
    mkdir -p "../tests/e2e"
    mkdir -p "../tests/unit"
    mkdir -p "../tests/integration" 
    mkdir -p "../tests/load"
    mkdir -p "../tests/security"
    mkdir -p "../tests/fixtures"
    mkdir -p "../tests/utils"
    
    log "✅ Testing directory structure created"
}

# Setup Playwright E2E testing
setup_playwright() {
    log "🎭 Setting up Playwright E2E testing..."
    
    # Create Playwright configuration
    cat > "../tests/playwright.config.js" << 'EOF'
// @ts-check
const { defineConfig, devices } = require('@playwright/test');

/**
 * @see https://playwright.dev/docs/test-configuration
 */
module.exports = defineConfig({
  testDir: './e2e',
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 1 : undefined,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: [
    ['html'],
    ['json', { outputFile: 'test-results/results.json' }],
    ['junit', { outputFile: 'test-results/results.xml' }]
  ],
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: process.env.TEST_BASE_URL || 'http://localhost:3000',
    
    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',
    
    /* Take screenshot on failure */
    screenshot: 'only-on-failure',
    
    /* Record video on failure */
    video: 'retain-on-failure',
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
    
    /* Test against mobile viewports. */
    {
      name: 'Mobile Chrome',
      use: { ...devices['Pixel 5'] },
    },
    {
      name: 'Mobile Safari',
      use: { ...devices['iPhone 12'] },
    },
  ],

  /* Run your local dev server before starting the tests */
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
  },
});
EOF

    # Create sample E2E test
    cat > "../tests/e2e/authentication.spec.js" << 'EOF'
// @ts-check
const { test, expect } = require('@playwright/test');

test.describe('Authentication Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should display login form', async ({ page }) => {
    // Navigate to login page
    await page.click('[data-testid="login-button"]');
    
    // Check if login form is visible
    await expect(page.locator('[data-testid="login-form"]')).toBeVisible();
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
  });

  test('should login with valid credentials', async ({ page }) => {
    await page.click('[data-testid="login-button"]');
    
    // Fill login form
    await page.fill('input[type="email"]', 'test@chainlens.ai');
    await page.fill('input[type="password"]', 'testpassword123');
    
    // Submit form
    await page.click('[data-testid="submit-login"]');
    
    // Check if user is redirected to dashboard
    await expect(page).toHaveURL(/.*dashboard/);
    await expect(page.locator('[data-testid="user-profile"]')).toBeVisible();
  });

  test('should show error with invalid credentials', async ({ page }) => {
    await page.click('[data-testid="login-button"]');
    
    // Fill with invalid credentials
    await page.fill('input[type="email"]', 'invalid@example.com');
    await page.fill('input[type="password"]', 'wrongpassword');
    
    // Submit form
    await page.click('[data-testid="submit-login"]');
    
    // Check for error message
    await expect(page.locator('[data-testid="error-message"]')).toBeVisible();
    await expect(page.locator('[data-testid="error-message"]')).toContainText('Invalid credentials');
  });

  test('should handle password reset flow', async ({ page }) => {
    await page.click('[data-testid="login-button"]');
    
    // Click forgot password
    await page.click('[data-testid="forgot-password"]');
    
    // Fill email for password reset
    await page.fill('input[type="email"]', 'test@chainlens.ai');
    
    // Submit reset request
    await page.click('[data-testid="submit-reset"]');
    
    // Check for success message
    await expect(page.locator('[data-testid="success-message"]')).toBeVisible();
    await expect(page.locator('[data-testid="success-message"]')).toContainText('Password reset email sent');
  });
});
EOF

    # Create crypto analysis E2E test
    cat > "../tests/e2e/crypto-analysis.spec.js" << 'EOF'
// @ts-check
const { test, expect } = require('@playwright/test');

test.describe('Crypto Analysis Features', () => {
  test.beforeEach(async ({ page }) => {
    // Login first
    await page.goto('/login');
    await page.fill('input[type="email"]', 'test@chainlens.ai');
    await page.fill('input[type="password"]', 'testpassword123');
    await page.click('[data-testid="submit-login"]');
    
    // Navigate to analysis page
    await page.goto('/analysis');
  });

  test('should analyze crypto token', async ({ page }) => {
    // Enter token symbol
    await page.fill('[data-testid="token-input"]', 'BTC');
    
    // Click analyze button
    await page.click('[data-testid="analyze-button"]');
    
    // Wait for analysis to complete
    await expect(page.locator('[data-testid="analysis-loading"]')).toBeVisible();
    await expect(page.locator('[data-testid="analysis-loading"]')).toBeHidden();
    
    // Check analysis results
    await expect(page.locator('[data-testid="analysis-results"]')).toBeVisible();
    await expect(page.locator('[data-testid="price-data"]')).toBeVisible();
    await expect(page.locator('[data-testid="sentiment-score"]')).toBeVisible();
    await expect(page.locator('[data-testid="technical-analysis"]')).toBeVisible();
  });

  test('should display charts and visualizations', async ({ page }) => {
    await page.fill('[data-testid="token-input"]', 'ETH');
    await page.click('[data-testid="analyze-button"]');
    
    // Wait for analysis completion
    await page.waitForSelector('[data-testid="analysis-results"]');
    
    // Check for chart elements
    await expect(page.locator('[data-testid="price-chart"]')).toBeVisible();
    await expect(page.locator('[data-testid="volume-chart"]')).toBeVisible();
    await expect(page.locator('canvas')).toHaveCount(2); // Chart.js canvases
  });

  test('should export analysis report', async ({ page }) => {
    await page.fill('[data-testid="token-input"]', 'SOL');
    await page.click('[data-testid="analyze-button"]');
    
    await page.waitForSelector('[data-testid="analysis-results"]');
    
    // Start download
    const downloadPromise = page.waitForEvent('download');
    await page.click('[data-testid="export-pdf"]');
    const download = await downloadPromise;
    
    // Verify download
    expect(download.suggestedFilename()).toBe('SOL-analysis-report.pdf');
  });

  test('should handle invalid token symbols', async ({ page }) => {
    // Enter invalid token
    await page.fill('[data-testid="token-input"]', 'INVALID_TOKEN_123');
    await page.click('[data-testid="analyze-button"]');
    
    // Check for error message
    await expect(page.locator('[data-testid="error-message"]')).toBeVisible();
    await expect(page.locator('[data-testid="error-message"]')).toContainText('Token not found');
  });
});
EOF

    log "✅ Playwright E2E tests configured"
}

# Setup unit testing with Jest
setup_unit_testing() {
    log "🃏 Setting up Jest unit testing..."
    
    # Create Jest configuration
    cat > "../tests/jest.config.js" << 'EOF'
module.exports = {
  testEnvironment: 'node',
  testMatch: [
    '<rootDir>/unit/**/*.test.js',
    '<rootDir>/unit/**/*.spec.js'
  ],
  collectCoverage: true,
  collectCoverageFrom: [
    '../src/**/*.{js,ts}',
    '!../src/**/*.d.ts',
    '!../src/**/node_modules/**',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html', 'json'],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
  setupFilesAfterEnv: ['<rootDir>/utils/test-setup.js'],
  verbose: true,
};
EOF

    # Create test setup utilities
    cat > "../tests/utils/test-setup.js" << 'EOF'
// Test setup and global utilities
const { TextEncoder, TextDecoder } = require('util');

// Polyfills for Node.js environment
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

// Mock fetch for API testing
global.fetch = jest.fn();

// Mock console methods in tests
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

// Test helper functions
global.testHelpers = {
  // Create mock user data
  createMockUser: (overrides = {}) => ({
    id: 'test-user-id',
    email: 'test@chainlens.ai',
    name: 'Test User',
    createdAt: new Date().toISOString(),
    ...overrides,
  }),

  // Create mock crypto data
  createMockCryptoData: (symbol = 'BTC', overrides = {}) => ({
    symbol,
    name: symbol === 'BTC' ? 'Bitcoin' : `${symbol} Token`,
    price: 50000,
    marketCap: 1000000000,
    volume24h: 25000000,
    change24h: 2.5,
    sentiment: 0.7,
    ...overrides,
  }),

  // Mock API response
  mockApiResponse: (data, status = 200) => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
    text: async () => JSON.stringify(data),
  }),

  // Wait for async operations
  waitFor: (ms) => new Promise(resolve => setTimeout(resolve, ms)),
};

// Setup and teardown
beforeEach(() => {
  jest.clearAllMocks();
  fetch.mockClear();
});

afterEach(() => {
  jest.restoreAllMocks();
});
EOF

    # Create sample unit tests
    cat > "../tests/unit/crypto-analyzer.test.js" << 'EOF'
const CryptoAnalyzer = require('../../src/services/crypto-analyzer');

describe('CryptoAnalyzer', () => {
  let analyzer;

  beforeEach(() => {
    analyzer = new CryptoAnalyzer();
  });

  describe('analyzeToken', () => {
    test('should analyze valid token successfully', async () => {
      const mockData = testHelpers.createMockCryptoData('BTC');
      
      // Mock API calls
      fetch.mockResolvedValueOnce(
        testHelpers.mockApiResponse(mockData)
      );

      const result = await analyzer.analyzeToken('BTC');

      expect(result).toEqual({
        symbol: 'BTC',
        name: 'Bitcoin',
        price: 50000,
        sentiment: 0.7,
        recommendation: 'buy', // Based on positive sentiment
      });
    });

    test('should throw error for invalid token', async () => {
      fetch.mockResolvedValueOnce(
        testHelpers.mockApiResponse({ error: 'Token not found' }, 404)
      );

      await expect(analyzer.analyzeToken('INVALID')).rejects.toThrow('Token not found');
    });

    test('should handle API rate limiting', async () => {
      fetch.mockResolvedValueOnce(
        testHelpers.mockApiResponse({ error: 'Rate limit exceeded' }, 429)
      );

      await expect(analyzer.analyzeToken('BTC')).rejects.toThrow('Rate limit exceeded');
    });
  });

  describe('calculateSentiment', () => {
    test('should calculate sentiment correctly', () => {
      const positiveNews = [
        { sentiment: 0.8, weight: 1 },
        { sentiment: 0.6, weight: 0.5 },
        { sentiment: 0.9, weight: 2 },
      ];

      const sentiment = analyzer.calculateSentiment(positiveNews);
      expect(sentiment).toBeCloseTo(0.8, 1);
    });

    test('should handle empty news array', () => {
      const sentiment = analyzer.calculateSentiment([]);
      expect(sentiment).toBe(0.5); // Neutral sentiment
    });
  });

  describe('generateRecommendation', () => {
    test('should recommend buy for positive sentiment', () => {
      const recommendation = analyzer.generateRecommendation(0.8, 5.2);
      expect(recommendation).toBe('buy');
    });

    test('should recommend sell for negative sentiment', () => {
      const recommendation = analyzer.generateRecommendation(0.2, -3.1);
      expect(recommendation).toBe('sell');
    });

    test('should recommend hold for neutral conditions', () => {
      const recommendation = analyzer.generateRecommendation(0.5, 0.5);
      expect(recommendation).toBe('hold');
    });
  });
});
EOF

    # Create authentication unit tests
    cat > "../tests/unit/auth.test.js" << 'EOF'
const AuthService = require('../../src/services/auth-service');
const jwt = require('jsonwebtoken');

// Mock JWT
jest.mock('jsonwebtoken');

describe('AuthService', () => {
  let authService;

  beforeEach(() => {
    authService = new AuthService();
    jest.clearAllMocks();
  });

  describe('login', () => {
    test('should login with valid credentials', async () => {
      const mockUser = testHelpers.createMockUser();
      
      // Mock successful login
      authService.validateCredentials = jest.fn().mockResolvedValue(mockUser);
      jwt.sign.mockReturnValue('mock-jwt-token');

      const result = await authService.login('test@chainlens.ai', 'password123');

      expect(result).toEqual({
        user: mockUser,
        token: 'mock-jwt-token',
      });
    });

    test('should reject invalid credentials', async () => {
      authService.validateCredentials = jest.fn().mockRejectedValue(
        new Error('Invalid credentials')
      );

      await expect(
        authService.login('invalid@example.com', 'wrongpassword')
      ).rejects.toThrow('Invalid credentials');
    });
  });

  describe('verifyToken', () => {
    test('should verify valid token', () => {
      const mockPayload = { userId: 'test-user-id', email: 'test@chainlens.ai' };
      jwt.verify.mockReturnValue(mockPayload);

      const result = authService.verifyToken('valid-token');

      expect(result).toEqual(mockPayload);
      expect(jwt.verify).toHaveBeenCalledWith('valid-token', process.env.JWT_SECRET);
    });

    test('should reject invalid token', () => {
      jwt.verify.mockImplementation(() => {
        throw new Error('Invalid token');
      });

      expect(() => authService.verifyToken('invalid-token')).toThrow('Invalid token');
    });
  });
});
EOF

    log "✅ Jest unit testing configured"
}

# Setup integration testing
setup_integration_testing() {
    log "🔗 Setting up integration testing..."
    
    cat > "../tests/integration/api.test.js" << 'EOF'
const request = require('supertest');
const app = require('../../src/app');

describe('API Integration Tests', () => {
  let authToken;

  beforeAll(async () => {
    // Login and get auth token
    const loginResponse = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'test@chainlens.ai',
        password: 'testpassword123',
      });

    authToken = loginResponse.body.token;
  });

  describe('Authentication Endpoints', () => {
    test('POST /api/auth/login should authenticate user', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test@chainlens.ai',
          password: 'testpassword123',
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('token');
      expect(response.body).toHaveProperty('user');
    });

    test('POST /api/auth/register should create new user', async () => {
      const newUser = {
        email: 'newuser@chainlens.ai',
        password: 'newpassword123',
        name: 'New User',
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(newUser);

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('user');
      expect(response.body.user.email).toBe(newUser.email);
    });
  });

  describe('Crypto Analysis Endpoints', () => {
    test('GET /api/crypto/analyze/:symbol should return analysis', async () => {
      const response = await request(app)
        .get('/api/crypto/analyze/BTC')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('symbol', 'BTC');
      expect(response.body).toHaveProperty('price');
      expect(response.body).toHaveProperty('sentiment');
      expect(response.body).toHaveProperty('recommendation');
    });

    test('POST /api/crypto/compare should compare tokens', async () => {
      const response = await request(app)
        .post('/api/crypto/compare')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          tokens: ['BTC', 'ETH', 'SOL'],
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('comparison');
      expect(response.body.comparison).toHaveLength(3);
    });

    test('GET /api/crypto/trending should return trending tokens', async () => {
      const response = await request(app)
        .get('/api/crypto/trending')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('trending');
      expect(Array.isArray(response.body.trending)).toBe(true);
    });
  });

  describe('User Data Endpoints', () => {
    test('GET /api/user/profile should return user profile', async () => {
      const response = await request(app)
        .get('/api/user/profile')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('user');
      expect(response.body.user).toHaveProperty('email');
    });

    test('PUT /api/user/profile should update user profile', async () => {
      const updates = {
        name: 'Updated Name',
        preferences: {
          theme: 'dark',
          notifications: true,
        },
      };

      const response = await request(app)
        .put('/api/user/profile')
        .set('Authorization', `Bearer ${authToken}`)
        .send(updates);

      expect(response.status).toBe(200);
      expect(response.body.user.name).toBe(updates.name);
    });
  });

  describe('Error Handling', () => {
    test('should return 401 for unauthorized requests', async () => {
      const response = await request(app)
        .get('/api/crypto/analyze/BTC');

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error', 'Unauthorized');
    });

    test('should return 404 for non-existent endpoints', async () => {
      const response = await request(app)
        .get('/api/nonexistent')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(404);
    });

    test('should handle malformed requests', async () => {
      const response = await request(app)
        .post('/api/crypto/compare')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ invalid: 'data' });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });
  });
});
EOF

    log "✅ Integration testing configured"
}

# Setup load testing with k6
setup_load_testing() {
    log "⚡ Setting up load testing with k6..."
    
    cat > "../tests/load/basic-load.js" << 'EOF'
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');

export const options = {
  stages: [
    { duration: '2m', target: 10 }, // Ramp up to 10 users
    { duration: '5m', target: 10 }, // Stay at 10 users
    { duration: '2m', target: 20 }, // Ramp up to 20 users
    { duration: '5m', target: 20 }, // Stay at 20 users
    { duration: '2m', target: 0 },  // Ramp down to 0 users
  ],
  thresholds: {
    http_req_duration: ['p(95)<1000'], // 95% of requests under 1s
    http_req_failed: ['rate<0.1'],     // Error rate under 10%
    errors: ['rate<0.1'],              // Custom error rate under 10%
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8000';

export function setup() {
  // Login and get auth token
  const loginRes = http.post(`${BASE_URL}/api/auth/login`, JSON.stringify({
    email: 'test@chainlens.ai',
    password: 'testpassword123',
  }), {
    headers: { 'Content-Type': 'application/json' },
  });

  check(loginRes, {
    'login successful': (r) => r.status === 200,
  });

  return { authToken: loginRes.json('token') };
}

export default function(data) {
  const authHeaders = {
    'Authorization': `Bearer ${data.authToken}`,
    'Content-Type': 'application/json',
  };

  // Test crypto analysis endpoint
  const cryptoRes = http.get(`${BASE_URL}/api/crypto/analyze/BTC`, {
    headers: authHeaders,
  });

  const success = check(cryptoRes, {
    'crypto analysis status 200': (r) => r.status === 200,
    'crypto analysis has data': (r) => r.json('price') !== undefined,
    'response time < 2s': (r) => r.timings.duration < 2000,
  });

  errorRate.add(!success);

  // Test trending endpoint
  const trendingRes = http.get(`${BASE_URL}/api/crypto/trending`, {
    headers: authHeaders,
  });

  check(trendingRes, {
    'trending status 200': (r) => r.status === 200,
    'trending has data': (r) => Array.isArray(r.json('trending')),
  });

  // Test user profile
  const profileRes = http.get(`${BASE_URL}/api/user/profile`, {
    headers: authHeaders,
  });

  check(profileRes, {
    'profile status 200': (r) => r.status === 200,
  });

  sleep(1);
}

export function teardown(data) {
  // Cleanup if needed
  console.log('Load test completed');
}
EOF

    # Create stress test scenario
    cat > "../tests/load/stress-test.js" << 'EOF'
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '1m', target: 50 },   // Ramp up to 50 users
    { duration: '2m', target: 50 },   // Stay at 50 users
    { duration: '1m', target: 100 },  // Ramp up to 100 users
    { duration: '2m', target: 100 },  // Stay at 100 users
    { duration: '1m', target: 200 },  // Stress test with 200 users
    { duration: '2m', target: 200 },  // Maintain stress
    { duration: '1m', target: 0 },    // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<2000'], // 95% of requests under 2s
    http_req_failed: ['rate<0.2'],     // Error rate under 20%
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8000';

export function setup() {
  const loginRes = http.post(`${BASE_URL}/api/auth/login`, JSON.stringify({
    email: 'test@chainlens.ai',
    password: 'testpassword123',
  }), {
    headers: { 'Content-Type': 'application/json' },
  });

  return { authToken: loginRes.json('token') };
}

export default function(data) {
  const authHeaders = {
    'Authorization': `Bearer ${data.authToken}`,
    'Content-Type': 'application/json',
  };

  // Random token selection for more realistic load
  const tokens = ['BTC', 'ETH', 'SOL', 'ADA', 'DOT', 'LINK', 'UNI', 'AAVE'];
  const randomToken = tokens[Math.floor(Math.random() * tokens.length)];

  const res = http.get(`${BASE_URL}/api/crypto/analyze/${randomToken}`, {
    headers: authHeaders,
  });

  check(res, {
    'status is 200': (r) => r.status === 200,
    'response time under 5s': (r) => r.timings.duration < 5000,
  });

  sleep(Math.random() * 3 + 1); // Random sleep 1-4 seconds
}
EOF

    log "✅ Load testing configured"
}

# Setup security testing
setup_security_testing() {
    log "🔒 Setting up security testing..."
    
    cat > "../tests/security/security-scan.js" << 'EOF'
// Security testing with OWASP ZAP integration
const ZapClient = require('zaproxy');
const options = {
  proxy: 'http://localhost:8090' // ZAP proxy
};

const zaproxy = new ZapClient(options);

async function runSecurityScan() {
  console.log('Starting security scan...');
  
  try {
    // Set up ZAP
    await zaproxy.core.newSession();
    
    // Spider the application
    const scanId = await zaproxy.spider.scan('http://localhost:3000');
    console.log(`Spider scan started with ID: ${scanId}`);
    
    // Wait for spider to complete
    let spiderProgress;
    do {
      await new Promise(resolve => setTimeout(resolve, 1000));
      spiderProgress = await zaproxy.spider.status(scanId);
      console.log(`Spider progress: ${spiderProgress}%`);
    } while (spiderProgress < 100);
    
    // Run active scan
    const activeScanId = await zaproxy.ascan.scan('http://localhost:3000');
    console.log(`Active scan started with ID: ${activeScanId}`);
    
    // Wait for active scan to complete
    let scanProgress;
    do {
      await new Promise(resolve => setTimeout(resolve, 5000));
      scanProgress = await zaproxy.ascan.status(activeScanId);
      console.log(`Active scan progress: ${scanProgress}%`);
    } while (scanProgress < 100);
    
    // Get scan results
    const alerts = await zaproxy.core.alerts();
    console.log(`Found ${alerts.length} security alerts`);
    
    // Generate report
    const htmlReport = await zaproxy.core.htmlreport();
    require('fs').writeFileSync('./security-report.html', htmlReport);
    
    console.log('Security scan completed. Report saved to security-report.html');
    
    return alerts;
  } catch (error) {
    console.error('Security scan failed:', error);
    throw error;
  }
}

// Export for use in test runners
module.exports = { runSecurityScan };
EOF

    # Create manual security test checklist
    cat > "../tests/security/manual-security-tests.md" << 'EOF'
# Manual Security Testing Checklist

## Authentication & Authorization

### SQL Injection Tests
- [ ] Test login form with SQL injection payloads
- [ ] Test search inputs with SQL injection attempts
- [ ] Verify parameterized queries are used

### XSS (Cross-Site Scripting) Tests
- [ ] Test input fields with XSS payloads
- [ ] Verify output encoding is implemented
- [ ] Check for DOM-based XSS vulnerabilities

### CSRF (Cross-Site Request Forgery) Tests
- [ ] Verify CSRF tokens are implemented
- [ ] Test state-changing operations without tokens
- [ ] Check SameSite cookie attributes

### Session Management Tests
- [ ] Verify secure session handling
- [ ] Test session timeout functionality  
- [ ] Check for session fixation vulnerabilities

## Input Validation

### File Upload Tests
- [ ] Test malicious file upload attempts
- [ ] Verify file type restrictions
- [ ] Check file size limitations

### API Input Validation
- [ ] Test with oversized payloads
- [ ] Test with malformed JSON
- [ ] Verify input sanitization

## Infrastructure Security

### HTTPS/TLS Tests
- [ ] Verify HTTPS is enforced
- [ ] Check TLS certificate validity
- [ ] Test for mixed content issues

### Security Headers Tests
- [ ] Verify X-Content-Type-Options header
- [ ] Check X-Frame-Options header
- [ ] Validate Content-Security-Policy
- [ ] Check Strict-Transport-Security header

### Rate Limiting Tests
- [ ] Test API rate limiting
- [ ] Verify brute force protection
- [ ] Check for DoS protection

## Data Protection

### Sensitive Data Tests
- [ ] Verify passwords are hashed
- [ ] Check for sensitive data exposure
- [ ] Test data encryption at rest

### Privacy Tests
- [ ] Verify GDPR compliance measures
- [ ] Test data deletion functionality
- [ ] Check consent management
EOF

    log "✅ Security testing configured"
}

# Create test runner scripts
create_test_runners() {
    log "🏃 Creating test runner scripts..."
    
    cat > "../scripts/run-all-tests.sh" << 'EOF'
#!/bin/bash

# 🧪 ChainLens Comprehensive Test Runner

set -e

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] $1${NC}"
}

error() {
    echo -e "${RED}[ERROR] $1${NC}"
}

warn() {
    echo -e "${YELLOW}[WARNING] $1${NC}"
}

# Initialize test results
FAILED_TESTS=()
TOTAL_TESTS=0
PASSED_TESTS=0

# Function to run tests and track results
run_test_suite() {
    local suite_name="$1"
    local command="$2"
    
    log "Running $suite_name..."
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    
    if eval "$command"; then
        log "✅ $suite_name PASSED"
        PASSED_TESTS=$((PASSED_TESTS + 1))
    else
        error "❌ $suite_name FAILED"
        FAILED_TESTS+=("$suite_name")
    fi
    
    echo ""
}

log "🧪 Starting ChainLens Comprehensive Test Suite"
log "=============================================="

# Unit Tests
run_test_suite "Unit Tests" "cd ../tests && npm test -- --testPathPattern=unit"

# Integration Tests
run_test_suite "Integration Tests" "cd ../tests && npm test -- --testPathPattern=integration"

# E2E Tests (if frontend is running)
if curl -s http://localhost:3000 > /dev/null; then
    run_test_suite "E2E Tests" "cd ../tests && npx playwright test"
else
    warn "Frontend not running on localhost:3000, skipping E2E tests"
fi

# Load Tests (basic)
if command -v k6 >/dev/null 2>&1; then
    run_test_suite "Basic Load Test" "k6 run ../tests/load/basic-load.js"
else
    warn "k6 not installed, skipping load tests"
fi

# Security Tests
run_test_suite "Security Vulnerability Scan" "cd ../tests && node security/security-scan.js"

# Generate test report
log "📊 Generating test report..."

cat > "../test-results/summary.json" << EOL
{
  "timestamp": "$(date -Iseconds)",
  "total_tests": $TOTAL_TESTS,
  "passed_tests": $PASSED_TESTS,
  "failed_tests": ${#FAILED_TESTS[@]},
  "success_rate": $(echo "scale=2; $PASSED_TESTS * 100 / $TOTAL_TESTS" | bc -l),
  "failed_test_suites": $(printf '%s\n' "${FAILED_TESTS[@]}" | jq -R . | jq -s .),
  "status": "$([ ${#FAILED_TESTS[@]} -eq 0 ] && echo "PASS" || echo "FAIL")"
}
EOL

# Final summary
log "=============================================="
log "🎯 TEST SUMMARY"
log "Total Test Suites: $TOTAL_TESTS"
log "Passed: $PASSED_TESTS"
log "Failed: ${#FAILED_TESTS[@]}"

if [ ${#FAILED_TESTS[@]} -eq 0 ]; then
    log "🎉 ALL TESTS PASSED! ✅"
    exit 0
else
    error "❌ Some tests failed:"
    for test in "${FAILED_TESTS[@]}"; do
        error "  - $test"
    done
    exit 1
fi
EOF

    chmod +x "../scripts/run-all-tests.sh"
    
    # Create individual test runners
    cat > "../scripts/run-unit-tests.sh" << 'EOF'
#!/bin/bash
cd "$(dirname "$0")/../tests"
npm test -- --testPathPattern=unit --coverage
EOF

    cat > "../scripts/run-e2e-tests.sh" << 'EOF'
#!/bin/bash
cd "$(dirname "$0")/../tests"
npx playwright test --reporter=html
EOF

    cat > "../scripts/run-load-tests.sh" << 'EOF'
#!/bin/bash
cd "$(dirname "$0")/../tests"
k6 run load/basic-load.js --out json=load-test-results.json
EOF

    chmod +x "../scripts/run-unit-tests.sh"
    chmod +x "../scripts/run-e2e-tests.sh"
    chmod +x "../scripts/run-load-tests.sh"
    
    log "✅ Test runner scripts created"
}

# Create CI/CD integration
create_ci_integration() {
    log "🔄 Creating CI/CD integration..."
    
    mkdir -p "../.github/workflows"
    
    cat > "../.github/workflows/test-suite.yml" << 'EOF'
name: ChainLens Test Suite

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main ]

jobs:
  unit-tests:
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Setup Node.js
      uses: actions/setup-node@v3
      with:
        node-version: '18'
        cache: 'npm'
    
    - name: Install dependencies
      run: npm ci
    
    - name: Run unit tests
      run: npm run test:unit
    
    - name: Upload coverage to Codecov
      uses: codecov/codecov-action@v3
      with:
        file: ./tests/coverage/lcov.info
        fail_ci_if_error: true

  integration-tests:
    runs-on: ubuntu-latest
    
    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: chainlens_test
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
      
      redis:
        image: redis:7
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Setup Node.js
      uses: actions/setup-node@v3
      with:
        node-version: '18'
        cache: 'npm'
    
    - name: Install dependencies
      run: npm ci
    
    - name: Run integration tests
      run: npm run test:integration
      env:
        DATABASE_URL: postgres://postgres:postgres@localhost:5432/chainlens_test
        REDIS_URL: redis://localhost:6379

  e2e-tests:
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Setup Node.js
      uses: actions/setup-node@v3
      with:
        node-version: '18'
        cache: 'npm'
    
    - name: Install dependencies
      run: npm ci
    
    - name: Install Playwright browsers
      run: npx playwright install --with-deps
    
    - name: Start application
      run: |
        npm run build
        npm run start &
        sleep 30 # Wait for app to start
    
    - name: Run E2E tests
      run: npm run test:e2e
    
    - name: Upload E2E test results
      uses: actions/upload-artifact@v3
      if: always()
      with:
        name: playwright-report
        path: tests/playwright-report/
        retention-days: 30

  security-tests:
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Run security scan
      uses: zaproxy/action-baseline@v0.7.0
      with:
        target: 'http://localhost:3000'
        
    - name: Upload security report
      uses: actions/upload-artifact@v3
      if: always()
      with:
        name: security-report
        path: report_html.html

  performance-tests:
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Setup k6
      uses: grafana/setup-k6-action@v1
    
    - name: Start application
      run: |
        npm run build
        npm run start &
        sleep 30
    
    - name: Run load tests
      run: k6 run tests/load/basic-load.js
EOF

    log "✅ CI/CD integration configured"
}

# Main execution
main() {
    log "🧪 Starting ChainLens Testing Framework Setup..."
    
    create_test_structure
    setup_playwright
    setup_unit_testing
    setup_integration_testing
    setup_load_testing
    setup_security_testing
    create_test_runners
    create_ci_integration
    
    # Create package.json for test dependencies
    cat > "../tests/package.json" << 'EOF'
{
  "name": "chainlens-tests",
  "version": "1.0.0",
  "description": "ChainLens Testing Framework",
  "scripts": {
    "test": "jest",
    "test:unit": "jest --testPathPattern=unit",
    "test:integration": "jest --testPathPattern=integration",
    "test:e2e": "playwright test",
    "test:load": "k6 run load/basic-load.js",
    "test:security": "node security/security-scan.js",
    "test:all": "../scripts/run-all-tests.sh",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage"
  },
  "devDependencies": {
    "@playwright/test": "^1.38.0",
    "jest": "^29.6.0",
    "supertest": "^6.3.0",
    "zaproxy": "^0.2.0"
  },
  "engines": {
    "node": ">=18.0.0"
  }
}
EOF

    mkdir -p "../test-results"
    
    log ""
    log "🎉 TESTING FRAMEWORK SETUP COMPLETED!"
    log ""
    log "📋 NEXT STEPS:"
    log "1. 🔧 Install test dependencies: cd tests && npm install"
    log "2. 🎭 Install Playwright browsers: npx playwright install"
    log "3. ⚡ Install k6: https://k6.io/docs/getting-started/installation/"
    log "4. 🏃 Run all tests: ./scripts/run-all-tests.sh"
    log "5. 🔄 Integrate with CI/CD pipeline"
    log ""
    log "📁 FILES CREATED:"
    log "   - tests/ (comprehensive test structure)"
    log "   - scripts/run-all-tests.sh (test runner)"
    log "   - .github/workflows/test-suite.yml (CI/CD)"
    log ""
}

main "$@"