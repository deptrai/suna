# Backend Start Issue - Test Execution

## Status: ⚠️ Backend Environment Issue

## Problem

Backend không thể start được do vấn đề với environment/dependencies khi dùng `uv run`.

**Error:**
```
ModuleNotFoundError: No module named 'fastapi'
```

Mặc dù `uv run python -c "import fastapi"` hoạt động, nhưng `uv run uvicorn` không load được dependencies.

## Solutions Tried

1. ✅ **Fixed import conflict** - Resolved `core/api.py` vs `core/api/` package conflict
2. ✅ **Fixed Playwright config** - webServer chỉ start cho E2E tests
3. ❌ **Backend start** - Multiple attempts failed due to environment issues

## Manual Start Instructions

### Option 1: Using uv (Recommended)

```bash
cd backend
uv sync  # Ensure dependencies are synced
uv run uvicorn api:app --host 0.0.0.0 --port 8000
```

### Option 2: Using Python venv

```bash
cd backend
uv venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
uv pip install -e .
python -m uvicorn api:app --host 0.0.0.0 --port 8000
```

### Option 3: Using start script

```bash
./scripts/core/start_simple.sh
```

## Verify Backend

```bash
curl http://localhost:8000/health
# Should return: {"status":"ok",...}
```

## Run Tests After Backend Starts

```bash
cd frontend
npm run test:api
```

## Current Test Status

- ✅ **20 tests configured** and ready
- ✅ **Test infrastructure** complete (fixtures, helpers, factories)
- ❌ **Backend not running** - tests fail with `ECONNREFUSED`

## Expected Results After Backend Starts

Once backend is running:
- Tests should connect successfully
- Some tests may still fail due to:
  - Authentication (placeholder tokens)
  - Missing test data
  - API response differences

## Next Steps

1. Start backend manually using one of the options above
2. Verify backend health endpoint
3. Run tests: `cd frontend && npm run test:api`
4. Fix any remaining test failures

---

**Note:** Backend code has been fixed. The issue is with environment/dependency loading when starting the server programmatically.





