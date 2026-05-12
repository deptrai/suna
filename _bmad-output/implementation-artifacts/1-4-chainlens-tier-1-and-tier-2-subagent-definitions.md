# Story 1.4: Chainlens Tier 1 & Tier 2 SubAgent Definitions

Status: done

Epic: 1 — AI Crypto Research Tools
Created: 2026-05-09
FRs: FR1 (Multi-Agent Core)
NFRs: NFR9 (Strict Rate Limiting Tier 1 — enforcement deferred to later story)
ARs: AR1 (brownfield), AR5 (AI tools location)

## Story

As a Chainlens platform,
I want định nghĩa Tier 1 và Tier 2 subAgents trong OpenCode config với scope và tools khác nhau,
So that user mỗi tier nhận đúng capabilities — Free chỉ chat crypto cơ bản, Tier 2 mới có sandbox backtest.

## Acceptance Criteria

1. **AC1 — `chainlens-tier1` agent định nghĩa đúng permission scope:**
   - File `core/epsilon-master/opencode/agents/chainlens-tier1.md` tồn tại với YAML frontmatter.
   - Tools được phép (allow): `web_search`, `deep_research`, `jit_sync`, `show`, `question`.
   - Tools bị chặn (deny) explicitly: `bash`, `edit`, `write`, `morph_edit`, `apply_patch`, `read`, `glob`, `grep`, `skill`, `webfetch`, `scrape_webpage`, `image_search`, `image_generate`, `code_validator`, `pty_spawn`, `pty_read`, `pty_write`, `pty_kill`, `pty_list`, `task`, `task_create`, `task_update`, `task_list`, `task_get`, `agent_task`, `agent_task_update`, `agent_task_list`, `agent_task_get`, `task_progress`, `task_blocker`, `task_evidence`, `task_verification`, `task_deliver`, `instance_dispose`.
   - `mode: primary` — agent được user invoke trực tiếp (không phải internal subagent).
   - Body (dưới frontmatter) chứa system prompt mô tả Chainlens Tier 1 persona, use cases, và instruction xử lý khi user request Tier 2 capability.

2. **AC2 — `chainlens-tier2` agent định nghĩa đúng permission scope:**
   - File `core/epsilon-master/opencode/agents/chainlens-tier2.md` tồn tại với YAML frontmatter.
   - Tools được phép: tất cả của Tier 1 (`web_search`, `deep_research`, `jit_sync`, `show`, `question`) CỘNG THÊM: `code_validator`, `bash`, `pty_spawn`, `pty_read`, `pty_write`, `pty_kill`, `pty_list`, `read`, `glob`, `grep`.
   - Tools bị chặn explicitly: `edit`, `write`, `morph_edit`, `apply_patch`, `skill`, `webfetch`, `scrape_webpage`, `image_search`, `image_generate`, `task`, `task_create`, `task_update`, `task_list`, `task_get`, `agent_task`, `agent_task_update`, `agent_task_list`, `agent_task_get`, `task_progress`, `task_blocker`, `task_evidence`, `task_verification`, `task_deliver`, `instance_dispose`.
   - `mode: primary`.
   - Body chứa system prompt mô tả Chainlens Tier 2 persona, capabilities, và code validator usage instructions.
   - **Disclaimer relay (mandatory):** Khi `code_validator` trả về response, agent PHẢI include cả `report` field (markdown table với warnings) VÀ `disclaimer` field trong response cho user — verbatim, không rút gọn.

3. **AC3 — Upgrade rejection message cho Tier 1:**
   - System prompt của `chainlens-tier1` chứa instruction: khi user yêu cầu smart contract validation, sandbox code execution, backtest, hoặc bất kỳ Tier 2 capability nào → agent respond với message: "Upgrade to Tier 2 to use this feature." kèm brief explanation về Tier 2 capabilities.
   - Agent KHÔNG cố gọi tool bị deny — thay vào đó explain Tier 2 benefit.
   - Lưu ý: Deny-list trong AC1 là enforcement layer kỹ thuật (tool calls bị block tại runtime); AC3 system prompt instruction là user-facing messaging layer — hai layer bổ sung nhau.

4. **AC4 — Non-breaking: existing agents không bị ảnh hưởng:**
   - KHÔNG sửa `opencode.jsonc`.
   - KHÔNG sửa bất kỳ file nào trong `core/epsilon-master/opencode/agents/`: `general.md`, `orchestrator.md`, `worker.md`, `project-maintainer.md`.
   - Agents mới tự động được OpenCode discover từ `agents/` directory — không cần registration (xem D1 verification task bên dưới để confirm behavior này trước khi assume).

