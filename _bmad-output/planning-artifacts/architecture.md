---
stepsCompleted: [1, 2, 3, 4, 5, 6, 7]
inputDocuments: ['_bmad-output/planning-artifacts/prd.md', '_bmad-output/project-context.md']
workflowType: 'architecture'
project_name: 'chainlens'
user_name: 'Luisphan'
date: '2026-05-08'
validation_status: 'READY_FOR_IMPLEMENTATION'
---

# Architecture Decision Document

_This document builds collaboratively through step-by-step discovery. Sections are appended as we work through each architectural decision together._

## Step 2: Project Context Analysis
*(Chấp nhận từ kết quả Elicitation - Red Team vs Blue Team Analysis)*

### Ràng buộc về Functional & Non-Functional Requirements (NFRs)
- **Bảo mật Sandbox:** Thiết lập `No outbound network`, `Strict Resource Quotas` (CPU/RAM cho MicroVM) và `Output Sanitization` để tránh buffer overflow trên Host.
- **Bảo mật dữ liệu (Enterprise Tier 3):** Triển khai cơ chế `Data Provenance` để chống Data Poisoning (đầu độc dữ liệu RAG), đảm bảo chỉ đồng bộ các dữ liệu có độ uy tín cao.
- **Tính ổn định tài chính:** Bổ sung `Distributed Locking` (dùng Redis) cho cơ chế trừ Credits để chống Race Condition khi stream LLM.
- **Tính sẵn sàng (Reliability):** Áp dụng `Circuit Breakers` cho toàn bộ các kết nối API từ bên thứ 3 (Nansen, DeFiLlama) để đảm bảo TTFB < 2s.
- **Tính tương thích:** Phải tích hợp liền mạch với Core Chainlens hiện tại (Bun, TypeScript, Hono/Elysia-like, Drizzle ORM, Supabase, Next.js).

### Lộ trình Phát hành (Roadmap / Release Milestones)
- **Phase 1 (MVP):**
  - Khởi tạo kiến trúc 3-Tier cơ bản (API Gateway, Agent Orchestrator, Core DB).
  - Phát triển Browser Extension (Vigilant Companion) & Discover Page cho Free Tier.
  - Tích hợp Vercel AI SDK cho tính năng Advisory (Generative UI).
  - Áp dụng Sandbox sơ khởi cho Code Gen.
  - Mô hình Free/Premium (Single-Tokenomics).
- **Phase 2 (Growth):**
  - Nâng cấp Sandbox (Firecracker MicroVM) với Strict Quotas và No outbound network.
  - Ra mắt tính năng Backtesting chuyên sâu.
  - Triển khai Dual-Tokenomics và cơ chế thanh toán/locking qua Redis.
  - Tính năng Enterprise: Data Provenance và Zero-Data-Leakage.

## Step 3: Starter Template Evaluation

### Primary Technology Domain
Web Application & API Backend (Brownfield Project / Monorepo Extension) based on project requirements analysis.

### Starter Options Considered

1. **Vercel AI SDK + Next.js (App Router)** - Mở rộng UI cho Chainlens tại `apps/web`.
2. **ElysiaJS / Hono + Bun (Chainlens Core Template)** - Thiết kế Agent Orchestrator & API Gateway tại `apps/api`.
3. **Browser Extension (Vite/React)** - Tích hợp Side Panel và Content Script tiêm Shadow DOM tại `apps/extension`.
4. **Chainlens Internal Monorepo Boilerplate** - Tái sử dụng Database connection pool, Type Safety end-to-end.

### Selected Starter: Option C - Monorepo Independent Deployment (`apps/chainlens-agent`)

