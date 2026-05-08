---
stepsCompleted: [step-01-validate-prerequisites, step-02-design-epics]
inputDocuments: ['_bmad-output/planning-artifacts/prd.md', '_bmad-output/planning-artifacts/architecture.md']
---

# chainlens - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for chainlens, decomposing the requirements from the PRD, UX Design if it exists, and Architecture requirements into implementable stories.

## Requirements Inventory

### Functional Requirements

FR1: Provide free tier (Tier 1) users with risk warnings (via RAG Data) and project analysis reports updated in real-time.
FR2: Allow premium users (Tier 2) to customize bots, agents, and custom tools.
FR3: Integrate an automated backtesting environment (Sandbox) for Tier 2 users to test AI-generated trading strategies against market data.
FR4: Provide enterprise (Tier 3) users with team collaboration workspaces (Team Collaboration).
FR5: Implement Data Integrations: Build specialized Agents to connect with Crypto APIs (DeFiLlama, Nansen, Dune) and Non-crypto APIs (Perplexity AI).
FR6: Integrate Vibe Trading API for backtesting execution.
FR7: Build Background Data Workers to store crypto project information, run 24/7, analyze data, and generate ready-made reports.
FR8: Implement a Dual-Tokenomics System & Universal Billing using Internal Credits and a Native Token ($CLENS).
FR9: Provide an Admin Dashboard to monitor Internal Credit usage across all tiers and manage Smart Contract actions (Burn / Buy-back).
FR10: Agent must JIT Data Sync by taking a snapshot and filling data gaps from real-time sources before calling the LLM.
FR11: All generated smart contract code or trading bots must pass through a validation layer (vulnerability scanning, reentrancy checks) and Sandbox testing.
FR12: Display mandatory legal disclaimers for all investment advice and generated code.
FR13: Implement Inbound-Only RAG Sync for Tier 3 (On-premise) to receive Market Data without any outbound telemetry.
FR14: Implement Hold-and-Settle billing sequence (Reserve -> Execute -> Stream -> Settle/Refund -> Release Lock).
FR15: Support Agnostic Multi-chain code generation without hard-coding specific chains.

### NonFunctional Requirements

NFR1: Time-to-First-Byte (TTFB) for AI Chat must be < 2 seconds.
NFR2: JIT RAG Sync Latency (snapshot and gap-fill) must not exceed 1.5 seconds.
NFR3: Sandbox Execution (Tier 2) MicroVM initialization must be < 1 second.
NFR4: Implement a hard timeout (e.g., 30s) for Sandbox code execution.
NFR5: System must handle a minimum of 1,000 Concurrent Users (CCU) interacting with the Agent.
NFR6: Data Workers must auto-scale based on the number of monitored crypto projects.
NFR7: LLM Provider Fallback: Auto-switch to a backup model in < 1 second if the primary API fails.
NFR8: High Availability (HA): 99.9% uptime for Core services (AI Interaction and Credit Management).
NFR9: Atomic Credit Deduction: Internal Credit deductions for LLM/RAG usage must be atomic; failure to deduct blocks the request.
NFR10: Strict Rate Limiting: Apply IP and Account-based rate limits for Tier 1 (Free) users.
NFR11: Sandbox Isolation: Sandbox code execution must have NO outbound network access, only connecting to the internal Vibe Trading API.
NFR12: Data Provenance to prevent Data Poisoning for RAG synchronization.

### Additional Requirements

