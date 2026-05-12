# Story 2.2: AI-Generated Discover Feed

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a Free tier user,
I want xem trang Discover với AI-generated news và alpha insights tổng hợp từ đa nguồn,
So that tôi nắm bắt early warnings và opportunities mà không cần tự research.

## Acceptance Criteria

1. **Given** user truy cập trang Discover (mọi tier kể cả Free)
   **When** Next.js server component tại `apps/web/src/app/(dashboard)/discover/` render
   **Then** trang hiển thị AI-summarized news từ đa nguồn với timestamp
   **And** early warning badge xuất hiện cho bất kỳ anomaly nào được detect trong 24h qua

2. **Given** AI summarization job chạy định kỳ qua BullMQ
   **When** job hoàn thành
   **Then** feed được cập nhật không cần user refresh
   **And** nội dung được anonymize — không expose dữ liệu cá nhân user nào

## Tasks / Subtasks

- [x] Task 1: Database Schema Extension (AC: 1, 2)
  - [x] Update `packages/db/src/schema/epsilon.ts` (additive-only migration) to include a table for discover feed items (e.g., `discover_feeds` or similar), with fields for `title`, `summary`, `timestamp`, `is_anomaly`/`warning_level`, and `sources`.
- [x] Task 2: AI Summarization Worker Setup (AC: 2)
  - [x] Implement a BullMQ background job in `apps/api/src/queue/bullmq/workers/` that runs periodically (e.g., hourly).
  - [x] Integrate with the AI module to fetch and summarize multi-source data.
  - [x] Ensure strict anonymization (no user data is accessed or exposed).
  - [x] Insert generated items into the database.