**Rationale for Selection:**
Vì Chainlens là nền tảng độc lập, việc tái sử dụng `pnpm workspace` là bắt buộc để chia sẻ Drizzle Schemas và Utilities.
Để tuân thủ Best Practices cho các tác vụ AI (Heavy I/O, Long-polling, Sandbox communication) mà không làm ảnh hưởng (block event loop / exhaust connection pool) của các REST API user-facing tại `apps/api`, chúng ta sẽ thiết lập một module độc lập mang tên `apps/chainlens-agent` (sử dụng Hono/Bun). Nó vẫn nằm trong monorepo nhưng được triển khai ở container riêng biệt (Fault Isolation).

**Initialization Command (Dependencies Addition):**

```bash
# Thêm Vercel AI SDK vào Frontend
cd apps/web && pnpm add ai @ai-sdk/react zod @ai-sdk/openai

# Tạo thư mục mới cho Agent Orchestrator và cài đặt dependencies
mkdir -p apps/chainlens-agent && cd apps/chainlens-agent
bun init
pnpm add ai @ai-sdk/openai hono
```

**Architectural Decisions Provided by Starter:**

- **Language & Runtime:** TypeScript (Strict Mode), Bun cho Backend, Node.js/Edge cho Frontend Next.js.
- **Styling Solution:** TailwindCSS kết hợp Radix-like primitives (shadcn/ui).
- **Build Tooling:** Turborepo, Next.js Turbopack, Bun bundler.
- **Testing Framework:** Bun Test (Unit/Backend) và Playwright (E2E).
- **Code Organization:** Cấu trúc Monorepo chia theo `apps/*` (client/services apps) và `packages/*` (shared logic, db schemas).
- **Development Experience:** Tái sử dụng s6-services kết hợp hot-reloading từ Bun. Share type an toàn từ Database đến Orchestrator và Frontend.

**Lưu ý:** Việc tạo folder `apps/chainlens-agent` và thiết lập kết nối cơ bản với `packages/db` sẽ là Story số 1 trong Implementation Phase.

## Step 4: Core Architectural Decisions

### Decision Priority Analysis

**Critical Decisions (Block Implementation):**
- Giao tiếp nội bộ (Internal Communication): Hono RPC.
- Infrastructure & Deployment: Sandbox Abstraction Layer (SandboxProvider) cho luồng Code Execution.

**Important Decisions (Shape Architecture):**
- Quản lý trạng thái AI (Frontend State): Vercel AI SDK Hooks (`useChat`, `useObject`).
- Kiến trúc dữ liệu (Data Caching/Locking): Redis (Upstash/Local s6) cho Distributed Locking.

**Deferred Decisions (Post-MVP):**
- Cơ sở hạ tầng scale tự động cho Firecracker MicroVMs.

### API & Communication Patterns
- **Quyết định:** Sử dụng **Hono RPC (v4.12+)** cho kết nối Backend-to-Frontend trong pnpm workspace.
- **Căn cứ (Rationale):** Type-safe native trên Bun, không yêu cầu build steps như GraphQL hay tRPC, tối ưu tốc độ gọi hàm và chia sẻ kiểu dữ liệu trực tiếp từ `apps/chainlens-agent` sang `apps/web`.

### Data Architecture
- **Quyết định:** Sử dụng **Redis** làm Distributed Cache & Lock Manager.
- **Căn cứ (Rationale):** Lock KHÔNG phải để atomic decrement (DB đã đảm bảo). Lock cần vì Hold-and-Settle là **two-phase reservation** — giữa hold và settle, tổng reservation không được vượt balance. Redis lock bảo vệ reservation window này. Đồng thời Redis làm lớp cache (semantic cache) cho các prompt trùng lặp.

### Infrastructure & Deployment
- **Quyết định:** Sử dụng **Sandbox Abstraction Layer** với Firecracker MicroVMs làm production backend.
- **Căn cứ (Rationale):** Đảm bảo an toàn bảo mật tuyệt đối khi chạy Code Generation từ LLM. Sandbox được trừu tượng hóa qua interface `SandboxProvider` — cho phép swap backend giữa Deno subprocess/gVisor (Phase 1 MVP, nhẹ, chạy được trên Mac) và Firecracker (Phase 2, full kernel isolation). Service code KHÔNG phụ thuộc trực tiếp vào Firecracker API.
- **Lưu ý:** Interface tồn tại chủ yếu cho **testability** (mock injection trong unit tests), không phải vì cần runtime polymorphism ở Phase 1.