- **Starter Template**: Monorepo Independent Deployment (`apps/chainlens-agent`) using Hono/Bun within the existing `pnpm workspace`. This is Epic 1 Story 1.
- Internal Communication: Use Hono RPC (v4.12+) for Backend-to-Frontend communication.
- Sandbox Abstraction Layer: Implement `SandboxProvider` (Deno subprocess for Phase 1 MVP, Firecracker for Phase 2).
- Frontend State Management: Use Vercel AI SDK Hooks (`useChat`, `useObject`) (v6+).
- Data Caching/Locking: Use Redis for Distributed Locking (semantic cache and two-phase reservation).
- Application-scoped singletons (Container) ONLY initialized at `index.ts`. No global singleton imports in route handlers.
- Endpoints MUST have Zod validation.
- Additive-only DB changes (no rename/drop, no auto `drizzle-kit generate`).
- Sanitize tool output before LLM context insertion.
- Structured JSON logging with `requestId`. NO `console.log`.
- `x-idempotency-key` required for all billed mutations (scoped by `userId`).
- Atomic Deploy: `chainlens-agent` and `apps/web` MUST deploy together for RPC changes (backward compatible 1 version).
- CI/CD Mock Guard: Block builds if `USE_MOCK_SANDBOX=true` in staging/production.
- Redis Network Security: Private VPC, TLS encryption, and ACL restricted to `chainlens-agent` service user.
- Credit Audit Integrity: Immutable audit records for Hold, Settle, and Refund operations.
- Settle-before-Release: `releaseLock()` ONLY called after successful `Settle`.
- AI Tool Error Contract: Tools MUST use try/catch and return error strings to the LLM (NO unhandled exceptions).
- Lifecycle Hooks: Implement `/healthz` (liveness), `/readyz` (DB/Redis check), `/api/v1/version` (Version Handshake), and graceful SIGTERM shutdown.
- Stale Hold Reaper: Background job (60s interval) to settle/refund holds > 5 minutes (can defer 2 weeks post-MVP).
- Orphan Sandbox Monitor: Background job to sweep orphaned sandbox processes/VMs.
- Error Code Taxonomy: Implement standard codes (INSUFFICIENT_CREDITS, SANDBOX_TIMEOUT, etc.).
- Alerting Rules: Set up alerts for Sandbox Circuit OPEN, Redis unavailable (>30s), Stale Hold anomaly, and negative credit balances (P0).
- Partial Failure Isolation: Sandbox failure isolates to code execution; Redis failure isolates all AI; LLM failure isolates AI (RPC static data remains active).

### UX Design Requirements

UX-DR1: None (Backend service focused)

### FR Coverage Map

FR1: Epic 1 - Free tier risk warnings & project analysis reports
FR2: Epic 3 - Tier 2 bot, agent, custom tool customization
FR3: Epic 3 - Tier 2 automated backtesting (Sandbox)
FR4: Epic 4 - Tier 3 team collaboration workspaces
FR5: Epic 1 - Data Integrations (Crypto & Non-crypto APIs)
FR6: Epic 3 - Vibe Trading API integration
FR7: Epic 1 - Background Data Workers (crypto info & reports)
FR8: Epic 2 - Dual-Tokenomics & Universal Billing
FR9: Epic 5 - Admin Dashboard & Smart Contract actions
FR10: Epic 1 - Agent JIT Data Sync (snapshot & gap-fill)
FR11: Epic 3 - Sandbox validation layer (vuln scanning)
FR12: Epic 1 - Mandatory legal disclaimers
FR13: Epic 4 - Tier 3 Inbound-Only RAG Sync
FR14: Epic 2 - Hold-and-Settle billing sequence
FR15: Epic 3 - Agnostic Multi-chain code generation

## Epic List

### Epic 1: Core AI Assistant & Knowledge Engine (Free Tier)
Người dùng (Tier 1) có thể chat với AI Agent an toàn, nhận các cảnh báo rủi ro và phân tích dự án theo thời gian thực (JIT Sync), đồng thời được tích hợp sẵn các cảnh báo pháp lý. (Bao gồm cả việc khởi tạo Starter Template cho `chainlens-agent`).
**FRs covered:** FR1, FR5, FR7, FR10, FR12

### Epic 2: Universal Billing & Credit Engine
Nền tảng có thể tự động trừ Internal Credits của người dùng một cách chính xác, an toàn (Atomic) qua cơ chế Hold-and-Settle, chuẩn bị nền tảng Tokenomics cho các tính năng Premium.
**FRs covered:** FR8, FR14

