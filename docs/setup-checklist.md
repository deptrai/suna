# Test Setup Checklist - Step by Step

**Purpose:** Complete setup checklist for enabling all E2E tests  
**Status:** In Progress

---

## Step 1: Setup Authentication Environment ✅

### 1.1 Create Test Environment File

```bash
cd frontend
touch .env.test.local
```

### 1.2 Configure Supabase Credentials

Edit `frontend/.env.test.local` and add:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-test-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-test-anon-key-here
BASE_URL=http://localhost:3000
API_URL=http://localhost:8000/api
```

**Options:**
- **Test Supabase Project** (Recommended): Create separate project for testing
- **Local Supabase**: Run `npx supabase start` and use local URL
- **Production** (Not Recommended): Only if no other option

### 1.3 Verify Configuration

- [x] `.env.test.local` created
- [ ] Supabase credentials configured
- [ ] Playwright config updated to load `.env.test.local`

---

## Step 2: Enable Authentication Tests (P0) 🔄

### 2.1 Verify Tests are Un-Skipped

Check `frontend/tests/e2e/authentication.spec.ts`:
- [ ] `AUTH-P0-002`: Signup flow - Should be active (not skipped)
- [ ] `AUTH-P0-003`: Login flow - Should be active (not skipped)

### 2.2 Run P0 Authentication Tests

```bash
cd frontend
npm run test:e2e:p0
```

Expected: 3 tests should run
- [ ] AUTH-P0-001: Load auth page (should pass)
- [ ] AUTH-P0-002: Signup flow (requires Supabase)
- [ ] AUTH-P0-003: Login flow (requires Supabase)

### 2.3 Verify Results

- [ ] All tests pass or fail gracefully
- [ ] No network errors
- [ ] Supabase connection working

---

## Step 3: Enable Dashboard Tests (P0) ⏳

### 3.1 Verify Tests

Check `frontend/tests/e2e/dashboard.spec.ts`:
- [ ] `DASH-P0-001`: Dashboard access - Should use `authenticatedUser` fixture

### 3.2 Run Dashboard Tests

```bash
npm run test:e2e -- tests/e2e/dashboard.spec.ts
```

- [ ] Tests pass with authenticated user

---

## Step 4: Enable Threads Tests (P0) ⏳

### 4.1 Verify Tests

Check `frontend/tests/e2e/threads.spec.ts`:
- [ ] Tests use `authenticatedUser` fixture
- [ ] Tests require test projects/threads setup

### 4.2 Setup Test Data

Create test projects and threads via:
- API calls in fixtures
- Database seeding
- Manual setup

### 4.3 Run Threads Tests

```bash
npm run test:e2e -- tests/e2e/threads.spec.ts
```

- [ ] Tests pass

---

## Step 5: Enable Checkout Tests (P0) ⏳

### 5.1 Verify Tests

Check `frontend/tests/e2e/checkout.spec.ts`:
- [ ] Basic page loading tests (should already work)
- [ ] Stripe integration tests (require Stripe test mode)

### 5.2 Setup Stripe Test Mode

- [ ] Get Stripe test API keys
- [ ] Configure in `.env.test.local`
- [ ] Create test checkout sessions

### 5.3 Run Checkout Tests

```bash
npm run test:e2e -- tests/e2e/checkout.spec.ts
```

- [ ] All tests pass

---

## Step 6: Enable Agent Config Tests (P1) ⏳

### 6.1 Verify Tests

Check `frontend/tests/e2e/agent-config.spec.ts`:
- [ ] Tests use `authenticatedUser` fixture
- [ ] Tests require test agents

### 6.2 Setup Test Agents

Create test agents via API or fixtures

### 6.3 Run Agent Config Tests

```bash
npm run test:e2e -- tests/e2e/agent-config.spec.ts
```

---

## Step 7: Enable Settings Tests (P1) ⏳

### 7.1 Verify Tests

Check `frontend/tests/e2e/settings.spec.ts`:
- [ ] API Keys tests (require auth + API)
- [ ] Credentials tests (require auth)

### 7.2 Run Settings Tests

```bash
npm run test:e2e -- tests/e2e/settings.spec.ts
```

---

## Step 8: Run Full Test Suite ⏳

### 8.1 Run All Tests

```bash
npm run test:e2e
```

### 8.2 Generate Coverage Report

```bash
npm run test:e2e:report
```

### 8.3 Verify Coverage

- [ ] Total tests: 72 tests
- [ ] Active tests: >22 tests (after enabling)
- [ ] Coverage >30%

---

## Step 9: Re-run Gate Decision

### 9.1 Execute Trace Workflow

Run BMAD `*trace` workflow to re-evaluate quality gate:
- Should show improved coverage
- P0 tests should all be enabled

---

## Progress Tracking

- [x] Step 1: Setup Authentication Environment
- [ ] Step 2: Enable Authentication Tests
- [ ] Step 3: Enable Dashboard Tests
- [ ] Step 4: Enable Threads Tests
- [ ] Step 5: Enable Checkout Tests
- [ ] Step 6: Enable Agent Config Tests
- [ ] Step 7: Enable Settings Tests
- [ ] Step 8: Run Full Test Suite
- [ ] Step 9: Re-run Gate Decision

---

**Current Status:** Step 1 complete, Step 2 in progress

**Next Action:** Verify Authentication tests run correctly


