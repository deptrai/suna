---
stepsCompleted: [1, 2, 3, 4, 5, 6, 7, 8]
lastStep: 8
status: 'complete'
completedAt: '2026-05-09'
inputDocuments:
  - _bmad-output/project-context.md
  - docs/project-overview.md
  - docs/epsilon-agent-os-framework-cloud-spec.md
  - docs/instance-three-layer-health-and-actions-spec.md
  - docs/development-release-guide.md
  - docs/admin-panel-handoff.md
  - docs/config-degradation-visual-handover.md
  - docs/justavps-restart-hardening-spec.md
  - docs/opencode-config-failsafe-spec.md
workflowType: 'architecture'
project_name: 'chainlens'
user_name: 'Luisphan'
date: '2026-05-09'
validation_status: 'IN_PROGRESS'
---

# Architecture Decision Document

_This document builds collaboratively through step-by-step discovery. Sections are appended as we work through each architectural decision together._

## Step 2: Project Context Analysis

### What This Project Is

**Epsilon** là một Agent OS Platform — cho phép user build, deploy và run custom AI background agents theo mô hình "Vercel for agents": một git repo định nghĩa behavior, `epsilon deploy` ship nó thành always-on worker với filesystem, channels, triggers, integrations, và persistent memory.

**Primary Domain:** AI Platform / Agent Deployment Infrastructure
**Complexity:** High — distributed system với 3 separate deployment units
**Type:** Brownfield Monorepo (mở rộng incremental)

---

### Architecture Overview — 3 Components

| Component | Docker Image | Source | Role |
|---|---|---|---|
| **API** | `epsilon/epsilon-api` | `apps/api/` | Backend: auth, billing, sandbox lifecycle, LLM proxy |
| **Frontend** | `epsilon/epsilon-frontend` | `apps/web/` | Next.js web UI |
| **Computer** | `epsilon/computer` | `core/` | Sandbox container: OpenCode + Epsilon Master + tools |

---

### 1. Sandbox Container (`core/` → `epsilon/computer`)

Mỗi user/project có 1 sandbox container riêng, chạy trên JustaVPS. Bên trong là môi trường Alpine Linux với **s6-services** supervisor quản lý các process:

| Service | Port | Role |
|---|---|---|
| **OpenCode** | :4096 | AI agent runtime thực sự — nhận message, gọi LLM, gọi tools |
| **Epsilon Master** | :8000 | Reverse proxy trước OpenCode: auth gate + billing gating |
| Chromium | — | Browser tool cho agent |
| sshd | — | SSH access |
| agent-browser-session | — | Browser session management |
| lss-sync | — | Local state sync |
| static-web | — | Static file serving |

**OpenCode là AI brain** — chạy agent loop (nhận prompt → gọi LLM → gọi tools → stream kết quả). Epsilon Master là guard layer trước nó.

---

### 2. Backend API (`apps/api/` — Hono + Bun)

`apps/api` KHÔNG chạy AI agent loop. Đây là platform layer:

#### 2.1 Auth Layer
- `middleware/auth.ts`: Supabase JWT + API key + combined auth
- `oauth/`: OAuth flows
- `access-control/`, `teams/`: RBAC + multi-workspace

#### 2.2 Sandbox Lifecycle Management (`platform/`)
- Provider abstraction: JustaVPS (production), local Docker (dev)
- Pool management (`pool/`): pre-warmed sandbox instances
- Provisioning poller, sandbox health monitor, auto-update loop

#### 2.3 Sandbox Proxy (`sandbox-proxy/`)
- Route `/:sandboxId/:port/*` → forward tới sandbox container đang chạy
- Auth token injection, preview sharing, Daytona + JustaVPS provider support

#### 2.4 LLM Proxy + Billing (`router/routes/llm.ts`, `router/services/billing.ts`)
- OpenCode trong sandbox route LLM calls QUA `apps/api/router/llm`
- 3 billing modes:
  1. Epsilon token → inject Epsilon's OpenRouter key → bill at 1.2× markup
  2. User's key + Epsilon token → passthrough → bill at 0.1× platform fee
  3. User's key only → pure passthrough, no billing
- Streaming: `tee()` stream → 1 nhánh về client, 1 nhánh đọc usage data để billing

#### 2.5 Integrations (`integrations/`)
- OAuth credential store cho 3rd-party connectors (Pipedream pattern)
- Notify sandbox khi connector sync

#### 2.6 Queue + Background Jobs (`queue/`)
- BullMQ-based background job processing

#### 2.7 Các Module Khác
- `billing/`: Stripe + RevenueCat subscription management
- `admin/`: Administrative endpoints
- `secrets/`, `repositories/`: Credential + API key management
- `router/routes/proxy.ts`: General LLM provider proxy (31KB)
- `router/routes/search-web.ts`, `search-image.ts`: Web/image search endpoints
- `router/services/serper.ts`, `tavily.ts`: Search API client wrappers

---

### 3. Frontend (`apps/web/` — Next.js 15)

#### 3.1 Kết nối tới Sandbox
- `@opencode-ai/sdk` v2 (`lib/opencode-sdk.ts`): singleton `OpencodeClient` trỏ vào sandbox URL đang active
- `authenticatedFetch`: inject auth token cho mọi request
- Frontend kết nối trực tiếp tới sandbox (qua `apps/api` sandbox-proxy)

#### 3.2 Tab-based Multi-session UI
- `stores/tab-store`: quản lý nhiều tab session đồng thời
- Catch-all route `[...catchAll]/page.tsx` resolve pathname → tab descriptor

#### 3.3 Thread/Chat Components
- `components/thread/tool-views/`: render kết quả tool calls từ OpenCode
- `components/session/`: session layout, chat input, error banner

#### 3.4 Dashboard Routes
```
app/(dashboard)/
├── agents/          # Agent configuration
├── sessions/        # Session management
├── tools/           # Tools marketplace/config
├── skills/          # Skills management
├── connectors/      # OAuth integrations
├── memory/          # Agent memory management
├── terminal/        # Embedded terminal
├── browser/         # Embedded browser view
├── files/           # Filesystem browser
├── marketplace/     # Agent/skill marketplace
└── admin/           # Admin panel
```

#### 3.5 Browser Extension (`apps/extension/`)

**Runtime & Build**: Bun (per `apps/extension/CLAUDE.md`). Build via `bun build` outputting to `apps/extension/dist/`. No webpack/vite. TailwindCSS shared with `apps/web` via Tailwind v4 CSS variables; final bundle injected into Shadow DOM.

**Manifest**: V3 (Chromium-based browsers). Host permissions: `*://*.twitter.com/*`, `*://*.x.com/*`, `*://*.facebook.com/*`, `*://*.dexscreener.com/*`, `*://*.coinmarketcap.com/*`, `*://*.coingecko.com/*`. Permissions: `storage`, `activeTab`, `scripting`.

**Components**:
- **Content script** (`apps/extension/src/content/index.ts`): runs on matched domains, scans DOM via `TreeWalker` (generic regex path) + `DomainParser` registry (domain-specific path, see Story 6.1.1). Wraps detected tokens in `.chainlens-token-highlight` spans, attaches hover handlers.
- **Tooltip rendering**: Single `#chainlens-shadow-host` div attached to `document.body` with `attachShadow({ mode: 'open' })`. All tooltip UI lives inside the Shadow DOM to prevent host site CSS leakage (UX-DR8).
- **Background service worker** (`apps/extension/background/`): currently minimal. Future home for SPA navigation hooks and offline cache management.
- **Popup + Side Panel**: planned for future stories (6.2 Risk Tooltip & Expand, 6.3 Account Sync). Manifest already declares `default_popup` and `side_panel`.

