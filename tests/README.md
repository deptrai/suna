# Test Suite Documentation

**Framework**: Playwright  
**Language**: TypeScript  
**Pattern**: API-First Testing with Fixture Architecture

---

## 🚀 Setup Instructions

### 1. Install Dependencies

```bash
cd frontend
npm install
```

Dependencies được cài đặt:
- `@playwright/test` - Playwright testing framework
- `@faker-js/faker` - Test data generation

### 2. Install Playwright Browsers

```bash
npx playwright install
```

Hoặc chỉ cài browsers cần thiết:
```bash
npx playwright install chromium
```

### 3. Configure Environment

Tạo file `.env` từ `.env.example` (nếu có):

```bash
cp .env.example .env
```

Cập nhật các biến môi trường:
- `BASE_URL`: URL của ứng dụng (mặc định: `http://localhost:3000`)
- `API_URL`: URL của API backend (mặc định: `http://localhost:8000/api`)
- `TEST_ENV`: Môi trường test (`local`, `staging`, `production`)

---

## 📋 Running Tests

### Local Execution

```bash
# Chạy tất cả tests
npm run test:e2e

# Chạy tests với UI mode (khuyến nghị cho development)
npm run test:e2e:ui

# Chạy tests với browser visible
npm run test:e2e:headed

# Debug mode (pause on failure)
npm run test:e2e:debug

# Xem test report
npm run test:e2e:report
```

### Chạy Tests Cụ Thể

```bash
# Chạy một test file
npx playwright test tests/e2e/example.spec.ts

# Chạy tests matching pattern
npx playwright test --grep "login"

# Chạy tests trên một browser cụ thể
npx playwright test --project=chromium
```

### CI/CD Execution

```bash
# Chạy tests trong CI (headless, với retries)
CI=true npm run test:e2e
```

---

## 🏗️ Architecture Overview

### Directory Structure

```
tests/
├── e2e/                          # Test files (organize as needed)
│   └── example.spec.ts           # Example test suite
├── support/                      # Framework infrastructure
│   ├── fixtures/                 # Test fixtures (key pattern)
│   │   ├── index.ts             # Main fixture composition
│   │   └── factories/            # Data factories
│   │       └── user-factory.ts   # User factory với auto-cleanup
│   ├── helpers/                  # Utility functions
│   └── page-objects/             # Page object models (optional)
└── README.md                     # This file
```

### Fixture Pattern

**Pattern**: Pure function → Fixture → Composition

1. **Pure Functions**: Test helpers không phụ thuộc framework (unit-testable)
2. **Fixtures**: Wrap pure functions với framework dependencies
3. **Composition**: Combine multiple fixtures via `mergeTests`

**Example**:

```typescript
import { test, expect } from '../support/fixtures';

test('example test', async ({ page, userFactory }) => {
  // userFactory được inject tự động
  const user = await userFactory.createUser({ role: 'admin' });
  // Auto-cleanup sau khi test xong
});
```

### Data Factories

**Principle**: API-first setup với dynamic factories

- ✅ Sử dụng `faker` để tạo unique values (tránh collision trong parallel tests)
- ✅ Accept overrides để thể hiện test intent: `createUser({ role: 'admin' })`
- ✅ API seeding trước khi test UI (10-50x faster)
- ✅ Auto-cleanup sau khi test hoàn tất

**Reference**: `bmad/bmm/testarch/knowledge/data-factories.md`

---

## 🎯 Best Practices

### Selector Strategy

**Luôn sử dụng `data-testid` attributes**:

```typescript
// ✅ Good
await page.click('[data-testid="login-button"]');

// ❌ Bad (brittle CSS selector)
await page.click('.btn-primary');
```

### Test Isolation

- Mỗi test phải độc lập, có thể chạy riêng lẻ
- Sử dụng factories để setup state, không phụ thuộc vào test trước
- Auto-cleanup đảm bảo không để lại side effects

### Test Organization

- Nhóm related tests trong `test.describe()` blocks
- Tổ chức test files theo feature/domain
- Sử dụng descriptive test names: `should create user and login`

### Timeouts

Cấu hình timeouts trong `playwright.config.ts`:

- **Test timeout**: 60s
- **Action timeout**: 15s  
- **Navigation timeout**: 30s
- **Assertion timeout**: 15s

Nếu cần timeout khác cho specific action:

```typescript
await page.click('[data-testid="button"]', { timeout: 5000 });
```

### Failure Artifacts

Artifacts được capture **chỉ khi failure**:

- **Screenshots**: `test-results/` folder
- **Videos**: Chỉ khi test fail (để giảm storage)
- **Traces**: Chỉ khi test fail (Playwright trace viewer)

Xem artifacts:
```bash
npm run test:e2e:report
```

---

## 🔗 CI Integration

### GitHub Actions Example

```yaml
name: E2E Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '20'
      - run: npm ci
      - run: npx playwright install --with-deps
      - run: npm run test:e2e
        env:
          CI: true
      - uses: actions/upload-artifact@v3
        if: failure()
        with:
          name: playwright-report
          path: test-results/
```

---

## 📚 Knowledge Base References

Test architecture dựa trên BMAD TEA knowledge base:

- **Fixture Architecture**: `bmad/bmm/testarch/knowledge/fixture-architecture.md`
  - Pure function → fixture pattern
  - Composable fixtures với `mergeTests`
  
- **Data Factories**: `bmad/bmm/testarch/knowledge/data-factories.md`
  - Factory functions với overrides
  - API-first setup
  
- **Playwright Config**: `bmad/bmm/testarch/knowledge/playwright-config.md`
  - Environment-based configuration
  - Timeout standards
  
- **Network-First Safeguards**: `bmad/bmm/testarch/knowledge/network-first.md`
  - Intercept-before-navigate workflow
  - Deterministic waits

- **Test Quality**: `bmad/bmm/testarch/knowledge/test-quality.md`
  - Test design principles
  - Isolation rules

---

## 🐛 Troubleshooting

### Tests Fail Intermittently

- Kiểm tra network conditions (thêm waits nếu cần)
- Verify test isolation (không phụ thuộc vào test khác)
- Check for race conditions (sử dụng proper waits)

### Browser Not Found

```bash
npx playwright install
```

### Port Already in Use

Kiểm tra nếu port 3000 đã được sử dụng:
```bash
lsof -ti:3000 | xargs kill -9
```

### Environment Variables Not Loading

Đảm bảo `.env` file tồn tại và `BASE_URL`, `API_URL` được set đúng.

---

## 📝 Next Steps

1. ✅ Framework đã được scaffold
2. ✅ Sample tests đã được tạo
3. 🔄 Cập nhật tests theo actual application flows
4. 🔄 Thêm more factories nếu cần (products, orders, etc.)
5. 🔄 Setup CI/CD pipeline
6. 🔄 Add contract testing (Pact) nếu có microservices

---

**Generated by BMAD TEA (Master Test Architect)**  
**Framework**: Playwright v1.49+  
**Pattern**: API-First Testing with Fixture Architecture


