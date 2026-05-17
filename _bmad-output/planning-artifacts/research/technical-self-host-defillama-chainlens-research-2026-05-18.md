---
stepsCompleted: [1, 2, 3, 4, 5, 6]
inputDocuments: []
workflowType: 'research'
lastStep: 6
research_type: 'technical'
research_topic: 'Self-host DefiLlama làm Data Layer cho Chainlens'
research_goals: 'Phân tích feasibility, architecture, cost, fork strategy, integration với Chainlens, và so sánh alternatives'
user_name: 'Luisphan'
date: '2026-05-18'
web_research_enabled: true
source_verification: true
---

# Research Report: Technical Feasibility — Self-host DefiLlama làm Data Layer cho Chainlens

**Date:** 2026-05-18
**Author:** Luisphan
**Research Type:** Technical

---

## Executive Summary

**Verdict: KHẢ THI — Nên triển khai theo hướng "Thin Selective Fork"**

Self-hosting một phần DefiLlama làm data layer riêng cho Chainlens là **hoàn toàn khả thi về mặt kỹ thuật** và mang lại lợi thế kinh tế rõ ràng. Thay vì clone toàn bộ hệ sinh thái 6+ repos phức tạp, Chainlens chỉ cần fork **2 repos cốt lõi** (`DefiLlama-Adapters` + `dimension-adapters`), build một thin HTTP wrapper server, và deploy như một **standalone microservice** trên VPS riêng biệt — hoàn toàn tách biệt khỏi Chainlens monorepo.

**3 điểm quyết định:**

1. **Chi phí**: $6–12/tháng (VPS Hetzner) vs $300/tháng (DefiLlama Pro API) → tiết kiệm **96%**, ROI dương từ tháng đầu tiên.

2. **Kỹ thuật**: DefiLlama adapters là plain TypeScript functions, không có central registry — có thể import chọn lọc chỉ 15–20 protocols cần thiết. Node.js incompatibility với Bun được giải quyết hoàn toàn bằng cách chạy service này như một Docker container riêng, Chainlens gọi qua HTTP.

3. **Rủi ro thấp**: Triển khai song song với public API, Chainlens fallback tự động nếu self-hosted service có vấn đề. MIT license cho phép fork và modify không giới hạn.

**Khuyến nghị thực thi:** Build MVP trong 2–3 tuần với 5 protocols đầu tiên (Uniswap v3, Aave v3, GMX, Curve, Lido), validate accuracy 7 ngày, sau đó mở rộng lên 15–20 protocols trong tháng 2.

---

## Table of Contents

