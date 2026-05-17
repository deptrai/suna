---
stepsCompleted: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
lastStep: 10
status: 'complete'
completedAt: '2026-05-17'
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
| **Prod (chainlens.net)** | Dokploy (`frontend-pyzi0j`) | Dokploy (`api-djcsof`, api.chainlens.net) | Daytona EU (primary), JustAVPS (legacy) |

**Local dev:**
- Frontend: localhost:3000 (`pnpm dev:frontend`)
- API: localhost:8008 (`pnpm dev:api`)
- Sandbox: Docker local (`pnpm dev:sandbox`) HOẶC Daytona cloud qua cloudflared tunnel — xem Step 10
- DB: Supabase local (`supabase start`)

> **Production deployment platform**: Chainlens production (167.172.66.16) chạy trên **Dokploy** (Docker Swarm) — không phải Vercel. autoDeploy=true theo branch `feat/rename-chainlens-epsilon`. Sandbox provider chuyển từ JustAVPS sang **Daytona** (EU region) trong 2026-05.

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

**Risk Mitigation Constraints (Rào chắn Rủi ro - Epic 10):**
*   **Financial Risk (Negative Balance):** Áp dụng **Circuit Breaker** tại API Gateway. Lập tức cắt đứt kết nối mạng nội bộ của Sandbox ra ngoài nếu phát hiện dấu hiệu lạm dụng (trừ credit > 5 lần/phút hoặc số dư < $5) để bảo đảm nguyên tắc Atomic Credit Deduction (NFR8).
*   **Compliance Risk (PII Data Leak):** Bắt buộc tích hợp **Data Masking Middleware** (vd: Presidio) để tự động quét và ẩn giấu dữ liệu nhạy cảm (PII) trong file dữ liệu của user trước khi Agent có quyền gửi payload cho LLM bên thứ ba.
*   **Integration Risk (Webhook Spam):** Áp dụng **Alert Deduplication & Cooldown** tại nguồn phát sinh sự cố trước khi trigger Pipedream Webhook (Story 10.4), đảm bảo các lỗi trùng lặp bị gộp lại kèm bộ đếm (count), tránh Rate Limit và spam channel Slack.

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

### Implementation Patterns for Autonomous Agents (Epic 10)

**1. Naming Patterns (DAG Event Naming):**
- Sử dụng chuẩn `namespace.action` cho cột `event_type` trong bảng `dag_events` (ví dụ: `swarm.task.started`, `agent.coder.failed`, `sandbox.execution.timeout`).
- Giúp tối ưu hóa truy vấn lọc (filter) theo từng cấp độ trên cột JSONB.

**2. Structure Patterns (Sandbox Execution):**
- **Không tạo file vật lý trên host server.** Mọi đoạn code Python/Bash do LLM sinh ra phải được truyền trực tiếp vào Sandbox thông qua `stdin` hoặc API payload.
- Đảm bảo Zero-Data-Leakage và không để lại rác (orphaned files) trên máy chủ host, tuân thủ nguyên tắc tinh gọn.

**3. Format Patterns (Agent Tool Output):**
- Tất cả các Custom Tools nội bộ (chạy sandbox, gọi agent-browser) bắt buộc phải trả về dữ liệu được bọc trong **JSON Wrapper**: `{ "success": boolean, "data": any, "error": string | null }`.
- Nếu lỗi, trường `error` phải chứa chi tiết lỗi (stderr) để Agent dựa vào đó kích hoạt vòng lặp Tự sửa lỗi (Self-heal).

**4. Process Patterns (Self-Healing Loop):**
- Agent chỉ được phép retry (tự sửa lỗi) tối đa **3 lần** khi nhận về `success: false` từ một Tool. Sau 3 lần, phải báo cáo lỗi tổng hợp lên cho user để tránh vòng lặp vô hạn gây tiêu hao Credit (Cost Budgeting).

## Step 6: Project Structure & Boundaries

### Epic 10 Boundaries (Autonomous Agents)
**Separation of Concerns Rule:** Các tính năng tự trị phải tuân thủ nghiêm ngặt ranh giới Monorepo hiện tại:
1. **OpenCode Domain (`core/epsilon-master/opencode/`)**: Chỉ chứa logic suy nghĩ (Prompts/Agents .md) và Tool definitions (`sandbox_exec.ts`, `swarm_delegate.ts`). **Tuyệt đối không import `packages/db` hoặc kết nối Database trực tiếp.** Đối với các file nhị phân (Binary/PDF) sinh ra từ Agent, Tool phải upload lên Storage/S3 (qua hàm share util) và chỉ trả về URL trong JSON Wrapper. **Luật Chống Phụ thuộc Vòng (No Circular Dependency):** OpenCode tuyệt đối không được gọi HTTP request ngược lại các endpoint của `apps/api`. Mọi kết quả phải được trả về qua Return Value hoặc Callback cho API Proxy tự xử lý. **Định hướng Tương lai:** Cân nhắc đóng gói `opencode` thành một workspace package nội bộ (vd: `packages/opencode`) để đảm bảo tính độc lập tuyệt đối và dễ tách server sau này.
2. **API Proxy Domain (`apps/api/src/router/routes/swarm/`)**: Đóng vai trò cầu nối duy nhất. Nhận request HTTP/SSE từ Frontend, tương tác với Database (ghi `dag_events`), và chuyển tiếp lệnh sang OpenCode. Đảm nhận logic Billing và Cost Budgeting. **Bắt buộc thiết kế theo mô hình Asynchronous (Fire-and-Forget):** API nhận request, tạo Job ID, ném task vào Queue (BullMQ) và trả về HTTP 202 ngay lập tức để tránh timeout. Client dùng Job ID để nhận stream log qua SSE.
3. **Database Domain (`packages/db/src/schema/`)**: Bổ sung schema cho DAG Events tại file `swarm.ts` (Tuân thủ AR3 additive-only).
4. **Frontend Domain (`apps/web/src/components/agent/`)**: Các UI Components mới (Dry-run Dashboard, Action Drawer) phải gọi qua `apps/api`, không bao giờ kết nối thẳng xuống môi trường OpenCode. UI Component phải sử dụng **React Context (vd: `AgentSwarmProvider`)** bọc vòng ngoài để quản lý duy nhất 1 kết nối SSE, tránh việc các component con mở nhiều kết nối mạng dư thừa. **Persistent SSE Context:** Context này bắt buộc phải đồng bộ Job ID đang chạy vào `localStorage`/`IndexedDB` để có thể phục hồi kết nối (gọi API lấy Snapshot) nếu user lỡ tay đóng tab trình duyệt và mở lại.

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
**Provider decision (MVP):** QuickNode WebSocket endpoint configured by platform/operator.
*   **Runtime model:** Background worker maintains long-lived WSS subscriptions using JSON-RPC `eth_subscribe` / `newPendingTransactions` where supported. If the provider returns only transaction hashes, the worker must fetch transaction details via the same QuickNode endpoint before filtering/classification.
*   **Configuration:** Do not hardcode provider URLs or API keys. Use env vars such as `MEMPOOL_PROVIDER=quicknode`, `MEMPOOL_CHAINS=ethereum,bsc`, and per-chain WSS URLs (`MEMPOOL_WS_URL_ETHEREUM`, `MEMPOOL_WS_URL_BSC`, etc.).
*   **Cost/coverage risk:** Pending-transaction streams can generate high delivered-message volume and provider credit usage. The worker must filter by configured chain/router watchlist and threshold; do not attempt unfiltered full-chain persistence for MVP.
*   **Agent boundary:** OpenCode tool `mempool_alerts` queries Chainlens API/DB only. It must not connect directly to QuickNode, Blocknative, or any external mempool provider.
*   **Legacy note:** Earlier planning referenced Blocknative. Keep provider adapter boundaries generic so Blocknative/self-hosted nodes can be added later, but QuickNode is the initial configured provider.