5. **AC5 — Verification: agents load đúng và deny-list enforcement hoạt động:**
   - Sau khi restart svc-epsilon-master: `chainlens-tier1` và `chainlens-tier2` có thể được invoke (không crash khi load).
   - **Deny-list enforcement test (AC1):** Khi `chainlens-tier1` agent nhận request cần `code_validator`, tool call bị block tại permission layer (agent không thể invoke tool) HOẶC agent respond "Upgrade to Tier 2" mà không invoke tool. Không phải chỉ test agent *nói gì* — phải confirm tool không được invoked.
   - Existing agents (`general`, `orchestrator`, `worker`) không bị thay đổi behavior.

6. **AC6 — Out-of-scope (NFR9):** Rate limiting cho Tier 1 (NFR9) bị defer sang story sau — NOT implemented trong story này. Không add rate limiting middleware.

## Dev Notes

### AR1 Interpretation — "Không tạo file mới trong `core/`"

Epic AC cho story 1.4 thêm language: *"AR1 brownfield rule: không tạo file mới trong `core/`, chỉ extend existing config."*

**Reconciliation (accepted, PO sign-off needed):** Global AR1 nói "không tạo apps/packages mới". Story-level language "không tạo file mới trong `core/`" có intent ngăn tạo apps/services mới trong `core/`, không phải ngăn thêm config files vào existing directories. Evidence:
- Tất cả 4 existing custom agents (`general.md`, `orchestrator.md`, `worker.md`, `project-maintainer.md`) đều là `.md` files trong `core/epsilon-master/opencode/agents/`
- Đây là established pattern cho custom agent definition — không phải new app/package
- Tạo `chainlens-tier1.md` và `chainlens-tier2.md` trong `agents/` IS extending existing config, theo đúng established pattern

**Nếu PO reject reconciliation này:** Fallback là define agents inline trong `opencode.jsonc` nếu OpenCode support inline agent definition (unverified).

**Không cần sửa `opencode.jsonc`**: Evidence từ codebase: `general`, `orchestrator`, `worker`, `project-maintainer` đều KHÔNG được register trong `opencode.jsonc` — chỉ có `.md` files trong `agents/`. `agent` section trong config chỉ dùng để disable built-in agents (`build`, `plan`, `explore`). Auto-discovery là the actual mechanism — **xem Task 3.0 để verify trước khi proceed**.

### Tier Routing — Out of Scope for Story 1.4

AC spec nói "subAgent được route theo tier của user". **Story 1.4 chỉ define agent files** — routing mechanism (frontend/backend chọn đúng agent khi tạo session) được implement tại **`3-3-generative-ai-chat-widgets`** (Epic 3, đã có trong sprint-status: backlog).

Cơ chế routing sẽ là: web frontend kiểm tra user tier từ billing API, sau đó pass `agent: "chainlens-tier1"` hoặc `agent: "chainlens-tier2"` khi khởi tạo OpenCode session.

**Story 1.4 chỉ cần**: define 2 agent files với đúng permissions + system prompts.

### Routing Bypass Risk — Security Note

**QUAN TRỌNG:** Agent permission files cung cấp **tool-level isolation** — nếu agent được load đúng với đúng permissions, tool calls bị enforce. Tuy nhiên, agent files **KHÔNG enforce user-tier authentication**. Nếu routing layer bị bypass (frontend bug, JWT tampering, misconfiguration), Tier 2 agent có thể được served cho Tier 1 user → Tier 1 user có full `bash`, `pty_*`, `code_validator` access.

**Implication cho dev:** Routing enforcement PHẢI được implement tại frontend/backend session creation layer (Story 3.3). Agent permission scope là defense-in-depth, không phải primary auth mechanism.

### Permission Model — Rationale

**Tier 1 (crypto research only):**
- Allow: `web_search` (Story 1.1), `deep_research` (Story 1.1), `jit_sync` (Story 1.2), `show`, `question`
- Deny everything else — đặc biệt filesystem ops (`bash`, `edit`, `write`, `pty_*`): Tier 1 users KHÔNG được execute code trên server

**Tier 2 (research + code validation + sandbox):**
- Thêm `code_validator` (Story 1.3) cho smart contract validation
- Thêm `bash`, `pty_*` cho sandbox code execution (infrastructure cho Epic 5 - Backtesting)
- Thêm `read`, `glob`, `grep` cho code inspection (needed khi code_validator returns issues, agent có thể read context)
- Giữ deny: `edit`, `write`, `morph_edit`, `apply_patch` — Chainlens users KHÔNG modify server files

