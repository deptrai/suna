# Test Setup Requirements

**Last Updated:** 2025-11-02

---

## Prerequisites

### 1. Development Server

**Required:** Dev server must be running before executing tests

```bash
cd frontend
npm run dev
```

**Keep this running in a separate terminal** while running tests.

**Alternative:** Uncomment `webServer` in `playwright.config.ts` to auto-start dev server (slower but automatic).

---

### 2. Environment Variables

**Required:** `.env.local` with Supabase credentials

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
BASE_URL=http://localhost:3000
```

**Status:** ✅ Already configured

---

### 3. Browsers

**Current Setup:** Chromium only (for faster local testing)

**To enable Firefox/Webkit:**
```bash
cd frontend
npx playwright install firefox webkit
```

Then uncomment in `playwright.config.ts`:
```typescript
{ name: 'firefox', use: { ...devices['Desktop Firefox'] } },
{ name: 'webkit', use: { ...devices['Desktop Safari'] } },
```

---

## Quick Start

### Run Tests

```bash
cd frontend

# Terminal 1: Start dev server
npm run dev

# Terminal 2: Run tests
npm run test:e2e:p0  # P0 tests only
npm run test:e2e     # All tests
```

---

## Test Execution Order

1. ✅ Start dev server (`npm run dev`)
2. ✅ Verify `.env.local` exists
3. ✅ Run tests (`npm run test:e2e:p0`)

---

## Troubleshooting

### Tests Timeout

**Issue:** `TimeoutError: page.goto: Timeout 30000ms exceeded`

**Fix:** Ensure dev server is running on `http://localhost:3000`

### Browser Not Found

**Issue:** `Error: browserType.launch: Executable doesn't exist`

**Fix:** 
```bash
npx playwright install
# Or install specific browser:
npx playwright install chromium  # Default, usually installed
npx playwright install firefox
npx playwright install webkit
```

### Form Submission Fails

**Issue:** Submit button disabled or checkbox won't check

**Fix:** Already handled in fixtures - if persists, check form validation requirements

---

## Configuration

### Current Setup

- **Browsers:** Chromium only (fastest)
- **Dev Server:** Manual start required
- **Environment:** `.env.local` (auto-loaded)

### Recommended for CI/CD

- **Browsers:** Chromium only (CI usually has limited resources)
- **Dev Server:** Auto-start via `webServer` config
- **Environment:** GitHub Secrets (configured in workflow)

---

**Status:** ✅ Ready for testing


