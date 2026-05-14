# Story 2.7: DeFiLlama Pro Data Tools (Hacks, Token Unlocks, Bridges)

Status: backlog

Epic: 2 — Crypto Data Infrastructure
Created: 2026-05-14
Last Reviewed: 2026-05-14 (Winston — System Architect)
FRs: FR2, FR21
NFRs: NFR2, NFR4
ARs: AR1, AR2, AR3, AR6, AR8

**Dependencies:** 
- Story 2.4 phải hoàn thành trước (cần `defillama-worker.ts` để extend, `getDefillamaUrl` helper, `DEFILLAMA_PRO_API_KEY` config).
- Hacks/Emissions endpoints **CHỈ available với Pro key** — story 2.7 sẽ skip 2 categories đó nếu `DEFILLAMA_PRO_API_KEY` chưa set, chỉ crawl bridges (Free).

## Story

As a Epsilon agent phân tích rủi ro crypto,
I want gọi tool `risk_lookup` để query lịch sử hack, token unlock schedule, và bridge volumes cho một protocol/token,
so that agent có thể cảnh báo user về rủi ro bảo mật và sell pressure từ token unlocks trước khi họ invest.

## Acceptance Criteria

1. **AC1 — DB schema (3 tables mới):**

   **`epsilon.defillama_hacks`** (~500 rows historical):
   - `hack_id varchar(200)` PK (composite: `${slug-name}-${date}`), `name varchar(255)`, `date timestamptz`, `amount_usd numeric(20,4)`, `chain varchar(100)`, `classification varchar(100)`, `technique varchar(100)`, `target_type varchar(50)`, `returned_funds_usd numeric(20,4)`, `fetched_at timestamptz`
   - Index: `idx_defillama_hacks_name` ON `name` (cho ILIKE search), `idx_defillama_hacks_date` ON `date DESC`

   **`epsilon.defillama_token_unlocks`** (~500 protocols):
   - `token_id varchar(100)` PK (protocol_id từ DeFiLlama emissions response), `name varchar(255)`, `symbol varchar(50)`, `circ_supply numeric(20,4)`, `total_locked numeric(20,4)`, `max_supply numeric(20,4)`, `next_unlock_date timestamptz`, `next_unlock_amount_usd numeric(20,4)`, `unlocks_per_day numeric(20,4)`, `mcap numeric(20,4)`, `fetched_at timestamptz`, `updated_at timestamptz`
   - Indexes: `idx_defillama_unlocks_symbol` ON `symbol`, `idx_defillama_unlocks_next_date` ON `next_unlock_date`

   **`epsilon.defillama_bridges`** (~50 rows):
   - `bridge_id integer` PK, `name varchar(255)`, `display_name varchar(255)`, `weekly_volume_usd numeric(20,4)`, `monthly_volume_usd numeric(20,4)`, `chains jsonb`, `fetched_at timestamptz`, `updated_at timestamptz`
   - Index: `idx_defillama_bridges_name` ON `name`

   - Migration `0005_defillama_pro_tables.sql` được generate qua `bun run db:generate` và commit.

2. **AC2 — Endpoint URL mapping (extend `getDefillamaUrl` từ Story 2.4):**

   | Endpoint key | Pro-only? | Pro URL | Free URL |
   |---|---|---|---|
   | `hacks` | ✅ Pro-only | `https://pro-api.llama.fi/{KEY}/api/hacks` | N/A |
   | `emissions` | ✅ Pro-only | `https://pro-api.llama.fi/{KEY}/api/emissions` | N/A |
   | `bridges` | Both | `https://pro-api.llama.fi/{KEY}/bridges/bridges` | `https://bridges.llama.fi/bridges` |

   Update `getDefillamaUrl(endpoint, proKey?)` từ Story 2.4 để support 3 endpoint keys mới. Cho `hacks` và `emissions`: nếu không có `proKey` → throw `Error('Pro API key required for hacks/emissions endpoints')`.