**Data flow — tooltip hover** (Story 6.1 + 6.1.0):
```
1. User hovers .chainlens-token-highlight span
   ↓
2. Content script reads dataset.token, debounce 500ms
   ↓
3. fetch GET ${API_BASE}/v1/advisory/risk?q=<token>
   (anonymous, no auth — see §4.x Advisory Endpoint Contract)
   ↓
4. apps/api advisory-risk route:
   - IP rate-limit check
   - Cache lookup (5min ticker, 1min price)
   - Aggregate: token-search → contract-risk → simple/price
   - Return { risk: { level, liquidity, contractInfo, price, change24h } }
   ↓
5. Content script renders tooltip inside Shadow DOM with Liquid Glass styling
```

**Trade-offs**:
- *Bundle size constraint*: Manifest V3 content scripts must be lean. No React, no Vercel AI SDK in content scripts — vanilla TS + DOM manipulation only.
- *Shadow DOM isolation*: prevents host CSS interference but means Tailwind utility classes need explicit injection via `<link>` to extension-bundled stylesheet (`chrome.runtime.getURL('dist/styles.css')`).
- *No cross-origin fetch from popup*: must declare API origin in `host_permissions`. Adding new API domain = manifest update + re-publish to Chrome Web Store.

---

### 4. Shared Packages (`packages/`)

| Package | Purpose |
|---|---|
| `packages/db` | Drizzle ORM schema + Supabase migrations |
| `packages/shared` | Common TypeScript types + utilities |
| `packages/agent-tunnel` | Network relay cho agent connections |
| `packages/epsilon-ocx-registry` | Cloudflare Workers registry cho OCX/agent capabilities |
| `packages/voice` | Python FastAPI voice processing service |

---

### 5. Infrastructure: 3-Layer Health Model

```
Layer 1 — Host VM (JustaVPS machine)
  Health: machine status (ready/stopped/provisioning/error)
  Actions: start_host, reboot_host, stop_host
  → Chỉ dùng khi machine offline hoàn toàn

Layer 2 — Workload Service (Docker on host)
  Health: systemctl justavps-docker.service, justavps-workload container
  Actions: start_workload, restart_workload, stop_workload
  → DEFAULT repair action cho hầu hết incidents

Layer 3 — Core Runtime (inside container)
  Health: localhost:8000, session/status, OpenCode readiness
  Actions: restart individual services (epsilon-master, opencode)
  → Dùng khi container up nhưng services bên trong bị lỗi
```

---

### 6. Request Flow — AI Chat

```
1. User gõ tin nhắn (apps/web)
         ↓
2. @opencode-ai/sdk → HTTP/SSE tới sandbox URL
         ↓
3. apps/api sandbox-proxy: /:sandboxId/8000/* → container:8000
         ↓
4. Epsilon Master (container:8000) → auth check → OpenCode:4096
         ↓
5. OpenCode processes:
   a. Gọi LLM → qua apps/api/router/llm → OpenRouter
      (billing check + deduct tại apps/api)
   b. Gọi tools: bash, file, browser, MCP servers...
   c. Stream kết quả ngược về frontend via SSE
         ↓
6. apps/web renders tool-views từ stream
```

---

### 7. Deployment Environments

| Env | Frontend | API | Sandboxes |
|---|---|---|---|
| **Dev** | Vercel (main branch) | dev-api.epsilon.com (VPS) | JustaVPS dev org |
| **Prod** | Vercel (production) | new-api.epsilon.com (VPS) | JustaVPS prod org |

**Local dev:**
- Frontend: localhost:3000 (`pnpm dev:frontend`)
- API: localhost:8008 (`pnpm dev:api`)
- Sandbox: Docker local (`pnpm dev:sandbox`)
- DB: Supabase local (`supabase start`)

---

### 8. Technical Constraints

- **Bun runtime** cho backend — KHÔNG dùng Node.js-specific APIs
- **Additive-only migrations** — Drizzle schema, chỉ thêm, không rename/drop
- **Strict TypeScript** — no `any`
- **Next.js App Router** — `"use client"` chỉ ở leaf nodes
- **pnpm workspaces** — import shared code qua `@epsilon/shared`, `@epsilon/db`
- **OpenCode là black box** — tương tác qua HTTP/SSE protocol, KHÔNG import internals

## Step 3: Starter Template Evaluation

### Primary Technology Domain

**Brownfield Monorepo Extension** — không chọn starter mới. Mọi quyết định công nghệ đã được thực thi trong codebase hiện tại.

### Existing Technology Foundation

| Layer | Technology | Status |
|---|---|---|
| Backend Runtime | Bun | ✅ Production |
| Backend Framework | Hono (TypeScript) | ✅ Production |
| Frontend | Next.js 15 (App Router) | ✅ Production |
| Database ORM | Drizzle ORM | ✅ Production |
| Database Host | Supabase (PostgreSQL) | ✅ Production |
| Auth | Supabase JWT + API Keys | ✅ Production |
| AI SDK | Vercel AI SDK (`@ai-sdk/*`) | ✅ Production |
| Container | Docker + Alpine + s6 | ✅ Production |
| Sandbox Runtime | OpenCode + Epsilon Master | ✅ Production |
| Styling | TailwindCSS + Radix primitives | ✅ Production |
| Editor | CodeMirror 6 | ✅ Production |
| Mobile | Expo + NativeWind | ✅ Production |
| Desktop | Tauri (Rust) | ✅ Production |
| Package Manager | pnpm workspaces | ✅ Production |
| Monorepo Tooling | Turborepo | ✅ Production |
| Build (Frontend) | Next.js Turbopack | ✅ Production |
| Testing (Backend) | Bun test | ✅ Production |
| Testing (E2E) | Playwright | ✅ Production |
| Observability | Sentry + Logtail | ✅ Production |
| VPS Provider | JustaVPS | ✅ Production |
| LLM Gateway | OpenRouter | ✅ Production |
| Edge Registry | Cloudflare Workers | ✅ Production |
| Voice Backend | Python + FastAPI | ✅ Production |

### Architectural Decisions Already Made

**Language & Runtime:**
- TypeScript strict mode trên toàn bộ codebase
- Bun native APIs cho backend (KHÔNG Node.js `fs`, `path`, `crypto`)
- Python chỉ cho `packages/voice`

**Code Organization:**
- `apps/*`: end-user applications (api, web, mobile, desktop, extension)
- `packages/*`: shared libraries (`@epsilon/db`, `@epsilon/shared`, `@epsilon/agent-tunnel`)
- `core/`: sandbox infrastructure (Docker, s6-services, OpenCode config)
- Path aliases: `@/*` → `./src/*` trong `apps/web` và `apps/api`

**Database:**
- Tất cả DB operations qua Drizzle ORM schemas tại `packages/db`
- Migrations: additive-only (chỉ thêm table/column, KHÔNG rename/drop)

**Frontend Patterns:**
- Next.js App Router (`app/` directory)
- `"use client"` chỉ ở leaf nodes — server components ưu tiên
- TailwindCSS cho styling (NativeWind trên mobile)

**AI Integration:**
- Vercel AI SDK (`@ai-sdk/*`) cho tất cả LLM interactions trong backend
- OpenCode là black box — tương tác qua HTTP/SSE, không import internals

**Note:** Không cần initialization command — project đã khởi tạo. Mọi feature mới là extension vào codebase hiện tại.

## Step 4: Core Architectural Decisions

### Data Architecture

**Database:** Supabase PostgreSQL (managed) + Drizzle ORM
- All schemas tại `packages/db/src/schema/`
- Migrations: additive-only — KHÔNG rename/drop columns/tables
- Migration pattern: chỉ `ALTER TABLE ... ADD COLUMN` hoặc `CREATE TABLE`
- Client: Drizzle query builder (`@epsilon/db`) — raw SQL bị cấm
- Row Level Security (RLS): enforced ở Supabase layer cho user-owned resources