### Epic 3: Premium Agent Customization & Execution Sandbox (Tier 2)
Người dùng Premium có thể tùy biến bot/agent, viết code chiến lược giao dịch và đưa vào Sandbox để backtest an toàn với market data trước khi tương tác với Vibe Trading API.
**FRs covered:** FR2, FR3, FR6, FR11, FR15

### Epic 4: Enterprise Workspaces & Privacy Sync (Tier 3)
Khách hàng Doanh nghiệp có không gian làm việc nhóm (Team Collaboration) và có thể đồng bộ market data on-premise an toàn với kiến trúc Inbound-Only RAG (Zero-Data-Leakage).
**FRs covered:** FR4, FR13

### Epic 5: Admin Dashboard & Ecosystem Management
Admin có thể giám sát việc sử dụng Credit trên toàn hệ thống và quản lý các hành động Tokenomics (Burn / Buy-back) thông qua Smart Contract.
**FRs covered:** FR9

### Epic 6: Chainlens Crypto-Native UI/UX Integration
Tích hợp giao diện Frontend chuyên biệt cho Web3, bao gồm Web App và Browser Extension (Vigilant Companion), cùng trang Discover AI-Generated và Generative UI Widgets.
**FRs covered:** FR1

### Epic 7: AI Compute Infrastructure (BYOK, LLM Proxy & Local Ollama)
Triển khai hạ tầng tính toán phi tập trung cho người dùng, bao gồm BYOK (cung cấp API Key nhận thưởng), cổng Proxy LLM (MaaS - Model as a Service thanh toán bằng token), và kết nối Local Ollama miễn phí.

## Epic 1: Core AI Assistant & Knowledge Engine (Free Tier)

Người dùng (Tier 1) có thể chat với AI Agent an toàn, nhận các cảnh báo rủi ro và phân tích dự án theo thời gian thực (JIT Sync), đồng thời được tích hợp sẵn các cảnh báo pháp lý. (Bao gồm cả việc khởi tạo Starter Template cho `chainlens-agent`).

### Story 1.1: Khởi tạo Project & Lifecycle Hooks

As a System Operator,
I want a clean Hono/Bun starter template with lifecycle endpoints and structured logging,
So that the service is observable and can be safely deployed.

**Acceptance Criteria:**

**Given** một pnpm workspace hiện tại
**When** khởi tạo ứng dụng mới
**Then** `apps/chainlens-agent` được tạo ra dùng Hono và Bun
**And** ứng dụng expose type-safe Hono RPC.

**Given** ứng dụng đang chạy
**When** gọi các endpoint `/healthz`, `/readyz`, và `/api/v1/version`
**Then** trả về HTTP 200 OK và đúng định dạng version handshake
**And** hệ thống log bằng structured JSON (kèm `requestId`), không dùng `console.log`
**And** ứng dụng handle graceful shutdown khi nhận SIGTERM.

### Story 1.2: AI Chat Endpoint & Legal Disclaimers

As a Free Tier User,
I want to chat with the AI and receive fast, streaming responses with legal disclaimers,
So that I get immediate advisory safely without legal liabilities.

**Acceptance Criteria:**

**Given** user gửi câu hỏi qua UI
**When** request được gọi tới backend qua Hono RPC
**Then** backend stream kết quả trả về sử dụng format của Vercel AI SDK
**And** Time-To-First-Byte (TTFB) < 2 giây.

**Given** AI sinh ra câu trả lời chứa phân tích crypto
**When** message được hoàn thiện
**Then** hệ thống tự động append/chèn thêm mandatory legal disclaimer (miễn trừ trách nhiệm).

**Given** primary LLM API bị sập/timeout
**When** gọi LLM
**Then** hệ thống tự động fallback sang backup model trong vòng < 1 giây.

### Story 1.3: Background Data Workers

As a System Operator,
I want background workers to continuously index crypto project data,
So that the AI has a pre-warmed knowledge base of crypto projects.

**Acceptance Criteria:**

