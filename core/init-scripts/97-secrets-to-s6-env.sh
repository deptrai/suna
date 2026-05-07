#!/usr/bin/with-contenv bash
set -euo pipefail

# ─────────────────────────────────────────────────────────────────────────────
# Secrets → s6 env recovery
#
# This is the PERSISTENCE BRIDGE between the two zones:
#   /persistent/secrets/  (persistent, encrypted)  →  /run/s6/container_environment/ (tmpfs)
#
# The s6 env dir is tmpfs — wiped on every container start. This script
# rebuilds it from the persistent encrypted secrets store so all services
# (opencode, epsilon-master, triggers) have their env vars.
#
# Recovery chain (in priority order):
#   1. Docker env vars (injected at container create) → always present on first boot
#   2. /persistent/secrets/.bootstrap-env.json → core vars (EPSILON_TOKEN, etc.)
#   3. /persistent/secrets/.secrets.json → all user secrets (API keys, etc.)
#
# The SecretStore encrypts with a DEDICATED encryption key (NOT EPSILON_TOKEN).
# This means secrets survive EPSILON_TOKEN changes, API restarts, and rotations.
# ─────────────────────────────────────────────────────────────────────────────

# Derive secrets directory from SECRET_FILE_PATH.
_SECRET_FILE="${SECRET_FILE_PATH:-${EPSILON_PERSISTENT_ROOT:-/persistent}/secrets/.secrets.json}"
SECRETS_DIR="$(dirname "$_SECRET_FILE")"
S6_ENV_DIR="/run/s6/container_environment"
SECRETS_FILE="$_SECRET_FILE"
BOOTSTRAP_FILE="${SECRETS_DIR}/.bootstrap-env.json"
SEED_FILE="/ephemeral/epsilon-master/seed-env.json"

# ── 1. Fix ownership ────────────────────────────────────────────────────────
# Secrets dir may be root-owned after volume mount. Fix for abc.
mkdir -p "$SECRETS_DIR"
chown -R abc:users "$SECRETS_DIR"
chmod 700 "$SECRETS_DIR"

if [ -d "$S6_ENV_DIR" ]; then
  chown -R abc:users "$S6_ENV_DIR"
  chmod 755 "$S6_ENV_DIR"
fi

# ── 2. Restore core vars from bootstrap file ────────────────────────────────
# Bootstrap file contains plaintext core vars (EPSILON_TOKEN, EPSILON_API_URL,
# INTERNAL_SERVICE_KEY). These are needed BEFORE the SecretStore can decrypt
# anything (EPSILON_TOKEN was the old encryption key; now it's just identity).
if [ -f "$BOOTSTRAP_FILE" ] && [ -d "$S6_ENV_DIR" ]; then
  echo "[Epsilon] Restoring core env vars from bootstrap file..."
  bun -e "
    const data = JSON.parse(require('fs').readFileSync('$BOOTSTRAP_FILE', 'utf-8'));
    const s6 = '$S6_ENV_DIR';
    let n = 0;
    for (const [k, v] of Object.entries(data)) {
      if (!v) continue;
      // Only restore if not already set in s6 env dir (Docker env takes priority)
      const s6Path = s6 + '/' + k;
      try {
        const existing = require('fs').readFileSync(s6Path, 'utf-8').trim();
        if (existing) continue; // Already set by Docker env
      } catch {}
      require('fs').writeFileSync(s6Path, String(v));
      n++;
    }
    if (n > 0) console.log('[Epsilon] Restored ' + n + ' core env var(s) from bootstrap');
  " || echo "[Epsilon] WARN: bootstrap restore failed (non-fatal)"
fi

# ── 3. Seed template keys (first run only) ──────────────────────────────────
if [ ! -f "$SECRETS_FILE" ] && [ -f "$SEED_FILE" ]; then
  echo "[Epsilon] First run — seeding template keys into SecretStore"
  bun -e "
    const { SecretStore } = require('/ephemeral/epsilon-master/src/services/secret-store.ts');
    const seed = require('$SEED_FILE');
    const store = new SecretStore();
    let n = 0;
    for (const [k, v] of Object.entries(seed)) {
      if (k.startsWith('_')) continue;
      await store.set(k, String(v));
      n++;
    }
    console.log('[Epsilon] Seeded ' + n + ' template keys');
  " || echo "[Epsilon] WARN: template key seed failed"
fi

# Fix ownership of any files created by the seed step
chown -R abc:users "$SECRETS_DIR"

# ── 4. Sync all secrets into s6 env dir ─────────────────────────────────────
# This decrypts every secret and writes it to /run/s6/container_environment/
# so all s6-supervised services can access them via with-contenv.
if [ -f "$SECRETS_FILE" ]; then
  echo "[Epsilon] Syncing secrets into s6 container environment..."
  bun "/ephemeral/epsilon-master/src/scripts/sync-s6-env.ts" || echo "[Epsilon] WARN: secret sync failed"
else
  echo "[Epsilon] No secrets file yet — skipping secret sync"
fi

# ── 5. Fix s6 env dir ownership ─────────────────────────────────────────────
# Sync ran as root. epsilon-master (abc) needs write access at runtime.
if [ -d "$S6_ENV_DIR" ]; then
  chown -R abc:users "$S6_ENV_DIR"
fi

echo "[Epsilon] Secrets recovery complete"
