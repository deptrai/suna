# Story 9.3: Implement Shared Pool routing for Tier 1 users

Status: ready-for-dev

## Story

As a MMOMarket Free Tier Buyer,
I want my cloned agent to be provisioned instantly in a Shared Pool sandbox,
so that I can start using the agent without waiting for a cold start and Chainlens can save infrastructure costs.

## Acceptance Criteria

1. API Key integration for MMOMarket is used instead of OAuth2.
2. Sandbox provisioning checks the user's tier.
3. If user tier is 'free' (Tier 1), the system bypasses creating a new Daytona sandbox and instead returns a hardcoded ID (e.g., `global-tier1-sandbox-01`).
4. If user tier is not 'free' (Tier 2/Premium), the system calls Daytona API to spin up a new isolated sandbox as normal.
5. In `epsilon-master` (agent runtime), the `execute_bash`, `run_python`, and other dangerous filesystem tools are disabled if the tier is 'free'.
6. Free tier agents read their RAG context and config directly from the DB/API instead of writing to the local `.epsilon-data/` filesystem.

## Tasks / Subtasks

- [ ] Task 1: Update Daytona Provider Provisioning (AC: 2, 3, 4)
  - [ ] Fetch user tier from database in `DaytonaProvider.create()` in `apps/api/src/platform/providers/daytona.ts`.
  - [ ] If 'free', return static/shared Sandbox ID without calling `daytona.create()`.
- [ ] Task 2: Secure Epsilon Master Tool Access (AC: 5)
  - [ ] Modify `epsilon-master` to check user tier from the connection payload.
  - [ ] Disable `execute_bash`, `run_python`, and file system writes for 'free' tier.
- [ ] Task 3: Data Isolation for Shared Pool (AC: 6)
  - [ ] Ensure RAG data and configuration reading defaults to DB/API for 'free' tier rather than assuming access to a dedicated `.epsilon-data/` filesystem.

## Dev Notes

- Relevant architecture patterns and constraints:
  - **Shared Pool (Tier 1)**: Agents must not execute arbitrary code or write to the shared filesystem to prevent noisy neighbor and security risks.
  - **Premium (Tier 2)**: Retains existing Daytona sandbox creation logic.
- Source tree components to touch:
  - `apps/api/src/platform/providers/daytona.ts`
  - `core/epsilon-master/` (tools registration and initialization)
- Testing standards summary:
  - Ensure the fallback logic behaves deterministically and does not break existing premium sandbox provisioning.

### Project Structure Notes

- Alignment with unified project structure: `apps/api/` handles the routing and business logic, while `core/epsilon-master/` runs the agent and tools. 

### References

- [Source: docs/chainlens-mmomarket-integration-architect.md#4.2 Provisioning Logic (Tier-Aware)]
- [Source: docs/mmomarket-3rd-party-api-prd-epics.md]