**Given** hệ thống worker được bật
**When** tới chu kỳ chạy (cron/interval)
**Then** worker sẽ cào và lưu trữ thông tin crypto project vào Database
**And** tạo sẵn các ready-made reports.

### Story 1.4: AI Tools & External Integrations

As a Free Tier User,
I want the AI to query real-time data from DeFiLlama and Perplexity,
So that the answers are accurate and backed by external sources.

**Acceptance Criteria:**

**Given** AI cần tra cứu data external
**When** gọi tool kết nối tới DeFiLlama (Crypto) hoặc Perplexity (Non-crypto)
**Then** tool phải sanitize output trước khi chèn vào LLM context
**And** nếu tool bị lỗi, phải `try/catch` và return chuỗi lỗi (error string) cho LLM, KHÔNG được throw unhandled exception.

### Story 1.5: JIT Data Sync & Risk Warnings

As a Free Tier User,
I want the AI to instantly fetch missing real-time data before answering my crypto query,
So that I get the most current risk warnings and analysis.

**Acceptance Criteria:**

**Given** user hỏi về một token cụ thể
**When** AI nhận ra dữ liệu hiện tại có khoảng trống (data gaps)
**Then** trigger quy trình JIT Data Sync (lấy snapshot và điền gap)
**And** quá trình sync tốn < 1.5 giây
**And** LLM sử dụng dữ liệu vừa sync để phân tích và đưa ra cảnh báo rủi ro (risk warnings).

## Epic 2: Universal Billing & Credit Engine

Nền tảng có thể tự động trừ Internal Credits của người dùng một cách chính xác, an toàn (Atomic) qua cơ chế Hold-and-Settle, chuẩn bị nền tảng Tokenomics cho các tính năng Premium.

### Story 2.1: Idempotency & Distributed Locking Middleware

As a System Operator,
I want the API to require idempotency keys and use distributed locking,
So that duplicate billing requests are prevented and concurrent operations are safe.

**Acceptance Criteria:**

**Given** một billed request được gửi tới API
**When** request có chứa `x-idempotency-key`
**Then** hệ thống sử dụng Redis để acquire lock cho user đó
**And** ngăn chặn xử lý nếu phát hiện duplicate key.

**Given** request không có `x-idempotency-key`
**When** middleware xử lý
**Then** trả về lỗi 400 Bad Request ngay lập tức.

### Story 2.2: The Hold-and-Settle Credit Engine (Core DB)

As a Platform Engineer,
I want a secure, atomic database layer for managing internal credits,
So that users cannot double-spend and every transaction is auditable.

**Acceptance Criteria:**

**Given** user có đủ Credit
**When** hàm `Reserve` (Hold) được gọi
**Then** số dư bị trừ tạm thời và một Immutable Audit Record trạng thái "HOLD" được tạo ra (Atomic).

**Given** một giao dịch đang ở trạng thái HOLD
**When** hàm `Settle` hoặc `Refund` được gọi
**Then** Audit Record được update và số dư thực được chốt hoặc hoàn lại
**And** hàm `releaseLock()` CHỈ được gọi SAU KHI `Settle/Refund` đã thành công.

**Given** user không đủ Credit
**When** hàm `Reserve` được gọi
**Then** throw error `INSUFFICIENT_CREDITS`.

### Story 2.3: Tích hợp Billing vào AI Chat Endpoints

As a System Operator,
I want the AI chat endpoints to use the Hold-and-Settle engine,
So that users are accurately billed for LLM and RAG usage.

**Acceptance Criteria:**

**Given** user gọi API Chat
**When** request đi qua billing middleware
**Then** hệ thống thực hiện `Reserve` credit trước khi gọi LLM
**And** nếu trừ thất bại, block request ngay lập tức.

**Given** LLM stream xong (hoặc lỗi giữa chừng)
**When** kết thúc request
**Then** hệ thống gọi `Settle` (hoặc `Refund` nếu lỗi) dựa trên số token thực tế đã dùng
**And** release lock để user có thể gửi request tiếp theo.