### 2.2. Entity & Hacker Wallet Tracking (Story 2.1.2)
**Provider decision (MVP):** Arkham Intelligence for entity labels; optional QuickNode HTTP RPC for on-chain verification.
*   **Web Platform:** Free for individual use.
*   **API Access:** **Custom Pricing / Token-gated**. Billed via a "Credit" system. Programmatic access requires an Enterprise agreement or holding/staking a significant amount of $ARKM tokens.
*   **Runtime model:** Arkham remains the source of entity/label attribution. If additional verification is required, use per-chain QuickNode HTTP RPC configured by the platform/operator to read balance/log/call data for the specific token/address being analyzed.
*   **Configuration:** Do not hardcode provider URLs or API keys. Use `ARKHAM_*` for label access and optional `ENTITY_WALLET_CHAINS=ethereum,base,...` plus `ENTITY_WALLET_RPC_URL_ETHEREUM`, `ENTITY_WALLET_RPC_URL_BASE`, etc. for QuickNode verification.
*   **Scope:** Multi-chain by allowlist, not full-chain crawling. MVP processes queried tokens, watched wallets, and stale cached labels only.
*   **Agent boundary:** OpenCode tool `entity_wallet_risk` queries Chainlens API/DB only. It must not call Arkham or QuickNode directly.

### 2.2a. On-chain Fact Checking (Story 2.2.1)
**Provider decision (MVP):** QuickNode HTTP RPC endpoint configured by platform/operator.
*   **Runtime model:** Fact-check worker reads on-chain evidence through per-chain QuickNode HTTP RPC using JSON-RPC methods such as `eth_getLogs`, `eth_call`, and balance/state reads where needed. It verifies configured Dev/Treasury/team wallets for the token/article being published, then persists an audit row before Discover feed publication.
*   **Configuration:** Use env vars such as `ONCHAIN_FACT_CHECK_PROVIDER=quicknode`, `ONCHAIN_FACT_CHECK_CHAINS=ethereum,base,polygon,arbitrum`, and per-chain URLs (`ONCHAIN_FACT_CHECK_RPC_URL_ETHEREUM`, `ONCHAIN_FACT_CHECK_RPC_URL_BASE`, etc.). Worker starts only when enabled and at least one configured chain endpoint exists.
*   **Fallbacks:** Etherscan-compatible APIs, Blockscout, and Moralis can be used as fallback or supplemental sources for transfer history/current holders, but they are not the default provider for MVP.
*   **Cost/coverage risk:** RPC log scans can be expensive. Restrict by chain allowlist, token contract, wallet watchlist, block/time window, and max transfer limits. Do not scan all logs or all wallets on a chain.
*   **Discover boundary:** This is a backend publish-time verification layer for Discover. It is not an OpenCode tool in MVP unless a later story explicitly exposes one.

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
**Provider:** Token Terminal REST v2 API.
*   **Pro Tier (Web/Export only):** ~$350/month (No API access). Do not implement this story via browser scraping, web login automation, or CSV export assumptions.
*   **API Tier:** **Custom Pricing** (Contact Sales). Required for implementation because worker needs backend REST access with bearer-token auth.
*   **Runtime model:** backend-only daily/cache-first worker, not live provider calls per Agent prompt. Worker refreshes project/metric metadata, pulls configured fundamentals, and computes valuation snapshots.
*   **Operator configuration:** `TOKEN_TERMINAL_WORKER_ENABLED`, `TOKEN_TERMINAL_API_BASE_URL`, `TOKEN_TERMINAL_API_KEY`, `TOKEN_TERMINAL_PROJECTS`, `TOKEN_TERMINAL_METRICS`, sync interval, cache TTL, concurrency, and max projects per run.
*   **Scope guard:** run only configured project/metric allowlists. Do not attempt "all protocols/all metrics" by default because provider access, redistribution, and rate-limit costs are contract-dependent.
*   **API/tool boundary:** Agent/OpenCode uses internal `protocol_valuation` route/tool that reads normalized Chainlens DB/cache. The Token Terminal key never enters OpenCode, sandbox, frontend, public feeds, logs, or raw response payloads.
*   **Rate and cost guard:** Token Terminal reference currently states 60 requests/minute; throttle worker below that limit. Cache hits should be free or low-cost internally; live refresh must require explicit backend permission and a product-approved Tier 2 credit key.

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

