# Sandbox Token Drift — Chaos Drill Runbook

**Story:** 5.0.4 (chaos & regression tests). **Use this drill** quarterly + before any rotation of related infra (apps/api restart cadence, Daytona provider upgrade, etc.).

This drill verifies the drift detection + auto-reconcile chain shipped in Story 5.0.2 end-to-end against a real sandbox container. If the drill fails, **a 5.0.2 regression is likely** — open a P0 hotfix story.

## Architecture recap (4-layer token store)

The sandbox `EPSILON_TOKEN` lives in four storage layers, owned by two parties:

| Layer | Path | Owner | Mutated by |
|---|---|---|---|
| A | `apps/api/.env INTERNAL_SERVICE_KEY` | Operator / 5.0.2 auto-sync | manual edit OR drift reconcile |
| B | DB `epsilon.sandboxes.config.serviceKey` (JSONB) | `apps/api` | provision + 401 retry + drift reconcile |
| C | container `/workspace/.secrets/.bootstrap-env.json` | sandbox init | bootstrap-env regeneration |
| D | container s6 env `/run/s6/container_environment/EPSILON_TOKEN` | sandbox s6 service | secrets-to-s6-env init script |

Story 5.0.2 reactive auto-reconcile (`bad_signature` → `X-Epsilon-Token-Drift` response header → `apps/api` reconcile + sync retry + 30s circuit breaker) makes A, B, and (in-process) `process.env.INTERNAL_SERVICE_KEY` converge to whatever C says — within one request after drift is detected.

## Drill — 10 minutes

### Preconditions