3. **AC3 — Worker crawl (extend `defillama-worker.ts` từ Story 2.4):**
   
   Trong `defillama-worker.ts`:
   
   - **Bridges**: thêm vào job chính (hourly), cùng schedule với 5 categories từ Story 2.4. Không yêu cầu Pro key.
   - **Hacks + Emissions**: tạo scheduler riêng `sync-defillama-pro-daily` với cron `41 2 * * *` (2:41 AM daily) — không cần fetch hourly. Dùng `upsertJobScheduler` với `pattern` thay vì `every`:
     ```typescript
     await queue.upsertJobScheduler(
       'sync-defillama-pro-daily',
       { pattern: '41 2 * * *', tz: 'UTC' },
       { name: 'fetch-defillama-pro-daily', data: {}, opts: { attempts: 1 } },
     );
     ```
   - Guard: nếu `!config.DEFILLAMA_PRO_API_KEY` → log info `[defillama-worker] Pro key not set, skipping hacks/emissions` và skip 2 fetches đó (bridges vẫn chạy).
   - Per-category retry pattern giống Story 2.4 (`fetchWithRetry` helper).

4. **AC4 — JIT route `/v1/router/jit-sync/risk` (AC3 + AC5):**
   - `GET /v1/router/jit-sync/risk?protocol={slug}&token={symbol}` — ít nhất 1 trong 2 params required.
   - Query 3 tables:
     - `defillama_hacks` WHERE `name ILIKE '%' || protocol || '%'` (sanitize % và _ trong protocol)
     - `defillama_token_unlocks` WHERE `symbol = token` HOẶC `name ILIKE '%' || protocol || '%'`
     - `defillama_bridges` WHERE `name ILIKE '%' || protocol || '%'` (optional, chỉ relevant cho bridge protocols)
   - Compute `risk_score` theo logic dưới Dev Notes.
   - Response: `{ hacks: [...], upcoming_unlocks: [...], bridge_volume: {...}|null, risk_score: 'HIGH'|'MEDIUM'|'LOW', source: 'db_cache', fetched_at }`.
   - `checkCredits` + `deductToolCredits` qua `queueMicrotask`.
   - Tool cost: `getToolCost('risk_lookup', 0)` — cao hơn các tools khác vì Pro data.

5. **AC5 — OpenCode tool `risk_lookup.ts`:**
   - File: `core/epsilon-master/opencode/tools/risk_lookup.ts`.
   - Args: `protocol` (string, required), `token_symbol` (optional).
   - Gọi `${EPSILON_API_URL}/v1/router/jit-sync/risk` với `Bearer ${EPSILON_TOKEN}`.
   - Timeout: `AbortSignal.timeout(2000)`.
   - Returns formatted risk report (xem Dev Notes).

6. **AC6 — TypeScript clean, không regression tests.**

## Tasks / Subtasks

- [ ] **Task 0: DB Schema — 3 tables mới (AC1)**
  - [ ] 0.1 — Append vào `packages/db/src/schema/epsilon.ts` sau `defillamaStablecoins` (Story 2.4 tables).
  - [ ] 0.2 — Tạo table `defillamaHacks` với 2 indexes.
  - [ ] 0.3 — Tạo table `defillamaTokenUnlocks` với 2 indexes.
  - [ ] 0.4 — Tạo table `defillamaBridges` với 1 index.
  - [ ] 0.5 — Export 3 tables từ `packages/db/src/index.ts`.
  - [ ] 0.6 — `cd packages/db && bun run db:generate` — verify `0005_defillama_pro_tables.sql`.
  - [ ] 0.7 — `cd packages/db && bun run db:migrate`.