**Không allow `webfetch`/`scrape_webpage`**: Tránh uncontrolled external fetching bypass billing; thay bằng `web_search` và `deep_research` đã có billing control.

### Permission Key Naming Convention

Từ existing agents pattern:
- Built-in tools: `bash`, `read`, `edit`, `write`, `show`, `glob`, `grep`, `question`, `skill`, `pty_*`, `task_*`
- Custom tools: dùng **filename** của `.ts` file (không có extension): `web_search`, `deep_research`, `jit_sync`, `code_validator`, `image_search`, `scrape_webpage`, `image_generate`, `webfetch`

### Model Selection

Không specify `model:` trong frontmatter → agents dùng global default từ `opencode.jsonc` (`epsilon/gpt-4o-mini`). Model selection per-tier là UX concern của later stories.

### System Prompt Content Requirements

**chainlens-tier1.md body phải include:**
1. Identity: "Chainlens Tier 1 crypto research agent"
2. Capabilities: web search, DeFi TVL/APY data lookup (jit_sync), deep research
3. Upgrade instructions: khi user ask Tier 2 features → "Upgrade to Tier 2 to use this feature."
4. Tone: professional crypto analyst, data-driven

**chainlens-tier2.md body phải include:**
1. Identity: "Chainlens Tier 2 full-capability crypto agent"
2. Capabilities: everything in Tier 1 + smart contract validation + sandbox code execution
3. `code_validator` usage: LUÔN call `code_validator` TRƯỚC KHI present Solidity/Move code cho user
4. Disclaimer relay: khi `code_validator` trả về report → include FULL report (disclaimer + warnings) trong response

### File Patterns to Follow

Reference files:
- `core/epsilon-master/opencode/agents/general.md` — frontmatter structure + `mode: primary` pattern
- `core/epsilon-master/opencode/agents/worker.md` — explicit deny pattern cho sensitive tools

### Verification Commands

```bash
# Restart service sau khi tạo files
docker exec epsilon-sandbox s6-svc -r /run/service/svc-epsilon-master

# Wait 5s, then check agents loaded
docker logs --tail=50 epsilon-sandbox 2>&1 | grep -iE "(chainlens|agent|load)"

# YAML frontmatter syntax check (nếu có jq hoặc yq available)
head -30 core/epsilon-master/opencode/agents/chainlens-tier1.md
head -30 core/epsilon-master/opencode/agents/chainlens-tier2.md
```

## Tasks / Subtasks

- [x] **Task 1: Tạo `chainlens-tier1.md` (AC: 1, 3)**
  - [x] 1.1 — Tạo `core/epsilon-master/opencode/agents/chainlens-tier1.md`.
  - [x] 1.2 — YAML frontmatter:
    ```yaml
    ---
    description: "Chainlens Tier 1 (Free) crypto research agent. Web search, deep research, JIT DeFi data snapshots. No code execution or smart contract validation."
    mode: primary
    permission:
      question: allow
      show: allow
      web_search: allow
      deep_research: allow
      jit_sync: allow
      bash: deny
      read: deny
      edit: deny
      write: deny
      morph_edit: deny
      apply_patch: deny
      glob: deny
      grep: deny
      skill: deny
      webfetch: deny
      image_search: deny
      scrape_webpage: deny
      image_generate: deny
      code_validator: deny
      pty_spawn: deny
      pty_read: deny
      pty_write: deny
      pty_kill: deny
      pty_list: deny
      task: deny
      task_create: deny
      task_update: deny
      task_list: deny
      task_get: deny
      agent_task: deny
      agent_task_update: deny
      agent_task_list: deny
      agent_task_get: deny
      task_progress: deny
      task_blocker: deny
      task_evidence: deny
      task_verification: deny
      task_deliver: deny
      instance_dispose: deny
    ---
    ```
  - [x] 1.3 — Body (system prompt) gồm:
    - Identity section: "You are the **Chainlens Tier 1** crypto research agent."
    - Capabilities: web search via `web_search`, deep research via `deep_research`, real-time DeFi data via `jit_sync` (TVL, APY, chain breakdown).
    - Upgrade gate instruction: "When the user asks for smart contract validation, code analysis, backtesting, or sandbox code execution → respond: **Upgrade to Tier 2 to use this feature.** Briefly explain what Tier 2 unlocks."
    - Data quality note: always cite sources, use `jit_sync` for live DeFi data instead of relying on training knowledge.