**Data Models (key entities):**
- `sandboxes`: sandbox instance metadata, provider, status, user/project link
- `sessions`: OpenCode session per sandbox
- `threads`: conversation threads in sessions
- `messages`: individual messages in threads
- `accounts` / `users`: Supabase auth integration
- `subscriptions`: Stripe subscription state
- `credits`: billing credit ledger

**Caching:**
- Sandbox provider cache in-memory (sandbox-proxy: `providerCache`)
- No Redis — caching là in-process

---

### Authentication & Security

**Auth Stack:**
- Primary: Supabase JWT (`Authorization: Bearer <jwt>`)
- Secondary: API Key (`x-api-key` header) — hashed, stored in DB
- Combined: `middleware/auth.ts` tries JWT → falls back to API key
- Service-level: `x-epsilon-service-key` cho internal service-to-service calls

**Auth Flow:**
```
Client → apps/api → Supabase JWT verify → user context injected → handler
                 → API key lookup in DB → user context injected → handler
```

**Sandbox Auth:**
- Epsilon Master trong sandbox validates `x-epsilon-auth-token` trước khi forward tới OpenCode
- Token được inject bởi `authenticatedFetch` trong apps/web

**Authorization:**
- RBAC qua `access-control/` và `teams/` modules
- Multi-workspace support: user thuộc nhiều workspace với roles khác nhau

---

### API & Communication Patterns

**Backend API Style:** REST via Hono (TypeScript, Bun runtime)
- Route structure: `apps/api/src/router/routes/`
- No GraphQL — pure REST + SSE streaming
- Validation: Zod schemas tại route level

**Sandbox Proxy Pattern:**
```
Request: /:sandboxId/:port/*
Handler: sandbox-proxy/index.ts
  → Lookup sandbox URL from provider
  → Forward request with auth token injected
  → Stream response back to client
```

**LLM Proxy Pattern (3 billing modes):**
```
Mode 1: Epsilon credit token
  → Inject Epsilon's OpenRouter key
  → Bill at 1.2× markup, deduct from user credits

Mode 2: User key + Epsilon token
  → Passthrough user's key
  → Bill at 0.1× platform fee

Mode 3: User key only
  → Pure passthrough
  → No billing
```
Implementation: `router/routes/llm.ts` — tee() stream: 1 nhánh → client, 1 nhánh → usage tracking

**Vibe-Trading MCP Proxy Pattern (Epic 5):**

Decision date: 2026-05-12. Replaces earlier HTTP-extension approach (archived). Applies to
all 21 Vibe-Trading MCP tools (market data, options, patterns, factor analysis, Shadow Account,
Swarm Teams, finance skills, web/file I/O).

```
Sandbox (OpenCode agent)
  │  remote MCP over Streamable HTTP
  │  URL: {EPSILON_API_URL}/v1/router/vibe-trading-mcp/mcp
  │  Authorization: Bearer {EPSILON_TOKEN}
  ▼
epsilon-api proxy route (apps/api/src/router/routes/vibe-trading-mcp.ts, ~120 LOC)
  ├─ Parse JSON-RPC method + params.name
  ├─ If method == "tools/call":
  │    checkCredits(accountId) → 402 if insufficient
  │    Log [TIER-BYPASS-SUSPECT] mcp_tool=X account=Y
  │    Forward to VT MCP service
  │    On success: deductToolCredits(accountId, `vt_mcp_${toolName}`, cost) ATOMIC
  │    Return response
  ├─ Else (tools/list, initialize, resources/*): free passthrough
  ▼
vibe-trading-mcp:8900 (FastMCP Streamable HTTP, reuses existing VT Docker image)
  │
  ▼
VT Python library (22 tools auto-registered)
```

**Rationale for MCP proxy over per-tool HTTP wrapping:**

| Aspect | HTTP extension (rejected) | MCP proxy (chosen) |
|---|---|---|
| LOC for 21 tools | ~1500 | ~180 |
| Stories needed | 5 (5.5-5.9) | 2 (5.5 proxy + 5.6 UI) |
| VT submodule patches | 15 endpoints × ~15 LOC | 0 (unless BYOK — then ~15 LOC for key header read) |
| New tool onboarding (when VT upgrades) | +80 LOC per tool | 0 LOC (auto-discovered) |
| NFR8 atomic billing | ✅ per-route deduct | ✅ proxy intercepts tools/call |
| NFR10 sandbox isolation | ✅ sandbox → epsilon-api only | ✅ sandbox → epsilon-api only |

**What this does NOT replace:**
- `vibe_trading_backtest` OpenCode HTTP tool (Story 5.1) — coexists for heavy async backtest
  integrated with Backtest UI (SSE streaming, equity curve, Phase A/B state machine)
- Existing `/v1/router/vibe-trading/*` HTTP routes (Stories 5.1, 5.6) — coexist for UI-driven flows

**Tool naming conventions:**
- MCP tools billed under prefix `vt_mcp_*` (e.g. `vt_mcp_get_market_data`) in `TOOL_PRICING`
- OpenCode HTTP tools keep `vibe_trading_*` prefix (`vibe_trading_backtest`)
- Default pricing fallback ($0.01) for unknown tool names — safe default when VT adds new tools

**Reference:** See [_bmad-output/implementation-artifacts/5-5-vibe-trading-mcp-proxy.md](_bmad-output/implementation-artifacts/5-5-vibe-trading-mcp-proxy.md) for full story spec.

**Streaming:** SSE (Server-Sent Events) cho AI response streaming
- OpenCode → Epsilon Master → apps/api sandbox-proxy → apps/web
- No WebSocket

**Error Handling Standard:**
- Hono `app.onError()` global handler
- HTTP status codes: 400 (validation), 401 (auth), 403 (forbidden), 429 (rate limit), 500 (internal)

**Anonymous Public Endpoint Pattern (Advisory Tooltip Gateway):**

Decision date: 2026-05-11. Introduced to support Browser Extension tooltip (Epic 6) without requiring user authentication.

```
GET /v1/advisory/risk?q=<token>
  No auth — accessible from chrome-extension://* origins
  IP-based rate limit (5 rps burst, 100 rpm sustained)
  Aggressive in-memory cache (5min ticker, 1min price)
  Aggregates: token-search (CoinGecko) → contract-risk (GoPlus) → simple/price (CoinGecko)
  Response shape: { risk: { level, liquidity, contractInfo, price, change24h }, meta }
```

**NFR8 carve-out**: This endpoint is explicitly exempted from NFR8 (Atomic Credit Deduction) because:
1. It only reads aggregated public market data — no LLM calls, no expensive computation.
2. Product positioning: extension tooltip is a free-tier awareness feature (PRD §4.1, UX §2.1).
3. Abuse mitigation alternatives: IP rate limit (NFR9 compliant), aggressive cache, optional Phase 2 migration to authenticated proxy if abuse occurs.

**Scope boundary**: This pattern applies ONLY to read-only, public-data, anonymous endpoints. All other endpoints (`/v1/router/*` token-info, contract-risk, vibe-trading, llm proxy) remain `combinedAuth` + credit-deducted per NFR8.

**Implementation**: See [_bmad-output/implementation-artifacts/6-1-0-advisory-risk-endpoint.md](_bmad-output/implementation-artifacts/6-1-0-advisory-risk-endpoint.md) for full story spec including aggregator service, rate-limit middleware, CORS extension for `chrome-extension://*` origin.

