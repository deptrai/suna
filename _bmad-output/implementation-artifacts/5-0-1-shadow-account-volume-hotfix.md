# Story 5.0.1: Shadow Account Volume Hotfix (Platform Infra)

Status: review

**Implementation log (audit 2026-05-18)**: Shadow volume mounts applied to [scripts/compose/docker-compose.yml](scripts/compose/docker-compose.yml) — added 2 named volumes (`vibe-trading-shadow-accounts`, `vibe-trading-shadow-reports`) + mounted at `/home/vibe/.vibe-trading/shadow_{accounts,reports}` in both `vibe-trading` and `vibe-trading-worker` services. Container user verified as `vibe` (HOME=/home/vibe) via `docker exec`. Restart required: `docker compose up -d vibe-trading vibe-trading-worker` to attach new volumes. Existing volumes unchanged (rolling deploy safe).

**Depends on**: [Story 5.0](5-0-vibe-trading-platform-foundation.md) done.
**Blocks**: [Story 5.6](5-6-shadow-account-swarm-ui.md) — 5.6 cannot ship until this is merged.

<!-- Created 2026-05-12 by Winston. Retroactive infra hotfix to Story 5.0 scope.
     Story 5.0 provisioned vibe-trading-runs + vibe-trading-sessions volumes but
     missed the shadow-reports and shadow-accounts dirs. Without this hotfix,
     Shadow Account features in Story 5.6 would lose state on container restart. -->

## Context

Story 5.0 provisioned these Docker volumes cho Vibe-Trading container:
- `vibe-trading-runs:/app/agent/runs`
- `vibe-trading-sessions:/app/agent/sessions`

Shadow Account features (Story 5.6) persist state in 2 additional directories:
- `~/.vibe-trading/shadow_accounts/` — extracted strategy rules (JSON)
- `~/.vibe-trading/shadow_reports/` — rendered HTML/PDF reports