- [ ] **Task 1: Extend getDefillamaUrl helper (AC2)**
  - [ ] 1.1 — Mở `apps/api/src/router/services/defillama.ts`.
  - [ ] 1.2 — Update `LlamaEndpoint` type: thêm `'hacks' | 'emissions' | 'bridges'`.
  - [ ] 1.3 — Update `getDefillamaUrl(endpoint, proKey?)` switch:
    ```typescript
    case 'hacks':
      if (!proKey) throw new Error('Pro API key required for hacks endpoint');
      return `https://pro-api.llama.fi/${proKey}/api/hacks`;
    case 'emissions':
      if (!proKey) throw new Error('Pro API key required for emissions endpoint');
      return `https://pro-api.llama.fi/${proKey}/api/emissions`;
    case 'bridges':
      if (proKey) return `https://pro-api.llama.fi/${proKey}/bridges/bridges`;
      return 'https://bridges.llama.fi/bridges';
    ```

- [ ] **Task 2: Service functions (AC3)**
  - [ ] 2.1 — Thêm vào `apps/api/src/router/services/defillama.ts`:
    - `fetchHacks(proKey: string): Promise<DefillamaHackRow[]>` — required Pro key.
    - `fetchTokenUnlocks(proKey: string): Promise<DefillamaTokenUnlockRow[]>` — required Pro key.
    - `fetchBridges(proKey?: string): Promise<DefillamaBridgeRow[]>` — Pro key optional.
  - [ ] 2.2 — Define TypeScript interfaces matching API responses.

- [ ] **Task 3: Extend defillama-worker (AC3)**
  - [ ] 3.1 — Mở `apps/api/src/queue/bullmq/workers/defillama-worker.ts`.
  - [ ] 3.2 — Thêm `fetchBridges()` call vào `processJob()` (hourly job, sau 5 categories từ Story 2.4).
  - [ ] 3.3 — Tạo function mới `processProDailyJob()` cho hacks + emissions.
  - [ ] 3.4 — Trong `processProDailyJob()`: guard `if (!config.DEFILLAMA_PRO_API_KEY) { logger.info(...); return; }`.
  - [ ] 3.5 — Update Worker handler: switch theo `job.name` để dispatch:
    ```typescript
    new Worker(QUEUE_NAME, async (job) => {
      if (job.name === 'fetch-defillama-all') return processJob(job.id);
      if (job.name === 'fetch-defillama-pro-daily') return processProDailyJob(job.id);
      throw new Error(`Unknown job name: ${job.name}`);
    }, { connection: redisConnection, ... });
    ```
  - [ ] 3.6 — Trong `setupDefillamaWorkerJobs()`: thêm 2nd scheduler cho daily Pro job.

- [ ] **Task 4: JIT route handler (AC4)**
  - [ ] 4.1 — Tạo `apps/api/src/router/routes/jit-sync-risk.ts`.
  - [ ] 4.2 — `GET /v1/router/jit-sync/risk` — Zod validate (ít nhất 1 trong protocol/token).
  - [ ] 4.3 — Sanitize `protocol` để escape `%` và `_` trong ILIKE pattern.
  - [ ] 4.4 — Query 3 tables song song qua `Promise.all`.
  - [ ] 4.5 — Compute `risk_score` qua helper function.
  - [ ] 4.6 — `checkCredits` + `deductToolCredits` (queueMicrotask).
  - [ ] 4.7 — Register route trong `apps/api/src/router/index.ts`: mount tại `/v1/router/jit-sync/risk`.

- [ ] **Task 5: Tool cost config (AC4)**
  - [ ] 5.1 — Thêm entry `risk_lookup` vào TOOL_COSTS map trong `apps/api/src/config.ts`.

- [ ] **Task 6: OpenCode tool (AC5)**
  - [ ] 6.1 — Tạo `core/epsilon-master/opencode/tools/risk_lookup.ts`.
  - [ ] 6.2 — Follow pattern của `jit_sync.ts`.
  - [ ] 6.3 — Format risk report (xem Dev Notes).

- [ ] **Task 7: TypeScript check (AC6)**
  - [ ] 7.1 — `cd apps/api && npx tsc --noEmit` — không có lỗi mới.

## Dev Notes

### Pattern Reference
- Worker extension: `apps/api/src/queue/bullmq/workers/defillama-worker.ts` (Story 2.4) — extend, không tạo worker mới.
- Route: `apps/api/src/router/routes/jit-sync.ts`.
- Tool: `core/epsilon-master/opencode/tools/jit_sync.ts`.

### DeFiLlama Pro API Endpoints
**Important:** Pro endpoints **chèn API key vào path**, không phải query param:
- Hacks: `https://pro-api.llama.fi/{KEY}/api/hacks` (Pro-only)
- Emissions/Unlocks: `https://pro-api.llama.fi/{KEY}/api/emissions` (Pro-only)
- Bridges: `https://pro-api.llama.fi/{KEY}/bridges/bridges` (Pro) OR `https://bridges.llama.fi/bridges` (Free)

