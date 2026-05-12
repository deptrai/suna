---
stepsCompleted: ['step-01-preflight-and-context', 'step-02-identify-targets']
lastStep: 'step-02-identify-targets'
lastSaved: '2026-05-10T00:00:00Z'
inputDocuments: ['_bmad-output/implementation-artifacts/3-3-generative-ai-chat-widgets.md']
---

## Step 1: Preflight & Context Loading Summary

- **Execution Mode**: Standalone (Auto-discover for `apps/api/src/integrations`)
- **Detected Stack**: backend
- **Framework Status**: Validated (`bun:test` found)
- **Loaded Knowledge Fragments**: 
  - Core fragments
  - API Testing Patterns

## Step 2: Automation Targets & Coverage Plan

### 1. Targets by Test Level

**API Tests (`tests/unit/integrations/routes.test.ts`)**
- `POST /connections/save`: Insert integration and auto-link to active sandboxes.
- `POST /connections/sync`: Sync missing integrations from provider.
- `GET /connections`: List connections.
- `POST /webhook`: Webhook validation (HMAC sig check) and saving integration.
- `POST /connections/proxy`: Proxy requests to the integration provider.

**Sandbox API Tests (`tests/unit/integrations/sandbox-routes.test.ts`)**
- `POST /token`: Retrieve connection tokens using a valid sandboxId.
- `POST /proxy`: Execute proxy via sandbox link, validating link ownership.
- `GET /list`: List connected integrations for sandbox.
- `POST /run-action`: Test executing remote provider action.
- Trigger Routes (`/triggers/available`, `/triggers/deploy`, `/triggers/deployed`, `/triggers/deployed/:id`): Check trigger lifecycle and active status updates.

### 2. Priority Assignments

- **P0**: Core flow & auth: `POST /connections/save`, `POST /webhook` (Security/HMAC validation), `POST /token`, `POST /connections/proxy`.
- **P1**: Operational endpoints: `/list`, `/sync`, `/run-action`, Trigger management.
- **P2**: Search & Labeling: `/apps`, `/search-apps`, `PATCH /connections/:integrationId/label`.

### 3. Justification for Coverage Scope
Integration routes map directly to external data (Pipedream), user sandbox authorization, and webhooks. Testing these guarantees that our API keys are secure, sandboxes only execute against authorized providers, and webhooks properly validate their signatures before mutating state.