- [x] Task 3: Discover Page Frontend (AC: 1, 2)
  - [x] Create Next.js server component at `apps/web/src/app/(dashboard)/discover/page.tsx`.
  - [x] Fetch feed items from the database directly (since it's a server component) or via a new TRPC/API route.
  - [x] Render the news feed with timestamps.
  - [x] Add the "early warning badge" logic for anomalies in the past 24 hours.

### Review Findings

#### Decision Needed (5) — RESOLVED

- [x] [Review][Decision] **Anonymization strategy** → Option (b): deterministic PII scrubber. `scrubPii` in `packages/shared/src/utils/discover-feed.ts` strips wallet hex (`0x{40}`), tx hashes (`0x{64}`), ENS names, emails, IPv4, phones. Applied to AI output before DB insert in `discover-feed.ts`. Defense-in-depth — does not trust LLM output.
- [x] [Review][Decision] **Realtime feed update** → Option (a)+(b) hybrid: `export const dynamic = 'force-dynamic'` on `page.tsx` so each navigation fetches fresh data from API. API endpoint sets `Cache-Control: max-age=60`. AC2 satisfied for navigation-driven refresh. (While-open polling deferred — see deferred-work.md.)
- [x] [Review][Decision] **Migration file** → Option (a) chosen but **DEFERRED**: `bunx drizzle-kit generate --name discover_feeds` requires interactive TTY (drizzle-kit's enum resolver). Run manually before deploy. `0001_*.sql` must be committed; `db:push --force` is dev-only.
- [x] [Review][Decision] **Mock fetchRawNews** → Option (b): feature-flag `DISCOVER_WORKER_ENABLED` (default `false` in `apps/api/src/config.ts`). Worker + scheduler skip registration when disabled. Infrastructure ships now; enable in env when real Twitter/RSS/Nansen/Dune integrations land.
- [x] [Review][Decision] **Public `/v1/discover` endpoint** → Option (a): page now fetches from `/v1/discover` via `BACKEND_URL` (single source of truth). `apps/web/src/lib/db.ts` deleted (web no longer holds a DB connection). API route adds explicit projection + cache headers + 503 on DB failure. (Auth/rate-limit treated separately — feed is anonymized at write time.)

#### Patch (29)

- [x] [Review][Patch] Use `queue.upsertJobScheduler` instead of deprecated `add(..., {repeat})` for cron — [apps/api/src/queue/bullmq/workers/discover-feed.ts:78](apps/api/src/queue/bullmq/workers/discover-feed.ts#L78)
- [x] [Review][Patch] Dedupe worker/scheduler startup between `.then` and `.catch` branches — [apps/api/src/index.ts:1063](apps/api/src/index.ts#L1063), [apps/api/src/index.ts:1092](apps/api/src/index.ts#L1092)
- [x] [Review][Patch] `createOpenAI({ name: 'openrouter' })` is invalid; `name` is not a recognized option for OpenRouter — use `@ai-sdk/openai-compatible` or set `compatibility: 'compatible'` — [apps/api/src/queue/bullmq/workers/discover-feed.ts:24](apps/api/src/queue/bullmq/workers/discover-feed.ts#L24)
- [x] [Review][Patch] Add `OPENROUTER_API_URL`/`OPENROUTER_API_KEY` to envSchema; remove silent `'dummy_key'` fallback (throw at boot if missing) — [apps/api/src/config.ts](apps/api/src/config.ts), [apps/api/src/queue/bullmq/workers/discover-feed.ts:25](apps/api/src/queue/bullmq/workers/discover-feed.ts#L25)
- [x] [Review][Patch] Wrap insert loop in try/catch + use `db.transaction` so partial failures roll back — [apps/api/src/queue/bullmq/workers/discover-feed.ts:60-69](apps/api/src/queue/bullmq/workers/discover-feed.ts#L60-L69)
- [x] [Review][Patch] Attach `worker.on('error', …)` and `worker.on('failed', …)` handlers — [apps/api/src/queue/bullmq/workers/discover-feed.ts:30](apps/api/src/queue/bullmq/workers/discover-feed.ts#L30)
- [x] [Review][Patch] Remove `as any` on `sources` — let zod-validated shape flow into Drizzle's `$type<…>()` — [apps/api/src/queue/bullmq/workers/discover-feed.ts:67](apps/api/src/queue/bullmq/workers/discover-feed.ts#L67)
- [x] [Review][Patch] Remove `(src: any, ...)` cast in source map — [apps/web/src/app/(dashboard)/discover/page.tsx:71](apps/web/src/app/(dashboard)/discover/page.tsx#L71)
- [x] [Review][Patch] Replace `db.select().from(discoverFeeds)` with explicit column projection so future columns can't leak — [apps/api/src/discover/routes.ts:18-22](apps/api/src/discover/routes.ts#L18-L22)
- [x] [Review][Patch] Web `db` Proxy throws on `typeof prop === 'symbol'` (e.g. `Symbol.iterator`, `then`); guard against introspection so `next build` does not crash when `DATABASE_URL` is absent — [apps/web/src/lib/db.ts:8](apps/web/src/lib/db.ts#L8)
- [x] [Review][Patch] Replace `console.log` with the project `logger` (`apps/api/src/lib/logger.ts`) — [apps/api/src/queue/bullmq/workers/discover-feed.ts:33](apps/api/src/queue/bullmq/workers/discover-feed.ts#L33)
- [x] [Review][Patch] Extract `isWithinLast24Hours` to shared module and import from both page and test — currently the test exercises a literal copy of the function, not the production code — [tests/unit/utils/discover-feed-utils.test.ts:6](tests/unit/utils/discover-feed-utils.test.ts#L6)
- [x] [Review][Patch] Remove silent skip on 401/404 in API integration test — currently a regression that breaks the route or adds auth would PASS CI — [tests/api/discover-feed.spec.ts:23-30](tests/api/discover-feed.spec.ts#L23-L30)
- [x] [Review][Patch] Extend anonymization test beyond literal blacklist (regex for `0x[0-9a-fA-F]{40}`, ENS `*.eth`, IPv4, tx hashes) — [tests/api/discover-feed.spec.ts:81-89](tests/api/discover-feed.spec.ts#L81-L89)
- [x] [Review][Patch] Defensive `new Date(item.timestamp)` cast — Drizzle returns Date but page-level serialization can produce strings, breaking `>` comparison — [apps/web/src/app/(dashboard)/discover/page.tsx:29](apps/web/src/app/(dashboard)/discover/page.tsx#L29)
- [x] [Review][Patch] Guard against empty `object.items` (warn + return; do not silently no-op) — [apps/api/src/queue/bullmq/workers/discover-feed.ts:58](apps/api/src/queue/bullmq/workers/discover-feed.ts#L58)
- [x] [Review][Patch] Slice `item.title` to 500 chars before insert — schema is `varchar(500)`; AI output longer crashes the whole batch — [apps/api/src/queue/bullmq/workers/discover-feed.ts:63](apps/api/src/queue/bullmq/workers/discover-feed.ts#L63)
- [x] [Review][Patch] Whitelist `https://`/`http://` for `src.url` (XSS via AI-generated `javascript:` / `data:` schemes) — [apps/web/src/app/(dashboard)/discover/page.tsx:73](apps/web/src/app/(dashboard)/discover/page.tsx#L73)
- [x] [Review][Patch] Add `rel="noreferrer noopener"` to external source links (tabnabbing) — [apps/web/src/app/(dashboard)/discover/page.tsx:74](apps/web/src/app/(dashboard)/discover/page.tsx#L74)
- [x] [Review][Patch] Module-level `Queue`/`Worker` instantiation forces tests to require Redis; lazy-init or guard with `NODE_ENV !== 'test'` — [apps/api/src/queue/bullmq/workers/discover-feed.ts:12](apps/api/src/queue/bullmq/workers/discover-feed.ts#L12)
- [x] [Review][Patch] Add SIGTERM/SIGINT hooks calling `worker.close()` + `queue.close()` to drain in-flight jobs and release Redis connections — [apps/api/src/index.ts](apps/api/src/index.ts)
- [x] [Review][Patch] Add `redisConnection.on('error', …)` to surface connection failures (currently unhandled) — [apps/api/src/queue/bullmq/connection.ts:4](apps/api/src/queue/bullmq/connection.ts#L4)
- [x] [Review][Patch] Add idempotency for re-runs: hash content (or unique on `title+timestamp`) + `onConflictDoNothing` — without this, hourly retries duplicate every item — [apps/api/src/queue/bullmq/workers/discover-feed.ts:60](apps/api/src/queue/bullmq/workers/discover-feed.ts#L60)
- [x] [Review][Patch] Add `export const dynamic = 'force-dynamic'` to discover page so build does not attempt SSG without DB — [apps/web/src/app/(dashboard)/discover/page.tsx](apps/web/src/app/(dashboard)/discover/page.tsx)
- [x] [Review][Patch] Move `DiscoverFeedItem` type to `packages/shared/src/types/` (AR8: feature addition order DB → Shared types → API → Frontend) — currently duplicated inline in page + test — [apps/web/src/app/(dashboard)/discover/page.tsx:9-17](apps/web/src/app/(dashboard)/discover/page.tsx#L9-L17)
- [x] [Review][Patch] Type `metadata` as `Metadata` from `next` — [apps/web/src/app/(dashboard)/discover/page.tsx:5](apps/web/src/app/(dashboard)/discover/page.tsx#L5)
- [x] [Review][Patch] Remove story-ID reference from production code comment (will rot) — [apps/api/src/discover/routes.ts:15](apps/api/src/discover/routes.ts#L15)
- [x] [Review][Patch] Use stable React key `key={`${item.id}-${idx}`}` for source map — currently `key={idx}` causes reconciliation glitches if sources reorder — [apps/web/src/app/(dashboard)/discover/page.tsx:72](apps/web/src/app/(dashboard)/discover/page.tsx#L72)
- [x] [Review][Patch] Drop dead optional chain `item.sources?.length || 0` (already narrowed by enclosing condition) — [apps/web/src/app/(dashboard)/discover/page.tsx:80](apps/web/src/app/(dashboard)/discover/page.tsx#L80)

#### Deferred → Resolved (6 of 8)

- [x] [Review][Defer→Patch] Boolean partial index `idx_discover_feeds_anomaly` rewritten as partial index `WHERE is_anomaly = true` on `timestamp` — [packages/db/src/schema/epsilon.ts:1023](packages/db/src/schema/epsilon.ts#L1023)
- [x] [Review][Defer→Patch] Pagination via `?offset=N` (clamped 0..1000) + `pagination.nextOffset` in response — [apps/api/src/discover/routes.ts](apps/api/src/discover/routes.ts)
- [x] [Review][Defer→Patch] Daily TTL pruning cron — `cleanup` job at `13 3 * * *` deletes rows older than `DISCOVER_RETENTION_DAYS` (default 30) — [apps/api/src/queue/bullmq/workers/discover-feed.ts](apps/api/src/queue/bullmq/workers/discover-feed.ts)
- [x] [Review][Defer→Patch] TLS Redis: connection auto-enables `tls: {}` when URL begins with `rediss://` — [apps/api/src/queue/bullmq/connection.ts](apps/api/src/queue/bullmq/connection.ts)
- [x] [Review][Defer→Patch] In-tab auto-refresh: page renders `<DiscoverFeedClient>` (client component) using react-query with 5-min `refetchInterval` + `refetchOnWindowFocus` — [apps/web/src/app/(dashboard)/discover/discover-feed-client.tsx](apps/web/src/app/(dashboard)/discover/discover-feed-client.tsx)
- [x] [Review][Defer→Patch] Removed `@ai-sdk/openai` dep (now using `@ai-sdk/openai-compatible` only) — [apps/api/package.json](apps/api/package.json)

#### Deferred — Still Outstanding (2)

- [x] [Review][Defer] Drizzle migration generation `0001_discover_feeds.sql` — requires interactive TTY; run `bunx drizzle-kit generate --name discover_feeds` manually pre-deploy — deferred, tooling constraint
- [x] [Review][Defer] Real `fetchRawNews()` Twitter/RSS/Nansen/Dune integrations — worker feature-flagged off until built — deferred, follow-up story

## Dev Notes

- **Architecture Rules Compliance**: 
  - AR3: Drizzle ORM additive-only migrations — do not rename or drop.
  - AR4: Next.js App Router — `"use client"` only at leaf nodes, prefer server components.
  - AR8: Feature addition sequence: DB schema → Shared types → API route / Worker → Frontend.
- **Previous Work Intelligence**: Story 2.1 set up the foundation for the BullMQ worker. Reuse the same worker architecture and queue management patterns.

### Project Structure Notes

- Database schema updates belong in `packages/db/src/schema/`.
- Worker implementations go to `apps/api/src/queue/bullmq/workers/`.
- The new web page should be in `apps/web/src/app/(dashboard)/discover/`.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story-2.2]
- [Source: _bmad-output/planning-artifacts/architecture.md]

## Dev Agent Record

### Agent Model Used

Antigravity (Gemini)

### Debug Log References

### Completion Notes List

### File List