**Future migration paths** (if abuse becomes ops problem):
- Option B: Add `combinedAuth` + extension API key provisioning flow.
- Option C: Move to dedicated `chainlens-extension-gateway` service with Redis-backed cache and stricter fingerprint-based rate limit.

Both migrations preserve response shape — extension code stays stable.

---

### Frontend Architecture

**Framework:** Next.js 15 (App Router, Turbopack dev)

**Routing:**
- `app/(dashboard)/[...catchAll]/page.tsx`: tab-based catch-all
- Tab store (`stores/tab-store`): manages multiple concurrent sessions
- Server components default; `"use client"` chỉ ở leaf nodes

**Sandbox Connection:**
- `@opencode-ai/sdk` v2 → `OpencodeClient` singleton (`lib/opencode-sdk.ts`)
- `authenticatedFetch`: injects auth token vào mọi sandbox request
- Direct connection: apps/web → apps/api sandbox-proxy → sandbox container

**State Management:**
- Zustand stores cho global state (tab-store, session state)
- React Query / SWR cho server data fetching
- No Redux

**UI System:**
- TailwindCSS + Radix UI primitives
- CodeMirror 6 cho code editor
- Tool-view components: `components/thread/tool-views/` — renders OpenCode tool call results

**Mobile/Desktop:**
- Mobile: Expo + NativeWind (React Native)
- Desktop: Tauri (Rust shell)
- Shared business logic qua `@epsilon/shared`

---

### Infrastructure & Deployment

**Sandbox Provider Abstraction:**
```
IProvider interface
  ├── JustaVPS (production): REST API → provision VM → run Docker image
  └── Local Docker (dev): docker-compose, direct container management
```

**3-Layer Health Model:**
```
Layer 1 — Host VM (JustaVPS machine)
  Repair: start_host, reboot_host (chỉ khi machine offline hoàn toàn)

Layer 2 — Workload Service (Docker on host)  ← DEFAULT REPAIR
  Repair: restart_workload
  Check: systemctl justavps-docker.service status

Layer 3 — Core Runtime (inside container)
  Repair: restart epsilon-master, opencode services
  Check: localhost:8000/health, session/status
```

**Container Architecture (epsilon/computer):**
- Base: Alpine Linux + s6-overlay process supervisor
- Services managed by s6:
  - `svc-epsilon-master`: port 8000, reverse proxy trước OpenCode
  - `svc-opencode-serve`: port 4096, AI agent runtime (managed by Epsilon Master ServiceManager)
  - `svc-chromium`: Browser tool
  - `svc-sshd`: SSH access
  - `svc-agent-browser-session`, `svc-lss-sync`, `svc-static-web`

**Sandbox Pool:**
- `pool/`: pre-warmed sandbox instances để reduce cold start
- Provisioning poller: background loop check sandbox health + auto-provision
- Auto-update loop: rolling update sandboxes với new image versions

**Environments:**
```
Dev:  frontend → Vercel (main branch)
      api     → dev-api.epsilon.com (VPS)
      sandbox → JustaVPS dev org

Prod: frontend → Vercel (production)
      api     → new-api.epsilon.com (VPS)
      sandbox → JustaVPS prod org
```

**Background Jobs:** BullMQ (`queue/`) cho async operations

**Monitoring:** Sentry (error tracking) + Logtail (structured logs)

---


### Autonomous Agent Architecture (Epic 10)

**Critical Decisions (Quyết định then chốt - Ảnh hưởng trực tiếp đến hệ thống):**

*   **State Management cho DAG Checkpointing:** Lựa chọn lưu trữ trạng thái vào **Database (Postgres thông qua Drizzle ORM)**.
    *   *Rationale:* Các tác vụ tự trị có thể chạy hàng giờ. Việc lưu trạng thái DAG vào Postgres đảm bảo tính bền vững, cho phép khôi phục tiến trình.
    *   *Implementation Constraints (Tối ưu Hiệu năng & Rủi ro):* Bắt buộc sử dụng cơ chế **Append-only Events** với cột `JSONB` để lưu trạng thái, thay vì Update liên tục. Để tối ưu truy vấn (Read IO), bảng `dag_events` phải sử dụng index `is_latest` hoặc Materialized View để tránh full-table scan JSONB khi đọc trạng thái. Cần có Cronjob **Data Pruning/Archival** xóa hoặc nén các event chi tiết của Job đã hoàn thành > 30 ngày để chống phình DB.