### Multi-chain Strategy
- **Quyết định:** Agnostic Multi-chain Support (Không hardcode blockchain logic).
- **Căn cứ (Rationale):** Sử dụng khả năng tự nhận diện của LLM để sinh code cho nhiều hệ sinh thái khác nhau (EVM, Solana, Move, v.v.). Hệ thống Agent và Sandbox Runtime sẽ được thiết kế linh hoạt, không bị trói buộc (agnostic) vào bất kỳ ngôn ngữ lập trình smart contract cụ thể nào.

### LLM Proxy & Token Utility (Model-as-a-Service)
- **Quyết định:** Tích hợp LLM Proxy Gateway và Self-Hosted Model (Qwen 3.6 27B) thanh toán bằng Crypto (`$CLENS` token).
- **Căn cứ (Rationale):** Hoàn thiện chuỗi giá trị Tokenomics (Data Flywheel -> Token Sink). Hệ thống đóng vai trò như một "OpenRouter cho Web3", cung cấp quyền truy cập LLM ẩn danh. Proxy Gateway sẽ thực hiện routing request, track input/output tokens chính xác, và trừ credits trực tiếp từ ví off-chain của user. Kiến trúc Hold-and-Settle với Redis Lock Manager sẽ được áp dụng trực tiếp cho luồng Proxy này để đảm bảo tốc độ cao và chống Race Condition.

### Decentralized Local Compute (Ollama Integration)
- **Quyết định:** Hỗ trợ kết nối Local LLM thông qua Ollama (User host model tại thiết bị cá nhân).
- **Căn cứ (Rationale):** Tối đa hóa việc tận dụng năng lực tính toán (Compute) nhàn rỗi từ thiết bị của user. Thay vì gọi API tốn phí, user có thể chạy Ollama ở local và trỏ Chainlens về `localhost`. Nâng cao hơn, user có thể tham gia vào **Compute Pool** (đóng vai trò như worker node) để chia sẻ năng lực tính toán cho mạng lưới và nhận thưởng token `$CLENS`. Kiến trúc này yêu cầu Web App/Extension có khả năng bypass CORS và định tuyến traffic về máy local của user một cách bảo mật.

### Frontend & Extension Architecture
- **Quyết định 1 (Web UI):** Sử dụng **Vercel AI SDK Hooks** (v6+) kết hợp **Generative UI**. Tool calls từ backend được stream và render trực tiếp thành các React components (Token Info, Risk Badge).
- **Quyết định 2 (Extension):** Sử dụng kiến trúc React/Vite cho `apps/extension`. Giao diện tiêm vào host website (như X, DexScreener) bắt buộc dùng **Shadow DOM** để cách ly CSS (đảm bảo style Epsilon Cyber-Glass không bị xung đột). Background scripts quản lý Auth sync với Web App.
- **Căn cứ (Rationale):** SDK v6 hỗ trợ MCP và built-in streaming/structured output, kết hợp Generative UI mang lại trải nghiệm Crypto-native mượt mà. Extension cô lập style giúp UI hoạt động ổn định trên mọi nền tảng thứ ba.

### Decision Impact Analysis

**Implementation Sequence:**
1. Setup Redis và cấu hình Distributed Lock helper tại `packages/shared`.
2. Dựng khung Hono RPC trong `apps/chainlens-agent` và export type cho `apps/web`.
3. Tích hợp Vercel AI SDK (`useChat`) tại frontend và kết nối với router của Hono.
4. Triển khai Sandbox Integration (implement `SandboxProvider` — Deno subprocess cho Phase 1, Firecracker cho Phase 2).

