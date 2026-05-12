# Story 5.7: Swarm Teams + Web/File Tools (P2+P3) — Remaining VT Capabilities

Status: backlog

**Depends on**: [Story 5.5](5-5-vibe-trading-research-tools-p0.md) done,
[Story 5.6](5-6-shadow-account-trade-journal-ui.md) done.

**Partially blocked**: Swarm Teams require LLM API key management infrastructure not yet built.
Split into P2 (ship now) + P3 (needs prereq).

<!-- Created 2026-05-12 (rewritten by Winston). Final 10 MCP tools + LLM key management.
     Split-shippable: P2 = web/file/swarm-status tools (~ready), P3 = swarm run UI (blocked). -->

## Story

As a Tier 2 analyst trên Chainlens,
I want các Web research tools + File I/O + Multi-agent Swarm teams,
So that tôi có thể research external sources từ chat và chạy pre-built research teams
(Investment Committee, Quant Desk, Crypto Trading Desk, ...).

## Scope Split

### P2 — Ship with Story 5.7 (ready)

7 tools, no blockers:
- `vibe_trading_web_search` — DuckDuckGo search
- `vibe_trading_read_url` — fetch web page as Markdown
- `vibe_trading_read_document` — extract PDF/DOCX/XLSX text
- `vibe_trading_write_file` — file I/O in VT workspace
- `vibe_trading_read_file` — file I/O
- `vibe_trading_list_swarm_presets` — list 29 teams
- `vibe_trading_list_swarm_runs` — list recent runs

### P3 — Deferred to Story 5.8 (separate story)

3 tools, blocked on LLM key management:
- `vibe_trading_run_swarm` — requires user's `OPENAI_API_KEY`
- `vibe_trading_get_swarm_status` — only useful after `run_swarm`
- `vibe_trading_get_swarm_result` — only useful after `run_swarm`

**Blocker**: Swarm teams spawn internal LLM workers. VT needs `OPENAI_API_KEY` + `LANGCHAIN_MODEL_NAME`
env. Chainlens has no user-settings "AI Keys" page, no encrypted-at-rest key storage. Implementing this
is a separate concern (Epic 7 Credit Economy area) — not appropriate to bundle here.

## Acceptance Criteria (P2 only)

### AC1 — VT FastAPI exposes 7 P2 tool endpoints

**Given** Story 5.5/5.6 established HTTP extension pattern
**When** Story 5.7 ships P2
**Then** thêm 7 endpoints vào `Vibe-Trading/agent/api_server.py`:

| Endpoint | MCP tool wrapped |
|---|---|
| `POST /tools/web_search` | `web_search` |
| `POST /tools/read_url` | `read_url` |
| `POST /tools/read_document` | `read_document` |
| `POST /tools/write_file` | `write_file` |
| `POST /tools/read_file` | `read_file` |
| `GET  /swarm/presets` | already exists (line 1794) — no change |
| `GET  /swarm/runs` | already exists (line 1820) — no change |

**And** `write_file` + `read_file` sandboxed to VT's configured workspace dir (verify with VT team
the exact path restriction — probably `/app/agent/sessions/{session_id}/`). Reject paths with
`..`, absolute paths pointing outside workspace, or null bytes.

### AC2 — epsilon-api sub-routes for 7 P2 tools

**Given** Story 5.5/5.6 sub-route pattern
**When** Story 5.7 ships
**Then** thêm sub-routes:

```
POST /v1/router/vibe-trading/web-search
POST /v1/router/vibe-trading/read-url
POST /v1/router/vibe-trading/read-document
POST /v1/router/vibe-trading/write-file
POST /v1/router/vibe-trading/read-file
GET  /v1/router/vibe-trading/swarm/presets
GET  /v1/router/vibe-trading/swarm/runs?limit={N}
```

**And** `read_url` route:
- Validate URL scheme: `http://`, `https://` only
- Block SSRF: reject URLs resolving to `127.0.0.1`, `169.254.169.254` (AWS metadata), Docker internal IPs
- Delegate DNS resolution to VT (which runs in its own container, not sandbox)
- Content-Length cap: 5MB fetched, truncate with warning

