# 🛠️ Testing Troubleshooting Guide

This guide lists common testing issues and fixes for Backend (Python), Frontend (Next.js), and Microservices (NestJS).

## Backend (Python / pytest)

- Issue: ImportError / ModuleNotFoundError
  - Fix: Run `uv sync --all-extras --dev`. Verify PYTHONPATH if using relative imports.
- Issue: Coverage not generated
  - Fix: Ensure pytest.ini has `--cov` flags and `.coveragerc` exists. Run `uv run pytest --cov`.
- Issue: Async tests hang
  - Fix: Set `asyncio_mode = auto` in pytest.ini. Avoid nested event loops.
- Issue: Redis/DB connection errors
  - Fix: Use in-memory SQLite for tests or mock Redis with fixtures.

## Frontend (Jest / RTL)

- Issue: next/navigation or next/image mock errors
  - Fix: Verify jest.setup.ts mocks; clear .next cache and reinstall deps.
- Issue: CSS/assets import errors
  - Fix: Ensure identity-obj-proxy and file mocks configured in jest config.
- Issue: JSDOM-specific failures
  - Fix: Set `testEnvironment: 'jsdom'` in jest.config.ts.

## Microservices (NestJS / Jest / Supertest)

- Issue: ts-jest config errors
  - Fix: Ensure tsconfig references are correct and `ts-jest` present.
- Issue: E2E tests port conflicts
  - Fix: Use random ports or set `PORT=0`. Avoid overlapping test servers.
- Issue: Coverage missing
  - Fix: Use `--coverage` flag and ensure coverage reporters are enabled.

## CI/CD

- Issue: Quality gates fail due to missing artifacts
  - Fix: Ensure test workflows upload coverage artifacts as configured.
- Issue: Codecov upload failures
  - Fix: Set `fail_ci_if_error: false`; verify files path.

---

If problems persist, capture logs and open an issue with steps to reproduce.