- Local dev: `epsilon-sandbox` container running, `apps/api` running on port 8008, frontend on 3000.
- Production: pick a **non-production sandbox** (NOT a paying customer's). Inform ops before running.
- Optional: capture the current Sentry / Logtail alert count for `event_kind=token_drift` so you can verify the drill emitted exactly 1 alert (debounced for 5 min after that).

### Step 1 — Baseline check (sanity)

```sh
# Local dev:
curl -sf http://localhost:8008/v1/health || echo "FAIL: apps/api unhealthy before drill"
docker exec epsilon-sandbox curl -sf http://localhost:8000/health || echo "FAIL: epsilon-master unhealthy before drill"

# Trigger a session creation via UI or curl, capture session ID. Verify:
docker exec epsilon-sandbox sqlite3 /home/vibe/.opencode/storage/sessions.db \
  "SELECT session_id, owner_user_id FROM session_owners ORDER BY created_at DESC LIMIT 1;"
```

Expected: `owner_user_id` is set (not empty). If empty, drift is already present — fix manually (see CLAUDE.md Troubleshooting) before continuing.

### Step 2 — Force drift

Pick ONE of these mutations (each tests a different layer):

```sh
# Option 2a — mutate layer D (s6 env). Most realistic — simulates container restart with stale env.
docker exec epsilon-sandbox sh -c \
  'echo "bogus-drift-token-for-drill" > /run/s6/container_environment/EPSILON_TOKEN'

# Option 2b — mutate layer C (bootstrap-env). Simulates corrupted secrets file.
docker exec epsilon-sandbox sh -c \
  'jq ".INTERNAL_SERVICE_KEY = \"bogus-drift-token-for-drill\"" /workspace/.persistent-system/secrets/.bootstrap-env.json > /tmp/x && mv /tmp/x /workspace/.persistent-system/secrets/.bootstrap-env.json'

# Option 2c — mutate layer A (apps/api .env). Simulates operator typo.
sed -i.bak 's|^INTERNAL_SERVICE_KEY=.*|INTERNAL_SERVICE_KEY="bogus-drift-token-for-drill"|' apps/api/.env
# bun --hot will pick up the .env change on next request

# Option 2d — mutate layer B (DB). Simulates manual UPDATE gone wrong.
docker exec -e PGPASSWORD=postgres supabase_db_epsilon-local psql -U supabase_admin -d postgres -c \
  "UPDATE epsilon.sandboxes SET config = jsonb_set(config, '{serviceKey}', '\"bogus-drift-token-for-drill\"') WHERE external_id = 'epsilon-sandbox';"
```

### Step 3 — Trigger a request

```sh
# Via UI: open the app, send a new chat message, or create a new session.
# Via curl (replace <SESSION_ID>):
curl -sf -X POST http://localhost:8008/v1/p/epsilon-sandbox/8000/session \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <user-token>" \
  -d '{"name": "drift-drill-session"}'
```

### Step 4 — Verify auto-reconcile fired

Tail `apps/api` log. You should see this chain within 1-2 seconds:

```
[epsilon-user] Ignoring bad X-Epsilon-User-Context (bad_signature); continuing without user context
[reconcile] sandbox=epsilon-sandbox drift detected (bad_signature; sandbox=epsilon-sandbox); attempting reconcile + sync retry
[reconcile] .env INTERNAL_SERVICE_KEY synced to <new16chars>…; process.env updated, no restart needed
[LOCAL-PREVIEW] Refreshed sandbox serviceKey in DB + invalidated cache (externalId=epsilon-sandbox)
[reconcile] sandbox=epsilon-sandbox drift resolved (DB <old16>… → container <new16>…); retry status=200
```

**Check structured alert** (Logtail / Loki):
```
{"event":"sandbox.token.bad_signature","event_kind":"token_drift","level":"warning","sandboxId":"epsilon-sandbox","reason":"bad_signature","requestMethod":"POST","requestPath":"...","tokenPrefix":"...","ts":"..."}
```

Pass ✓ if all three appear within 5 seconds of the request.

### Step 5 — Verify state convergence

```sh
# Layer A (.env file)
grep INTERNAL_SERVICE_KEY apps/api/.env

# Layer B (DB)
docker exec -e PGPASSWORD=postgres supabase_db_epsilon-local psql -U supabase_admin -d postgres -c \
  "SELECT config->>'serviceKey' FROM epsilon.sandboxes WHERE external_id = 'epsilon-sandbox';"

# Layer C (container bootstrap)
docker exec epsilon-sandbox cat /workspace/.persistent-system/secrets/.bootstrap-env.json \
  || docker exec epsilon-sandbox cat /workspace/.secrets/.bootstrap-env.json

# Layer D (container s6 env)
docker exec epsilon-sandbox cat /run/s6/container_environment/EPSILON_TOKEN
```

**Pass ✓** if A == B == C (Layer D is the canonical truth — A/B/C should all match C). Layer D itself is set by container init scripts and is not auto-mutated by `apps/api`.

### Step 6 — Verify request succeeded

```sh
# session_owners must have a fresh row for the session created in step 3
docker exec epsilon-sandbox sqlite3 /home/vibe/.opencode/storage/sessions.db \
  "SELECT session_id, owner_user_id, created_at FROM session_owners ORDER BY created_at DESC LIMIT 1;"
```

**Pass ✓** if `owner_user_id` is set. If empty, the retry didn't propagate user context — investigate.

### Step 7 — Verify circuit breaker (negative path)

```sh
# Stop the sandbox container — reconcile will fail (can't read bootstrap)
docker stop epsilon-sandbox

# Fire 5 rapid requests
for i in $(seq 1 5); do
  curl -sf -X GET http://localhost:8008/v1/p/epsilon-sandbox/8000/health > /dev/null 2>&1 || echo "request $i failed (expected)"
done

# Tail log — should see ONE reconcile attempt (circuit tripped after first failure),
# NOT five.
grep -c '\[reconcile\]' /tmp/apps-api.log | tail -5
```

**Pass ✓** if `[reconcile]` count increased by exactly 1, not 5.

### Step 8 — Cleanup

```sh
# Restart sandbox
docker start epsilon-sandbox

# Wait 31s for circuit cool-off, then trigger a request
sleep 31
curl -sf http://localhost:8008/v1/p/epsilon-sandbox/8000/health

# Verify reconcile is allowed again (circuit cleared) — should succeed
```

If you mutated Layer A in step 2c, restore from backup:
```sh
mv apps/api/.env.bak apps/api/.env
```

## Failure modes

| Symptom | Likely cause | Action |
|---|---|---|
| No `[reconcile]` log line after request | Drift header not set by middleware | Check `X-Epsilon-Token-Drift` in response headers (curl `-D -`); verify `result.reason === 'bad_signature'` path |
| Reconcile fires but request still 401 | `process.env.INTERNAL_SERVICE_KEY` not updated (review P2 regression) | Verify line in [syncInternalServiceKeyToEnvFile](apps/api/src/sandbox-proxy/routes/local-preview.ts) sets `process.env.INTERNAL_SERVICE_KEY = newKey` |
| Reconcile loops every 30s | Circuit breaker not tripping OR cool-off too short | Verify `DRIFT_COOLOFF_MS = 30_000` + `tripCircuit` called on retry-still-has-drift path |
| Drift header visible in browser response | Header not in `STRIP_RESPONSE_HEADERS` (review P5 regression) | Verify `'x-epsilon-token-drift'` is in the Set in [local-preview.ts](apps/api/src/sandbox-proxy/routes/local-preview.ts) |
| Alert spams Logtail with every request | Debounce broken OR env gate not honored | Check `EPSILON_DRIFT_ALERTS_ENABLED` env in container; verify `shouldEmitAlert` map state |

## Manual recovery (if auto-reconcile fully broken)

Use the [CLAUDE.md Troubleshooting](CLAUDE.md) manual fix as escape hatch:
1. Read C (bootstrap file) for the truth token
2. Update A (.env), B (DB) to match
3. Restart `apps/api`

## Cadence

- **Quarterly** drill on production sandbox (non-customer)
- **Before** any apps/api restart cadence change, Daytona provider upgrade, or s6 init script edit
- **After** any change to `epsilon-user-middleware.ts`, `sandbox-provisioner.ts`, `local-preview.ts`, or `config.ts INTERNAL_SERVICE_KEY` getter