**And** `read_document` route:
- Accept only `file_path` within VT workspace (path traversal prevention)
- File size check at route layer: reject >20MB (PDF with OCR can be slow)

**And** `write_file` route:
- Path traversal prevention (normalize + check prefix)
- Content size cap: 1MB per write (prevent filling disk)
- Reject executable extensions `.sh`, `.py`, `.exe` — allow `.json`, `.csv`, `.md`, `.txt`, `.yaml`

### AC3 — 7 OpenCode tools + Tier 2 permissions

**Given** Story 5.5/5.6 tool pattern
**When** Story 5.7 ships
**Then**:

| Tool | Description | Timeout |
|---|---|---|
| `vibe_trading_web_search.ts` | DuckDuckGo search (top N results) | 5s |
| `vibe_trading_read_url.ts` | Fetch web page as Markdown | 10s |
| `vibe_trading_read_document.ts` | Extract PDF/DOCX/XLSX text | 25s |
| `vibe_trading_write_file.ts` | Write file to VT workspace | 3s |
| `vibe_trading_read_file.ts` | Read file from VT workspace | 3s |
| `vibe_trading_list_swarm_presets.ts` | List 29 pre-built teams | 2s |
| `vibe_trading_list_swarm_runs.ts` | List recent swarm runs | 2s |

**And** `chainlens-tier2.md` frontmatter: 7 tools `allow`, 3 P3 tools `deny`
**And** `chainlens-tier1.md`: 10 tools `deny` (Tier 1 has no VT tool access for MVP)

### AC4 — Duplicate tool clarification in agent prompt

**Given** Chainlens already có `web_search` tool (Perplexity/Tavily-backed, see
[tools/web_search.ts](core/epsilon-master/opencode/tools/web_search.ts))
**When** Story 5.7 adds `vibe_trading_web_search` (DuckDuckGo-backed)
**Then** agent system prompt disambiguates:
- Use `web_search` (existing) for general research + crypto news
- Use `vibe_trading_web_search` (new) when need free fallback or DuckDuckGo specifically
- **Default**: prefer `web_search` (higher quality)

**Similarly** `deep_research` vs `vibe_trading_read_url`:
- `deep_research` (existing, Perplexity Sonar) — comprehensive multi-source with citations
- `vibe_trading_read_url` (new) — single URL to Markdown, no synthesis
- Rule: use `deep_research` for complex queries, `vibe_trading_read_url` for known URLs

### AC5 — SSRF + path traversal hardening

**Given** `read_url` + `write_file` + `read_file` touch external/filesystem surfaces
**When** Story 5.7 ships
**Then** hardening tests required:
- `read_url`: reject `http://127.0.0.1/*`, `http://[::1]/*`, `http://169.254.169.254/*`, `file://`,
  `javascript:`, `data:` — return 400 with SSRF error
- `write_file`: reject paths with `..`, absolute paths, paths resolving outside workspace — return 400
- `read_file`: same path validation as write_file
- Each hardening scenario has a test case (≥6 security tests)

### AC6 — Pricing tier

| Tool | baseCost | Rationale |
|---|---|---|
| `vibe_trading_web_search` | $0.01 | DuckDuckGo is free; thin proxy overhead |
| `vibe_trading_read_url` | $0.02 | Network fetch + HTML-to-MD conversion |
| `vibe_trading_read_document` | $0.10 | PDF parsing (OCR fallback can take 25s) |
| `vibe_trading_write_file` | $0.00 | Filesystem only |
| `vibe_trading_read_file` | $0.00 | Filesystem only |
| `vibe_trading_list_swarm_presets` | $0.00 | Static read |
| `vibe_trading_list_swarm_runs` | $0.00 | Static read |

### AC7 — Tests

- Backend service tests: 7 happy + 7 error paths (≥14 tests) — file path
  `apps/api/src/__tests__/unit/vibe-trading-api-client.test.ts` (extend)
- Backend route tests: 7 happy + 7 validation + 7 402 (≥21 tests) — file path
  `apps/api/src/__tests__/unit/vibe-trading-route.test.ts` (extend)