### Story 2.4: Background Reapers & Alerting Metrics

As a System Operator,
I want a background job to clean up stale holds and metrics for alerting,
So that stranded credits are returned to users and anomalies are detected.

**Acceptance Criteria:**

**Given** hệ thống đang chạy
**When** cứ mỗi 60 giây (interval)
**Then** Stale Hold Reaper job chạy để quét các giao dịch HOLD quá 5 phút
**And** tự động chuyển trạng thái sang Refund (hoặc Settle tùy logic fallback).

**Given** hệ thống xuất hiện negative credit balance
**When** quét định kỳ
**Then** hệ thống log ra cảnh báo P0 (để kết nối với các hệ thống Alerting).

## Epic 3: Premium Agent Customization & Execution Sandbox (Tier 2)

Người dùng Premium có thể tùy biến bot/agent, viết code chiến lược giao dịch và đưa vào Sandbox để backtest an toàn với market data trước khi tương tác với Vibe Trading API.

### Story 3.1: Custom Bot & Agent Configuration

As a Premium User (Tier 2),
I want to create and customize my own AI agents and tools,
So that I can tailor the assistant's behavior and analytical capabilities to my specific trading strategy.

**Acceptance Criteria:**

**Given** người dùng ở Tier 2
**When** họ truy cập giao diện quản lý Agent
**Then** họ có thể tạo cấu hình Agent mới (chỉnh sửa system prompt, chọn tools).

**Given** một Agent đã được customize
**When** người dùng bắt đầu chat với Agent đó
**Then** AI sử dụng đúng cấu hình và các tool đã được chỉ định.

### Story 3.2: Vulnerability Scanner & Validation Layer

As a System Operator,
I want all generated smart contract and trading bot code to be scanned for vulnerabilities before execution,
So that malicious or highly flawed code does not run in the Sandbox.

**Acceptance Criteria:**

**Given** AI vừa sinh ra một đoạn code giao dịch hoặc smart contract
**When** hệ thống chuẩn bị đưa vào Sandbox
**Then** code phải đi qua Validation Layer để check các lỗi bảo mật cơ bản (như reentrancy).

**Given** code không qua được bước validation
**When** hệ thống phản hồi
**Then** trả về lỗi cho AI để tự sửa hoặc báo cho người dùng, không được phép đưa vào Sandbox.

### Story 3.3: Secure Sandbox Execution Environment

As a Platform Engineer,
I want an isolated Sandbox execution environment (using Deno subprocess or Firecracker),
So that AI-generated code can run safely without impacting the host system or accessing external networks.

**Acceptance Criteria:**

**Given** đoạn code đã qua validation
**When** SandboxProvider khởi tạo MicroVM/subprocess
**Then** thời gian khởi tạo phải < 1s (NFR3).

**Given** code đang chạy trong Sandbox
**When** vượt quá 30 giây (hard timeout)
**Then** Sandbox tự động kill process và trả về lỗi `SANDBOX_TIMEOUT`.

**Given** code trong Sandbox cố gắng gọi ra external network (ngoại trừ Vibe Trading API nội bộ)
**When** HTTP request được tạo ra
**Then** kết nối bị block (No outbound network access).

### Story 3.4: Backtesting with Vibe Trading API

As a Premium User (Tier 2),
I want my custom trading bot to backtest against historical market data via the Vibe Trading API,
So that I can verify the strategy's profitability before real execution.

**Acceptance Criteria:**

**Given** code chiến lược đang chạy an toàn trong Sandbox
**When** code gọi đến Vibe Trading API để backtest
**Then** API trả về mock/historical market data và cho phép giả lập các lệnh trade.

**Given** quá trình backtest kết thúc
**When** Sandbox trả kết quả về
**Then** người dùng nhận được báo cáo kết quả trade trên giao diện chat.

### Story 3.5: Sandbox Resource Management & Monitors

As a Platform Engineer,
I want background jobs to monitor and clean up isolated Sandbox resources,
So that orphaned processes do not consume system memory over time.

