# Authentication Test Setup Guide

**Purpose:** Setup authentication environment for E2E tests  
**Priority:** P0 (CRITICAL)  
**Status:** Ready for Configuration

---

## Quick Start

### Step 1: Create Test Environment File

```bash
cd frontend
cp .env.test.example .env.test.local
```

### Step 2: Configure Supabase Credentials

Edit `frontend/.env.test.local` and add your test Supabase credentials:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-test-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-test-anon-key
```

**Options for Supabase:**

1. **Use Test Supabase Project (Recommended)**
   - Create a separate Supabase project for testing
   - Use that project's URL and anon key
   - Keeps test data separate from production

2. **Use Local Supabase**
   - Run Supabase locally: `npx supabase start`
   - Use local URL: `http://localhost:54321`
   - Use local anon key from Supabase dashboard

3. **Use Production Supabase (Not Recommended)**
   - Only if no other option
   - Risk: Test data mixed with production
   - Use with caution

### Step 3: Verify Setup

```bash
# Run P0 tests
cd frontend
npm run test:e2e:p0
```

Tests should now run (will be skipped if Supabase not configured).

---

## Test Behavior

### With Supabase Configured

- ✅ Tests will create real users via signup flow
- ✅ Tests will authenticate with real Supabase
- ✅ Full end-to-end authentication validation
- ⚠️ Test users created in Supabase (need cleanup strategy)

### Without Supabase Configured

- ⚠️ Tests will use mock credentials
- ⚠️ Authentication tests will skip or fail gracefully
- ℹ️ Non-auth tests will continue to work

---

## Test Fixtures

### `authenticatedUser` Fixture

Automatically creates test user and authenticates:

```typescript
test('example', async ({ page, authenticatedUser }) => {
  // authenticatedUser provides:
  // - email: string
  // - password: string  
  // - name: string
  // User is automatically signed up via Supabase
});
```

**How it works:**
1. Generates unique test credentials (faker)
2. Navigates to signup page
3. Fills and submits signup form
4. Waits for successful signup
5. Provides credentials to test
6. Cleanup handled by Supabase (or test database cleanup)

---

## P0 Tests Enabled

After setup, these tests will run:

1. **AUTH-P0-002:** Signup flow
   - File: `frontend/tests/e2e/authentication.spec.ts:28`
   - Creates new user via signup
   - Verifies redirect to dashboard

2. **AUTH-P0-003:** Login flow
   - File: `frontend/tests/e2e/authentication.spec.ts:67`
   - Uses authenticatedUser fixture
   - Verifies login and redirect

3. **DASH-P0-001:** Dashboard access
   - File: `frontend/tests/e2e/dashboard.spec.ts:17`
   - Uses authenticatedUser fixture
   - Verifies dashboard loads after auth

---

## Troubleshooting

### "Supabase not configured" Warning

**Cause:** `.env.test.local` not created or credentials not set

**Fix:**
```bash
cd frontend
cp .env.test.example .env.test.local
# Edit .env.test.local with your credentials
```

### Tests Failing with "Network Error"

**Cause:** Supabase URL incorrect or unreachable

**Fix:**
- Verify Supabase URL is correct
- Check network connectivity
- Verify Supabase project is active

### "User already exists" Errors

**Cause:** Test users not cleaned up between runs

**Fix:**
- Implement user cleanup in fixture
- Or use unique emails (faker already does this)
- Or setup test database reset between runs

### Tests Timing Out

**Cause:** Authentication flow taking too long

**Fix:**
- Increase timeout in `playwright.config.ts`
- Check Supabase response times
- Verify test environment has good connectivity

---

## Cleanup Strategy

### Option 1: Automatic Cleanup (Recommended)

Implement cleanup in fixture after test:

```typescript
// In auth.fixture.ts
// After await use(...), add:
// Delete user via Supabase admin API (if available)
```

### Option 2: Test Database Reset

Reset test database between test runs:

```bash
# Before tests
npm run db:reset:test
```

### Option 3: Manual Cleanup

Periodically clean test users from Supabase dashboard.

---

## CI/CD Integration

For GitHub Actions, add secrets:

1. Go to GitHub Settings → Secrets and variables → Actions
2. Add secrets:
   - `TEST_SUPABASE_URL` - Test Supabase project URL
   - `TEST_SUPABASE_ANON_KEY` - Test Supabase anon key
3. Update workflow to use secrets:

```yaml
env:
  NEXT_PUBLIC_SUPABASE_URL: ${{ secrets.TEST_SUPABASE_URL }}
  NEXT_PUBLIC_SUPABASE_ANON_KEY: ${{ secrets.TEST_SUPABASE_ANON_KEY }}
```

---

## Verification Checklist

- [ ] `.env.test.local` created from `.env.test.example`
- [ ] Supabase credentials configured
- [ ] Run `npm run test:e2e:p0` - all 3 tests should run
- [ ] All P0 tests passing
- [ ] Verify coverage: `npm run test:e2e:p0` shows 3/3 tests
- [ ] Re-run gate decision: `*trace` workflow

---

**Next Steps After Setup:**

1. Run P0 tests: `npm run test:e2e:p0`
2. Verify all pass
3. Check coverage = 100% for P0
4. Re-run gate decision: `*trace`

---

**Last Updated:** 2025-11-02