**Cross-Component Dependencies:**
- Hono RPC client tại Frontend phụ thuộc trực tiếp vào TypeScript interfaces export từ Backend.
- Vercel AI SDK tại Frontend phụ thuộc vào logic streaming response chuẩn format của AI SDK trả về từ `chainlens-agent`.

## Step 5: Implementation Patterns & Consistency Rules

### Pattern Categories Defined

**Critical Conflict Points Identified:** 7 khu vực:
1. Quy tắc đặt tên Schema & Redis keys.
2. Cấu trúc Route Hono, RPC & Frontend Client.
3. Cấu trúc thư mục, DI & AI Tool Definitions.
4. Error Handling, Sandbox Security & Output Sanitization.
5. Quy trình tính phí an toàn (Hold & Settle).
6. Lifecycle Management & Frontend Resilience.
7. Observability, Rate Limiting & Idempotency.

### Naming Patterns

**Database & Redis:**
- **Tables:** `snake_case` số nhiều (`agent_sessions`).
- **Columns:** `snake_case` (`created_at`).
- **Redis Keys:** `<service>:<entity>:<id>:<action>` (`chainlens:user:123:credit_lock`).
- **Idempotency Redis Keys:** `chainlens:idempotency:<userId>:<key>` — PHẢI scope theo `userId` để chống spoofing.

**API (Hono RPC):**
- **Paths:** Kebab-case + namespace (`/api/v1/sandbox/execute-code`).
- Bắt buộc Zod validation (`zValidator`).

**Code:**
- **Files/Folders:** Kebab-case. **Classes/Interfaces:** PascalCase. **Functions/Variables:** camelCase.

**Environment Variables:**
- App-specific: prefix `CHAINLENS_` (`CHAINLENS_MOCK_SANDBOX`, `CHAINLENS_BUILD_HASH`).
- Shared/Chainlens-level: giữ convention hiện tại (`DATABASE_URL`, `REDIS_URL`, `OPENAI_API_KEY`).

### Structure Patterns

**Project Organization:**
```text
apps/chainlens-agent/src/
├── index.ts           # Entry point, Application Container, SIGTERM handler
├── app.ts             # Hono app, Middleware DI, export AppType
├── routes/            # Sub-routers (sandbox.ts, advisory.ts, health.ts)
├── services/          # Business logic
├── sandbox/           # SandboxProvider interface + implementations (deno.ts, firecracker.ts)
├── lib/               # Utilities (lock-manager, rate-limiter, logger, circuit-breaker)
└── tools/             # Vercel AI SDK tools (Factory Pattern)
```

**Hono Router Chaining:** Chia sub-routers độc lập, mount vào `app.ts`.

**Frontend RPC Client:** Gom tại `apps/web/lib/rpc.ts`:
```typescript
export const sandboxRpc = hc<SandboxApp>(baseUrl + '/api/sandbox')
```

**Dependency Injection (Dual-Scope):**
- **Request-scoped DI:** DB/Redis inject qua Hono middleware → `c.get('db')`. CẤM global singleton imports **trong route handlers**.
- **Application-scoped DI:** Background jobs (Stale Hold Reaper, Orphan VM Monitor) và Circuit Breaker state sử dụng **Application Container** — singleton khởi tạo tại `index.ts`, inject vào middleware và jobs cùng lúc.

**AI Tool Factory Pattern:**
```typescript
export const createExecuteCodeTool = (ctx: ToolContext) => tool({ ... })
```
- AI Tools PHẢI wrap logic trong `try/catch`. Return error message string cho LLM, KHÔNG throw unhandled exception.