**Acceptance Criteria:**

**Given** hệ thống đang chạy với nhiều Sandbox instance
**When** một Sandbox bị crash hoặc ngắt kết nối đột ngột
**Then** Orphan Sandbox Monitor (background job) sẽ định kỳ quét và dọn dẹp các process/MicroVM mồ côi.

**Given** Sandbox bị lỗi (Circuit OPEN)
**When** hệ thống giám sát phát hiện
**Then** lỗi được giới hạn (Partial Failure Isolation) và chỉ cảnh báo trên hệ thống monitor, không làm sập toàn bộ AI Chat.

### Story 3.6: Agnostic Multi-chain Code Generation

As a Quant Trader (Tier 2),
I want the AI to generate smart contract and trading bot code for various blockchains (EVM, Solana, Move) without hardcoded restrictions,
So that I can seamlessly deploy strategies across multiple ecosystems using the same conversational interface.

**Acceptance Criteria:**

**Given** người dùng yêu cầu tạo bot giao dịch hoặc smart contract cho một chuỗi bất kỳ (ví dụ: Solana hoặc Ethereum)
**When** AI sinh code và trả kết quả
**Then** AI tự động nhận diện ngôn ngữ và framework phù hợp (như Rust/Anchor cho Solana, Solidity cho EVM)
**And** đoạn code được sinh ra tương thích với hệ sinh thái được yêu cầu mà không bị giới hạn bởi hardcoded logic của hệ thống.


## Epic 4: Enterprise Workspaces & Privacy Sync (Tier 3)

Khách hàng Doanh nghiệp có không gian làm việc nhóm (Team Collaboration) và có thể đồng bộ market data on-premise an toàn với kiến trúc Inbound-Only RAG (Zero-Data-Leakage).

### Story 4.1: Team Collaboration Workspaces

As an Enterprise User (Tier 3),
I want to create shared workspaces for my team,
So that multiple members can collaborate, view shared reports, and manage custom agents together.

**Acceptance Criteria:**

**Given** người dùng Tier 3
**When** họ truy cập tính năng Workspace
**Then** có thể tạo workspace, mời thành viên (RBAC - Role-Based Access Control).

**Given** các thành viên trong cùng workspace
**When** họ sử dụng Agent hoặc xem Report
**Then** họ có thể thấy dữ liệu và cấu hình dùng chung của Workspace đó.

### Story 4.2: Inbound-Only RAG Sync (On-premise)

As an Enterprise User (Tier 3),
I want market data updates synced to my on-premise environment via an inbound-only connection,
So that my proprietary data remains completely private with zero outbound telemetry.

**Acceptance Criteria:**

**Given** môi trường Enterprise On-premise
**When** hệ thống cần cập nhật market data từ Chainlens
**Then** kết nối chỉ diễn ra một chiều (Inbound) từ Chainlens sang On-premise, không có bất kỳ request nào gọi ngược ra ngoài (Zero-Data-Leakage).

**Given** luồng đồng bộ RAG đang chạy
**When** dữ liệu được truyền tải
**Then** hệ thống phải đảm bảo Data Provenance để chống Data Poisoning.


## Epic 5: Admin Dashboard & Ecosystem Management

Admin có thể giám sát việc sử dụng Credit trên toàn hệ thống và quản lý các hành động Tokenomics (Burn / Buy-back) thông qua Smart Contract.

### Story 5.1: Credit Monitoring Dashboard

As a Platform Admin,
I want a dashboard to monitor Internal Credit usage across all tiers,
So that I can track revenue, usage anomalies, and system health.

**Acceptance Criteria:**

**Given** Admin đăng nhập vào Dashboard
**When** họ xem tổng quan
**Then** thấy được tổng lượng Credit đang được Hold, Settle, và Refund.

**Given** hệ thống có anomaly (như negative balance được alert từ Reaper)
**When** Admin xem Dashboard
**Then** các cảnh báo P0 sẽ được highlight rõ ràng.

### Story 5.2: Tokenomics Actions (Burn / Buy-back)