Verified at [api_server.py:1665](Vibe-Trading/agent/api_server.py#L1665):
```python
reports_dir = Path.home() / ".vibe-trading" / "shadow_reports"
```

Without volume mounts, all shadow data is lost on container restart — breaks Story 5.6 AC3
(report retrieval) and leaks disk space as orphaned state files accumulate.

## Story

As a Chainlens platform operator,
I want Docker volumes mounted at `~/.vibe-trading/shadow_accounts/` and `~/.vibe-trading/shadow_reports/`
inside vibe-trading + vibe-trading-worker containers,
so that Shadow Account strategies and rendered reports persist across container restarts and can
be retrieved via the existing `GET /shadow-reports/{id}` endpoint.

## Acceptance Criteria

### AC1 — Volumes declared and mounted

**Given** `scripts/compose/docker-compose.yml` currently declares 2 VT volumes
**When** Story 5.0.1 ships
**Then** 2 new named volumes added to `volumes:` block:
```yaml
volumes:
  vibe-trading-runs:
  vibe-trading-sessions:
  vibe-trading-shadow-accounts:     # NEW
  vibe-trading-shadow-reports:      # NEW
  redis-data:
```

**And** both `vibe-trading` service and `vibe-trading-worker` service mount them at the
correct paths (user home dir of the `vibe` non-root user — verify path matches VT's default):

```yaml
services:
  vibe-trading:
    volumes:
      - vibe-trading-runs:/app/agent/runs
      - vibe-trading-sessions:/app/agent/sessions
      - vibe-trading-shadow-accounts:/home/vibe/.vibe-trading/shadow_accounts
      - vibe-trading-shadow-reports:/home/vibe/.vibe-trading/shadow_reports
  vibe-trading-worker:
    volumes:
      # same 4 volumes as vibe-trading
```

### AC2 — Path resolution verified

**Given** VT code uses `Path.home() / ".vibe-trading" / "shadow_reports"`
**When** container starts as `vibe` user (verified [Dockerfile:40-43](Vibe-Trading/Dockerfile#L40))
**Then** `Path.home()` resolves to `/home/vibe/` — confirm with:
```sh
docker exec vibe-trading python -c "from pathlib import Path; print(Path.home())"
```

**And** if `Path.home()` returns a different path (e.g. `/root` if user override in compose),
update the volume mount paths to match

### AC3 — Existing volumes unchanged, no data loss

**Given** existing deployments have data in `vibe-trading-runs` + `vibe-trading-sessions`
**When** Story 5.0.1 redeploy
**Then** existing volumes remain intact (no `docker volume rm`)
**And** only new volumes are added — rolling deploy safe

### AC4 — Rollback procedure documented

**Given** Story 5.0.1 is additive-only
**When** documented in `core/docker/README.md`
**Then** operations runbook includes:
- Volume creation command: `docker compose up -d --force-recreate vibe-trading vibe-trading-worker`
- Rollback: remove the 2 new volume lines, redeploy — existing shadow data in ephemeral container FS will be lost (acceptable — rollback implies abandoning Shadow Account feature)

## Tasks / Subtasks

### Task 1 — Update docker-compose.yml (AC1, AC2)

- [ ] First verify `Path.home()` resolves correctly inside running vibe-trading container:
  ```sh
  docker exec $(docker ps -qf name=vibe-trading) sh -c 'id -u; id -un; echo $HOME'
  ```
- [ ] Edit `scripts/compose/docker-compose.yml`:
  - Add 2 named volumes under top-level `volumes:` block
  - Add 2 `volumes:` mount lines to `vibe-trading` service block
  - Add same 2 mount lines to `vibe-trading-worker` service block
  - Match path based on Task 1 step 1 verification (likely `/home/vibe/` — but verify)

### Task 2 — Deploy verification (AC1, AC2, AC3)

- [ ] Rolling deploy: `docker compose up -d vibe-trading vibe-trading-worker`
- [ ] Verify mounts active:
  ```sh
  docker inspect vibe-trading | jq '.[].Mounts[] | select(.Destination | contains("shadow"))'
  ```
- [ ] Expect 2 mounts with `Destination` matching home dir shadow paths
- [ ] Test persistence: trigger a test render via VT API, kill + recreate container, verify file still exists

### Task 3 — Documentation (AC4)

- [ ] Update `core/docker/README.md` với:
  - Section "Shadow Account persistence" describing 2 new volumes
  - Rollback procedure
  - Reference to Story 5.6 as the consumer

### Task 4 — Sprint status update

- [ ] Mark this story `done` in `_bmad-output/implementation-artifacts/sprint-status.yaml` (if exists)
- [ ] Unblock Story 5.6 by noting "5.0.1 merged — shadow volumes available" in 5.6 change log

## Dev Notes

### Volume naming convention

Follows existing Story 5.0 pattern: `vibe-trading-<purpose>`. Two new volumes named to be
self-documenting.

### No VT code changes

This story is pure infrastructure. Zero Python changes, zero VT submodule patches. The
`Path.home()` call at [api_server.py:1665](Vibe-Trading/agent/api_server.py#L1665) already
resolves correctly — we just need persistent storage behind it.

### Migration impact

Currently deployed environments have NO Shadow Account features (Story 5.6 not shipped yet),
so there is no existing shadow state to migrate. This is a clean slate — just add volumes.

### Source Tree Components to Touch

**Modified files:**
- `scripts/compose/docker-compose.yml` — add 2 volumes + 2 mounts × 2 services = 4 mount lines
- `core/docker/README.md` — operations runbook section

**NOT modified:**
- `Vibe-Trading/` — no code changes needed
- Story 5.0 artifacts — this is a follow-up story, not retroactive edit

### Testing Standards

- Manual verification only (infra change, no code)
- Rolling deploy smoke test: `curl http://vibe-trading:8899/health` → 200 before + after

### Performance Budget

| Metric | Target | Notes |
|---|---|---|
| Deploy time | <30s | Rolling update of 2 services |
| Volume creation | <1s | Docker volume init |
| No runtime overhead | — | Bind mount path, no IO layer |

### References

- [Story 5.0](5-0-vibe-trading-platform-foundation.md) — initial VT platform foundation
- [Story 5.6](5-6-shadow-account-swarm-ui.md) — consumer of these volumes
- [VT shadow_reports path](Vibe-Trading/agent/api_server.py#L1665)
- [VT Dockerfile vibe user](Vibe-Trading/Dockerfile#L40)