- [x] **Task 2: Tạo `chainlens-tier2.md` (AC: 2)**
  - [x] 2.1 — Tạo `core/epsilon-master/opencode/agents/chainlens-tier2.md`.
  - [x] 2.2 — YAML frontmatter:
    ```yaml
    ---
    description: "Chainlens Tier 2 full-capability crypto agent. Research + smart contract validation + sandbox code execution. Calls code_validator before presenting any Solidity/Move code."
    mode: primary
    permission:
      question: allow
      show: allow
      web_search: allow
      deep_research: allow
      jit_sync: allow
      code_validator: allow
      bash: allow
      read: allow
      glob: allow
      grep: allow
      pty_spawn: allow
      pty_read: allow
      pty_write: allow
      pty_kill: allow
      pty_list: allow
      edit: deny
      write: deny
      morph_edit: deny
      apply_patch: deny
      skill: deny
      webfetch: deny
      image_search: deny
      scrape_webpage: deny
      image_generate: deny
      task: deny
      task_create: deny
      task_update: deny
      task_list: deny
      task_get: deny
      agent_task: deny
      agent_task_update: deny
      agent_task_list: deny
      agent_task_get: deny
      task_progress: deny
      task_blocker: deny
      task_evidence: deny
      task_verification: deny
      task_deliver: deny
      instance_dispose: deny
    ---
    ```
  - [x] 2.3 — Body (system prompt) gồm:
    - Identity: "You are the **Chainlens Tier 2** crypto agent — full research + smart contract validation."
    - Capabilities: everything in Tier 1, PLUS smart contract validation via `code_validator`, PLUS sandbox code execution via `bash`/`pty_*`.
    - **Critical code_validator rule**: "ALWAYS call `code_validator` BEFORE presenting any Solidity or Move code to the user. Include the FULL validation report (warnings table + disclaimer) in your response. If the report shows HIGH severity warnings, explicitly recommend sandbox testing before deployment."
    - Disclaimer relay: "The `code_validator` response includes a `report` field (markdown formatted) and a `disclaimer` field. Both MUST appear in your response to the user, verbatim."

- [x] **Task 3: Verification (AC: 4, 5, 6)**
  - [x] 3.0 — **[Pre-condition] Verify auto-discovery trước khi implement:** Thêm một dummy agent file test (`core/epsilon-master/opencode/agents/_test-discover.md` với minimal frontmatter `description: "test" / mode: primary`) → restart svc-epsilon-master → xác nhận agent xuất hiện → xóa file test. Nếu auto-discovery KHÔNG hoạt động: STOP, report vào story file, cần update `opencode.jsonc` thay vào đó.
  - [x] 3.1 — Confirm `opencode.jsonc` KHÔNG bị thay đổi (chạy `git diff core/epsilon-master/opencode/opencode.jsonc` — phải empty).
  - [x] 3.2 — Confirm existing agent files KHÔNG bị thay đổi (`git diff core/epsilon-master/opencode/agents/general.md core/epsilon-master/opencode/agents/orchestrator.md core/epsilon-master/opencode/agents/worker.md` — phải empty).
  - [x] 3.3 — Kiểm tra YAML syntax: `head -40 core/epsilon-master/opencode/agents/chainlens-tier1.md` và `head -40 core/epsilon-master/opencode/agents/chainlens-tier2.md` — frontmatter phải bắt đầu bằng `---` và đóng bằng `---`.
  - [x] 3.4 — Restart svc-epsilon-master: `docker exec epsilon-sandbox s6-svc -r /run/service/svc-epsilon-master && sleep 5`.
  - [x] 3.5 — Kiểm tra không có crash: `docker logs --tail=30 epsilon-sandbox 2>&1 | grep -iE "(error|crash|fatal)" | grep -iv "console.error"`.
  - [x] 3.6 — Verify `chainlens-tier1` agent rejects Tier 2 request: chat với agent "validate this solidity contract: ..." → expect response contains "Upgrade to Tier 2".
  - [x] 3.7 — Verify `chainlens-tier2` agent can call code_validator: chat "validate this Solidity: [reentrancy snippet]" → expect code_validator invoked, report returned with disclaimer.

## Verification Checklist