As a Platform Admin,
I want to trigger Smart Contract actions like Token Burn or Buy-back directly from the Admin panel,
So that I can manage the $CLENS native token ecosystem based on system revenue.

**Acceptance Criteria:**

**Given** Admin ở trang quản lý Tokenomics
**When** thực hiện lệnh Burn hoặc Buy-back
**Then** hệ thống sẽ gọi Smart Contract tương ứng trên blockchain.

**Given** giao dịch blockchain được tạo
**When** giao dịch thành công hoặc thất bại
**Then** Dashboard hiển thị trạng thái thực tế của Transaction và cập nhật lịch sử.

## Epic 6: Chainlens Crypto-Native UI/UX Integration

Tích hợp giao diện Frontend chuyên biệt cho Web3, cải tiến từ nền tảng web hiện có (không phải thiết kế mới hoàn toàn), bao gồm kết nối ví, biểu đồ nâng cao, trang tin tức AI-generated và các widget động sinh ra từ AI.

### Story 6.1: Hệ thống Web3 Auth & Wallet Management

As a User,
I want to connect my Web3 Wallet (MetaMask, Phantom) instead of just using email,
So that I can authenticate securely and interact with on-chain features seamlessly.

**Acceptance Criteria:**

**Given** người dùng chưa đăng nhập
**When** họ click vào Connect Wallet
**Then** hệ thống hiển thị tùy chọn kết nối qua `wagmi` / `viem` (MetaMask, Phantom)
**And** cho phép chuyển đổi Network trực tiếp từ UI
**And** hiển thị ENS hoặc avatar nếu có.

### Story 6.2: Phát triển Crypto-UI Component Library

As a Frontend Developer,
I need a robust set of UI components specifically for Crypto,
So that I can build trading dashboards and chat widgets efficiently.

**Acceptance Criteria:**

**Given** Frontend Developer cần xây dựng UI
**When** họ import các UI components từ thư viện
**Then** họ có thể sử dụng `TokenCard` để hiển thị Price, 24h Change, Market Cap
**And** sử dụng `RiskBadge` để cảnh báo rủi ro hợp đồng thông minh
**And** sử dụng `Sparkline` và `DataGrid` để hiển thị TVL/Yield.

### Story 6.3: Tích hợp Vercel AI SDK Generative UI

As a User,
I want the AI chat to return interactive widgets (like charts or token cards) instead of just plain text,
So that I can consume complex market data intuitively.

**Acceptance Criteria:**

**Given** người dùng đang chat với AI
**When** AI trả về các thông tin thị trường phức tạp hoặc data on-chain
**Then** backend stream tool calls và Frontend tự động render thành Generative UI component (như biểu đồ, thẻ token)
**And** hỗ trợ hiển thị `Transaction Simulation Card` với nút bấm thao tác trực tiếp.

### Story 6.4: Advanced Market Dashboard

As a Trader (Tier 1/2),
I want a dashboard with professional charting tools,
So that I can analyze DeFiLlama and Nansen data visually.

**Acceptance Criteria:**

**Given** Trader truy cập vào Advanced Market Dashboard
**When** họ xem thông tin chi tiết của một token
**Then** hệ thống hiển thị biểu đồ nến OHLCV sử dụng `TradingView Lightweight Charts`
**And** hiển thị biểu đồ TVL, APY bằng `Recharts`
**And** hiển thị biểu đồ dòng tiền (Smart Money Flow).

### Story 6.5: Sandbox IDE & Backtest Visualizer

As a Quant Trader (Tier 2),
I want a visual interface to edit bot code and view backtest performance,
So that I can evaluate AI-generated strategies easily.

**Acceptance Criteria:**

**Given** Quant Trader truy cập Sandbox IDE
**When** họ viết hoặc chỉnh sửa code chiến lược bằng `Monaco Editor` và chạy backtest
**Then** hệ thống hiển thị báo cáo hiệu suất (Sharpe Ratio, Max Drawdown)
**And** hiển thị `Equity Curve Chart` so sánh lợi nhuận với Benchmark.

