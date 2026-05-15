# Story 8.3.1: LLM Proxy Bidirectional Fallback (Epsilon ↔ Anthropic-Proxy)

Status: ready-for-dev

> **Note**: Tính năng này đã được implement trước khi story file được tạo. Story này tài liệu hóa hậu kỳ để dev agent / reviewer có context đầy đủ về scope, design rationale, và verification artifacts. Status `ready-for-dev` được giữ để chạy `code-review` workflow như stories khác.

## Story

As a Chainlens user dùng cùng một model `claude-opus-4-7` / `claude-sonnet-4-6` / `claude-haiku-4-5` qua hai providers song song (`epsilon` và `anthropic-proxy`),
I want hệ thống tự động fallback sang provider còn lại khi provider tôi chọn fail (URL parse error, 5xx, upstream timeout),
So that tôi không bị mất turn vì lỗi gateway tạm thời, và chỉ phải retry thủ công khi cả hai upstream cùng chết.

## Acceptance Criteria

1. **Server-side fallback (chainlens-proxy → epsilon-router)**: khi `apps/chainlens-proxy` (port 3002) nhận POST `/v1/chat/completions` với `model` ∈ whitelist claude và upstream chính (v98store) trả `>=500` HOẶC fetch throw, proxy retry 1 lần đến `FALLBACK_BASE_URL` (= Epsilon router) với `FALLBACK_API_KEY` và header `X-Fallback-Source: chainlens-proxy`. Response của fallback được forward lại client với status / Content-Type của upstream secondary.
2. **Server-side fallback (epsilon-router → chainlens-proxy)**: trong `apps/api/src/router/services/llm.ts` `proxyToOpenRouter`, khi `model` ∈ whitelist claude VÀ `config.ANTHROPIC_PROXY_URL` set, primary `OPENROUTER_API_URL` (v98store) fail (>=500 hoặc throw) → router retry tới `${ANTHROPIC_PROXY_URL}/chat/completions` với `Authorization: Bearer ${ANTHROPIC_PROXY_API_KEY}` và header `X-Fallback-Source: epsilon-router`.
3. **Loop guard**: khi request đến chainlens-proxy hoặc epsilon-router có sẵn header `X-Fallback-Source: <tag>`, branch fallback nội bộ MUST bị bỏ qua (chỉ trả response của primary, không retry). Verify: `grep -c "Fallback-Source"` trong log mỗi request ≤ 1.
4. **Whitelist scope**: fallback CHỈ áp dụng khi `model` ∈ `CLAUDE_FALLBACK_MODELS = ['claude-opus-4-7', 'claude-sonnet-4-6', 'claude-haiku-4-5', 'claude-haiku-4-5-20251001']`. Models ngoài whitelist (vd `gpt-5.4`, `gemini-3-1-pro-preview`, `minimax/minimax-m2.7`) giữ nguyên hành vi cũ — primary fail thì lỗi luôn, không retry sang provider khác.
5. **Streaming safety**: fallback chỉ thực hiện trước khi byte đầu tiên của response stream được flush về client. Khi đã streaming (`isStreaming=true` và đã trả `Response`), không retry — để client nhận lỗi giữa chừng và xử lý ở lớp UI.
6. **Whitelist constants shared**: file `apps/api/src/router/config/claude-fallback.ts` (server) và `apps/web/src/lib/llm/claude-fallback.ts` (FE) export cùng nội dung `CLAUDE_FALLBACK_MODELS`, `PROVIDER_PAIR`, `isClaudeFallbackModel()`, `getFallbackProvider()` để tránh drift. Mọi sửa đổi whitelist phải update cả 2 file.
7. **FE manual retry button**: khi cả 2 server-side fallback fail (turn assistant message có `error`), `TurnErrorDisplay` (`apps/web/src/components/session/session-error-banner.tsx`) hiện thêm button `Retry with [Epsilon|Anthropic Proxy]` nếu (a) currentModel.modelID ∈ whitelist, (b) currentModel.providerID có cặp đối ứng trong `PROVIDER_PAIR`, (c) error text match một trong các pattern fallback hint (`cannot be parsed as a url`, `502`, `503`, `504`, `upstream`, `both primary and fallback`, `all providers failed`).
8. **FE retry handler**: click button → `client.session.promptAsync` được gọi lại với `parts` lấy từ `buildForkPrompt(userMessage.parts)`, `model = { providerID: altProvider, modelID: currentModel.modelID }`, kế thừa `agent` và `directory` của session hiện tại. Trạng thái button cycle `idle → retrying → (success không-render | failed)`.
9. **Sandbox env wiring**: `ANTHROPIC_PROXY_URL` và `ANTHROPIC_PROXY_API_KEY` phải được inject vào sandbox container — qua startup sync (`apps/api/src/index.ts:keysToSync`) khi sandbox thiếu key, và qua pool env-injector (`apps/api/src/pool/env-injector.ts:buildEnvPayload`) cho cloud pool. Cả 2 chỉ inject khi cả 2 env vars đều set ở phía host.