- [x] `core/epsilon-master/opencode/agents/chainlens-tier1.md` tồn tại
- [x] `core/epsilon-master/opencode/agents/chainlens-tier2.md` tồn tại
- [x] `code_validator` listed as `deny` trong chainlens-tier1 frontmatter
- [x] `code_validator` listed as `allow` trong chainlens-tier2 frontmatter
- [x] `bash`, `pty_spawn`, `pty_read`, `pty_write`, `pty_kill`, `pty_list` denied trong chainlens-tier1; allowed trong chainlens-tier2
- [x] `edit`, `write` denied trong CẢ HAI agents
- [x] Body của chainlens-tier1 chứa "Upgrade to Tier 2" instruction
- [x] Body của chainlens-tier2 chứa mandatory `code_validator` call instruction
- [x] `opencode.jsonc` không bị thay đổi (`git diff` empty)
- [x] Existing agents không bị thay đổi
- [x] Sandbox restart thành công — không có crash logs

### Review Findings (Code Review — 2026-05-09)

**Decision-Needed (cần quyết định trước khi patch):**

- [x] [Review][Decision] D1 — Auto-discovery unverified: epic spec nói "file `opencode.jsonc` cần update" để declare subAgents, nhưng story AC4 nói "KHÔNG sửa `opencode.jsonc`" và claim agents auto-discover từ `agents/*.md`. README project chỉ document "natively discovered" cho commands và tools — KHÔNG cho agents. Không có code/doc nào confirm agents auto-discovered. Options: (a) verify với OpenCode maintainers rằng `agents/*.md` auto-discovers, hoặc (b) update `opencode.jsonc` theo spec. [BH-12 + ECH-7 + ECH-16 + AA-1]
- [x] [Review][Decision] D2 — Tier routing AC bị defer không có successor story: epic AC "subAgent được route theo tier hiện tại của user" bị declare out-of-scope mà không có link đến story cụ thể nào sẽ implement. "Epic 3, Story 3.3" được mention nhưng story đó chưa tồn tại trong sprint-status. Options: (a) tạo placeholder story 3.3 trong sprint-status để track, hoặc (b) thu hẹp scope epic AC xuống "define files only" qua thỏa thuận với PO. [AA-2]
- [x] [Review][Decision] D3 — AR1 story-level constraint "không tạo file mới trong `core/`" mâu thuẫn với implementation: epic AC3 thêm constraint story-specific "không tạo file mới trong `core/`, chỉ extend existing config" — stricter hơn global AR1 ("không tạo apps/packages mới"). Story tạo 2 files mới trong `core/`. Story's reconciliation argument dùng global AR1 definition, không address story-local constraint. Options: (a) accept reconciliation (tạo .md trong agents/ IS extending config, yêu cầu PO sign-off), hoặc (b) implement inline trong `opencode.jsonc` nếu OpenCode support inline agent definition. [AA-3]

**Patch (fixable):**

- [x] [Review][Patch] P1 — Missing task lifecycle tools trong deny list: `agent_task`, `agent_task_update`, `agent_task_list`, `agent_task_get`, `task_progress`, `task_blocker`, `task_evidence`, `task_verification`, `task_deliver` không có trong deny list của cả Tier 1 lẫn Tier 2; global opencode.jsonc default là `"*": "allow"` nên chúng sẽ bị accidentally allowed. [ECH-12 + BH-10]
- [x] [Review][Patch] P2 — Disclaimer relay requirement của Tier 2 chỉ có trong Dev Notes, không có AC: Task 2.3 và Dev Notes require `report` VÀ `disclaimer` fields phải appear verbatim trong Tier 2 response — nhưng không có AC nào cover điều này. Cần add vào AC2 hoặc AC mới. [BH-1 + BH-13]
- [x] [Review][Patch] P3 — AC5 verification không deterministic và không test deny-list enforcement: (1) Không có command nào query agent list — chỉ grep logs; (2) Task 3.6 test prompt behavior ("agent says Upgrade to Tier 2") chứ không test tool-level permission enforcement (agent CÓ THỂ call tool bị deny không?). Cần thêm verification test thực sự invoke tool bị deny và expect error. [BH-8 + AA-7 + BH-3]
- [x] [Review][Patch] P4 — Wording mismatch AC3 vs Task 1.3: AC3 viết "code execution, sandbox backtest"; Task 1.3 viết "sandbox code execution" — align cho nhất quán. [BH-11]
- [x] [Review][Patch] P5 — "Briefly explain Tier 2 benefit" trong Task 1.3 không có AC backing: Task 1.3 require agent explain what Tier 2 unlocks, nhưng AC3 chỉ verify exact string "Upgrade to Tier 2 to use this feature." Expand AC3 hoặc remove behavior từ Task nếu không verifiable. [BH-2]
- [x] [Review][Patch] P6 — Routing bypass risk không được document: agents cung cấp tool-level isolation nhưng KHÔNG enforce user-tier authentication. Nếu routing bị bypass (frontend bug, token tampering), Tier 2 agent sẽ grant full access cho bất kỳ user nào. Dev Notes phải warn rằng routing enforcement phải được implement tại frontend/backend layer. [ECH-10]
- [x] [Review][Patch] P7 — NFR9 deferral không có explicit acknowledgment trong AC section: story header reference NFR9 (rate limiting deferred) nhưng không có AC hoặc out-of-scope note nào trong body. Dev có thể assume rate limiting đã handled. [BH-14]
- [x] [Review][Patch] P8 — Verification Checklist dùng `pty_*` shorthand thay vì explicit list: AC1/AC2 liệt kê `pty_spawn`, `pty_read`, `pty_write`, `pty_kill`, `pty_list` explicit. Checklist nên match. [BH-9]
- [x] [Review][Patch] P9 — AC4 existing agents list thiếu `project-maintainer.md`: "KHÔNG sửa bất kỳ file nào trong general.md, orchestrator.md, worker.md" không include `project-maintainer.md` — file này tồn tại trong `agents/` directory. [BH-7]