- **Security hardening tests** (≥6 tests, critical): new file
  `apps/api/src/__tests__/unit/url-guard.test.ts`:
  - Reject `http://127.0.0.1/*` → 400
  - Reject `http://[::1]/*` → 400
  - Reject `http://169.254.169.254/*` (AWS metadata) → 400
  - Reject `file://` / `javascript:` / `data:` → 400
  - Reject hostname that resolves to blocked IP (DNS rebinding) → 400
  - Accept public HTTPS URL → pass
- **Path guard tests** (≥4 tests): new file
  `apps/api/src/__tests__/unit/path-guard.test.ts`:
  - Reject `../../../etc/passwd` → 400
  - Reject absolute path `/etc/passwd` → 400
  - Reject path with null bytes → 400
  - Accept valid relative path within workspace → pass
- OpenCode tool tests: per-tool happy + 1 error (≥14 tests)
- VT integration tests (gated): `test_p2_tool_endpoints.py` (≥7 tests)

## Product Decisions (outside story scope)

**Decision deferred — revisit after Story 5.7 ships:** Should `vibe_trading_web_search` be
Tier 1 accessible (free fallback) if Perplexity/Tavily budget exhausted? Currently Tier 2-only
for MVP. Re-evaluate if `web_search` budget issues arise. This is a pricing/business decision,
not an engineering one — owner: product team.

## Tasks / Subtasks

### Task 1 — VT FastAPI: 5 new endpoints (AC1)

- [ ] Edit `Vibe-Trading/agent/api_server.py`:
  - Thêm 5 endpoints `/tools/web_search`, `/tools/read_url`, `/tools/read_document`, `/tools/write_file`, `/tools/read_file`
  - Pydantic models mirror MCP signatures
  - `write_file` / `read_file`: validate path within configured workspace dir — coordinate với VT team
    về exact dir (likely `/app/agent/sessions/{session_id}/` or similar)

### Task 2 — Backend service + routes (AC2, AC5)

- [ ] Extend service layer + routes
- [ ] **SSRF guard** — create `apps/api/src/router/services/url-guard.ts`:
  - Allow-list schemes: `http://`, `https://`
  - Block-list IPs: `127.0.0.0/8`, `::1`, `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`,
    `169.254.0.0/16`, `fc00::/7`
  - Resolve DNS at service layer (Bun `Bun.dns.resolve`) and verify resolved IPs not in block-list
  - Reject if any resolved IP is blocked — return 400 "URL resolves to blocked IP range"
  - Unit tests for all 4 block-list categories

- [ ] **Path guard** — create `apps/api/src/router/services/path-guard.ts`:
  - Normalize path via `path.normalize()` (Bun)
  - Reject if normalized path starts with `/` or `\`, contains `..`, or resolves outside workspace prefix
  - Workspace prefix configurable via `VIBE_TRADING_WORKSPACE_PATH` env (default `/app/agent/sessions`)
  - Unit tests for traversal attempts

### Task 3 — 7 OpenCode tools (AC3)

- [ ] Create tool files theo Story 5.5 pattern

### Task 4 — Agent prompt disambiguation (AC4)

- [ ] Update `core/epsilon-master/opencode/agents/chainlens-tier2.md` **frontmatter** (permission block):
  - Add 7 P2 tools with `allow`
  - Add 3 P3 tools with `deny` (explicit)
- [ ] Update `core/epsilon-master/opencode/agents/chainlens-tier2.md` **system prompt body**:
  - Add "Web Research — tool selection" section:
    - Rule: `web_search` default (Perplexity/Tavily, higher quality), `vibe_trading_web_search` fallback (DuckDuckGo, free)
    - Rule: `deep_research` for complex multi-source synthesis, `vibe_trading_read_url` for single known URL
    - Rule: `vibe_trading_read_document` for PDF/DOCX/XLSX (existing tools cannot handle)
  - Add section for file tools explaining workspace sandboxing
- [ ] Update `core/epsilon-master/opencode/agents/chainlens-tier1.md` frontmatter:
  - Add all 10 VT P2+P3 tools with `deny`

### Task 5 — Pricing (AC6)

- [ ] Edit `apps/api/src/config.ts` TOOL_PRICING — add 7 entries

### Task 6 — Tests (AC8)

- [ ] Unit + integration tests including security hardening (AC5)

### Task 7 — Documentation

- [ ] Update `core/epsilon-master/opencode/tools/README.md`
- [ ] Update [deferred-work.md] với P3 blockers:
  - "Swarm Teams UI (run_swarm, get_swarm_status, get_swarm_result) requires Story 5.8 (LLM Key
    Management). Blocked on user-settings encrypted key storage infrastructure."

## Dev Notes

### SSRF guard implementation

```ts
// apps/api/src/router/services/url-guard.ts
const BLOCKED_CIDRS = [
  '127.0.0.0/8', '::1/128',
  '10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16',
  '169.254.0.0/16', 'fc00::/7', '::ffff:0:0/96',
];