### Risk Score Logic
```typescript
function computeRiskScore(
  hacks: Array<{ date: Date; amount_usd: number }>,
  unlocks: Array<{ next_unlock_date: Date | null; next_unlock_amount_usd: number | null; circ_supply: number | null; mcap: number | null }>,
): 'HIGH' | 'MEDIUM' | 'LOW' {
  const now = Date.now();
  const oneYear = 365 * 24 * 60 * 60 * 1000;
  const twoYears = 2 * oneYear;
  const thirtyDays = 30 * 24 * 60 * 60 * 1000;

  const recentHack12m = hacks.some(h => now - h.date.getTime() < oneYear);
  const recentHack24m = hacks.some(h => now - h.date.getTime() < twoYears);

  // Tính % unlock so với mcap (cleaner hơn so với circ_supply vì có nghĩa USD)
  const upcomingUnlock = unlocks.find(u =>
    u.next_unlock_date && (u.next_unlock_date.getTime() - now) < thirtyDays && u.next_unlock_date.getTime() > now,
  );
  const unlockPct = upcomingUnlock && upcomingUnlock.mcap && upcomingUnlock.mcap > 0 && upcomingUnlock.next_unlock_amount_usd
    ? (upcomingUnlock.next_unlock_amount_usd / upcomingUnlock.mcap) * 100
    : 0;

  if (recentHack12m || unlockPct > 10) return 'HIGH';
  if (recentHack24m || unlockPct > 5) return 'MEDIUM';
  return 'LOW';
}
```

### ILIKE Pattern Sanitization
Postgres `ILIKE` treats `%` và `_` là wildcards. User input `100%` sẽ match mọi thứ. Sanitize:
```typescript
function escapeLikePattern(input: string): string {
  return input.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}
// Usage:
const safe = escapeLikePattern(protocol);
sql`name ILIKE ${`%${safe}%`}`
```

### Tool Response Format
```
⚠️  HIGH RISK: Ronin Bridge

🔒 Hacks (last 24m):
  • 2022-03-23: $625M lost (validator key compromise)
  • Recovered: $30M

🔓 Token Unlocks:
  • 2026-06-12: 12.5% of AXS supply unlocks ($45M)
  • Daily emissions: 0.05% of supply

🌉 Bridge Volume:
  • Weekly: $234M
  • Monthly: $1.2B
```

LOW risk format:
```
✅ LOW RISK: Lido

No hacks recorded in last 24 months.
No upcoming unlocks (>5% of supply) in next 30 days.
```

### Why Daily Cron for Hacks/Emissions
- `/api/hacks`: ~500 records, append-only — historical data không thay đổi mỗi giờ.
- `/api/emissions`: ~500 protocols, daily-resolution unlock schedules — refresh hourly là wasteful.
- Daily 2:41 AM UTC: low-traffic time, không conflict với hourly job (every full hour).

### BullMQ: 1 Worker, 2 Schedulers
Worker handler dispatch theo `job.name`:
- `fetch-defillama-all` → `processJob()` (hourly, 5 categories + bridges)
- `fetch-defillama-pro-daily` → `processProDailyJob()` (daily, hacks + emissions)

Cả 2 schedulers cùng queue `defillama-sync`, cùng worker instance — tận dụng 1 process.

## Dev Agent Record

### Debug Log
(empty)

### Completion Notes
(empty)

## File List

(empty — to be filled during implementation)

## Change Log

| Date | Change |
|------|--------|
| 2026-05-14 | Story created |
| 2026-05-14 | Architect review (Winston): added Pro path mapping (`/api/hacks`, `/api/emissions`, `/bridges/bridges`), 1-worker-2-schedulers pattern, ILIKE sanitization, indexes for query patterns, mcap-based unlock % calc |
