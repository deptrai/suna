# Story 1.1: Khởi tạo Project & Lifecycle Hooks

Status: completed

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a System Operator,
I want a clean Hono/Bun starter template with lifecycle endpoints and structured logging,
so that the service is observable and can be safely deployed.

## Acceptance Criteria

1. **Given** một pnpm workspace hiện tại
   **When** khởi tạo ứng dụng mới
   **Then** `apps/chainlens-agent` được tạo ra dùng Hono và Bun
   **And** ứng dụng expose type-safe Hono RPC.
2. **Given** ứng dụng đang chạy
   **When** gọi các endpoint `/healthz`, `/readyz`, và `/api/v1/version`
   **Then** trả về HTTP 200 OK và đúng định dạng version handshake
   **And** hệ thống log bằng structured JSON (kèm `requestId`), không dùng `console.log`
   **And** ứng dụng handle graceful shutdown khi nhận SIGTERM.

## Tasks / Subtasks

- [x] Task 1: Khởi tạo thư mục và cấu hình (AC: 1)
  - [x] Tạo `apps/chainlens-agent` sử dụng Bun + Hono.
  - [x] Thiết lập `package.json`, `tsconfig.json` tích hợp vào pnpm workspace.
- [x] Task 2: Xây dựng App và Middleware cơ bản (AC: 1, 2)
  - [x] Tạo `src/app.ts` khởi tạo instance Hono.
  - [x] Thêm middleware cho structured JSON logging (kèm `requestId`), chặn `console.log`.
  - [x] Thiết lập Type-safe RPC export (`AppType`).
- [x] Task 3: Lifecycle Hooks & Endpoints (AC: 2)
  - [x] Tạo `/healthz`, `/readyz`, và `/api/v1/version` endpoints.
  - [x] Xử lý graceful shutdown (lắng nghe `SIGTERM` / `SIGINT`).

## Dev Notes

- **Relevant architecture patterns and constraints**: 
  - Sử dụng Bun runtime và Hono framework.
  - Export kiểu `AppType` để phục vụ cho type-safe Hono RPC client tại frontend.
  - Nghiêm cấm dùng `console.log`, phải dùng structured JSON logging.
  - Request-scoped DI (nếu có sau này, hiện tại chuẩn bị sẵn chỗ cho middleware).
- **Source tree components to touch**:
  - `apps/chainlens-agent/` (Thư mục mới hoàn toàn)
  - `apps/chainlens-agent/src/app.ts`
  - `apps/chainlens-agent/package.json`
- **Testing standards summary**:
  - Sử dụng Bun Test cho unit testing. Phải đảm bảo endpoints `/healthz`, `/readyz` trả về 200 OK.

### Project Structure Notes

- Alignment with unified project structure: Nằm trong `apps/chainlens-agent` của monorepo.
- Ứng dụng này phục vụ Core AI Assistant (độc lập với `chainlens-proxy` vốn là LLM Proxy Gateway).

### References

- [Source: _bmad-output/planning-artifacts/architecture.md#Option C]
- [Source: _bmad-output/planning-artifacts/epics.md#Story 1.1]

## Dev Agent Record

### Agent Model Used

Claude-3.7-Sonnet (Antigravity)

### Debug Log References

### Completion Notes List

Ultimate context engine analysis completed - comprehensive developer guide created.

### File List

- `apps/chainlens-agent/src/app.ts`
- `apps/chainlens-agent/package.json`
- `apps/chainlens-agent/tsconfig.json`