**Lifecycle Hooks:**
- `GET /healthz` → liveness. `GET /readyz` → DB + Redis check (dedicated connection, timeout 1s max).
- `GET /api/v1/version` → trả build hash để Frontend kiểm tra **Version Handshake** khi khởi tạo RPC client.
- `SIGTERM` → drain streams → **kill active sandbox processes** → settle credit → shutdown.
- **Orphan Sandbox Monitor:** Background job định kỳ quét và kill các sandbox process/VM không có parent process.

### Format Patterns

**API Response:** Type inference Hono RPC. Lỗi Business: `{ success: false, error: "CODE", message }`.

**Error Code Taxonomy:**
```
INSUFFICIENT_CREDITS | SANDBOX_TIMEOUT | SANDBOX_CIRCUIT_OPEN |
RATE_LIMITED | IDEMPOTENCY_CONFLICT | LOCK_CONTENTION |
REDIS_UNAVAILABLE | VALIDATION_ERROR | LLM_PROVIDER_ERROR
```

**AI SDK:** `streamText`/`streamObject` cho UX. `generateObject` + Zod cho structured data.

### Communication Patterns

**Frontend State:** `useChat`/`useObject` cho AI. `hc` RPC cho static requests.

**Frontend Resilience:**
- Optimistic UI cho tin nhắn user.
- Giữ partial response kèm badge `[Interrupted]` khi stream lỗi.
- Nút `Retry` cho user.
- **Version Mismatch Banner:** Khi build hash frontend ≠ backend → hiển thị `"Hệ thống đang cập nhật, vui lòng refresh trang"`.
- **LLM Provider Error UX:** Khi AI service lỗi (429/500), hiển thị thông báo rõ ràng: `"AI service tạm thời quá tải, vui lòng thử lại sau 30s"`. KHÔNG hiển thị raw error.

**Request Tracing (Observability):**
- Middleware đầu tiên gán/propagate `x-request-id` (UUID).
- Truyền `requestId` vào: logs, Sandbox calls, Redis ops, AI SDK metadata.
- **Logging format chuẩn (JSON structured):**
  ```json
  { "timestamp": "...", "level": "info", "requestId": "uuid", "userId": "...", "action": "sandbox.execute", "durationMs": 1234 }
  ```
- CẤM dùng `console.log` text thuần trong production code.

**Alerting Rules (Critical Triggers):**
- Sandbox Circuit Breaker OPEN → alert (Slack/PagerDuty).
- Redis unavailable > 30s → alert.
- Stale Hold Reaper xử lý > 3 holds/phút → alert (anomaly, có thể leak).
- Credit balance âm (should never happen) → **P0 alert** + auto-pause billing.

**Partial Failure Isolation:**
- Sandbox failure CHỈ ảnh hưởng code execution endpoint. Advisory chat và structured extraction tiếp tục hoạt động bình thường.
- Redis failure ảnh hưởng TOÀN BỘ AI endpoints (vì cần lock + rate limit).
- LLM Provider failure ảnh hưởng AI features, nhưng static data (RPC) vẫn hoạt động.

### Process Patterns

**Redis Dependency Policy:**
- Khi Redis unavailable → toàn bộ AI endpoints trả `503 Service Unavailable` ngay tại middleware.
- `readyz` trả `false` → load balancer tự ngắt traffic. KHÔNG cố gắng xử lý request mà thiếu lock/rate-limit.

**Error Handling & Sandbox Timeout (Self-Healing):**
- `app.onError` bắt lỗi tổng. Sanitize lỗi từ `SandboxProvider` (strip internal paths, process IDs).
- `Promise.race` timeout ~5s cho Sandbox. Sau timeout → gửi **explicit kill signal** tới sandbox process đang chờ. Trả message để LLM tự sửa sai.

**Sandbox Circuit Breaker:**
- Sau 3 consecutive sandbox timeout → mở circuit → trả `503` trực tiếp trong 30s mà KHÔNG tạo sandbox process mới.
- Circuit tự đóng sau 30s (half-open state: thử 1 request, nếu OK → đóng, nếu fail → mở lại).