*   **Sandbox Lifecycle & Limits Management:** Sử dụng **Native Unix Tools & Container/MicroVM Limits** (Occam's Razor).
    *   *Rationale:* Loại bỏ sự phức tạp của một Supervisor tùy chỉnh. Sử dụng lệnh `timeout` của Linux để bọc các tiến trình thực thi, và cgroups/MicroVM config để giới hạn Hard RAM/CPU.
    *   *Implementation Constraints (Tối ưu Hiệu năng & Rủi ro):* Chấp nhận Cold-Start 3-5 giây thay vì duy trì Warm-Pool tốn kém; che lấp độ trễ bằng UI Loading State (SSE Streaming). Các tiến trình chạy code (Python/Bash) vẫn phải bị gông quyền **non-root**. Bắt buộc **Pipe Stdout/Stderr liên tục** ra ngoài Sandbox trong lúc chạy để không mất log phân tích khi tiến trình bị OS kill đột ngột.

**Important Decisions (Quyết định quan trọng - Định hình luồng dữ liệu):**

*   **Agent Progress Streaming:** Lựa chọn **Server-Sent Events (SSE)** kết hợp REST API.
    *   *Rationale:* Dùng SSE để bắn log, Thought-process, và Cost Estimation 1 chiều từ Server về Frontend. Các thao tác tương tác của user (như click [Approve]) sẽ gọi qua REST API thông thường.
    *   *Implementation Constraints (Tối ưu Hiệu năng & Rủi ro):* API SSE phục vụ Agent Log phải có cơ chế **Log Throttling (Batching)** tối thiểu 200ms để không làm sập Main Thread của trình duyệt. SSE bắt buộc phải implement cơ chế phục hồi **Last-Event-ID** để đảm bảo không mất log khi đứt kết nối mạng. Nếu client reconnect sau khi lỡ quá nhiều events, API sẽ kích hoạt **State Snapshot Fallback** (gửi tóm tắt trạng thái) thay vì bắn bù từng event để tránh nghẽn RAM Node.js.

### Decision Impact Analysis

**Sequence khi thêm tính năng mới:**
1. DB schema → `packages/db/src/schema/` (additive migration)
2. Types → `packages/shared/src/types/`
3. API route → `apps/api/src/router/routes/`
4. Frontend → `apps/web/src/app/(dashboard)/`

**Cross-Component Dependencies:**
- OpenCode tools → MCP server protocol (KHÔNG thêm vào apps/api)
  - **Exception — Remote MCP proxy pattern**: khi cần billing/auth interception cho external MCP
    server (eg Vibe-Trading's 21 tools), apps/api có thể có 1 thin proxy route forwarding
    JSON-RPC. See "Vibe-Trading MCP Proxy Pattern" section above. Proxy is ~120 LOC passthrough,
    NOT per-tool wrapper.
- Billing check → apps/api/router/llm.ts (KHÔNG bypass sandbox-proxy)
- Auth → Supabase JWT first, API key fallback (middleware đã handle cả 2)
- Sandbox lifecycle → provider abstraction layer (không gọi JustaVPS API trực tiếp)

## Step 5: Implementation Patterns & Consistency Rules

### Naming Patterns

**Database Naming (Drizzle ORM + PostgreSQL):**
- Tables: `snake_case` plural — `sandboxes`, `user_sessions`, `api_keys`
- Columns: `snake_case` — `created_at`, `sandbox_id`, `is_active`
- Foreign keys: `<table_singular>_id` — `user_id`, `sandbox_id`
- Indexes: `<table>_<column(s)>_idx` — `users_email_idx`
- Schema definition: Drizzle `pgTable()` trong `packages/db/src/schema/`

**API Naming (Hono REST):**
- Endpoints: kebab-case plural nouns — `/api/sandboxes`, `/api/api-keys`
- Path params: `:id`, `:sandboxId`, `:userId`
- Query params: camelCase — `?pageSize=10&projectId=abc`
- Route files: `kebab-case.ts` — `apps/api/src/router/routes/sandbox-proxy.ts`

**TypeScript Naming:**
- Variables/functions: camelCase — `getUserById`, `sandboxProvider`
- Types/Interfaces: PascalCase — `SandboxStatus`, `BillingMode`
- Constants: SCREAMING_SNAKE_CASE — `MAX_SANDBOX_COUNT`, `DEFAULT_TIMEOUT`
- React components: PascalCase — `SessionTabsContainer`, `ToolView`
- Files (apps/web): `kebab-case.tsx` — `tool-view.tsx`, `session-layout.tsx`
- Files (apps/api): `kebab-case.ts` — `sandbox-proxy.ts`, `auth.ts`

---

### Structure Patterns

**apps/api Feature Organization:**
```
apps/api/src/
  router/routes/<feature>.ts   ← HTTP handlers
  router/services/<feature>.ts ← Business logic
  <module>/                    ← Self-contained feature module
    index.ts                   ← Public API của module
    types.ts                   ← Module-specific types
```

**packages/db Schema:**
```
packages/db/src/
  schema/
    <entity>.ts                ← 1 file per table/entity
  migrations/                  ← Drizzle migration files
  index.ts                     ← Re-export all schemas
```

**apps/web Component Organization:**
```
apps/web/src/
  app/(dashboard)/<feature>/   ← Next.js pages
  components/<feature>/        ← Feature-specific components
  components/ui/               ← Generic UI primitives
  stores/<feature>-store.ts    ← Zustand stores
  lib/                         ← Utilities, SDK clients
  hooks/use-<feature>.ts       ← Custom React hooks
```

**Test Location:**
- Backend: `apps/api/src/__tests__/` hoặc co-located `<file>.test.ts`
- E2E: `tests/e2e/` (Playwright)
- Unit: Bun test runner

---

### Format Patterns

**API Response Format:**
Hono trả về trực tiếp — KHÔNG dùng response wrapper `{data: ..., error: ...}`
```typescript
// ✅ Correct
return c.json({ id: sandbox.id, status: sandbox.status })
return c.json({ error: 'Not found' }, 404)

// ❌ Wrong
return c.json({ data: { id: sandbox.id }, success: true })
```

**Error Response Structure:**
```typescript
// Standard error shape
{ error: string, code?: string }

// Validation error
{ error: 'Validation failed', details: ZodError.issues }
```

**Date Format:**
- API: ISO 8601 strings — `"2026-05-09T10:00:00.000Z"`
- DB: Drizzle `timestamp()` với mode `'string'`
- KHÔNG dùng Unix timestamps trong API responses

**JSON Field Naming:**
- API responses: camelCase — `{ sandboxId, createdAt, isActive }`
- DB columns: snake_case (Drizzle tự map khi dùng `.$type<>()`)

---

### Communication Patterns

**Sandbox → API Communication:**
- OpenCode LLM calls: `POST /chat/completions` với `x-epsilon-auth-token`
- Health checks: `GET /health` trên Epsilon Master (port 8000)
- KHÔNG gọi apps/api từ sandbox cho business logic — chỉ LLM proxy + health

**Frontend → Sandbox:**
- Qua `OpencodeClient` (`lib/opencode-sdk.ts`) — KHÔNG gọi sandbox URL trực tiếp
- Auth token injection: qua `authenticatedFetch` wrapper
- SSE streaming: SDK handles reconnection tự động

**Inter-module Communication (apps/api):**
- Import qua module's `index.ts` — KHÔNG import internal files trực tiếp
- Async jobs: BullMQ queue, KHÔNG gọi async functions fire-and-forget

**Event Naming (BullMQ queues):**
- Queue names: `kebab-case` — `sandbox-provision`, `credit-replenish`
- Job names: verb-noun — `provision-sandbox`, `deduct-credits`

---

### Process Patterns

**Validation:**
- Zod schemas tại route level trong apps/api
- Validate request body và query params trước khi xử lý
- Type inference từ Zod schema — KHÔNG define types riêng cho validated input

```typescript
const schema = z.object({ sandboxId: z.string().uuid() })
const { sandboxId } = schema.parse(await c.req.json())
```

**Auth Middleware:**
- Luôn dùng `authMiddleware` từ `middleware/auth.ts` — KHÔNG manually verify JWT
- User context available qua `c.get('user')` sau middleware
- Service routes: `serviceAuthMiddleware` cho internal calls

**Error Handling:**
- Route handlers: throw errors, Hono `onError` global handler catches
- Known errors: return với HTTP status code thích hợp
- Unexpected errors: log tới Logtail + Sentry, return 500
- KHÔNG swallow errors silently

**Sandbox Lifecycle:**
- Luôn qua `SandboxProvider` interface — KHÔNG gọi JustaVPS/Docker APIs trực tiếp
- Health check trước khi forward requests
- Pool manager cho sandbox provisioning

---

### Enforcement Guidelines

**All AI Agents MUST:**
- Import DB operations qua `@epsilon/db` — KHÔNG import Drizzle client trực tiếp
- Dùng `@epsilon/shared` types cho cross-package types
- Dùng Bun APIs (`Bun.file`, `Bun.write`) thay Node.js `fs`
- Validate với Zod tại route level
- Dùng `c.get('user')` cho auth context sau middleware
- Thêm DB migrations additive-only (KHÔNG rename/drop)

**Anti-Patterns:**
```typescript
// ❌ Raw SQL
db.execute(sql`SELECT * FROM sandboxes`)

// ✅ Drizzle ORM
db.select().from(sandboxes).where(eq(sandboxes.userId, userId))

// ❌ Direct Node.js fs
import { readFile } from 'fs/promises'

// ✅ Bun API
const content = await Bun.file(path).text()

// ❌ any type
const data: any = await response.json()

// ✅ Typed with Zod/TypeScript
const data = ResponseSchema.parse(await response.json())

// ❌ Adding AI tools as Hono routes
app.get('/api/crypto/price', fetchCryptoPrice)

// ✅ AI tools as MCP servers in sandbox container (core/)
```

## Step 6: Project Structure & Boundaries

### Complete Project Directory Structure

```
epsilon/ (monorepo root)
├── apps/
│   ├── api/                          ← Hono/Bun backend API
│   │   └── src/
│   │       ├── index.ts              ← Entry point, app composition
│   │       ├── middleware/
│   │       │   └── auth.ts           ← JWT + API key auth middleware
│   │       ├── router/
│   │       │   ├── routes/
│   │       │   │   ├── llm.ts        ← LLM proxy + billing (POST /chat/completions)
│   │       │   │   ├── proxy.ts      ← General LLM provider proxy
│   │       │   │   ├── search-web.ts
│   │       │   │   └── search-image.ts
│   │       │   └── services/
│   │       │       └── billing.ts    ← Credit deduction logic
│   │       ├── platform/             ← Sandbox lifecycle management
│   │       │   ├── index.ts
│   │       │   └── pool/             ← Pre-warmed sandbox pool
│   │       ├── sandbox-proxy/        ← /:sandboxId/:port/* → container
│   │       │   └── index.ts
│   │       ├── billing/              ← Stripe + RevenueCat
│   │       ├── auth/                 ← OAuth flows
│   │       ├── access-control/       ← RBAC
│   │       ├── teams/                ← Multi-workspace
│   │       ├── integrations/         ← OAuth connector store
│   │       ├── queue/                ← BullMQ background jobs
│   │       ├── secrets/              ← Credential management
│   │       ├── repositories/         ← Git repo management
│   │       └── admin/                ← Admin endpoints
│   │
│   ├── web/                          ← Next.js 15 frontend
│   │   └── src/
│   │       ├── app/
│   │       │   ├── (dashboard)/      ← Authenticated dashboard routes
│   │       │   │   ├── [...catchAll]/ ← Tab-based catch-all
│   │       │   │   ├── agents/
│   │       │   │   ├── sessions/
│   │       │   │   ├── tools/
│   │       │   │   ├── skills/
│   │       │   │   ├── connectors/
│   │       │   │   ├── memory/
│   │       │   │   ├── terminal/
│   │       │   │   ├── browser/
│   │       │   │   ├── files/
│   │       │   │   ├── marketplace/
│   │       │   │   └── admin/
│   │       │   └── (auth)/           ← Login/signup pages
│   │       ├── components/
│   │       │   ├── thread/
│   │       │   │   └── tool-views/   ← OpenCode tool result renderers
│   │       │   ├── session/          ← Session layout, chat input
│   │       │   └── ui/               ← Radix-based primitives
│   │       ├── stores/
│   │       │   └── tab-store.ts      ← Multi-tab session state
│   │       ├── lib/
│   │       │   └── opencode-sdk.ts   ← OpencodeClient singleton
│   │       └── hooks/
│   │
│   ├── mobile/                       ← Expo + NativeWind (React Native)
│   └── desktop/                      ← Tauri (Rust shell)
│
├── core/                             ← Docker sandbox container build
│   ├── Dockerfile
│   ├── s6-services/                  ← Process supervisor config
│   │   ├── svc-epsilon-master/
│   │   │   └── run                   ← Port 8000, proxies → OpenCode:4096
│   │   ├── svc-opencode-serve/
│   │   │   └── run                   ← Port 4096, managed by Epsilon Master
│   │   ├── svc-chromium/
│   │   ├── svc-sshd/
│   │   ├── svc-agent-browser-session/
│   │   ├── svc-lss-sync/
│   │   └── svc-static-web/
│   └── opencode-config/              ← OpenCode config + MCP server definitions
│
├── packages/
│   ├── db/                           ← Drizzle ORM + Supabase migrations
│   │   └── src/
│   │       ├── schema/               ← 1 file per table
│   │       ├── migrations/           ← Additive-only migration files
│   │       └── index.ts
│   ├── shared/                       ← Cross-package TypeScript types
│   │   └── src/
│   │       └── types/
│   ├── agent-tunnel/                 ← Network relay for agent connections
│   ├── epsilon-ocx-registry/         ← Cloudflare Workers OCX registry
│   └── voice/                        ← Python FastAPI voice backend
│
├── tests/
│   └── e2e/                          ← Playwright E2E tests
│
├── package.json                      ← pnpm workspaces root
├── pnpm-workspace.yaml
├── turbo.json                        ← Turborepo pipeline
└── supabase/                         ← Supabase local dev config
    └── migrations/
```

---

### Architectural Boundaries

**API Boundaries:**
```
Public API (apps/api):
  POST /chat/completions         ← LLM proxy (called BY OpenCode in sandbox)
  GET/POST /api/sandboxes/*      ← Sandbox lifecycle
  GET/POST /api/billing/*        ← Subscription + credits
  /:sandboxId/:port/*            ← Sandbox proxy (called BY apps/web)
  GET/POST /api/integrations/*   ← OAuth connectors
  GET/POST /api/admin/*          ← Admin panel

Internal Only (không expose ra ngoài):
  Queue workers (BullMQ)
  Provisioning poller
  Auto-update loop
  Pool manager
```

**Component Boundaries:**
```
apps/web ←→ apps/api:
  - Auth: Supabase JWT từ client
  - Sandbox proxy: qua /:sandboxId/:port/*
  - REST API: qua /api/* endpoints

apps/web ←→ sandbox (qua proxy):
  - OpenCode SDK: HTTP/SSE tới sandbox:8000
  - Tất cả AI interactions đi qua này

sandbox (OpenCode) ←→ apps/api:
  - LLM calls: POST /chat/completions (bắt buộc, để billing)
  - KHÔNG gọi các /api/* endpoints khác

apps/api ←→ JustaVPS:
  - Sandbox provision/deprovision
  - Health monitoring
  - Chỉ qua SandboxProvider abstraction
```

**Data Boundaries:**
```
packages/db:
  - Tất cả DB schemas phải định nghĩa ở đây
  - apps/* KHÔNG define schema riêng
  - Import: @epsilon/db

packages/shared:
  - Types dùng across multiple packages
  - KHÔNG chứa business logic
  - Import: @epsilon/shared

Sandbox state (trong container):
  - Filesystem của sandbox (volatile, không persist)
  - OpenCode session state (trong container memory)
  - Sync về DB qua lss-sync service khi cần
```

---

### Integration Points

**External Services:**
```
Supabase (PostgreSQL + Auth):
  - DB: packages/db → Drizzle ORM
  - Auth: apps/api middleware/auth.ts

OpenRouter (LLM Gateway):
  - apps/api/router/routes/llm.ts
  - Inject API key + route to model

JustaVPS (VPS Provider):
  - apps/api/platform/ → SandboxProvider interface
  - REST API cho VM lifecycle

Stripe + RevenueCat (Billing):
  - apps/api/billing/
  - Webhook handlers

Sentry + Logtail (Observability):
  - apps/api: error.ts + logger.ts wrappers
  - apps/web: Sentry client SDK

Cloudflare Workers (OCX Registry):
  - packages/epsilon-ocx-registry/
  - Agent capability registry
```

**Development Workflow:**
```
Local dev startup:
  supabase start          → DB on :54321
  pnpm dev:api            → apps/api on :8008
  pnpm dev:frontend       → apps/web on :3000
  pnpm dev:sandbox        → local Docker sandbox

Build pipeline (Turborepo):
  turbo build             → builds all apps in dependency order
  turbo test              → runs all test suites

Docker build:
  apps/api      → epsilon/epsilon-api image
  apps/web      → epsilon/epsilon-frontend image
  core/         → epsilon/computer image
```

## Step 7: Architecture Validation Results

### Coherence Validation ✅

**Decision Compatibility:**
Tất cả technology choices đã proven production-compatible: Bun runtime + Hono + Drizzle ORM + Supabase PostgreSQL + Next.js App Router hoạt động trong production. Không có version conflicts — tech stack ổn định.

**Pattern Consistency:**
- Naming conventions (snake_case DB, camelCase TS API responses, kebab-case files) nhất quán với existing code
- Auth pattern (JWT → API key fallback qua single middleware) áp dụng nhất quán toàn bộ `apps/api`
- Sandbox provider abstraction được respected: không có direct JustaVPS API calls ngoài `platform/`

**Structure Alignment:**
- `packages/db` là single source of truth cho tất cả DB schemas — enforced bởi import convention
- `sandbox-proxy` là single entry point cho mọi frontend-sandbox communication — không có direct sandbox calls
- MCP servers trong `core/opencode-config/` là correct location cho AI tools — KHÔNG phải Hono routes

---

### Requirements Coverage Validation ✅

**Component Coverage:**
- ✅ Sandbox container (`epsilon/computer`): core/, s6-services, OpenCode + Epsilon Master
- ✅ Backend API (`epsilon/epsilon-api`): apps/api, tất cả modules documented
- ✅ Frontend (`epsilon/epsilon-frontend`): apps/web, tất cả dashboard routes documented
- ✅ Shared packages: packages/db, packages/shared, packages/agent-tunnel, packages/voice

**Cross-Cutting Concerns:**
- ✅ Auth: Supabase JWT + API key, 2-mode middleware, sandbox token injection
- ✅ Billing: LLM proxy 3-mode billing, credit ledger, Stripe + RevenueCat
- ✅ Observability: Sentry + Logtail, cả api lẫn web
- ✅ Sandbox health: 3-layer model, provisioning poller, auto-update loop
- ✅ Background jobs: BullMQ queues cho async operations

**Non-Functional Requirements:**
- ✅ Performance: sandbox pool (pre-warmed), SSE streaming (không buffer), BullMQ async
- ✅ Security: RLS tại Supabase, JWT verification, service key cho internal calls
- ✅ Scalability: stateless API (sandbox state trong containers), provider abstraction cho multi-VPS

---

### Implementation Readiness Validation ✅

**Decision Completeness:**
- ✅ Tất cả critical decisions documented với file paths cụ thể
- ✅ 3 billing modes documented với implementation location
- ✅ Auth flow documented với middleware file reference
- ✅ Sandbox lifecycle documented với provider abstraction pattern

**Structure Completeness:**
- ✅ Full monorepo tree với file-level detail
- ✅ API boundaries documented (public vs internal)
- ✅ Component communication boundaries explicit
- ✅ External service integration points mapped

**Pattern Completeness:**
- ✅ TypeScript naming conventions với examples
- ✅ API response format với ✅/❌ code examples
- ✅ Error handling pattern documented
- ✅ Anti-patterns với concrete TypeScript examples

---

### Gap Analysis Results

**Critical Gaps:** Không có.

**Minor Gaps (non-blocking):**
- OpenCode MCP server configuration format chưa được document chi tiết (nằm trong `core/opencode-config/` nhưng spec chưa được included)
- Drizzle schema file naming convention cho từng entity chưa có example cụ thể
- BullMQ job retry policy chưa được specify

**Note:** Đây là brownfield documentation — tất cả gaps trên đều là documentation gaps, không phải implementation gaps.

---

### Architecture Completeness Checklist

**Requirements Analysis**
- [x] Project context thoroughly analyzed
- [x] Scale and complexity assessed (Brownfield Monorepo, high complexity, 3 deployment units)
- [x] Technical constraints identified (Bun APIs, additive migrations, strict TS, App Router)
- [x] Cross-cutting concerns mapped (auth, billing, sandbox lifecycle, observability)

**Architectural Decisions**
- [x] Critical decisions documented with versions
- [x] Technology stack fully specified (Step 3 tech matrix)
- [x] Integration patterns defined (Step 4: all communication patterns)
- [x] Performance considerations addressed (pool, SSE, BullMQ)

**Implementation Patterns**
- [x] Naming conventions established (DB snake_case, TS camelCase, routes kebab-case)
- [x] Structure patterns defined (feature-based api, component-based web)
- [x] Communication patterns specified (sandbox↔api, frontend↔sandbox, inter-module)
- [x] Process patterns documented (validation, auth middleware, error handling, anti-patterns)

**Project Structure**
- [x] Complete directory structure defined (full monorepo tree with file-level detail)
- [x] Component boundaries established (API/sandbox/frontend with explicit rules)
- [x] Integration points mapped (all external services documented)
- [x] Requirements to structure mapping complete (all feature directories mapped)

---

### Architecture Readiness Assessment

**Overall Status:** READY FOR IMPLEMENTATION

**Confidence Level:** High — tài liệu này reflect chính xác production codebase đang chạy, không phải planned architecture.

**Key Strengths:**
- Document based on actual codebase investigation — không phải assumptions
- Critical insight documented: OpenCode là AI brain (KHÔNG phải apps/api)
- Anti-patterns với code examples prevent phổ biến nhất của AI implementation mistakes
- Boundary rules explicit: MCP servers cho tools, provider abstraction cho sandbox lifecycle

**Areas for Future Enhancement:**
- Document OpenCode MCP server configuration format khi implement Chainlens crypto tools
- Add Drizzle schema examples cho từng entity type
- Document BullMQ retry policies khi implement background jobs

---

### Implementation Handoff

**AI Agent Guidelines:**
- Follow all architectural decisions exactly as documented in Steps 4-6
- Use implementation patterns from Step 5 consistently — đặc biệt anti-patterns
- Respect project structure from Step 6 — KHÔNG tạo thêm apps/ hoặc packages/ mới nếu không cần
- Refer to this document cho tất cả architectural questions trước khi implement

**First Implementation Priority:**
Project đã initialized. Tất cả feature mới phải extend vào codebase hiện tại theo sequence:
1. `packages/db/src/schema/<entity>.ts` — additive DB schema
2. `packages/shared/src/types/<feature>.ts` — shared types
3. `apps/api/src/router/routes/<feature>.ts` — API handlers
4. `apps/web/src/app/(dashboard)/<feature>/` — Frontend pages
5. `core/opencode-config/` — MCP server configs (nếu cần AI tools)

## Step 8: MMOMarket Integration Architecture

### Context & Vision
Tích hợp MMOMarket vào Chainlens để biến Chainlens thành "Creator Studio" — cho phép người dùng đăng bán (Sell) hoặc cho thuê (Rent) AI Agents của họ trực tiếp lên MMOMarket. MMOMarket đóng vai trò là sàn giao dịch trung tâm với hệ thống thanh toán hoàn chỉnh (cho phép nạp/rút), trong khi Chainlens xử lý việc thực thi (execution) và phân phối (fulfillment) agent. Đơn vị tiền tệ chuẩn hóa giữa 2 hệ thống là USD ($).

### 8.1. Authentication & Account Linking (OAuth2)
- **Role:** MMOMarket là Identity Provider (IdP).
- **Flow:** User trên Chainlens muốn bán/thuê Agent phải liên kết tài khoản MMOMarket (hoặc đăng nhập MMOMarket bằng Web3 wallet thông qua Chainlens).
- **Token Storage:** Chainlens lưu trữ Access Token và Refresh Token của user trong bảng `integrations` hoặc `oauth_credentials` (tương tự Pipedream pattern). Token này bị giới hạn quyền (Scopes) chỉ cho phép: tạo, sửa, xóa sản phẩm (listings).
- **Security:** Access tokens được mã hóa và bảo mật trong môi trường backend của Chainlens (`apps/api/secrets/`). Agent trong Sandbox (OpenCode) không được truy cập trực tiếp raw token mà phải gọi qua MCP server hoặc proxy.

### 8.2. Listing Synchronization (Vendor Open API)
- Khi user thao tác (Public, Private, Sell, Rent) trên UI của Chainlens, `apps/api` sẽ sử dụng Access Token của user để gọi API của MMOMarket.
- **Endpoint:** `POST https://mmomarket-api.com/api/v1/marketplace/listings`
- **Data Mapping:**
  - `listing_type`: Sell hoặc Rent.
  - `metadata.external_item_id`: Lưu trữ `agent_uuid` của Chainlens để dễ dàng đối soát.
  - `warranty_days`: Số ngày bảo hành thiết lập từ Chainlens.

### 8.3. Order Fulfillment & Webhooks (Giao hàng và Đồng bộ)
- **Luồng mua hàng:** Người mua thao tác trên MMOMarket. Tiền bị khóa vào Escrow.
- **Webhook Dispatcher:** MMOMarket gửi Webhook (sự kiện `Payment_Confirmed`) sang Chainlens.
- **Webhook Receiver (Chainlens):**
  - Route: `apps/api/src/router/routes/webhooks/mmomarket.ts`
  - Validation: Verify HMAC SHA256 signature từ Webhook Secret để chống giả mạo.
  - Queueing: Đẩy payload vào BullMQ (`queue/`) để xử lý bất đồng bộ nhằm đảm bảo độ tin cậy.
- **Fulfillment Logic (BullMQ Worker):**
  - User mua hàng phải liên kết tài khoản MMOMarket với Chainlens.
  - Chainlens xử lý cấp quyền (Grant Access) cho người mua:
    - **Rent / Use:** Cho phép người mua sử dụng Agent (thông qua giao diện Chainlens) nhưng không thấy source code.
    - **Sell (Transfer/Clone):** Clone Agent sang workspace của người mua.
  - Sau khi fulfillment hoàn tất, Worker gọi API của MMOMarket: `POST /api/v1/orders/{order_id}/fulfill`.
  - MMOMarket cập nhật trạng thái đơn thành "Delivered" và bắt đầu đếm ngược thời gian Escrow (Warranty).

### 8.4. Implementation Blueprint (Sequence)
1. **Database (`packages/db`):** 
   - Thêm tables lưu trữ Webhook secrets, OAuth credentials của MMOMarket.
   - Bổ sung `listing_id` (MMOMarket) vào bảng `agents`.
2. **API Routes (`apps/api`):**
   - OAuth callback handlers cho MMOMarket.
   - Endpoint nhận Webhook từ MMOMarket (HMAC validation).
   - API nội bộ cho phép Frontend trigger việc đăng bán lên MMOMarket.
3. **Queue / Workers (`apps/api/queue`):**
   - `mmomarket-webhook-worker`: Xử lý `Payment_Confirmed` để grant access/clone agent.
   - Logic gọi ngược lại `orders/{order_id}/fulfill` với cơ chế retry (Exponential Backoff).
4. **Frontend (`apps/web`):**
   - Nút liên kết tài khoản MMOMarket trong phần Settings/Connectors.
   - Giao diện cấu hình giá bán/cho thuê (Rent/Sell) trong màn hình quản lý Agent.
5. **Sandbox / MCP (`core/opencode-config`):**
   - Đảm bảo các tác vụ liên quan tới tài chính/sản phẩm được tách biệt khỏi LLM, hoặc nếu cấp quyền cho AI agent tự động list hàng, phải thông qua một MCP Tool được kiểm soát chặt chẽ với consent của user.
# Third-Party API Cost Analysis & Recommendations

**Date:** 2026-05-11
**Project:** Chainlens
**Prepared by:** Mary (Business Analyst) & Winston (System Architect)

## 1. Executive Summary

This document outlines the current pricing models (2025-2026) for the third-party APIs required to support the "Deep Dive" stories in Epic 2 and Epic 3. The analysis reveals a significant shift in the data provider industry toward **Enterprise Custom Pricing** and **Pay-per-compute/call** models.

Implementing all features simultaneously using platform-subsidized API keys would result in an estimated operational cost of **$4,000 - $5,000+ per month**, primarily driven by high-frequency on-chain data and pay-per-call metrics.

## 2. API Pricing Breakdown

### 2.1. Mempool & MEV Data (Story 2.1.1)
**Provider:** Blocknative
*   **Developer/Free Tier:** $0 (Rate limited, ~1000 events/day, high latency ~2s). Suitable for prototyping.
*   **Commercial/Enterprise:** **Custom Pricing** (Contact Sales). Public mid-tier plans (~$69/mo) have been discontinued in favor of custom enterprise contracts for high-volume mempool sniffing.

### 2.2. Entity & Hacker Wallet Tracking (Story 2.1.2)
**Provider:** Arkham Intelligence
*   **Web Platform:** Free for individual use.
*   **API Access:** **Custom Pricing / Token-gated**. Billed via a "Credit" system. Programmatic access requires an Enterprise agreement or holding/staking a significant amount of $ARKM tokens.

### 2.3. Social Sentiment & Narrative Clustering (Story 2.2.2)
**Provider:** Santiment (SanAPI)
*   **Free:** $0 (1,000 calls/mo, 30-day delayed data). Unusable for real-time alpha.
*   **Pro:** $49/month (5,000 calls/mo, 30-day delayed data).
*   **Max:** **$249/month** (80,000 calls/mo, **Real-time data**). *This is the minimum required tier for Narrative Heatmaps and Social Sentiment alerts.*

### 2.4. Smart Money Flow & VIP Analytics (Story 2.3.1)
**Provider:** Nansen
*   **Nansen Pro Subscription:** $69/month.
*   **Nansen API (Pay-per-call):** No more flat-fee VIP plans ($3000/mo). Now uses micropayments via Pay.sh (USDC on Base/Solana).
    *   **Basic Data:** $0.01 / API call.
    *   **Alpha/VIP Data (Token God Mode, Smart Money):** **$0.05 / API call**.
*   *Note:* 1,000 Agent queries per day = $50/day = $1,500/month.

### 2.5. Deep On-chain Data & Analytics (Story 2.3)
**Provider:** Dune Analytics
*   **Plus Plan:** **$399/month**. Includes 25,000 compute credits.
*   **Overage:** ~$1.60 per 100 extra credits. Complex SQL queries for custom dashboards will consume credits rapidly.

### 2.6. Financial Statements (P/S, DAU) (Story 2.3.2)
**Provider:** Token Terminal
*   **Pro Tier (Web/Export only):** ~$350/month (No API access).
*   **API Tier:** **Custom Pricing** (Contact Sales). Typically reserved for larger startups and institutions.

### 2.7. Chart Overlays & Indicators (Story 3.2.1)
**Provider:** Glassnode
*   **Professional Plan:** **$999/month**.
*   **API Access:** The API is a **Paid Add-on** that is *only* available to users already on the $999/mo Professional plan. The cost of the API Add-on is Custom (Contact Sales).

---

## 3. Strategic Recommendations (Action Plan)

To ensure runway survival while delivering a premium product, the following strategies must be adopted:

### Recommendation 1: Aggressive Bootstrapping for MVP (Phase 1)
Do not purchase Glassnode, Token Terminal, or Arkham APIs for the initial launch. 
*   Rely entirely on **DeFiLlama (Free)** for TVL, Yield, and basic flows.
*   Purchase **Santiment Max ($249/mo)** as the primary investment for the "AI-Generated Discover Feed" to provide unique social sentiment value that competitors lack.

### Recommendation 2: Pass-Through Costs via BYOK (Bring Your Own Key)
For extremely expensive or pay-per-call APIs (like Nansen's $0.05/call), shift the cost to the power users.
*   **Leverage Epic 8.1 (BYOK):** Allow Quant Traders (Tier 2/3) to input their own Nansen API keys or connect their own Pay.sh wallets.
*   The Chainlens AI Agent will execute the tool using the user's credentials, ensuring Chainlens incurs zero marginal cost for premium data queries.

### Recommendation 3: Prerequisite - Atomic Credit System
Do not release the "Deep Dive" OpenCode Tools to Free/Tier 1 users until **Epic 7.1 (Internal Credits System)** is fully implemented and tested.
*   If a Tier 1 user requests Nansen Smart Money data, the system MUST accurately deduct the equivalent of >$0.05 from their Internal Credit balance atomically.
*   Failure to implement strict credit deduction before releasing these tools will result in rapid depletion of platform funds.

### Recommendation 4: Shared Pool Throttling
For Tier 1 users routed to the `global-tier1-sandbox-01` (Story 9.3), implement strict rate limiting (e.g., 3 premium queries per day) and heavily cache responses (e.g., cache a Token's Nansen data for 15 minutes globally so subsequent users asking about the same token do not trigger a new paid API call).