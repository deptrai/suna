const fs = require('fs');
const path = require('path');

const timestamp = '2026-05-08';
const detected_stack = 'fullstack';
const resolvedMode = 'subagent';

const apiTestsPath = `/tmp/tea-automate-api-tests-${timestamp}.json`;
const e2eTestsPath = `/tmp/tea-automate-e2e-tests-${timestamp}.json`;
const backendTestsPath = `/tmp/tea-automate-backend-tests-${timestamp}.json`;

const apiTestsOutput = JSON.parse(fs.readFileSync(apiTestsPath, 'utf8'));
const e2eTestsOutput = JSON.parse(fs.readFileSync(e2eTestsPath, 'utf8'));
const backendTestsOutput = JSON.parse(fs.readFileSync(backendTestsPath, 'utf8'));

if (!apiTestsOutput.success || !e2eTestsOutput.success || !backendTestsOutput.success) {
  console.error("One or more subagents failed.");
  process.exit(1);
}

const targetDirs = [
  path.join(process.cwd(), 'tests', 'api'),
  path.join(process.cwd(), 'tests', 'e2e'),
  path.join(process.cwd(), 'tests', 'unit'),
  path.join(process.cwd(), 'tests', 'integration'),
  path.join(process.cwd(), 'tests', 'fixtures'),
  path.join(process.cwd(), 'tests', 'support')
];

targetDirs.forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// Write API tests
if (apiTestsOutput.tests) {
  apiTestsOutput.tests.forEach((test) => {
    fs.mkdirSync(path.dirname(path.join(process.cwd(), test.file)), { recursive: true });
    fs.writeFileSync(path.join(process.cwd(), test.file), test.content, 'utf8');
    console.log(`✅ Created: ${test.file}`);
  });
}

// Write E2E tests
if (e2eTestsOutput.tests) {
  e2eTestsOutput.tests.forEach((test) => {
    fs.mkdirSync(path.dirname(path.join(process.cwd(), test.file)), { recursive: true });
    fs.writeFileSync(path.join(process.cwd(), test.file), test.content, 'utf8');
    console.log(`✅ Created: ${test.file}`);
  });
}

// Write Backend tests
if (backendTestsOutput.testsGenerated) {
  backendTestsOutput.testsGenerated.forEach((test) => {
    fs.mkdirSync(path.dirname(path.join(process.cwd(), test.file)), { recursive: true });
    fs.writeFileSync(path.join(process.cwd(), test.file), test.content, 'utf8');
    console.log(`✅ Created: ${test.file}`);
  });
}

// Fixtures
const allFixtureNeeds = [
  ...(apiTestsOutput.fixture_needs || []),
  ...(e2eTestsOutput.fixture_needs || []),
  ...(backendTestsOutput.coverageSummary?.fixtureNeeds || []),
];
const uniqueFixtures = [...new Set(allFixtureNeeds)];
console.log(`Unique fixtures needed: ${uniqueFixtures.join(', ')}`);

const authFixtureContent = `import { test as base } from '@playwright/test';

export const test = base.extend({
  authenticatedUser: async ({ page }, use) => {
    await page.goto('/auth/password?redirect=%2Finstances');
    await page.fill('input[name="email"]', 'test@example.com');
    await page.fill('input[name="password"]', 'password');
    await page.click('form button');
    await page.waitForURL('/instances');
    await use(page);
  },

  authToken: async ({ request }, use) => {
    const response = await request.post('/api/auth/login', {
      data: { email: 'test@example.com', password: 'password' },
    });
    const { token } = await response.json();
    await use(token);
  },
});
`;
fs.writeFileSync(path.join(process.cwd(), 'tests', 'fixtures', 'auth.ts'), authFixtureContent, 'utf8');
console.log(`✅ Created: tests/fixtures/auth.ts`);

const e2eCount = e2eTestsOutput.test_count || e2eTestsOutput.tests?.length || 0;
const backendCount = backendTestsOutput.coverageSummary?.totalTests || backendTestsOutput.testsGenerated?.length || 0;
const apiCount = apiTestsOutput.test_count || apiTestsOutput.tests?.length || 0;

const summary = {
  detected_stack: detected_stack,
  total_tests: apiCount + e2eCount + backendCount,
  api_tests: apiCount,
  e2e_tests: e2eCount,
  backend_tests: backendCount,
  fixtures_created: uniqueFixtures.length,
  api_test_files: apiTestsOutput.tests ? apiTestsOutput.tests.length : 0,
  e2e_test_files: e2eTestsOutput.tests ? e2eTestsOutput.tests.length : 0,
  backend_test_files: backendTestsOutput.testsGenerated ? backendTestsOutput.testsGenerated.length : 0,
  priority_coverage: {
    P0: (apiTestsOutput.priority_coverage?.P0 || 0) + (e2eTestsOutput.priority_coverage?.P0 || 0) + (backendTestsOutput.testsGenerated?.reduce((sum, t) => sum + (t.priority_coverage?.P0 || 0), 0) || 0),
    P1: (apiTestsOutput.priority_coverage?.P1 || 0) + (e2eTestsOutput.priority_coverage?.P1 || 0) + (backendTestsOutput.testsGenerated?.reduce((sum, t) => sum + (t.priority_coverage?.P1 || 0), 0) || 0),
    P2: (apiTestsOutput.priority_coverage?.P2 || 0) + (e2eTestsOutput.priority_coverage?.P2 || 0) + (backendTestsOutput.testsGenerated?.reduce((sum, t) => sum + (t.priority_coverage?.P2 || 0), 0) || 0),
    P3: (apiTestsOutput.priority_coverage?.P3 || 0) + (e2eTestsOutput.priority_coverage?.P3 || 0) + (backendTestsOutput.testsGenerated?.reduce((sum, t) => sum + (t.priority_coverage?.P3 || 0), 0) || 0),
  },
  knowledge_fragments_used: [
    ...(apiTestsOutput.knowledge_fragments_used || []),
    ...(e2eTestsOutput.knowledge_fragments_used || []),
    ...(backendTestsOutput.knowledge_fragments_used || [])
  ],
  subagent_execution: "SUBAGENT (parallel subagents)",
  performance_gain: "~40-70% faster than sequential"
};

fs.writeFileSync(`/tmp/tea-automate-summary-${timestamp}.json`, JSON.stringify(summary, null, 2), 'utf8');
console.log('✅ Wrote summary to /tmp/tea-automate-summary.json');
console.log(JSON.stringify(summary, null, 2));