**Tool Output Sanitization (Chống Prompt Injection):**
- **Strip non-printable/control characters** (zero-width, RTL override, etc.) bằng allowlist: chỉ giữ ASCII printable + basic whitespace.
- Truncate max 2000 chars/lượt. Bọc `[SANDBOX_OUTPUT_START/END]`.
- **Cross-turn Protection:** Giới hạn tổng sandbox output tích lũy trong conversation context ≤ 5000 chars. Vượt → tự động tóm tắt output cũ.
- **Context Rotation:** Sau mỗi 10 lượt, tóm tắt conversation và loại bỏ raw sandbox output cũ khỏi context window.
- System prompt chỉ dẫn LLM coi nội dung trong block là data, KHÔNG phải instruction.

**Local Dev Mocking:** `USE_MOCK_SANDBOX=true` → fallback Bun/Docker trên Mac.

**Rate Limiting (Tiered by Endpoint Cost):**
- **Advisory (chat):** 20 req/min/user — chi phí thấp, user gửi nhanh trong multi-turn.
- **Sandbox execution:** 5 req/min/user — chi phí cao, cần VM resources.
- **Structured extraction:** 10 req/min/user — chi phí trung bình.
- **Stream Initiation Rate Limit:** Tách riêng, max 3 stream initiation/min/user. Ngăn abuse qua liên tục disconnect/reconnect SSE.
- **2-Tier Middleware Order:** (1) IP-based global rate limit **trước Auth** (anti-DDoS, 60 req/min/IP). (2) User-based tiered rate limit **sau Auth** (cần `userId`).
- Vượt giới hạn → `429 Too Many Requests` ngay lập tức.

**Idempotency Key:**
- Frontend gửi header `x-idempotency-key` (UUID, sinh 1 lần per user action) cho mọi request tính phí.
- Backend dùng Redis `SETNX` (TTL=5 phút) với key `chainlens:idempotency:<userId>:<key>`. Key đã tồn tại → `409 Conflict`, KHÔNG xử lý lại.
- PHẢI scope theo `userId` để chống idempotency key spoofing (DoS).

**DB Connection Discipline:**
- AI stream KHÔNG ĐƯỢC giữ DB connection suốt quá trình streaming.
- Chỉ mở connection cho các thao tác rời rạc: Hold credit → release → stream → reconnect → Settle credit → release.
- `readyz` sử dụng dedicated connection với timeout 1s riêng biệt.

**Lock Contention Strategy:**
- Khi lock đã bị giữ bởi request khác → **Fail-fast**, trả `429 Too Many Requests` ngay lập tức. KHÔNG queue/wait.
- Giới hạn **max 1 concurrent AI stream per user** tại middleware layer.

**Hold-and-Settle Process:**
1. `acquireLock(TTL=60s)`.
2. **Hold** credit = Max Tokens.
3. Stream via Vercel AI SDK.
4. `onFinish` → tính usage → **Settle** (refund dư) → ghi **Credit Audit Log**.
5. `releaseLock()` — CHỈ gọi SAU KHI Settle thành công. Nếu Settle fail → giữ lock, Stale Hold Reaper sẽ xử lý.
6. **Stale Hold Reaper:** Background job (interval 60s) tự động settle/refund các hold > 5 phút không có `onFinish` (client disconnect, crash, etc.). *Đây là P1 nhưng có thể defer 2 tuần sau MVP launch nếu cần ship nhanh.*

**Credit Audit Trail:**
- Mỗi thao tác Hold, Settle, và Refund PHẢI tạo immutable audit record trong DB.
- Schema tối thiểu: `{ id, requestId, userId, action: 'hold'|'settle'|'refund', amount, balanceBefore, balanceAfter, timestamp }`.
- CẤM xóa hoặc sửa audit records. Chỉ `INSERT`.

### Enforcement Guidelines