> ⚠️ **Updated 2026-05-14**: This recommendation is **superseded for Stories 2.4–2.7** by the DeFiLlama Pro integration (Section 9). When shipping Stories 2.4–2.7, the platform commits to DeFiLlama Pro at $300/mo to enable hourly full-database crawls (~7,000 protocols, ~16,000 yield pools) and Pro-only endpoints (hacks, token unlocks). The Free-tier-only stance still applies for Glassnode/Token Terminal/Arkham per this recommendation. See Section 9.10 for cost trade-off analysis.

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

---

## Step 9: DeFiLlama Pro Integration Architecture (Stories 2.4 — 2.7)

**Added:** 2026-05-14 (Winston — System Architect)

This section documents architectural decisions for the DeFiLlama integration expansion (Stories 2.4 through 2.7) that supersede portions of "Recommendation 1: Aggressive Bootstrapping". With the DeFiLlama Pro subscription ($300/mo) now committed, the platform shifts from a single-protocol JIT lookup model (Story 1.2) to a comprehensive pre-indexed dataset covering TVL, Yields, DEX volumes, Fees, Stablecoins, Hacks, Token Unlocks, and Bridge volumes.

### 9.1. Free vs Pro Endpoint Path Mapping (CRITICAL)

DeFiLlama's Pro API is **not** simply an authenticated wrapper over the Free API. Endpoint paths differ between tiers, and Pro endpoints **embed the API key in the URL path** (not query params or headers):

| Endpoint key | Free URL | Pro URL |
|---|---|---|
| `protocols` | `https://api.llama.fi/protocols` | `https://pro-api.llama.fi/{KEY}/api/protocols` |
| `pools` (yields) | `https://yields.llama.fi/pools` | `https://pro-api.llama.fi/{KEY}/yields/pools` |
| `dexs` | `https://api.llama.fi/overview/dexs` | `https://pro-api.llama.fi/{KEY}/api/overview/dexs` |
| `fees` | `https://api.llama.fi/overview/fees` | `https://pro-api.llama.fi/{KEY}/api/overview/fees` |
| `stablecoins` | `https://stablecoins.llama.fi/stablecoins` | `https://pro-api.llama.fi/{KEY}/stablecoins/stablecoins` |
| `coin-prices` | `https://coins.llama.fi/prices/current/{coins}` | `https://pro-api.llama.fi/{KEY}/coins/prices/current/{coins}` |
| `hacks` | (Pro-only) | `https://pro-api.llama.fi/{KEY}/api/hacks` |
| `emissions` | (Pro-only) | `https://pro-api.llama.fi/{KEY}/api/emissions` |
| `bridges` | `https://bridges.llama.fi/bridges` | `https://pro-api.llama.fi/{KEY}/bridges/bridges` |

**Decision:** Centralize URL construction in a single helper `getDefillamaUrl(endpoint, proKey?)` exported from `apps/api/src/router/services/defillama.ts`. Story 2.4 introduces this helper; Stories 2.5–2.7 extend it. No service should construct DeFiLlama URLs inline.

**Rationale:** Pro/Free paths diverge in three subdomains (`api.llama.fi`, `yields.llama.fi`, `stablecoins.llama.fi`, `bridges.llama.fi`, `coins.llama.fi`) plus `pro-api.llama.fi`. A central helper prevents future bugs where one service uses the wrong path.

### 9.2. Two-Tier Cache Strategy (Stories 2.1 + 2.4)

Story 2.1 introduces a 5-minute refresh worker for ~15 hot protocols. Story 2.4 adds a 1-hour refresh worker for all ~7,000 protocols. Both write to different tables; the JIT sync route reads from both:

```
Hot tier:  protocol_watchlist (15 active slugs) → protocol_tvl_snapshots (5min refresh)
Full tier: defillama_protocols (~7,000 rows, 1h refresh)
```

**Lookup priority in `jit-sync.ts`:**
1. If `slug ∈ protocol_watchlist` (active=true) → query `protocol_tvl_snapshots`, freshness window = `CRYPTO_SYNC_INTERVAL_MS` (5 min default).
2. Else → query `defillama_protocols`, freshness window = `DEFILLAMA_SYNC_INTERVAL_MS` (1 h default).
3. Both miss/stale → in-memory cache → live fetch (existing logic).
4. All set `source: 'db_cache'` when serving from DB.

**Rationale:** Hot tier refresh rate (5 min) is overkill for 7,000 protocols (worker would saturate API rate limits and burn $30/mo in unnecessary Pro calls). Full tier refresh (1 h) is too slow for the ~15 protocols rendered in dashboards (Story 3.1) where freshness matters. Two-tier separates concerns: hot path optimizes latency for known-popular protocols; full path provides coverage for the long tail.

### 9.3. Per-Category Retry, Not Job-Level Retry

DeFiLlama Pro plan has a 1,000 req/min rate limit. A naive BullMQ `attempts: 3` would retry the entire job (5 fetches × 3 attempts = 15 calls) on a single 429, wasting budget.

**Decision:**
- BullMQ job-level: `attempts: 1` (no job-level retry).
- Per-category retry inline via `fetchWithRetry(url, retries=3, baseDelayMs=60_000)` — exponential backoff (60s, 120s, 240s) on 429/5xx, timeout 30s per fetch.
- If one category exhausts retries, log and continue with other categories — never throw from `processJob`.

**Rationale:** A single category failure (e.g., `/pools` rate-limited because we hit a 60-second budget cliff) should not invalidate the other 4 categories that succeeded. Job-level retry would re-fetch all 5, doubling the rate-limit pressure.

### 9.4. Database Indexing Strategy

The `defillama_pools` table will hold ~16,000 rows and is queried by Story 2.6 with multiple filters. **Decision:** Add 4 indexes upfront in Story 2.4 migration to avoid post-deploy performance fixes:

```sql
-- Story 2.6 query patterns:
-- WHERE chain = ? AND tvl_usd > ? ORDER BY apy DESC
-- WHERE project = ? ORDER BY apy DESC
CREATE INDEX idx_defillama_pools_project ON epsilon.defillama_pools(project);
CREATE INDEX idx_defillama_pools_chain ON epsilon.defillama_pools(chain);
CREATE INDEX idx_defillama_pools_apy ON epsilon.defillama_pools(apy DESC);
CREATE INDEX idx_defillama_pools_tvl ON epsilon.defillama_pools(tvl_usd DESC);
```