### Story 6.6: AI-Generated Discover & News Page

As a User (Free or Premium),
I want an AI-generated Discover page that aggregates news, insights, and warnings from various sources and from the community's interactions with the AI assistant,
So that I can get real-time alpha insights and early risk warnings globally.

**Acceptance Criteria:**

**Given** người dùng truy cập trang Discover
**When** trang được tải
**Then** hệ thống hiển thị tin tức tổng hợp tự động từ các API tin tức, on-chain data và insights cộng đồng
**And** hiển thị các thẻ cảnh báo (Risk warnings) và tin nóng (Trending insights)
**And** người dùng có thể nhấp vào để tương tác tiếp với AI.

### Story 6.7: Vigilant Companion Browser Extension

As a User,
I want a lightweight browser extension that proactively detects tokens across platforms (X, Dexscreener, CoinMarketCap) and shows an AI-powered Trust Score tooltip,
So that I can quickly assess the safety of a token without leaving the page I am browsing.

**Acceptance Criteria:**

**Given** người dùng cài đặt và đăng nhập vào Vigilant Companion Browser Extension
**When** họ lướt các trang web (X, Dexscreener) và hover vào token address hoặc `$TOKEN`
**Then** extension scan DOM và hiển thị Tooltip chứa Trust Score cùng cảnh báo rủi ro
**And** cung cấp Side Panel để chat nhanh với AI Assistant
**And** đồng bộ insights cá nhân hóa với tài khoản web
**And** cung cấp nút "Expand" để mở rộng sang Web App đầy đủ.

## Epic 7: AI Compute Infrastructure (BYOK, LLM Proxy & Local Ollama)

Triển khai hạ tầng tính toán AI mở rộng, hướng tới Web3 DePIN-lite, nơi người dùng có quyền tự chủ về compute model, đóng góp dữ liệu để nhận token và thanh toán dịch vụ AI linh hoạt.

### Story 7.1: BYOK (Bring Your Own Key) & Data Contribution Rewards

As a User,
I want to use my own OpenAI/Anthropic API key for chatting and optionally allow Chainlens to store my query context anonymously,
So that I don't have to pay internal credits and can earn $CLENS tokens for my data contribution.

**Acceptance Criteria:**

**Given** user nhập API key hợp lệ trong Settings
**When** gọi AI Chat
**Then** hệ thống sử dụng key của user (không trừ Credit)
**And** tính toán "Proof of Contribution" dựa trên tokens sử dụng
**And** tự động thưởng $CLENS token cho user theo tỷ lệ quy định.

### Story 7.2: LLM Proxy Gateway & Model-as-a-Service (MaaS)

As a Developer or User,
I want to deposit USDT or $CLENS to buy API access to commercial models and self-hosted models (Qwen 3.6 27B) via an OpenRouter-like interface,
So that I can integrate Chainlens intelligence into my own tools at a competitive price.

**Acceptance Criteria:**

**Given** user đã nạp $CLENS hoặc USDT
**When** họ gọi `/v1/chat/completions` của proxy gateway
**Then** request được định tuyến qua Hold-and-Settle billing middleware
**And** tính phí theo token consumption
**And** request thành công với model được yêu cầu (GPT-4o, Claude 3.5, hoặc Qwen 3.6 27B).

### Story 7.3: Local Compute Integration via Ollama

As a Privacy-conscious User,
I want to connect Chainlens directly to my local Ollama instance (localhost:11434),
So that I can run completely private, free analysis with Zero-Data-Leakage.

**Acceptance Criteria:**

**Given** user chạy sẵn Ollama ở máy cá nhân
**When** họ thiết lập `localhost:11434` làm provider trong Web App
**Then** Chainlens gửi prompt trực tiếp tới local model (không đi qua backend)
**And** kết quả được stream trực tiếp lên UI với độ trễ tối thiểu
**And** không lưu trữ bất kỳ data nào lên server của Chainlens.