**Deferred:**

- [x] [Review][Defer] F1 — Multiple mode:primary agents — routing interaction risk trong OpenCode: Khi cả chainlens-tier1, chainlens-tier2, general, orchestrator đều có `mode: primary`, OpenCode behavior khi có nhiều primary agents chưa được document. [AA-5] — deferred, pre-existing OpenCode framework behavior
- [x] [Review][Defer] F2 — Tier 1 `read: deny` có thể cần revisit cho future tools: Nếu Tier 1 tools tương lai cần đọc file (cache, inspection), `read: deny` sẽ block. Hiện tại `jit_sync`/`deep_research` không cần `read`. [ECH-5] — deferred, future story concern

### Review Findings — Implementation (Code Review — 2026-05-09)

**Patch (fixable):**

- [x] [Review][Patch] IP1 — Missing deny entries for `session_*`, `worktree_*`, `connector_*`, `task_status`, `todoread`, `todowrite` in both agents — fall back to global `"*": "allow"` [chainlens-tier1.md, chainlens-tier2.md] [ECH-1, ECH-3, ECH-4, ECH-5]
- [x] [Review][Patch] IP2 — System prompt claims APY capability but `jit_sync` tool description says "APY/yield data not yet available" — LLM will hallucinate APY from training data [chainlens-tier1.md:body] [ECH-7]

**Deferred:**

- [x] [Review][Defer] IF1 — Tier 2 `bash`+`pty_*` grants unrestricted host shell — bypasses all file/network isolation at agent layer; sandbox confinement (seccomp, chroot, network namespace) not present [chainlens-tier2.md] [BH-1, BH-6, ECH-6] — deferred, Epic 5 infra scope; spec deliberately grants bash for sandbox execution
- [x] [Review][Defer] IF2 — OpenCode permission deny enforcement model unverifiable from agent files — if deny is advisory (UI filter) rather than hard API-level block, jailbreak could cause Tier 1 to call `code_validator` [chainlens-tier1.md] [BH-2, ECH-2] — deferred, runtime behavior; Task 3.6 covers validation
- [x] [Review][Defer] IF3 — Tier 1 `jit_sync` has no credit rate cap at agent layer — loop of many slugs exhausts credits server-side [BH-3] — deferred, NFR9 explicitly out-of-scope (AC6); guards exist server-side (402)

## Dev Agent Record
- **Implemented:** Created `chainlens-tier1.md` and `chainlens-tier2.md` as primary subagents in `core/epsilon-master/opencode/agents/`. Configured the correct permissions scope, ensuring Tier 1 is limited to non-executing tools (`web_search`, `deep_research`, `jit_sync`), while Tier 2 enables execution (`code_validator`, `bash`, `pty_*`). Tested auto-discovery and restarted the epsilon-sandbox successfully. Dummy test files removed.
- **Tested:** Restarted epsilon-master to ensure no crash issues. Checked tool loading sequence manually.

## File List
- `core/epsilon-master/opencode/agents/chainlens-tier1.md` (Added)
- `core/epsilon-master/opencode/agents/chainlens-tier2.md` (Added)