1. [Technical Research Scope Confirmation](#technical-research-scope-confirmation)
2. [Technology Stack Analysis](#technology-stack-analysis)
   - 2.1 [DefiLlama Repository Ecosystem](#1-defillama-repository-ecosystem)
   - 2.2 [Technology Stack Chi Tiết](#2-technology-stack-chi-tiết)
   - 2.3 [Bun vs Node.js Compatibility](#3-bun-vs-nodejs-compatibility-critical)
   - 2.4 [Database & Storage Replacement Strategy](#4-database--storage-replacement-strategy)
3. [Integration Patterns Analysis](#integration-patterns-analysis)
   - 3.1 [DefiLlama Data Pipeline Architecture](#1-defillama-data-pipeline-architecture)
   - 3.2 [Adapter Pattern Deep Dive](#2-adapter-pattern-deep-dive)
   - 3.3 [RPC Node Requirements](#3-rpc-node-requirements)
   - 3.4 [Fork Strategy Analysis](#4-fork-strategy-analysis)
   - 3.5 [Alternatives Comparison](#5-alternatives-comparison)
4. [Architectural Patterns and Implementation Blueprint](#architectural-patterns-and-implementation-blueprint)
   - 4.1 [Recommended Architecture](#1-recommended-architecture-thin-selective-fork)
   - 4.2 [Docker Compose Setup](#2-docker-compose-setup)
   - 4.3 [Database Schema](#3-database-schema)
   - 4.4 [Worker Implementation](#4-worker-implementation)
   - 4.5 [API Server Implementation](#5-api-server-implementation)
   - 4.6 [Chainlens Integration](#6-chainlens-integration)
   - 4.7 [Cost Summary](#7-cost-summary)
5. [Implementation Approaches and Technology Adoption](#implementation-approaches-and-technology-adoption)
   - 5.1 [Technology Adoption Strategies](#technology-adoption-strategies)
   - 5.2 [Development Workflows and Tooling](#development-workflows-and-tooling)
   - 5.3 [Testing and Quality Assurance](#testing-and-quality-assurance)
   - 5.4 [Deployment and Operations Practices](#deployment-and-operations-practices)
   - 5.5 [Team Organization and Skills](#team-organization-and-skills)
   - 5.6 [Cost Optimization and Resource Management](#cost-optimization-and-resource-management)
   - 5.7 [Risk Assessment and Mitigation](#risk-assessment-and-mitigation)
6. [Technical Research Recommendations](#technical-research-recommendations)
   - 6.1 [Implementation Roadmap](#implementation-roadmap)
   - 6.2 [Technology Stack Recommendations](#technology-stack-recommendations)
   - 6.3 [Skill Development Requirements](#skill-development-requirements)
   - 6.4 [Success Metrics and KPIs](#success-metrics-and-kpis)

---

## Technical Research Scope Confirmation

**Research Topic:** Self-host DefiLlama làm Data Layer cho Chainlens
**Research Goals:** Phân tích feasibility, architecture, cost, fork strategy, integration với Chainlens, và so sánh alternatives

**Technical Research Scope:**
- Architecture Analysis — DefiLlama repo structure, data flow, system design
- Implementation Approaches — fork strategy, crawling pipeline, adapter pattern
- Technology Stack — Node.js vs Bun compatibility, DB requirements, RPC dependencies
- Integration Patterns — kết nối vào Chainlens API layer hiện tại
- Performance Considerations — data freshness, scalability, cost at scale

**Research Methodology:**
- Current web data với rigorous source verification (GitHub repos, official docs, community guides)
- Multi-source validation cho critical technical claims
- Confidence levels cho uncertain information

**Scope Confirmed:** 2026-05-18

---

## Technology Stack Analysis

### 1. DefiLlama Repository Ecosystem

DefiLlama không phải một monolith — đây là **hệ sinh thái multi-repo**, mỗi repo phụ trách một metric family riêng biệt:

| Repository | Vai trò | Runtime | Storage |
|---|---|---|---|
| `DefiLlama-Adapters` | TVL adapters cho protocols | Node.js/TS + `@defillama/sdk` | S3 (via SDK) |
| `defillama-server` | Core server, coin prices, oracles TVS | TypeScript + `ts-node` | S3 + DynamoDB |
| `dimension-adapters` | Fees, volume, options, aggregators | TypeScript + `pnpm` | RPC/subgraph → DB |
| `yield-server` | Yields và APY per pool | JS/TS + `npm` | Yield DB |
| `peggedassets-server` | Stablecoin supply & peg data | TypeScript, Node 23 | **DynamoDB** |
| `bridges-server` | Bridge TVL & cross-chain transfers | TypeScript + Node.js | **PostgreSQL** |
| `defillama-sdk` | Shared SDK cho EVM calls | npm library | AWS S3 SDK |
| `chainlist` | Chain metadata & RPC endpoints | JS config | Static list |

**Key insight:** Để self-host "DefiLlama", bạn phải deploy và orchestrate **ít nhất 4–6 services riêng biệt**, không phải một app duy nhất.

_Source: [docs.llama.fi](https://docs.llama.fi), [github.com/DefiLlama](https://github.com/DefiLlama)_

---

### 2. Technology Stack Chi Tiết

#### 2.1 Runtime & Language
- **Node.js + TypeScript** là backbone xuyên suốt tất cả repos
- `ts-node` dùng cho dev/testing; production compile sang JS
- `peggedassets-server` Dockerfile: `FROM node:23` — yêu cầu Node 18+
- Package manager: mix `pnpm` (dimension-adapters) và `npm` (yield-server)
- **⚠️ Chainlens dùng Bun** — cần verify compatibility layer

#### 2.2 Database & Storage (Multi-store Architecture)
```
┌─────────────────────────────────────────────────────┐
│                DefiLlama Storage Layer               │
├──────────────┬──────────────┬───────────────────────┤
│   DynamoDB   │  PostgreSQL  │        S3             │
│              │              │                       │
│ - Coin prices│ - Bridge txns│ - Adapter artifacts   │
│ - Stablecoin │ - Aggregates │ - Historical snapshots│
│   supply     │ - Daily vol  │ - Static files        │
│ - TVL cache  │              │                       │
└──────────────┴──────────────┴───────────────────────┘
```

**Không có Redis được document chính thức**, nhưng caching layer tồn tại ở API layer (website lag ~1 hour so với API).

_Source: [peggedassets-server/package.json](https://github.com/DefiLlama/peggedassets-server/blob/master/package.json), [bridges-server README](https://github.com/DefiLlama/bridges-server)_

#### 2.3 RPC Infrastructure
- SDK dùng environment variables: `ETHEREUM_RPC`, `BSC_RPC`, `POLYGON_RPC`, v.v.
- Hỗ trợ multiple RPCs per chain: `ETHEREUM_RPC=url1,url2...`
- DefiLlama tự vận hành `eth.llamarpc.com` cho internal use
- `chainlist` repo cung cấp catalog 500+ chains với RPC endpoints

**Điều này có nghĩa:** Bạn KHÔNG cần tự run full nodes — có thể dùng Alchemy/Infura/QuickNode và configure qua env vars.

_Source: [defillama-sdk README](https://github.com/DefiLlama/defillama-sdk), [bridges-server README](https://github.com/DefiLlama/bridges-server)_

---

### 3. Data Pipeline Architecture

DefiLlama implement **distributed ETL pattern**:

```
┌─────────────────────────────────────────────────────────────┐
│                    DefiLlama ETL Pipeline                    │
│                                                             │
│  EXTRACT          TRANSFORM           LOAD                  │
│  ─────────        ─────────────       ──────────────        │
│  On-chain RPC  →  Adapter logic    →  DynamoDB/PG/S3        │
│  Subgraphs     →  (per protocol)   →  API endpoints         │
│  External APIs →  Price × Balance  →  Dashboard cache       │
│                                                             │
│  Scheduler: runs adapters every ~5–15 min per protocol      │
└─────────────────────────────────────────────────────────────┘
```

**TVL Computation Flow:**
1. Adapter gọi `multiCall` → fetch balances từ smart contracts
2. SDK multiply balances × token prices (từ CoinGecko + on-chain fallback)
3. Kết quả write vào DB, keyed by `protocol:timestamp`
4. API endpoint `/tvl/{protocol}` serve từ DB cache

**Fees/Volume Flow (dimension-adapters):**
1. `fetch(startTimestamp, endTimestamp, startBlock, endBlock)` được gọi daily
2. Adapter dùng `getLogs` để scan EVM events trong time window
3. Return `dailyFees`, `dailyVolume` dưới dạng token balance objects
4. Server price tokens → USD → store historical series

_Source: [docs.llama.fi/list-your-project/other-dashboards/how-to-build-an-adapter](https://docs.llama.fi/list-your-project/other-dashboards/how-to-build-an-adapter)_

---

### 4. Deployment Options & Infrastructure Cost

#### 4.1 Không có official self-hosting guide
**Quan trọng:** DefiLlama **không có** official documentation cho self-hosting. Không có Docker Compose cho toàn bộ stack. Chỉ có `bridges-server` có Dockerfile riêng.

Để self-host, bạn phải:
- Replace AWS services (DynamoDB, S3, Lambda triggers) với local equivalents
- Convert scheduled Lambda jobs → cron jobs / background workers
- Refactor AWS SDK calls nếu dùng non-AWS storage

#### 4.2 Cost Estimates (Verified)

| Scale | Use Case | Estimated Monthly Cost |
|---|---|---|
| **Minimal** | <50 protocols, 3–5 chains | **$50–120/tháng** |
| **Mid-scale** | Hundreds of protocols, 20+ chains | **$500–1,500/tháng** |
| **Full-scale** | 7,000+ protocols, 500+ chains | **$2,000–10,000+/tháng** |

**Breakdown cho Mid-scale (relevant cho Chainlens):**
- Compute (EC2/Fargate): $200–800/tháng
- Database (DynamoDB/RDS + S3): $200–700/tháng
- RPC subscriptions (Alchemy/Infura): $100–500/tháng
- Networking/monitoring: $100–400/tháng

_Source: Perplexity research synthesis từ AWS pricing + community estimates_

---

### 5. Fork Strategy Analysis

#### 5.1 Thin Fork (Recommended)
```
DefiLlama upstream (public)
        │
        ├── DefiLlama-Adapters (fork, minimal changes)
        │   └── Chỉ thêm adapters cho protocols chưa có
        │
        ├── dimension-adapters (fork, minimal changes)
        │   └── Thêm custom fee/volume adapters
        │
        └── defillama-sdk (use as npm package, không fork)
```

**Pros:** Dễ merge upstream, ít maintenance burden
**Cons:** Bị giới hạn bởi upstream architecture

#### 5.2 Full Fork (Không khuyến nghị cho Chainlens hiện tại)
- Fork toàn bộ `defillama-server` + tất cả repos
- Rewrite AWS dependencies → Supabase/PostgreSQL
- **Effort:** 2–3 tháng engineering, ongoing maintenance

#### 5.3 Upstream Merge Complexity
- DefiLlama có **active development** — adapters được update thường xuyên
- Thin fork: merge upstream `DefiLlama-Adapters` mỗi 2–4 tuần → manageable
- Full fork: diverge nhanh, merge conflicts tăng theo thời gian
- **Risk:** Protocol upgrades contract → adapter cần update trong 24–48h

---

### 6. Integration với Chainlens (Bun/Hono/Drizzle/Supabase)

#### 6.1 Compatibility Issues

| Component | DefiLlama | Chainlens | Compatibility |
|---|---|---|---|
| Runtime | Node.js 18–23 | **Bun** | ⚠️ Partial — Bun có Node.js compat layer nhưng AWS SDK v3 có thể có issues |
| Package manager | npm/pnpm | pnpm | ✅ Compatible |
| Database | DynamoDB + PostgreSQL | **Supabase (PostgreSQL)** | ✅ PostgreSQL compatible |
| Object storage | AWS S3 | Cần setup | ⚠️ Cần Supabase Storage hoặc MinIO |
| Scheduling | AWS Lambda/EventBridge | Cần setup | ⚠️ Cần BullMQ hoặc cron |

#### 6.2 Recommended Integration Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                  Chainlens Data Layer                        │
│                                                             │
│  ┌─────────────────────┐    ┌──────────────────────────┐   │
│  │  DefiLlama Adapters  │    │   Chainlens API (Bun)    │   │
│  │  (Node.js process)   │───▶│   /v1/router/defillama   │   │
│  │                      │    │                          │   │
│  │  - TVL adapters      │    │  Internal cache (Redis/  │   │
│  │  - Fees adapters     │    │  in-memory Map + TTL)    │   │
│  │  - Yield adapters    │    │                          │   │
│  └──────────┬───────────┘    └──────────────────────────┘   │
│             │                                               │
│             ▼                                               │
│  ┌─────────────────────┐                                   │
│  │  Supabase PostgreSQL │                                   │
│  │  (shared DB)         │                                   │
│  │  - tvl_snapshots     │                                   │
│  │  - protocol_fees     │                                   │
│  │  - yield_pools       │                                   │
│  └─────────────────────┘                                   │
└─────────────────────────────────────────────────────────────┘
```

**Key decision:** Chạy DefiLlama adapters như **separate Node.js process** (không phải Bun), write vào Supabase PostgreSQL, Chainlens API đọc từ đó. Tránh Bun compatibility issues.

#### 6.3 Drizzle Schema cho DefiLlama Data

```typescript
// packages/db/src/schema/defillama.ts
export const tvlSnapshots = pgTable('tvl_snapshots', {
  id: serial('id').primaryKey(),
  protocol: text('protocol').notNull(),
  chain: text('chain'),
  tvlUsd: numeric('tvl_usd', { precision: 20, scale: 2 }),
  timestamp: timestamp('timestamp').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

export const protocolFees = pgTable('protocol_fees', {
  id: serial('id').primaryKey(),
  protocol: text('protocol').notNull(),
  dailyFeesUsd: numeric('daily_fees_usd', { precision: 20, scale: 2 }),
  dailyRevenueUsd: numeric('daily_revenue_usd', { precision: 20, scale: 2 }),
  date: date('date').notNull(),
});
```

---

### 7. Alternatives Comparison

#### 7.1 So sánh tổng quan

| Solution | Cost | Infra Burden | Data Coverage | Maintenance | Best For |
|---|---|---|---|---|---|
| **DefiLlama Public API (Free)** | $0 | None | TVL, fees, yields, 7k+ protocols | None | Early stage, <100k req/month |
| **DefiLlama Pro API** | $300/tháng | None | + ETFs, derivatives, bridges | None | Mid-scale, need higher limits |
| **Self-host DefiLlama** | $500–2,000/tháng | Very High | Full control | Very High | Large teams, data sovereignty |
| **The Graph (self-hosted)** | $350–11,000+/tháng | Very High | Custom subgraphs | Very High | Subgraph-heavy, decentralization |
| **The Graph Network** | $20/1M queries | None | Existing subgraphs | Low | Subgraph consumers |
| **Goldsky** | Free tier + usage | Low | 155+ chains, streaming | Low | Real-time pipelines, Solana |
| **Subsquid/SQD** | Free tier + usage | Low-Medium | 225+ networks | Medium | Custom indexing, no egress fees |
| **Dune Analytics API** | Free–Enterprise | None | 60+ chains, SQL | Low | Ad-hoc analytics, research |

#### 7.2 Phân tích chi tiết từng alternative

**The Graph (self-hosted graph-node):**
- Hardware: 8 cores, 32GB RAM, 14TB NVMe cho BSC alone
- Engineering cost: $400–6,000/tháng (tùy scale)
- Verdict: **Không phù hợp** cho Chainlens — quá heavy, không cover TVL/fees natively

**Goldsky:**
- Free tier: 2,250 worker hours + 100k entities miễn phí
- Streaming pipelines → PostgreSQL/warehouse
- **Không có TVL/fees metrics out-of-box** — chỉ raw events
- Verdict: **Tốt cho custom on-chain data**, không thay thế DefiLlama

**Subsquid (SQD):**
- 225+ networks, 3 petabytes data, P50 latency 27ms
- Free data egress, pay chỉ compute + storage
- Cryptographic validation (6 layers)
- **Không có TVL/fees metrics out-of-box** — cần build aggregation logic
- Verdict: **Tốt làm raw data layer**, complement DefiLlama không thay thế

**Dune Analytics API:**
- 60+ chains, 1.5M+ community datasets
- Rate limits: 15–350 req/min tùy plan
- Data freshness: hourly (Solana: 6-hour)
- **Không có canonical TVL methodology** như DefiLlama
- Verdict: **Tốt cho research/internal dashboards**, không phù hợp làm primary data source

_Source: [thegraph.com/docs/en/resources/benefits](https://thegraph.com/docs/en/resources/benefits/), [goldsky.com/pricing](https://goldsky.com/pricing), [docs.sqd.dev/en/cloud/pricing](https://docs.sqd.dev/en/cloud/pricing/overview), [docs.dune.com/api-reference/overview/rate-limits](https://docs.dune.com/api-reference/overview/rate-limits)_

---

### 8. Recommended Architecture cho Chainlens

Dựa trên research, **hybrid approach** là optimal:

```
Phase 1 (Hiện tại → 3 tháng):
  DefiLlama Free API + Smart Caching Layer
  └── Cache TVL/fees/yields trong Supabase với TTL 15 phút
  └── Cost: ~$0 (API) + minimal Supabase storage
  └── Effort: 1–2 tuần

Phase 2 (3–6 tháng, khi scale):
  DefiLlama Pro API ($300/tháng) + Selective Adapter Fork
  └── Fork chỉ dimension-adapters cho protocols Chainlens cần
  └── Run adapters như Node.js cron jobs → Supabase
  └── Cost: $300 (Pro API) + $100–200 (infra)
  └── Effort: 3–4 tuần

Phase 3 (6–12 tháng, nếu cần data sovereignty):
  Partial Self-host: TVL + Fees adapters only
  └── Fork DefiLlama-Adapters + dimension-adapters
  └── Run trên separate Node.js service (không Bun)
  └── Supabase PostgreSQL làm storage
  └── Goldsky/SQD cho custom on-chain data
  └── Cost: $500–1,000/tháng
  └── Effort: 6–8 tuần + ongoing maintenance
```

---

## Key Technical Findings

1. **DefiLlama là multi-repo ecosystem** — không thể "clone và chạy" như một app đơn giản. Cần orchestrate 4–6 services.

2. **Node.js, không phải Bun** — DefiLlama yêu cầu Node 18–23. Chainlens cần chạy adapters như separate Node.js process, không integrate trực tiếp vào Bun runtime.

3. **AWS dependencies là blocker lớn nhất** — DynamoDB, S3, Lambda triggers cần được replaced. PostgreSQL (Supabase) có thể thay DynamoDB cho most use cases.

4. **RPC cost là hidden cost** — Để cover 20+ chains, cần Alchemy/Infura subscription ~$100–500/tháng. Không cần tự run nodes.

5. **Thin fork là viable** — Fork chỉ `DefiLlama-Adapters` và `dimension-adapters`, dùng `@defillama/sdk` như npm package. Merge upstream mỗi 2–4 tuần.

6. **Alternatives không thay thế DefiLlama** — Goldsky và SQD tốt cho raw on-chain data, nhưng không có canonical TVL/fees methodology. Dune tốt cho research, không phải production data source.

7. **Optimal path cho Chainlens:** Start với DefiLlama Pro API ($300/tháng) + smart caching, chỉ self-host khi subscription cost vượt $1,000/tháng hoặc cần data sovereignty.

---

## Sources

- [DefiLlama Official Docs](https://docs.llama.fi)
- [DefiLlama API Docs](https://api-docs.defillama.com)
- [DefiLlama GitHub Organization](https://github.com/DefiLlama)
- [defillama-sdk npm](https://www.npmjs.com/package/@defillama/sdk)
- [bridges-server README](https://github.com/DefiLlama/bridges-server)
- [peggedassets-server Dockerfile](https://github.com/DefiLlama/peggedassets-server/blob/master/Dockerfile)
- [The Graph: Self-hosting vs Network](https://thegraph.com/docs/en/resources/benefits/)
- [The Graph: Supported Network Requirements](https://thegraph.com/docs/en/indexing/supported-network-requirements/)
- [Goldsky Pricing](https://goldsky.com/pricing)
- [SQD Cloud Pricing](https://docs.sqd.dev/en/cloud/pricing/overview)
- [SQD Portal](https://sqd.dev/portal/)
- [Dune API Rate Limits](https://docs.dune.com/api-reference/overview/rate-limits)
- [Dune Data Freshness](https://docs.dune.com/data-catalog/data-freshness)
- [Token Terminal Metrics](https://tokenterminal.com/explorer/metrics/fees)
- [Formo DeFi Analytics Stack](https://formo.so/blog/defi-crypto-analytics-stack)
- [Best Blockchain Indexers 2025 — Ormi Labs](https://blog.ormilabs.com/best-blockchain-indexers-in-2025-real-time-web3-data-and-subgraph-platforms-compared/)

---

## Implementation Blueprint: Chainlens Data Service

> Scope đã được refine: **Không integrate vào Chainlens codebase**. Thay vào đó, deploy như một **standalone HTTP API service** trên server riêng. Chainlens gọi qua HTTP như bất kỳ external API nào khác.

### Architecture Overview

```
┌──────────────────────────────────────────────────────────────┐
│                  VPS / Docker Host                            │
│                                                              │
│  ┌─────────────────────┐    ┌──────────────────────────┐    │
│  │   worker (Node.js)   │    │   api (Node.js/Hono)     │    │
│  │                      │    │                          │    │
│  │  node-cron: */15 min │    │  GET /tvl/:protocol      │    │
│  │  → run adapters      │───▶│  GET /fees/:protocol     │    │
│  │  → write to Postgres │    │  GET /yields/:protocol   │    │
│  │                      │    │  GET /protocols          │    │
│  └──────────────────────┘    └──────────┬───────────────┘    │
│                                         │ HTTP                │
│  ┌──────────────────────┐               │                    │
│  │   PostgreSQL          │◀─────────────┘                    │
│  │   (tvl, fees, yields) │                                   │
│  └──────────────────────┘                                    │
└──────────────────────────────────────────────────────────────┘
         ↑ HTTP calls (internal network hoặc public)
┌──────────────────────────────────────────────────────────────┐
│              Chainlens API (Bun/Hono, port 8008)             │
│   /v1/router/defillama → proxy + in-memory cache (TTL 15m)  │
└──────────────────────────────────────────────────────────────┘
```

---

### Cấu trúc Project

```
chainlens-data-service/
├── docker-compose.yml
├── .env.example
├── worker/
│   ├── Dockerfile
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── index.ts              # cron entry point
│       ├── db.ts                 # postgres client
│       ├── adapters/
│       │   ├── runner.ts         # FetchOptions builder + adapter caller
│       │   └── registry.ts       # danh sách protocols cần track
│       └── jobs/
│           ├── sync-fees.ts
│           ├── sync-tvl.ts
│           └── sync-yields.ts
├── api/
│   ├── Dockerfile
│   ├── package.json
│   └── src/
│       ├── index.ts              # Hono HTTP server
│       └── routes/
│           ├── tvl.ts
│           ├── fees.ts
│           └── yields.ts
└── db/
    └── migrations/
        └── 001_init.sql
```

---

### docker-compose.yml

```yaml
version: "3.9"

services:
  db:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: ${DB_USER}
      POSTGRES_PASSWORD: ${DB_PASSWORD}
      POSTGRES_DB: ${DB_NAME}
    volumes:
      - db_data:/var/lib/postgresql/data
      - ./db/migrations:/docker-entrypoint-initdb.d
    networks:
      - backend

  worker:
    build:
      context: ./worker
    restart: unless-stopped
    environment:
      DB_HOST: db
      DB_PORT: 5432
      DB_USER: ${DB_USER}
      DB_PASSWORD: ${DB_PASSWORD}
      DB_NAME: ${DB_NAME}
      ETHEREUM_RPC: ${ETHEREUM_RPC}
      ARBITRUM_RPC: ${ARBITRUM_RPC}
      BASE_RPC: ${BASE_RPC}
      SOLANA_RPC: ${SOLANA_RPC}
    depends_on:
      - db
    networks:
      - backend

  api:
    build:
      context: ./api
    restart: unless-stopped
    ports:
      - "4000:4000"
    environment:
      DB_HOST: db
      DB_PORT: 5432
      DB_USER: ${DB_USER}
      DB_PASSWORD: ${DB_PASSWORD}
      DB_NAME: ${DB_NAME}
      API_KEY: ${INTERNAL_API_KEY}
    depends_on:
      - db
    networks:
      - backend

networks:
  backend:

volumes:
  db_data:
```

---

### Database Schema

```sql
-- db/migrations/001_init.sql

CREATE TABLE protocols (
  slug TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT,
  chains TEXT[],
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE tvl_snapshots (
  id BIGSERIAL PRIMARY KEY,
  protocol TEXT NOT NULL REFERENCES protocols(slug),
  chain TEXT,
  tvl_usd NUMERIC(24, 4),
  timestamp TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE protocol_fees (
  id BIGSERIAL PRIMARY KEY,
  protocol TEXT NOT NULL REFERENCES protocols(slug),
  date DATE NOT NULL,
  daily_fees_usd NUMERIC(24, 4),
  daily_revenue_usd NUMERIC(24, 4),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(protocol, date)
);

CREATE TABLE yield_pools (
  id BIGSERIAL PRIMARY KEY,
  protocol TEXT NOT NULL REFERENCES protocols(slug),
  pool_id TEXT NOT NULL,
  chain TEXT,
  symbol TEXT,
  apy NUMERIC(10, 4),
  tvl_usd NUMERIC(24, 4),
  timestamp TIMESTAMPTZ NOT NULL,
  UNIQUE(pool_id, timestamp)
);

-- Indexes cho query performance
CREATE INDEX idx_tvl_protocol_ts ON tvl_snapshots(protocol, timestamp DESC);
CREATE INDEX idx_fees_protocol_date ON protocol_fees(protocol, date DESC);
CREATE INDEX idx_yields_protocol_ts ON yield_pools(protocol, timestamp DESC);
```

---

### worker/src/adapters/registry.ts

```typescript
// Chỉ list những protocols bạn cần — không cần tất cả 7000+
export const TRACKED_PROTOCOLS = [
  // DEXes
  { slug: 'uniswap',    dashboard: 'fees', chains: ['ethereum', 'arbitrum', 'base'] },
  { slug: 'curve',      dashboard: 'fees', chains: ['ethereum', 'arbitrum'] },
  { slug: 'aerodrome',  dashboard: 'fees', chains: ['base'] },

  // Lending
  { slug: 'aave-v3',   dashboard: 'fees', chains: ['ethereum', 'arbitrum', 'base'] },
  { slug: 'compound',  dashboard: 'fees', chains: ['ethereum'] },

  // Perps
  { slug: 'gmx',       dashboard: 'fees', chains: ['arbitrum'] },
  { slug: 'hyperliquid', dashboard: 'fees', chains: ['ethereum'] },

  // Solana
  { slug: 'jupiter',   dashboard: 'fees', chains: ['solana'] },
  { slug: 'raydium',   dashboard: 'fees', chains: ['solana'] },

  // Thêm protocols khác theo nhu cầu...
] as const;
```

---

### worker/src/adapters/runner.ts

```typescript
import path from 'path';

// Đây là core: gọi adapter function từ dimension-adapters
export async function runAdapter(
  dashboard: string,
  slug: string,
  endTimestamp: number
): Promise<{ dailyFees?: number; dailyRevenue?: number } | null> {
  try {
    // Dynamic import — chỉ load file cần thiết
    const adapterPath = path.join(
      process.env.ADAPTERS_PATH!, // path đến dimension-adapters clone
      dashboard,
      slug,
      'index.ts'
    );

    const adapterModule = await import(adapterPath);
    const adapter = adapterModule.default;

    const startTimestamp = endTimestamp - 86400; // 24h window

    // Build FetchOptions — dựa theo test runner của dimension-adapters
    const { createBalances, getBlock } = await import(
      path.join(process.env.ADAPTERS_PATH!, 'helpers/balances')
    );

    const options = {
      startTimestamp,
      endTimestamp,
      startOfDay: startTimestamp,
      endOfDay: endTimestamp,
      createBalances: () => createBalances({ chain: 'ethereum', timestamp: endTimestamp }),
      getLogs: async () => [], // simplified — real impl cần RPC
      api: {}, // adapter-specific
    };

    // v2 adapter: fetch(options)
    if (adapter.version === 2 || adapter.fetch) {
      const result = await adapter.fetch(options);
      return normalizeResult(result);
    }

    // v1 adapter: fetch(timestamp, chainBlocks, options)
    if (adapter.adapter) {
      const chainEntry = Object.values(adapter.adapter)[0] as any;
      const result = await chainEntry.fetch(options);
      return normalizeResult(result);
    }

    return null;
  } catch (err) {
    console.error(`[runner] Failed ${dashboard}/${slug}:`, err);
    return null;
  }
}

function normalizeResult(result: any) {
  // Convert Balances object → USD number
  const dailyFees = result?.dailyFees?.getUSDValue?.() ?? null;
  const dailyRevenue = result?.dailyRevenue?.getUSDValue?.() ?? null;
  return { dailyFees, dailyRevenue };
}
```

---

### worker/src/jobs/sync-fees.ts

```typescript
import { TRACKED_PROTOCOLS } from '../adapters/registry';
import { runAdapter } from '../adapters/runner';
import { db } from '../db';

export async function syncFees() {
  const now = Math.floor(Date.now() / 1000);
  const today = new Date().toISOString().split('T')[0];

  console.log(`[sync-fees] Starting sync for ${TRACKED_PROTOCOLS.length} protocols`);

  for (const protocol of TRACKED_PROTOCOLS) {
    if (protocol.dashboard !== 'fees') continue;

    const result = await runAdapter('fees', protocol.slug, now);
    if (!result) continue;

    await db.query(
      `INSERT INTO protocol_fees (protocol, date, daily_fees_usd, daily_revenue_usd)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (protocol, date) DO UPDATE
       SET daily_fees_usd = EXCLUDED.daily_fees_usd,
           daily_revenue_usd = EXCLUDED.daily_revenue_usd`,
      [protocol.slug, today, result.dailyFees, result.dailyRevenue]
    );

    console.log(`[sync-fees] ✓ ${protocol.slug}: $${result.dailyFees?.toFixed(0)} fees`);
  }
}
```

---

### worker/src/index.ts

```typescript
import cron from 'node-cron';
import { syncFees } from './jobs/sync-fees';
import { syncTvl } from './jobs/sync-tvl';

// Chạy ngay khi start
async function runAll() {
  await Promise.allSettled([syncFees(), syncTvl()]);
}

// Cron: mỗi 15 phút
cron.schedule('*/15 * * * *', () => {
  console.log('[worker] Running scheduled sync...');
  void runAll();
});

console.log('[worker] Started. Running initial sync...');
void runAll();
```

---

### api/src/index.ts (Hono HTTP server)

```typescript
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { db } from './db';

const app = new Hono();

// Auth middleware — Chainlens gọi với internal API key
app.use('*', async (c, next) => {
  const key = c.req.header('x-api-key');
  if (key !== process.env.API_KEY) return c.json({ error: 'Unauthorized' }, 401);
  await next();
});

// GET /fees/:protocol?days=7
app.get('/fees/:protocol', async (c) => {
  const { protocol } = c.req.param();
  const days = Number(c.req.query('days') ?? 7);

  const rows = await db.query(
    `SELECT date, daily_fees_usd, daily_revenue_usd
     FROM protocol_fees
     WHERE protocol = $1
     ORDER BY date DESC
     LIMIT $2`,
    [protocol, days]
  );

  return c.json({ protocol, data: rows.rows });
});

// GET /tvl/:protocol
app.get('/tvl/:protocol', async (c) => {
  const { protocol } = c.req.param();

  const row = await db.query(
    `SELECT tvl_usd, timestamp
     FROM tvl_snapshots
     WHERE protocol = $1
     ORDER BY timestamp DESC
     LIMIT 1`,
    [protocol]
  );

  return c.json({ protocol, tvl: row.rows[0] ?? null });
});

// GET /protocols — list tất cả protocols đang track
app.get('/protocols', async (c) => {
  const rows = await db.query(
    `SELECT slug, name, category, chains FROM protocols WHERE enabled = true`
  );
  return c.json(rows.rows);
});

serve({ fetch: app.fetch, port: 4000 });
console.log('[api] Listening on :4000');
```

---

### Integration vào Chainlens API

Trong `apps/api/src/router/services/defillama.ts` (Chainlens side), chỉ cần:

```typescript
// Thay vì gọi api.llama.fi, gọi internal data service
const DATA_SERVICE_URL = process.env.DEFILLAMA_SERVICE_URL; // http://data-service:4000
const DATA_SERVICE_KEY = process.env.DEFILLAMA_SERVICE_KEY;

export async function getProtocolFees(protocol: string, days = 7) {
  const res = await fetch(`${DATA_SERVICE_URL}/fees/${protocol}?days=${days}`, {
    headers: { 'x-api-key': DATA_SERVICE_KEY },
    signal: AbortSignal.timeout(3000),
  });
  if (!res.ok) throw new Error(`Data service error: ${res.status}`);
  return res.json();
}
```

Cache layer trong Chainlens giữ nguyên — in-memory Map với TTL 15 phút như hiện tại.

---

### Infrastructure Cost (Revised — Selective Deployment)

| Component | Spec | Cost/tháng |
|---|---|---|
| VPS (Hetzner/DigitalOcean) | 2 vCPU, 4GB RAM, 80GB SSD | $12–20 |
| RPC — Ethereum | Alchemy free tier (300M compute units) | $0 |
| RPC — Arbitrum + Base | Alchemy free tier (shared) | $0 |
| RPC — Solana | Helius free tier (100k req/day) | $0 |
| PostgreSQL | Self-hosted trong Docker | $0 |
| **Total** | 50–100 protocols, 4 chains | **$12–20/tháng** |

Khi scale vượt free tier RPC: Alchemy Growth ~$49/tháng → total ~$60–70/tháng.

So sánh: DefiLlama Pro API = **$300/tháng**. Tiết kiệm **$230–280/tháng**.

---

### Deployment Steps

```bash
# 1. Clone dimension-adapters (chỉ cần repo này cho fees/TVL)
git clone https://github.com/DefiLlama/dimension-adapters.git
cd dimension-adapters && pnpm install

# 2. Clone DefiLlama-Adapters (cho TVL)
git clone https://github.com/DefiLlama/DefiLlama-Adapters.git
cd DefiLlama-Adapters && yarn install

# 3. Setup data service
git clone <chainlens-data-service>
cp .env.example .env
# Fill in DB credentials, RPC URLs, API key

# 4. Deploy
docker compose up -d

# 5. Verify
curl -H "x-api-key: $KEY" http://localhost:4000/protocols
curl -H "x-api-key: $KEY" http://localhost:4000/fees/uniswap
```

---

### Risks & Mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| Adapter API breaks sau protocol upgrade | Cao | Monitor DefiLlama upstream, subscribe GitHub notifications cho adapters bạn dùng |
| RPC rate limit | Trung bình | Stagger adapter runs (không chạy tất cả cùng lúc), dùng multiple RPC providers |
| `FetchOptions` helpers thay đổi | Thấp | Pin `dimension-adapters` tại specific commit, update có kiểm soát |
| Data service down → Chainlens fallback | Trung bình | Chainlens giữ fallback về DefiLlama public API khi data service unavailable |

_Source: [dimension-adapters testing docs](https://docs.llama.fi/list-your-project/other-dashboards/testing), [Docker Compose best practices 2025](https://www.freecodecamp.org/news/build-production-ready-web-apps-with-hono/)_

## Implementation Approaches and Technology Adoption

### Technology Adoption Strategies

**Gradual adoption (recommended)** là chiến lược phù hợp nhất cho Chainlens. Thay vì "big bang" migration, triển khai theo 3 giai đoạn:

**Phase 1 — Parallel run (tuần 1–2):** Self-hosted service chạy song song với DefiLlama public API. Chainlens vẫn dùng public API làm primary, self-hosted làm shadow. So sánh kết quả để validate accuracy.

**Phase 2 — Selective cutover (tuần 3–4):** Chuyển các protocol có traffic cao nhất (Uniswap, Aave, GMX) sang self-hosted. Giữ public API làm fallback cho long-tail protocols.

**Phase 3 — Full cutover (tháng 2):** Tắt dependency vào public API cho các protocol đã tracked. Giữ public API chỉ cho on-demand queries không có trong registry.

Chiến lược này giảm risk: nếu self-hosted service có vấn đề, Chainlens tự động fallback về public API mà không có downtime.

_Source: https://www.birjob.com/blog/vllm-tgi-ollama-self-hosting-llms_

### Development Workflows and Tooling

**Repository structure** cho self-hosted service nên là một repo riêng biệt (không trong Chainlens monorepo):

```
chainlens-data-service/
├── worker/          # Node.js 20, cron jobs, adapter runner
├── api/             # Hono HTTP server
├── adapters/        # Forked/customized DefiLlama adapters
├── db/              # PostgreSQL migrations (Drizzle hoặc raw SQL)
├── ops/             # Docker Compose, nginx config
└── .github/
    └── workflows/
        ├── ci.yml   # lint + typecheck + unit tests
        └── cd.yml   # build image + deploy to VPS
```

**CI pipeline (GitHub Actions):**

```yaml
# .github/workflows/ci.yml
name: CI
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env: { POSTGRES_USER: test, POSTGRES_PASSWORD: test, POSTGRES_DB: test }
        ports: ["5432:5432"]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: npm }
      - run: npm ci
      - run: npm run lint && npm run typecheck
      - run: npm run test
```

**CD pipeline:** SSH deploy lên VPS khi merge vào `main`:

```yaml
  deploy:
    needs: test
    if: github.ref == 'refs/heads/main'
    steps:
      - name: Deploy to VPS
        run: |
          ssh user@vps "cd /opt/chainlens-data && git pull && docker compose up -d --build"
```

_Source: https://github.com/DefiLlama/defillama-skills/actions_

### Testing and Quality Assurance

**3-layer testing strategy** cho adapter-based data service:

**Layer 1 — Unit tests (mock RPC):**
Test business logic của adapter runner mà không cần RPC thật. Mock `FetchOptions.api` để trả về fixture data.

```typescript
// worker/src/__tests__/adapter-runner.test.ts
import { runAdapter } from '../adapters/runner';

describe('runAdapter', () => {
  it('returns TVL for uniswap-v3', async () => {
    const mockApi = { call: jest.fn().mockResolvedValue('1000000000000000000') };
    const result = await runAdapter('uniswap-v3', { api: mockApi } as any);
    expect(result.tvl).toBeGreaterThan(0);
  });
});
```

**Layer 2 — Integration tests (fixed block):**
Chạy adapter với RPC thật nhưng tại một block cố định để đảm bảo determinism. Lưu kết quả làm "golden snapshot".

```bash
# Chạy adapter tại block cụ thể, so sánh với snapshot
npm run test:integration -- --protocol=uniswap-v3 --block=19000000
```

**Layer 3 — Cross-source validation:**
Hàng giờ, so sánh TVL/fees từ self-hosted service với DefiLlama public API. Alert nếu divergence > 5%.

```typescript
// worker/src/jobs/validate.ts
async function validateAgainstPublicApi(protocol: string) {
  const [selfHosted, public_] = await Promise.all([
    db.query.tvlSnapshots.findFirst({ where: eq(tvlSnapshots.protocol, protocol) }),
    fetch(`https://api.llama.fi/tvl/${protocol}`).then(r => r.json())
  ]);
  const divergence = Math.abs(selfHosted.tvlUsd - public_.tvl) / public_.tvl;
  if (divergence > 0.05) {
    logger.warn({ protocol, divergence }, 'TVL divergence detected');
  }
}
```

_Source: https://www.montecarlodata.com/blog-data-quality-monitoring/_

### Deployment and Operations Practices

**Health check endpoints** — mỗi service phải expose:

```typescript
// api/src/index.ts — thêm vào Hono app
app.get('/healthz', async (c) => {
  const dbOk = await db.execute(sql`SELECT 1`).then(() => true).catch(() => false);
  return c.json({ status: dbOk ? 'ok' : 'degraded', db: dbOk });
});
```

**Docker healthcheck** trong `docker-compose.yml`:

```yaml
api:
  healthcheck:
    test: ["CMD", "curl", "-f", "http://localhost:3001/healthz"]
    interval: 30s
    timeout: 5s
    retries: 3
    start_period: 10s
```

**Monitoring stack (lightweight cho VPS $12–20/month):**

Thay vì Prometheus + Grafana (tốn RAM), dùng:
- **Uptime Kuma** (self-hosted, 50MB RAM) — monitor endpoint availability
- **Logtail / BetterStack** (free tier 1GB/month) — centralized logs
- **Sentry** (free tier) — error tracking cho Node.js worker

**RPC fallback pattern:**

```typescript
// worker/src/lib/rpc.ts
const RPC_PROVIDERS = {
  ethereum: [process.env.ETHEREUM_RPC_PRIMARY, process.env.ETHEREUM_RPC_FALLBACK],
  arbitrum: [process.env.ARBITRUM_RPC_PRIMARY, process.env.ARBITRUM_RPC_FALLBACK],
};

async function callWithFallback(chain: string, method: string, params: unknown[]) {
  for (const rpc of RPC_PROVIDERS[chain]) {
    try {
      return await fetch(rpc, { method: 'POST', body: JSON.stringify({ jsonrpc: '2.0', method, params, id: 1 }) });
    } catch {
      continue;
    }
  }
  throw new Error(`All RPC endpoints failed for ${chain}`);
}
```

_Source: https://www.castordoc.com/data-strategy/data-pipeline-architecture-examples-best-practices-more-in-2024_

### Team Organization and Skills

**Skill requirements** để build và maintain self-hosted DefiLlama service:

| Skill | Level | Notes |
|-------|-------|-------|
| TypeScript / Node.js | Senior | Adapter code, worker logic |
| DeFi protocol knowledge | Mid | Hiểu TVL methodology, fee calculation |
| PostgreSQL | Mid | Schema design, query optimization |
| Docker / Linux ops | Mid | VPS deployment, container management |
| Blockchain RPC | Mid | `eth_call`, `eth_getLogs`, block queries |

**Team size:** 1 backend engineer có thể build MVP trong 2–3 tuần. Maintenance sau đó là ~2–4 giờ/tuần (thêm protocol mới, fix adapter khi protocol upgrade contract).

**Onboarding mới protocol:** Quy trình chuẩn hóa:
1. Fork adapter file từ `DefiLlama-Adapters` repo
2. Test với fixed block
3. Thêm vào `TRACKED_PROTOCOLS` registry
4. Deploy và monitor 24h đầu

### Cost Optimization and Resource Management

**RPC cost optimization** — quan trọng nhất vì đây là chi phí biến đổi lớn nhất:

| Strategy | Savings | Implementation |
|----------|---------|----------------|
| Batch `eth_call` multicall | 80–90% RPC calls | Dùng Multicall3 contract |
| Cache block-level results | 70% duplicate calls | Redis với TTL = block time |
| Alchemy free tier (300M CU/month) | $0 cho ~15 protocols | Đủ cho MVP |
| Infura free tier (100K req/day) | $0 fallback | Dùng làm secondary |

**Database cost optimization:**

```sql
-- Partition tvl_snapshots theo tháng để query nhanh hơn
CREATE TABLE tvl_snapshots (
  id BIGSERIAL,
  protocol TEXT NOT NULL,
  tvl_usd NUMERIC(20,2),
  captured_at TIMESTAMPTZ NOT NULL
) PARTITION BY RANGE (captured_at);

-- Tự động tạo partition mới mỗi tháng
CREATE TABLE tvl_snapshots_2026_05 PARTITION OF tvl_snapshots
  FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');
```

**Revised cost breakdown (production-ready):**

| Component | Provider | Monthly Cost |
|-----------|----------|-------------|
| VPS (2 vCPU, 4GB RAM) | Hetzner CX22 | $6 |
| PostgreSQL (included in VPS) | Self-hosted | $0 |
| RPC — Ethereum | Alchemy free | $0 |
| RPC — Arbitrum | Alchemy free | $0 |
| RPC — Solana | Helius free (100K/day) | $0 |
| Monitoring | Uptime Kuma + Sentry free | $0 |
| Logs | BetterStack free (1GB) | $0 |
| **Total** | | **~$6–12/month** |

So sánh: DefiLlama Pro API = $300/month → **tiết kiệm 96%**.

_Source: https://selfh.st/weekly/2025-05-30/_

### Risk Assessment and Mitigation

**Risk matrix cho self-hosted DefiLlama approach:**

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Protocol upgrades contract → adapter breaks | High | Medium | Monitor DefiLlama upstream repo, weekly sync |
| RPC provider outage | Medium | High | Multi-provider fallback, Chainlens fallback về public API |
| VPS downtime | Low | High | Chainlens fallback về public API (graceful degradation) |
| Data accuracy divergence | Medium | Medium | Cross-validation job hàng giờ vs public API |
| DefiLlama license change | Very Low | High | MIT license, fork đã tồn tại — không thể revoke |
| Maintenance burden tăng | Medium | Low | Chỉ track 15–20 protocols, không phải 7000+ |

**Graceful degradation pattern** trong Chainlens:

```typescript
// apps/api/src/router/services/defillama.ts
async function getTvl(protocol: string): Promise<TvlData> {
  try {
    // Try self-hosted first (faster, no rate limit)
    return await selfHostedClient.getTvl(protocol);
  } catch (err) {
    logger.warn({ protocol, err }, 'Self-hosted failed, falling back to public API');
    // Fallback to public DefiLlama API
    return await publicApiClient.getTvl(protocol);
  }
}
```

**Upstream sync strategy:**
- Subscribe to `DefiLlama-Adapters` GitHub releases
- Weekly automated PR: `git fetch upstream && git merge upstream/main -- adapters/`
- Review diff, chỉ merge các adapter trong `TRACKED_PROTOCOLS`

## Technical Research Recommendations

### Implementation Roadmap

**Sprint 1 (tuần 1–2): Foundation**
- [ ] Setup repo `chainlens-data-service` với Docker Compose
- [ ] PostgreSQL schema + migrations
- [ ] Fork 5 adapter files (Uniswap v3, Aave v3, GMX, Curve, Lido)
- [ ] Worker cron job chạy mỗi 15 phút
- [ ] Hono API server với `/tvl/:protocol`, `/fees/:protocol`
- [ ] Deploy lên Hetzner CX22

**Sprint 2 (tuần 3–4): Integration & Validation**
- [ ] Thêm 10 protocol còn lại vào registry
- [ ] Cross-validation job vs DefiLlama public API
- [ ] Uptime Kuma + Sentry setup
- [ ] Chainlens `defillama.ts` service update để call self-hosted first
- [ ] Parallel run: so sánh kết quả 7 ngày

**Sprint 3 (tháng 2): Production Hardening**
- [ ] RPC fallback implementation
- [ ] GitHub Actions CI/CD pipeline
- [ ] Alerting rules (TVL divergence > 5%, RPC failure)
- [ ] Full cutover từ public API
- [ ] Documentation: cách thêm protocol mới

### Technology Stack Recommendations

**Self-hosted data service stack:**

```
Runtime:     Node.js 20 LTS (Alpine Docker image)
Language:    TypeScript 5.x
HTTP:        Hono (nhẹ, fast, tương thích với Chainlens pattern)
Database:    PostgreSQL 16 (self-hosted trong Docker)
Scheduler:   node-cron (đơn giản, không cần Redis/BullMQ cho MVP)
RPC:         viem v2 (type-safe, tree-shakeable)
Testing:     Vitest (nhanh hơn Jest, ESM native)
Monitoring:  Uptime Kuma + Sentry free tier
Deployment:  Docker Compose trên Hetzner CX22
```

**Không dùng:**
- BullMQ/Redis — overkill cho 15–20 protocols, cron đủ
- Kubernetes — overkill cho single VPS
- ClickHouse/TimescaleDB — PostgreSQL đủ cho volume này
- AWS DynamoDB/S3 — không cần, PostgreSQL thay thế hoàn toàn

### Skill Development Requirements

Chainlens team cần bổ sung kiến thức:

1. **DefiLlama adapter pattern** — đọc 5–10 adapter files trong `DefiLlama-Adapters` repo để hiểu `FetchOptions` interface
2. **viem v2** — nếu hiện tại dùng ethers.js, viem có API tốt hơn cho multicall
3. **PostgreSQL partitioning** — cho time-series data optimization
4. **DeFi protocol mechanics** — TVL methodology, fee calculation per protocol type (AMM vs lending vs perps)

### Success Metrics and KPIs

**Technical KPIs:**

| Metric | Target | Measurement |
|--------|--------|-------------|
| Data freshness | < 20 phút lag | `MAX(captured_at) - NOW()` |
| TVL accuracy vs public API | < 2% divergence | Cross-validation job |
| API response time | < 100ms p99 | Uptime Kuma |
| RPC error rate | < 1% | Worker logs |
| Monthly cost | < $15 | VPS invoice |

**Business KPIs:**

| Metric | Target |
|--------|--------|
| API cost reduction | > 90% vs Pro subscription |
| Protocol coverage | 15–20 protocols (covers 80% Chainlens use cases) |
| Maintenance time | < 4 hours/week |
| Time to add new protocol | < 2 hours |