export async function assertUrlAllowed(url: string): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new HTTPException(400, { message: 'Invalid URL' });
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new HTTPException(400, { message: 'Only http/https allowed' });
  }

  // Resolve hostname and check each resolved IP against block-list
  const ips = await Bun.dns.resolve(parsed.hostname, 'A').catch(() => [] as string[]);
  const ip6s = await Bun.dns.resolve(parsed.hostname, 'AAAA').catch(() => [] as string[]);
  const all = [...ips, ...ip6s];
  if (all.length === 0) {
    throw new HTTPException(400, { message: 'DNS resolution failed' });
  }
  for (const ip of all) {
    if (isInBlockedCidr(ip, BLOCKED_CIDRS)) {
      throw new HTTPException(400, { message: `URL resolves to blocked IP range: ${ip}` });
    }
  }
}
```

### Story 5.8 preview (P3 — LLM Key Management)

Future story to unblock swarm `run_swarm`:
- User Settings page `/dashboard/settings/ai-keys`
- Encrypted storage via libsodium (npm `libsodium-wrappers`) + DB column `user_ai_keys.encrypted_key`
- Key injection into sandbox env at session spawn (like `VIBE_TRADING_API_KEY` today)
- UI: masked input, "Test Connection" button, rotation workflow
- Key types: `OPENAI_API_KEY`, `LANGCHAIN_MODEL_NAME`, future: `ANTHROPIC_API_KEY`

Out of scope for 5.7. Cross-link in epics.md.

### Source Tree Components to Touch

**NEW files:**
- 7 OpenCode tool files in `core/epsilon-master/opencode/tools/`
- `apps/api/src/router/services/url-guard.ts`
- `apps/api/src/router/services/path-guard.ts`
- `apps/api/src/__tests__/unit/url-guard.test.ts`
- `apps/api/src/__tests__/unit/path-guard.test.ts`
- `Vibe-Trading/agent/tests/test_p2_tool_endpoints.py`

**Modified files:**
- `Vibe-Trading/agent/api_server.py` — +5 endpoints
- `apps/api/src/router/services/vibe-trading.ts` — +7 fetch functions
- `apps/api/src/router/routes/vibe-trading.ts` — +7 sub-routes
- `apps/api/src/config.ts` — +7 TOOL_PRICING entries
- `apps/api/src/__tests__/unit/vibe-trading-*.test.ts` — extend
- `core/epsilon-master/opencode/agents/chainlens-tier1.md` — +10 deny (P2 + P3)
- `core/epsilon-master/opencode/agents/chainlens-tier2.md` — +7 allow (P2) + 3 deny (P3) + system prompt
- `core/epsilon-master/opencode/tools/README.md`

### References

- [Story 5.5](5-5-vibe-trading-research-tools-p0.md)
- [Story 5.6](5-6-shadow-account-trade-journal-ui.md)
- [Story 5.8] — LLM Key Management (to be created post 5.7 merge)
- [VT MCP server](Vibe-Trading/agent/mcp_server.py) — tool signatures
- [existing web_search](core/epsilon-master/opencode/tools/web_search.ts)
- [existing deep_research](core/epsilon-master/opencode/tools/deep_research.ts)