Performance target for Story 2.6 JIT route: P95 < 500 ms. Without these indexes, full-table scans on 16,000 rows during peak load would push P95 above 2 s.

**Rationale:** "Postpone optimization" doesn't apply when query patterns are known at design time. The cost of adding 4 indexes during initial migration is trivial; refactoring after a production performance incident is not.

### 9.5. Single Worker, Multiple Schedulers (Story 2.7)

Story 2.7 needs to crawl Hacks/Emissions **daily** (low-frequency historical data) and Bridges **hourly** (alongside Story 2.4's main job). Naive solutions:
- ❌ One scheduler with hourly cron: wastes Pro API budget on hacks (data unchanged for hours).
- ❌ Two separate workers + queues: doubles process overhead, complicates lifecycle.

**Decision:** One worker, one queue (`defillama-sync`), two `upsertJobScheduler` registrations:
- `sync-defillama-full` — `every: 3_600_000ms`, job name `fetch-defillama-all` (Story 2.4 + bridges).
- `sync-defillama-pro-daily` — `pattern: '41 2 * * *'` UTC, job name `fetch-defillama-pro-daily` (hacks + emissions).

The worker handler dispatches by `job.name`:
```typescript
new Worker(QUEUE_NAME, async (job) => {
  if (job.name === 'fetch-defillama-all') return processJob(job.id);
  if (job.name === 'fetch-defillama-pro-daily') return processProDailyJob(job.id);
  throw new Error(`Unknown job name: ${job.name}`);
});
```

**Rationale:** BullMQ supports multiple schedulers per queue out of the box. One worker process keeps lifecycle simple (`startDefillamaWorker` / `stopDefillamaWorker` are still single-call), and dispatch-by-name keeps each handler focused.

### 9.6. Bulk Upsert with Generated `set` Clauses

Story 2.4 upserts 5 tables × ~50 columns total. Hand-written `set: { col1: sql\`excluded.col1\`, col2: sql\`excluded.col2\`, ... }` is ~50 lines of repetitive code per migration. Mistake-prone.

**Decision:** Provide a `buildExcludedSet(table, excludeColumns?)` helper in `apps/api/src/queue/bullmq/workers/defillama-worker.ts` that introspects Drizzle table columns and emits an excluded-set object dynamically:

```typescript
function buildExcludedSet<T extends PgTable>(
  table: T,
  excludeColumns: string[] = [],
): Record<string, unknown> {
  const cols = getTableColumns(table);
  const result: Record<string, unknown> = {};
  for (const [name, col] of Object.entries(cols)) {
    if (excludeColumns.includes(name) || name === 'createdAt') continue;
    result[name] = sql.raw(`excluded.${(col as { name: string }).name}`);
  }
  return result;
}

// Usage:
await db.insert(defillamaProtocols)
  .values(batch)
  .onConflictDoUpdate({
    target: defillamaProtocols.slug,
    set: buildExcludedSet(defillamaProtocols, ['slug']),
  });
```

**Rationale:** Schema evolution (adding columns later) automatically includes the new column in upsert without manual update. Reduces boilerplate by ~80%.

### 9.7. Memory Considerations for Bulk Crawls

`/protocols` returns ~3-8 MB JSON (~7,000 objects). `/pools` returns ~5-15 MB (~16,000 objects). Combined peak heap during a crawl run: ~500 MB.

**Decision:**
- Chunk inserts at 500 rows/batch to stay below Postgres's 65,535 parameter limit and to release intermediate references between batches.
- Document expected peak memory in worker file header comment.
- Operator note: if deploying to a < 1 GB VPS, run worker in a separate process (future `WORKER_ONLY=true` env split — flagged as a follow-up but not blocking for current deployment targets).

### 9.8. ILIKE Pattern Sanitization (Story 2.7)

Story 2.7's risk lookup uses `ILIKE '%protocol%'` to match hack/unlock records. Postgres treats `%` and `_` as wildcards, so user input `100%` would match every row.

**Decision:** Always sanitize ILIKE patterns:
```typescript
function escapeLikePattern(input: string): string {
  return input.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}
```

This is defensive even though the input flows through the `protocol_slug` Zod schema (no `%` or `_` typically) — defense in depth costs nothing.

### 9.9. Migration Sequencing Constraint

Stories 2.4 and 2.7 each generate a migration file:
- Story 2.4 → `0004_defillama_tables.sql`
- Story 2.7 → `0005_defillama_pro_tables.sql`

**Constraint:** Story 2.4 migration MUST be committed before any work begins on Stories 2.5/2.6/2.7. Otherwise, parallel stories may both attempt to generate `0005_*.sql` and collide.

This is documented in each story's "Dev Notes" section. Sprint sequencing in `sprint-status.yaml` enforces this implicitly: only Story 2.4 is `ready-for-dev`; 2.5/2.6/2.7 remain `backlog` until 2.4 reaches `done`.

### 9.10. Cost Impact

| Item | Monthly Cost |
|---|---|
| DeFiLlama Pro subscription | $300 |
| Postgres storage (~50 MB additional for new tables) | <$1 |
| Background worker compute (1 core, ~10% utilization) | ~$5 (incremental on existing API host) |
| **Total incremental** | **~$306/mo** |

**Trade-off vs Free:**
- Free tier rate limit (~10 req/min, anecdotal) → could not sustain hourly full crawls of all 5 categories.
- Pro tier (1,000 req/min) → sustains full crawls plus burst capacity for Stories 2.5/2.6/2.7 JIT routes.
- Pro-only data (hacks, emissions) unlocks Story 2.7's risk-scoring use case, which is a differentiator vs competitors.

This $300/mo investment supersedes the original "DeFiLlama Free only" recommendation in Section 3.1 for any deployment that ships Stories 2.4–2.7.

---

## Step 10: Production Sandbox Connectivity Architecture (Daytona + cloudflared bridge)

**Added:** 2026-05-17 (Verified live on chainlens.net + Daytona EU)

This section documents the production sandbox connectivity model after the migration from JustaVPS to **Daytona** as the primary sandbox provider, and the introduction of a **cloudflared bridge tunnel** to work around Daytona's network firewall.

### 10.1. Why Daytona Replaces JustaVPS for Primary Workload

| Aspect | JustaVPS | Daytona |
|---|---|---|
| Provisioning model | Full VM + Docker on host | Container-as-sandbox (managed) |
| Cold-start | ~2 min (VM boot + docker pull) | ~5–7 min (image pull, persistent across stops) |
| Cost per sandbox | ~$5/mo per VPS, always-on | Pay-per-use (auto-stop after 15 min idle, archive after 30 min) |
| Network model | Full Linux network stack | Tier 1/2 firewall (whitelist AI providers) |
| `executeCommand` SDK | n/a (SSH-based) | Native `sandbox.process.executeCommand` |
| Lifecycle hooks | s6-services auto-start at boot | **PID 1 = `/usr/local/bin/daytona sleep infinity`** — bypasses ENTRYPOINT, s6 not auto-started |

The `PID 1 = sleep infinity` behavior is the critical Daytona-specific quirk that drives §10.3.

### 10.2. Daytona Tier Firewall — What Is Reachable from Sandbox

Daytona Tier 1/2 implements an **outbound allow-list firewall** at Envoy level. From inside a sandbox, only known AI provider domains are reachable; all custom domains return TLS connection reset.

| Domain | Reachability from Daytona sandbox |
|---|---|
| `api.anthropic.com` | ✅ allowed |
| `api.openai.com` | ✅ allowed |
| `openrouter.ai` | ✅ allowed |
| `*.trycloudflare.com` (subdomain) | ✅ allowed |
| `api.chainlens.net` | ❌ blocked (Connection reset by peer) |
| `v98store.com` | ❌ blocked (Connection reset by peer) |
| `cloudflare.com` (apex) | ❌ blocked |
| `ngrok.io` | ❌ blocked |

**Implication:** Sandbox cannot directly call back to `api.chainlens.net/v1/router` for LLM proxy or tool routing. Two solutions exist:

1. **Direct LLM key injection** — sandbox calls AI provider directly with platform's key. Implemented in [`apps/api/src/platform/providers/daytona.ts:98-102`](apps/api/src/platform/providers/daytona.ts#L98) for Anthropic/OpenAI/OpenRouter/Gemini/XAI keys. Bypasses Epsilon billing/proxy entirely.
2. **cloudflared bridge** — expose API container at `*.trycloudflare.com`, sandbox callbacks reach API normally. Required when LLM proxy uses non-AI domain (e.g. v98store) that Daytona blocks. See §10.4.

**Anti-pattern:** Setting `DAYTONA_NETWORK_ALLOW_LIST` env explicitly. This switches Daytona Envoy from default whitelist to explicit allow-list and **breaks** access to AI providers entirely (silent TLS reset on `api.anthropic.com`). Code at [`daytona.ts:69-74`](apps/api/src/platform/providers/daytona.ts#L69) explicitly does NOT pass `networkAllowList` to `daytona.create()`.

### 10.3. Sandbox Bootstrap Pattern (`epsilon-daytona-start` + `setsid`)

Because Daytona overrides PID 1 to `sleep infinity`, the s6-overlay services defined in `epsilon/computer` image (`svc-epsilon-master`, `svc-opencode-serve`, etc.) do not auto-start. The provider must explicitly trigger bootstrap after `daytona.create()` returns.

**Bootstrap sequence ([daytona.ts:147-153](apps/api/src/platform/providers/daytona.ts#L147)):**

```typescript
await this.startRuntime(daytonaSandbox);
const preview = await this.resolvePreviewEndpoint(daytonaSandbox, serviceKey, 8000);
const ready = await this.waitForRuntimeReady(daytonaSandbox, preview.url, preview.headers);
```

**`startRuntime()` ([daytona.ts:267-277](apps/api/src/platform/providers/daytona.ts#L267)):**

```typescript
const launch =
  "mkdir -p /tmp && setsid bash -c 'nohup /usr/local/bin/epsilon-daytona-start " +
  "> /tmp/epsilon-daytona-start.log 2>&1 < /dev/null &'";
await sandbox.process.executeCommand(launch, undefined, 10_000);
```

**Why `setsid` is mandatory:** Daytona's `executeCommand` reaps the entire process tree when the shell call returns. Plain `nohup ... &` does not survive — child processes get killed before `epsilon-daytona-start` finishes forking the bun runtime. `setsid bash -c '... </dev/null &'` creates a new session detached from the controlling tty, allowing the bootstrap to outlive the SDK call. Verified failure mode 2026-05-15: bootstrap halts at `[fix-ownership] Done.`, never reaches `starting epsilon-master on port 8000` without `setsid`.

**Readiness probe:** Poll `/epsilon/health` (lightweight, returns OK once epsilon-master listens on :8000) instead of `/global/health` (waits for full opencode warm-up, can be 5+ minutes). `waitForRuntimeReady` polls every 15s for up to 10 minutes. Cold start typically 5–7 minutes (image pull); subsequent starts ~30s (cached layers).

### 10.4. cloudflared Bridge for Production LLM Proxy

**Problem:** Production uses `OPENROUTER_API_URL=https://v98store.com/v1` to proxy LLM calls through a v98 reseller key. Sandbox cannot reach `v98store.com` directly (Daytona blocks), and cannot call back to `api.chainlens.net/v1/router/chat/completions` (also blocked) to use the API's existing v98 proxy logic.

**Solution:** Run a **cloudflared quick tunnel** as a Docker container on the production server, exposing the API container via `*.trycloudflare.com` (Daytona allows this subdomain). Sandbox callbacks resolve through the tunnel; the API container has direct access to v98store.

```
┌──────────────────┐  HTTPS   ┌──────────────────────┐
│  User browser    │─────────→│  chainlens.net (FE)  │
└──────────────────┘          └──────────────────────┘
                                         │
                                         ↓ /v1/platform/init
                                ┌─────────────────────┐
                                │ api.chainlens.net   │ (Dokploy api-djcsof)
                                └─────────────────────┘
                                  │              │
                          create  ↓              ↓ proxy LLM
                         ┌────────────┐    ┌──────────────┐
                         │ Daytona EU │    │ v98store.com │
                         │  sandbox   │    │  (key v98)   │
                         └────────────┘    └──────────────┘
                                │                  ↑
                       chat callback              │
                                ↓                  │
                  ┌──────────────────────────────┐ │
                  │ <random>.trycloudflare.com   │ │ (cloudflared bridge)
                  └──────────────────────────────┘ │
                                ↓                  │
                  api-djcsof:8008  (dokploy-network)
                  /v1/router/chat/completions ────┘
```

**Setup** (chỉ chạy 1 lần trên prod server, persistent across restarts):

```bash
docker run -d --name cloudflared-api-bridge \
  --restart unless-stopped \
  --network dokploy-network \
  cloudflare/cloudflared:latest \
  tunnel --url http://api-djcsof:8008 --no-autoupdate
```

Capture tunnel URL via `docker logs cloudflared-api-bridge | grep trycloudflare\.com`, then set `EPSILON_URL=<tunnel>/v1/router` in Dokploy api env. The other URLs (`BASE_URL`, `API_URL`, `FRONTEND_URL`) remain `chainlens.net` since they're for user-facing flows, not sandbox callbacks.

**Trade-offs of quick tunnel:**

| Aspect | Quick tunnel (current) | Named tunnel (future) |
|---|---|---|
| Auth required | None | Cloudflare account |
| URL | Random, changes on restart | Fixed (custom domain or `*.cfargotunnel.com`) |
| TLS | Cloudflare-issued | Cloudflare-issued |
| Stability | Best effort, no SLA | Production-grade |
| Re-deploy ergonomics | Must update `EPSILON_URL` + re-init existing sandboxes | Stable across container restarts |

**Migration path to named tunnel** (recommended when stabilizing):
1. Create Cloudflare account, install `cloudflared` CLI on prod server.
2. `cloudflared tunnel create chainlens-sandbox-bridge` → token + UUID.
3. Map subdomain (e.g. `sandbox-bridge.chainlens.net`) to tunnel via DNS API.
4. Replace quick tunnel container with `cloudflared tunnel run --token <TOKEN>`.
5. Update `EPSILON_URL=https://sandbox-bridge.chainlens.net/v1/router` once.

### 10.5. `INTERNAL_SERVICE_KEY` Drift After Redeploy (Production-only Bug)

**Symptom:** Frontend reports "Cannot connect to API" or sandbox proxy returns 401 immediately after Dokploy redeploys the api service. Existing sandboxes that worked before now fail auth.

**Root cause:** When `INTERNAL_SERVICE_KEY` is unset in env, [`config.ts:528`](apps/api/src/config.ts#L528) auto-generates a random 32-byte hex at startup. The generator attempts to persist to `.env` for stability — but in a Dokploy container, the working directory is read-only, so the key only lives in process memory. Each redeploy → new random key → existing sandboxes (provisioned with old key) fail mutual auth.

**Fix:** Set a stable key explicitly in Dokploy env for **both** `api-djcsof` AND `frontend-pyzi0j`:

```bash
openssl rand -hex 32
# Paste same value into INTERNAL_SERVICE_KEY of both services
```

After this fix, key persists across redeploys. Sandboxes provisioned before the fix still have the previous (in-memory) key — they must be re-init'd (delete + `/v1/platform/init`).

**Why both services:** API uses the key for `Bearer <key>` outbound when proxying into sandbox. Frontend uses the same key for server-side webhook verification and admin API calls. They must match for the trust chain to close.

### 10.6. Stale Sandbox Row Detection in DB

When a Daytona sandbox is auto-archived (after 30 min idle) or deleted manually from the Daytona dashboard, the corresponding DB row in `epsilon.sandboxes` may remain `status='active'`. Subsequent `/v1/platform/init` calls hit `findExistingSandbox()` which returns the stale row → API tries to wake/proxy → `DaytonaNotFoundError` → automatic mark as `status='error'` after 4 retries (see [sandbox-proxy preview retry logic]).

**Operational drift recovery:**

```sql
-- Audit (run periodically or after support tickets)
SELECT s.sandbox_id, s.external_id, s.status, s.updated_at
FROM epsilon.sandboxes s
WHERE s.status IN ('active', 'provisioning')
  AND s.provider = 'daytona'
  AND s.updated_at < NOW() - INTERVAL '1 hour';

-- Cleanup (mark stale rows so /init creates fresh sandbox on next request)
UPDATE epsilon.sandboxes
SET status = 'archived', updated_at = NOW()
WHERE sandbox_id IN (...);
```

**Future hardening (backlog):** Cross-validate DB sandbox rows against Daytona EU `daytona.list()` on a 30-minute schedule; auto-archive any DB row whose `external_id` is missing from Daytona. Avoids manual SQL intervention on user reports.

### 10.7. Production Verification Procedure

Used during deploy of the connectivity fix on 2026-05-17:

```typescript
// 1. Login → create sandbox
POST /v1/platform/init { provider: 'daytona' }
// Expect: 201 created, status=active, external_id=<new>

// 2. Wait sandbox health (5–7 min cold pull)
GET /v1/p/<external_id>/8000/epsilon/health
// Expect: 200 OK once epsilon-master ready

// 3. Create session
POST /v1/p/<external_id>/8000/session {}
// Expect: 200 OK, returns session id

// 4. Send chat message
POST /v1/p/<external_id>/8000/session/<id>/message
{
  "parts": [{ "type": "text", "text": "Say \"production OK\" only." }],
  "model": { "providerID": "epsilon", "modelID": "gpt-4o-mini" }
}
// Expect: 200 OK with assistant text "Production OK." within 30s
```

**Pass criteria:** Step 4 returns assistant text (not `(no text)`) within 30s. Cost should be < $0.01 for a single Haiku-size response.

**Fail-mode signature & remedy table:**

| Symptom | Likely cause | Fix |
|---|---|---|
| `/init` returns 500 with "Disk request 20GB exceeds maximum allowed" | Default `DAYTONA_RESOURCE_DISK=20` exceeds free-tier 10GB cap | Set `DAYTONA_RESOURCE_DISK=10` in Dokploy api env |
| `/health` returns 503 "Sandbox is waking up" indefinitely | Daytona sandbox archived/deleted but DB row stale | §10.6 cleanup |
| `/health` returns 200 but `/message` returns 504 "OpenCode timeout" | Sandbox cannot reach `EPSILON_API_URL` | §10.2 — verify domain reachable from sandbox via `executeCommand` curl test; if blocked, use cloudflared bridge §10.4 |
| `/message` returns 401 from sandbox proxy | `INTERNAL_SERVICE_KEY` mismatch between api/frontend/sandbox | §10.5 — set stable key, re-init affected sandboxes |
| Sandbox port 8000 not listening 5+ min after create | Bootstrap script not running (no `setsid`, or image missing `epsilon-daytona-start`) | §10.3 — verify code calls `setsid bash -c 'nohup ...'`, verify image has `/usr/local/bin/epsilon-daytona-start` |

### 10.8. Cost Impact (incremental over Step 7 baseline)

| Item | Monthly Cost |
|---|---|
| Daytona free tier (per sandbox 2 cpu / 4 gb / 10 gb disk) | $0 (15 min idle stop, 30 min archive) |
| cloudflared quick tunnel | $0 (free, no auth) |
| Cloudflare account (named tunnel migration, optional) | $0 (free tier sufficient) |
| Existing v98store key passthrough | unchanged |
| **Total incremental** | **$0** |

The architecture intentionally uses free-tier services for the bridge layer because the v98store key already covers LLM costs at favorable rates. Production-grade upgrades (named tunnel, Daytona paid tier with persistent VMs) become relevant if (a) cold-start UX becomes a complaint, or (b) cloudflared quick-tunnel instability causes user-visible incidents.

### 10.9. Known Operational Quirks

- **`DAYTONA_SNAPSHOT` safety override**: code at [`daytona.ts:42-50`](apps/api/src/platform/providers/daytona.ts#L42) hard-pins to `epsilonaicrypto/computer:daytona-fix-9` when env value is `daytona-fix-2..8`. Prevents older sandbox images (which lack the lightweight readiness probe) from being used in production. The env can lag the code; the override ensures forward compatibility.
- **Daytona's deprecated `DAYTONA_SERVER_URL`**: SDK warns to use `DAYTONA_API_URL`. Currently both are set; migrate when convenient.
- **`autoStopInterval=15` + `autoArchiveInterval=30`**: aggressive defaults to minimize Daytona quota usage, but increases cold-start frequency for users who chat irregularly. Tunable per-deployment if user feedback demands.

---

## Step 11: Production-Grade Reliability & Security Architecture (Story 8.5)

**Added:** 2026-05-17 (Post Perplexity AI deep research + codebase audit)

This section documents architectural decisions for the 12 production-grade issues identified in Story 8.5. Each decision includes rationale and trade-offs.

### 11.1. Session Data Durability — Litestream + Supabase Storage S3

**Problem:** Daytona container filesystem is ephemeral. SQLite at `/persistent/opencode/storage.sqlite` survives container stop/archive (data persists in Daytona's volume) but is lost on sandbox **delete**. Each sandbox recreate wipes session history.

**Decision: Litestream as SQLite WAL replication sidecar**

```
Sandbox container
├── epsilon-master (Bun :8000)
├── opencode (Node :4096)
└── litestream (sidecar, replicate WAL → S3)
    └── /persistent/opencode/storage.sqlite
                   ↕ WAL frames (sync-interval: 1s)
    Supabase Storage S3 (user-{id}/opencode/)
```

**Why Litestream over alternatives:**
- **Zero app code change** — Litestream intercepts WAL at filesystem level, not in SQLite connection
- **Near-zero RPO** (<1s lag) vs. periodic backup (minutes RPO)
- **S3-compatible** — Supabase Storage already in stack at `/storage/v1/s3`, no new infra
- **Tenant isolation** — path `user-{EPSILON_USER_ID}/opencode` per user in same bucket

**Startup sequence in `daytona-start.sh`:**
```bash
# Only runs if env vars present (backward compat)
if [ -n "${SUPABASE_S3_ENDPOINT:-}" ]; then
  litestream restore -if-replica-exists /persistent/opencode/storage.sqlite
  litestream replicate &   # sidecar, runs alongside epsilon-master
fi
```

**New Dokploy env vars:** `SUPABASE_S3_ENDPOINT`, `SUPABASE_S3_ACCESS_KEY`, `SUPABASE_S3_SECRET_KEY`

**Image change:** `core/docker/Dockerfile` installs Litestream binary → new image tag required (`stable-2`)

### 11.2. Billing Atomicity — PostgreSQL `atomic_use_credits`

**Decision (verified, no change needed):** `repositories/credits.ts` already calls `atomic_use_credits()` PostgreSQL function — a single statement that checks balance AND deducts atomically. TOCTOU between `checkCredits()` (UX guard) and `deductCredits()` is intentional: the fast pre-check prevents unnecessary DB round-trips; the real enforcement is in the atomic function.

**Required audit (Story 8.5 Sprint 1):** Verify all `router/routes/` call `await deductToolCredits()` (not fire-and-forget). Any `.catch(console.error)` wrapping billing calls = critical bug.

### 11.3. Multi-Replica Provisioning Dedup — Postgres Advisory Lock

**Problem:** `provisioningSubscriptions: Set<string>` in `sandbox-provisioner.ts` is process-local. Docker Swarm replicas (2+) each have their own Set → concurrent provision requests for same `subscriptionId` on different replicas both proceed.

**Decision: `pg_try_advisory_xact_lock()`**

```typescript
// Inside db.transaction():
await tx.execute(sql`SELECT pg_try_advisory_xact_lock(${lockKey}::bigint)`);
// Lock held for transaction duration; auto-released on commit/rollback
// pg_try_advisory_xact_lock returns false (no wait) if lock held by another connection
```

**Why advisory lock over Redis SETNX:**
- No new infra (Postgres already the source of truth)
- Automatic release on transaction end (no cleanup code, no TTL management)
- `pg_try_advisory_xact_lock` (non-blocking) vs. `pg_advisory_lock` (blocking) — prefer non-blocking to fail-fast duplicate requests

**`lockKey` derivation:** FNV-1a hash of `subscriptionId` string → `Int64` (Postgres advisory lock key is `int8`)

### 11.4. serviceKey Encryption at Rest — pgcrypto

**Problem:** `sandboxes.config` JSONB contains `{ serviceKey: "epsilon_..." }` in plaintext. Any DB read access (Supabase dashboard, SQL query, log export) exposes all sandbox auth tokens.

**Decision: pgcrypto symmetric encryption with dedicated column**

```sql
ALTER TABLE epsilon.sandboxes ADD COLUMN service_key_encrypted BYTEA;
-- Encrypt: pgp_sym_encrypt(serviceKey, DB_ENCRYPTION_KEY)
-- Decrypt: pgp_sym_decrypt(service_key_encrypted::bytea, DB_ENCRYPTION_KEY)
```

**Why pgcrypto over application-layer AES:**
- Key never travels from Postgres to application for the encrypt/decrypt operation (server-side)
- pgcrypto uses OpenPGP symmetric encryption (AES-256 by default)
- Single `DB_ENCRYPTION_KEY` env var — rotate with a migration

**Migration safety:** Add column first (non-blocking), encrypt rows in batches manually, NULL old JSONB field. Do NOT auto-encrypt in migration — requires `DB_ENCRYPTION_KEY` set, better to script separately.

### 11.5. WebSocket Auth — First-Message Pattern

**Problem:** WebSocket/SSE URLs with `?token=<jwt>` are logged by nginx access logs, cloudflared, and browser history. Token exposure = persistent auth risk.

**Decision: First-message authentication**

```
Client                Server
  |  ws.onopen         |
  |─── ws connect ────→|  (no auth in URL)
  |                    |  start 5s auth timeout
  |─ {type:"auth"} ──→|  first WS message = token
  |                    |  verify → clear timeout
  |─── normal msgs ──→|
```

**Server enforcement:** Close with code `4001` if no auth message within 5s. Token validated same as `combinedAuth` middleware (Supabase JWT or epsilon_* key).

### 11.6. Rate Limiting — `hono-rate-limiter`

**Decision:** Use `hono-rate-limiter` (Hono-native, no Redis required for MVP) with in-memory Map store.

| Route group | Limit | Window | Key |
|---|---|---|---|
| `/v1/platform/sandbox` | 3 req | 1 hour | `accountId` |
| `/v1/router/*` | 100 req | 1 minute | `accountId` |

**Single-replica limitation:** In-memory store is not shared across replicas. For multi-replica, upgrade to `@hono-rate-limiter/redis` store. Defer until actual multi-replica scale.

**Graceful degradation:** If store unavailable, rate limiter fails open (does not block requests) — prevents accidental service disruption.

### 11.7. Observability — OpenTelemetry + SigNoz

**Decision: Self-hosted SigNoz on prod server (167.172.66.16)**

SigNoz chosen over Grafana LGTM stack because:
- Single-binary deployment (ClickHouse backend, all-in-one)
- OTLP-native (traces + metrics + logs in one pipeline)
- Lower operational overhead for small team vs. managing Prometheus + Loki + Tempo separately

**API instrumentation:** `apps/api/src/telemetry.ts` (imported FIRST in `index.ts`) initializes `@opentelemetry/sdk-node` with OTLP HTTP exporter. Auto-instrumentation covers HTTP routes, fetch calls, Postgres queries.

**Key custom metrics:**
```typescript
provisionDuration = meter.createHistogram('sandbox.provision.duration_ms', { unit: 'ms' });
provisionAttempts = meter.createCounter('sandbox.provision.attempts_total');
```

**No-op mode:** If `OTEL_EXPORTER_OTLP_ENDPOINT` not set, SDK starts in no-op mode — zero performance impact, zero crashes. Safe to ship before SigNoz is deployed.

### 11.8. Named Cloudflare Tunnel (replaces quick tunnel)

**Problem:** Quick tunnel `xxx.trycloudflare.com` URL regenerates on container restart → `EPSILON_URL` must be manually updated → brief outage window + re-init existing sandboxes.

**Decision: Named tunnel with stable subdomain**

```
docker run cloudflare/cloudflared:latest tunnel run \
  --url http://api-djcsof:8008 \
  --token <CLOUDFLARE_TUNNEL_TOKEN>
```

Tunnel maps to `api-bridge.chainlens.net` (CNAME → `<tunnel-id>.cfargotunnel.com`). URL never changes across restarts.

**Cost:** $0 — Cloudflare named tunnels are free with any Cloudflare account. Domain `chainlens.net` already on Cloudflare.

**Migration:** One-time setup. Update `EPSILON_URL` once, never again.

### 11.9. Sandbox Lifecycle Resilience

**`ensureRunning()` post-wake health check:**
```
ensureRunning(externalId)
    ├── getStatus() → running?
    │   └── yes → quickHealthCheck() (1 attempt, 5s timeout)
    │       └── warn if unreachable (non-blocking)
    └── no → start() → waitForRuntimeReadyShort() (8×15s = 2min max)
                       └── throw if not ready
```

**Why 2-minute timeout (not 10 min):** On wake (not cold-start), image layers cached — epsilon-master should start in ~30s. 2 min = 4× safety margin.

**Exponential backoff (`sandbox-init-state.ts`):**

| Attempt | Delay |
|---|---|
| 0 | 2s |
| 1 | 15s |
| 2 | 60s |

Rationale: 2s handles transient flaps; 15s handles Daytona API rate-limiting; 60s handles region-wide issues. Total max wait: ~90s (much better than naive 3×2s = 6s which often retries mid-issue).

### 11.10. Summary: New Architectural Invariants (post Story 8.5)

| Invariant | Enforcement |
|---|---|
| Session data survives sandbox delete | Litestream → Supabase S3 |
| Billing calls never fire-and-forget | `await` enforcement + code audit |
| Provisioning dedup works multi-replica | Postgres advisory lock |
| serviceKey never in plaintext DB | pgcrypto + dedicated column |
| Auth token never in WS/SSE URL | First-message auth |
| API has request-level rate limits | hono-rate-limiter |
| Sandbox URL stable across restarts | Named Cloudflare Tunnel |
| Provisioning metrics exported | OTel OTLP → SigNoz |
| Retry delays are exponential | `[2s, 15s, 60s]` |
| ensureRunning verifies runtime health | poll `/epsilon/health` after wake |

---
