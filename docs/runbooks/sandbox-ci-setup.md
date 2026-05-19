# Sandbox CI Setup Runbook

One-time setup for the sandbox image CI/CD pipeline (Story 8.6).

## Prerequisites

- VPS at `167.172.66.16` with sudo access
- GHCR PAT with `packages:write` scope for `ghcr.io/deptrai/computer`
- Daytona API key (from Dokploy env `DAYTONA_API_KEY`)
- Optional: Dokploy API token (for auto-promote to patch DAYTONA_SNAPSHOT)

---

## 1. Install self-hosted GitHub Actions runner (label: sandbox-builder)

SSH into the VPS, then:

```bash
# Create dedicated user and directories
sudo useradd -m -s /bin/bash github-runner
sudo mkdir -p /var/lib/sandbox-ci
sudo chown github-runner:github-runner /var/lib/sandbox-ci

# Install runner (get latest URL from https://github.com/deptrai/chainlens/settings/actions/runners/new)
sudo su - github-runner
mkdir -p ~/actions-runner && cd ~/actions-runner
curl -o actions-runner-linux-x64.tar.gz -L \
  https://github.com/actions/runner/releases/download/v2.317.0/actions-runner-linux-x64-2.317.0.tar.gz
tar xzf actions-runner-linux-x64.tar.gz

# Configure (get token from GitHub → repo Settings → Actions → Runners → New self-hosted runner)
./config.sh \
  --url https://github.com/deptrai/chainlens \
  --token <TOKEN_FROM_GITHUB> \
  --name sandbox-builder-vps \
  --labels sandbox-builder \
  --runnergroup Default \
  --unattended

# Install as systemd service (run as root)
exit  # exit github-runner user
sudo /home/github-runner/actions-runner/svc.sh install github-runner
sudo /home/github-runner/actions-runner/svc.sh start
sudo /home/github-runner/actions-runner/svc.sh status
```

Verify runner appears in GitHub → Settings → Actions → Runners as `sandbox-builder-vps` with label `sandbox-builder`.

---

## 2. Configure GitHub Secrets

In repo Settings → Secrets → Actions, add:

| Secret | Value | Used by |
|--------|-------|---------|
| `GHCR_PAT` | PAT with `packages:write` for `ghcr.io/deptrai` | sandbox-base.yml, sandbox-build.yml, sandbox-smoke.yml |
| `DAYTONA_API_KEY` | `dtn_ef6fa4e8...` (same as Dokploy env) | sandbox-smoke.yml (provision/delete sandbox) |
| `DOKPLOY_API_TOKEN` | Dokploy API token | sandbox-smoke.yml (auto-promote patch) |
| `DOKPLOY_API_URL` | `https://chainlens.net:3000` or Dokploy URL | sandbox-smoke.yml |
| `GH_PAT` | Already exists (repo:private submodule access) | all workflows |

### Getting DOKPLOY_API_TOKEN

In Dokploy dashboard → Settings → API → Generate token. Use a dedicated token named `ci-auto-promote`.

---

## 3. Docker access on the runner

The runner must be able to build + push Docker images:

```bash
# Add github-runner to docker group
sudo usermod -aG docker github-runner

# Configure GHCR credentials
sudo su - github-runner
echo "<GHCR_PAT>" | docker login ghcr.io -u deptrai --password-stdin
```

---

## 4. Initial base image build

After runner is set up, trigger the first base build manually:

```bash
# From GitHub UI: Actions → Sandbox Base Image → Run workflow
# Or via CLI:
gh workflow run sandbox-base.yml \
  --ref main \
  --field push_latest=true
```

This takes ~20-25 min. Monitor in GitHub Actions.

After completion, verify:
```bash
docker manifest inspect ghcr.io/deptrai/computer:base-latest
cat /var/lib/sandbox-ci/current-base-sha
```

---

## 5. Test the full pipeline end-to-end

Make a trivial change to `core/epsilon-master/` and push to `main`. Expect:

1. `sandbox-build.yml` triggers (path filter: `core/epsilon-master/**`)
2. Builds thin image `next-<sha7>` (~5-8 min)
3. Dispatches `sandbox-smoke.yml`
4. Smoke test provisions real Daytona sandbox
5. Runs 5 checks
6. On pass: promotes to `stable`, patches Dokploy, redeploys API
7. On fail: records failure in circuit breaker

Monitor: GitHub Actions → Sandbox Image Build → Sandbox Smoke + Auto-Promote

---

## 6. Circuit breaker management

State file: `/var/lib/sandbox-ci/promote-history.json` (on the VPS runner)

```bash
# Check status
bash scripts/ci-circuit-breaker.sh status

# Manually unlock after 3 failures (investigate first!)
# Preferred: use GitHub Actions → unlock-promote.yml workflow
# Or directly on runner:
bash scripts/ci-circuit-breaker.sh unlock
```

---

## Rollback procedure

If a bad image was promoted to stable:

1. Find the previous good sha7:
   ```bash
   cat /var/lib/sandbox-ci/promote-history.json | jq '.history'
   ```

2. Trigger rollback:
   ```
   GitHub → Actions → Sandbox Rollback → Run workflow
   inputs:
     target_sha7: <sha7-of-good-image>
     reason: "Production issue with sha7 <bad-sha7>: <brief description>"
   ```

3. Verify: Dokploy API app env shows updated `DAYTONA_SNAPSHOT`, new deployment triggered.