**All AI Agents MUST:**
- CẤM global singleton imports **trong route handlers**. Application-scoped singletons (Container) CHỈ được khởi tạo tại `index.ts`.
- KHÔNG export endpoint mà không có Zod validation.
- KHÔNG bypass Hold & Settle cho API tính phí.
- LUÔN export `AppType` từ root router.
- **Additive-only DB:** CHỈ thêm table/column. CẤM rename/drop. CẤM tự chạy `drizzle-kit generate`.
- **Sanitize tool output** (strip non-printable → truncate → wrap markers) trước khi đưa vào LLM context.
- **Structured JSON logging** với `requestId`. CẤM `console.log`.
- **`x-idempotency-key`** cho mọi mutation có tính phí.
- **Atomic Deploy:** Khi thay đổi RPC interface, `chainlens-agent` và `apps/web` PHẢI deploy cùng lúc. Mọi breaking change trên RPC phải backward-compatible ít nhất 1 version.
- **Mock Guard:** CI/CD pipeline PHẢI chặn build nếu `USE_MOCK_SANDBOX=true` trên môi trường staging/production.
- **Redis Network Security:** Redis PHẢI nằm trong private VPC (no public access), bật TLS encryption, và cấu hình ACL chỉ cho phép chainlens-agent service user.
- **Credit Audit Integrity:** CẤM xóa/sửa credit audit records. Mọi thao tác tài chính phải có audit trail.
- **Settle-before-Release:** `releaseLock()` CHỈ được gọi sau khi `Settle` thành công. CẤM release lock trước settle.
- **AI Tool Error Contract:** Tools PHẢI wrap trong try/catch. Return error string cho LLM, CẤM throw unhandled.

## Step 7: Validation & Readiness Assessment

### Validation Methods Applied (6 rounds)

| # | Phương pháp | Category | Phát hiện chính |
|---|------------|----------|------------------|
| 1 | Pre-mortem Analysis | Risk | Stale Hold Reaper, SIGTERM cleanup, lock contention fail-fast, atomic deploy |
| 2 | Chaos Monkey Scenarios | Risk | Redis 503 policy, Sandbox Circuit Breaker, Version Handshake, userId-scoped idempotency |
| 3 | Security Audit Personas | Technical | Context Rotation, Credit Audit Trail, stream initiation rate limit, Redis VPC/TLS/ACL |
| 4 | First Principles Analysis | Core | Lock = reservation (not atomicity), SandboxProvider abstraction, tiered rate limit, dual-scope DI |
| 5 | Self-Consistency Validation | Advanced | Genericize Firecracker → Sandbox, 2-tier rate limit middleware, DI enforcement scope, project tree update |
| 6 | Code Review Gauntlet | Competitive | Error taxonomy, env var convention, tool error contract, alerting rules, partial failure isolation |

### Readiness Checklist

- [x] **Coherence:** Mọi section nhất quán sau Self-Consistency Validation (vòng 5).
- [x] **Security:** Sandbox isolation, prompt injection defense, Redis network security, credit audit trail.
- [x] **Reliability:** Circuit Breaker, Redis dependency policy, partial failure isolation, graceful degradation.
- [x] **Financial Integrity:** Hold-and-Settle atomic sequence, Settle-before-Release, Stale Hold Reaper, immutable audit log.
- [x] **Observability:** Structured JSON logging, requestId tracing, alerting rules, error taxonomy.
- [x] **Developer Experience:** Naming conventions, env var prefix, DI patterns, tool error contract, project tree.
- [x] **Deployment Safety:** Atomic deploy, Mock Guard, Version Handshake.

### Status: ✅ READY FOR IMPLEMENTATION

Tài liệu kiến trúc đã qua 6 vòng stress-test với ~30 phát hiện đã được tích hợp. Không còn blocking issues hoặc mâu thuẫn nội bộ. Sẵn sàng chuyển sang Implementation Phase.