## Tasks / Subtasks

> Tasks dưới mark `[x]` cho phần đã ship. Reviewer dùng làm checklist verify.

- [x] **Task 1: Shared whitelist constants** (AC #4, #6)
  - [x] 1.1: Tạo `apps/api/src/router/config/claude-fallback.ts` export `CLAUDE_FALLBACK_MODELS`, `PROVIDER_PAIR`, `isClaudeFallbackModel`, `FALLBACK_HEADER`.
  - [x] 1.2: Tạo `apps/web/src/lib/llm/claude-fallback.ts` mirror server file + bổ sung `getFallbackProvider()` helper cho FE.
- [x] **Task 2: Chainlens-proxy fallback chain** (AC #1, #3, #5)
  - [x] 2.1: Rewrite `apps/chainlens-proxy/src/index.ts` thành passthrough proxy với `UPSTREAM_BASE_URL` / `UPSTREAM_API_KEY` env-configurable, support body forward streaming.
  - [x] 2.2: Thêm fallback chain — đọc `FALLBACK_BASE_URL`, `FALLBACK_API_KEY`. Gắn header `X-Fallback-Source: chainlens-proxy` khi gọi fallback.
  - [x] 2.3: Loop guard — bỏ qua nhánh fallback khi incoming request đã có header `X-Fallback-Source`.
  - [x] 2.4: Cập nhật `apps/chainlens-proxy/.env` với `FALLBACK_BASE_URL=http://localhost:8008/v1/router` và `FALLBACK_API_KEY` (sandbox token).
- [x] **Task 3: Epsilon-router fallback path** (AC #2, #3, #5)
  - [x] 3.1: Update `proxyToOpenRouter(body, isStreaming, headers?)` trong `apps/api/src/router/services/llm.ts` — tách primary fetch khỏi fallback fetch, thêm try/catch để bắt cả throw và status >= 500.
  - [x] 3.2: Loop guard — `headers['x-fallback-source']` có giá trị → set `canFallback = false`.
  - [x] 3.3: Update caller `apps/api/src/router/routes/llm.ts:58` để collect headers từ `c.req.header()` và truyền xuống.
  - [x] 3.4: Verify `apps/api/src/config.ts` đã có `ANTHROPIC_PROXY_URL` + `ANTHROPIC_PROXY_API_KEY` (đã thêm trong fix prior).
- [x] **Task 4: FE retry banner** (AC #7, #8)
  - [x] 4.1: Update `apps/web/src/components/session/session-error-banner.tsx` `TurnErrorDisplay` — thêm props `onRetryWithFallback`, `fallbackProviderLabel`. Detect upstream-error patterns. State `idle|retrying|failed`.
  - [x] 4.2: Update `apps/web/src/components/session/session-chat.tsx` — thêm props `currentModel` + `onRetryWithFallback` cho `SessionTurn`, compute `fallbackInfo` per turn, bind handler.
  - [x] 4.3: Implement `handleRetryWithFallback(userMessageId, altProviderID)` callback — reuse `buildForkPrompt` + `client.session.promptAsync` với cặp providerID đối ứng.
- [x] **Task 5: Sandbox env injection** (AC #9)
  - [x] 5.1: Update `apps/api/src/index.ts` startup `keysToSync` để inject `ANTHROPIC_PROXY_URL` + `ANTHROPIC_PROXY_API_KEY` khi cả 2 set.
  - [x] 5.2: Update `apps/api/src/pool/env-injector.ts:buildEnvPayload` tương tự cho cloud pool.
  - [x] 5.3: Append vào `apps/api/.env` 2 keys với giá trị `http://host.docker.internal:3002/v1` + v98store key (cho local dev).
- [ ] **Task 6: Verification** (AC tất cả)
  - [x] 6.1: Curl test happy path chainlens-proxy `claude-haiku-4-5-20251001` → 200 OK.
  - [x] 6.2: Curl test fallback chainlens-proxy với `UPSTREAM_BASE_URL=http://invalid.local` → primary fail → fallback đến `localhost:8008/v1/router` → 200 OK; log có dòng `[fallback] primary=...status=0 ... → retry`.
  - [x] 6.3: Curl test loop guard chainlens-proxy với header `X-Fallback-Source: epsilon-router` → primary fail → trả 502 KHÔNG retry.
  - [x] 6.4: Curl test fallback epsilon-router với `OPENROUTER_API_URL=http://invalid.local` → router fallback đến chainlens-proxy → 200 OK.
  - [ ] 6.5: Browser E2E — login → chọn `Claude Opus 4.7 (Proxy)` → gửi tin → response. Stop chainlens-proxy → gửi → server fallback → response. Stop cả 2 → expect retry button hiện trên banner.
  - [ ] 6.6: Whitelist scope test — gửi `gpt-5.4` qua `epsilon` với upstream chết → expect lỗi (không fallback).
  - [ ] 6.7: Unit test scaffold `apps/api/src/__tests__/unit-llm-fallback.test.ts` — mock fetch, assert claude models fallback, gpt-5.4 không fallback, loop guard header bypass nhánh fallback.

## Dev Notes

### Existing implementation context

- **Provider config**: `core/epsilon-master/opencode/opencode.jsonc:28` định nghĩa provider `anthropic-proxy` với `baseURL: {env:ANTHROPIC_PROXY_URL}`. Tại thời điểm trước fix, sandbox không có biến này → opencode parse `""/chat/completions"` rỗng baseURL → fail. Provider `epsilon` (`opencode.jsonc:76`) dùng `EPSILON_API_URL/v1/router`.
- **Both providers share 3 claude models**: `claude-opus-4-7`, `claude-sonnet-4-6`, `claude-haiku-4-5(-20251001)`. ID model giống hệt nhau giữa hai providers — chỉ khác `providerID`.
- **OpenRouter alias**: `apps/api/src/config.ts:112` đặt `OPENROUTER_API_URL` mặc định `https://openrouter.ai/api/v1` nhưng local `.env` override thành `https://v98store.com/v1`. Đây là gateway thật cho cả 2 nhánh — chainlens-proxy → v98store và epsilon-router → v98store. Fallback hai chiều thực ra vẫn về cùng upstream cuối, nhưng path khác (router billing layer vs raw passthrough), phục vụ availability của intermediate hop.
- **Hot-reload note**: `apps/api` chạy `bun run --hot src/index.ts` — sửa code TS được pick up không cần restart manually. `apps/chainlens-proxy` cũng `bun run --hot` nhưng env file thay đổi cần restart bằng `kill $(lsof -ti :3002)` rồi start lại.
- **Sandbox env propagation**: POST `/env` (port 14000 trên host = 8000 trên sandbox) ghi vào `/run/s6/container_environment/<KEY>` nhưng KHÔNG restart opencode. Để nạp env mới, opencode-epsilon binary process phải bị kill (`s6-supervise` tự respawn, `with-contenv` đọc env mới). Patch tương tự đã có cho `EPSILON_TOKEN` rotation. Endpoint `POST /epsilon/reload {mode:"full"}` chỉ dispose OpenCode in-process (KHÔNG restart binary) → không nạp env mới.

### `proxyToOpenRouter` signature change

```ts
// Before
export async function proxyToOpenRouter(
  body: Record<string, unknown>,
  isStreaming: boolean,
): Promise<Response>

// After
export async function proxyToOpenRouter(
  body: Record<string, unknown>,
  isStreaming: boolean,
  headers?: Record<string, string>,  // lowercase keys, used for loop guard
): Promise<Response>
```

Caller: `apps/api/src/router/routes/llm.ts:58` thu thập `c.req.header()` (Hono trả `Record<string, string>`) lowercase key trước khi pass. Loop guard check `headers?.['x-fallback-source']`.

### `TurnErrorDisplay` props change

```ts
// New optional props (existing props giữ nguyên):
interface TurnErrorDisplayProps {
  errorText: string;
  className?: string;
  onRetryWithFallback?: () => void | Promise<void>;
  fallbackProviderLabel?: string;
}
```

`looksLikeUpstreamError(text)` filter ngăn button hiện cho mọi error (vd insufficient credits, abort) — chỉ hiện khi error text match upstream/URL pattern.

### File List (đã touch)

**Sửa**:
- `apps/chainlens-proxy/src/index.ts` — passthrough + fallback chain + loop guard.
- `apps/chainlens-proxy/.env` — `UPSTREAM_*`, `FALLBACK_*` env.
- `apps/api/src/router/services/llm.ts` — `proxyToOpenRouter` thêm fallback nhánh, signature thêm `headers`.
- `apps/api/src/router/routes/llm.ts` — caller pass headers xuống.
- `apps/api/src/config.ts` — `ANTHROPIC_PROXY_URL`, `ANTHROPIC_PROXY_API_KEY` schema + export.
- `apps/api/src/index.ts` — startup `keysToSync` thêm 2 keys.
- `apps/api/src/pool/env-injector.ts` — pool env payload thêm 2 keys.
- `apps/api/.env` — local dev values cho 2 keys.
- `apps/web/src/components/session/session-error-banner.tsx` — `TurnErrorDisplay` retry button.
- `apps/web/src/components/session/session-chat.tsx` — `handleRetryWithFallback`, `fallbackInfo`, props pass-through.

**Tạo mới**:
- `apps/api/src/router/config/claude-fallback.ts`
- `apps/web/src/lib/llm/claude-fallback.ts`

### Project Structure Notes

- Whitelist constants tách thành module riêng (`claude-fallback.ts`) thay vì inline trong llm.ts để FE/BE share logic mà không tạo cycle dependency.
- `apps/chainlens-proxy` vẫn là standalone Bun app, không tích hợp vào monorepo build pipeline. Production cần Docker image riêng hoặc deploy như sidecar — outside scope story này (defer Story 8.3).

### References

- [_bmad-output/planning-artifacts/epics.md#L1280-1296](_bmad-output/planning-artifacts/epics.md) — Story 8.3 LLM Proxy & MaaS gốc (parent).
- [core/epsilon-master/opencode/opencode.jsonc#L28-55](core/epsilon-master/opencode/opencode.jsonc) — provider `anthropic-proxy` định nghĩa.
- [core/epsilon-master/opencode/opencode.jsonc#L76-164](core/epsilon-master/opencode/opencode.jsonc) — provider `epsilon` định nghĩa.
- [apps/api/src/router/config/models.ts#L28-99](apps/api/src/router/config/models.ts) — model registry với pricing claude-*.
- [CLAUDE.md](CLAUDE.md) — project instructions, đặc biệt section Stack & Architecture / Backend convention.

## Dev Agent Record

### Agent Model Used

claude-opus-4-7 (Claude Code, Opus 4.7)

### Debug Log References

- Lỗi gốc: `"/chat/completions" cannot be parsed as a URL` từ `service=session.processor` — root cause: opencode-epsilon binary load env một lần khi start; sandbox không có `ANTHROPIC_PROXY_URL` → `new URL(...)` với baseURL rỗng fail. Fix: kill opencode binary để s6 respawn với env mới.
- Verify env propagation: `cat /proc/<pid>/environ | tr "\0" "\n" | grep ANTHROPIC_PROXY` sau khi inject.

### Completion Notes List

- Server-side fallback verify pass qua curl (chainlens-proxy + epsilon-router cả 2 chiều, loop guard hoạt động).
- Browser E2E + unit test (Task 6.5–6.7) chưa chạy do session bị logout giữa chừng và unit test framework chưa scaffold cho fallback module.
- Production note: `FALLBACK_API_KEY` hiện là sandbox token cho local dev. Khi deploy prod cần service token riêng để tránh lệch billing và rotation issue. Defer xử lý chính thức ở Story 8.3.

### File List

Xem section "File List (đã touch)" trong Dev Notes phía trên.
