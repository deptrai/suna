#!/bin/bash
# Daytona starts custom images under its own long-running PID 1 instead of the
# image ENTRYPOINT. This bootstraps the sandbox services that Docker Compose
# normally starts through /ephemeral/startup.sh -> s6-overlay.

set -euo pipefail

log() {
  echo "[daytona-start] $*"
}

if pgrep -f "/ephemeral/epsilon-master/src/index.ts" >/dev/null 2>&1; then
  log "epsilon-master already running"
  exit 0
fi

export HOME=/workspace
export EPSILON_PERSISTENT_ROOT="${EPSILON_PERSISTENT_ROOT:-/persistent}"
export OPENCODE_STORAGE_BASE="${OPENCODE_STORAGE_BASE:-${EPSILON_PERSISTENT_ROOT}/opencode}"
export OPENCODE_SHADOW_STORAGE_BASE="${OPENCODE_SHADOW_STORAGE_BASE:-${EPSILON_PERSISTENT_ROOT}/opencode-shadow}"
export EPSILON_OPENCODE_ARCHIVE_DIR="${EPSILON_OPENCODE_ARCHIVE_DIR:-${EPSILON_PERSISTENT_ROOT}/opencode-archive}"
export EPSILON_OPENCODE_CACHE_DIR="${EPSILON_OPENCODE_CACHE_DIR:-${EPSILON_PERSISTENT_ROOT}/opencode-cache}"
export SECRET_FILE_PATH="${SECRET_FILE_PATH:-${EPSILON_PERSISTENT_ROOT}/secrets/.secrets.json}"
export SALT_FILE_PATH="${SALT_FILE_PATH:-${EPSILON_PERSISTENT_ROOT}/secrets/.salt}"
export ENCRYPTION_KEY_PATH="${ENCRYPTION_KEY_PATH:-${EPSILON_PERSISTENT_ROOT}/secrets/.encryption-key}"
export AUTH_JSON_PATH="${AUTH_JSON_PATH:-${OPENCODE_STORAGE_BASE}/auth.json}"

mkdir -p /run/s6/container_environment
chmod 755 /run/s6/container_environment

log "running startup preparation without s6 handoff"
export EPSILON_SKIP_RECURSIVE_CHOWN=1
export DAYTONA_BOOTSTRAP_ONLY=1
/ephemeral/startup.sh

log "running container init scripts"
for script in /custom-cont-init.d/*; do
  [ -x "$script" ] || continue
  log "init $(basename "$script")"
  "$script"
done

# s6 normally snapshots the container environment into this directory. The
# OpenCode runtime wrapper reads these files even when s6 itself is not PID 1.
env | while IFS='=' read -r key value; do
  case "$key" in
    EPSILON*|INTERNAL_SERVICE_KEY|TUNNEL*|OPENAI*|ANTHROPIC*|GEMINI*|GROQ*|XAI*|TAVILY*|FIRECRAWL*|SECRET_FILE_PATH|SALT_FILE_PATH|ENCRYPTION_KEY_PATH|OPENCODE_*|AUTH_JSON_PATH)
      printf '%s' "$value" > "/run/s6/container_environment/$key"
      ;;
  esac
done
chown -R abc:users /run/s6/container_environment /workspace "$EPSILON_PERSISTENT_ROOT" 2>/dev/null || true

log "starting epsilon-master on port 8000 (with auto-restart on crash)"
# Export runtime vars so s6-setuidgid inherits the full environment (including
# EPSILON_API_URL, EPSILON_TOKEN, INTERNAL_SERVICE_KEY, TUNNEL_*, LLM API keys).
# Using `exec env VAR=val ...` would create a clean env and silently drop them.
export HOME=/workspace
export EPSILON_MASTER_PORT=8000
export OPENCODE_HOST=localhost
export OPENCODE_PORT=4096
export EPSILON_SERVICE_START_WAIT_MS="${EPSILON_SERVICE_START_WAIT_MS:-120000}"
export EPSILON_OPENCODE_READY_TIMEOUT_MS="${EPSILON_OPENCODE_READY_TIMEOUT_MS:-15000}"
export PATH="/opt/bun/bin:/usr/local/bin:/usr/bin:/bin"
# Do NOT use exec — we need the while loop to survive Bun segfaults.
# Bun v1.3.x has known segfault bug after extended runtime; the restart loop
# recovers automatically without requiring sandbox reprovisioning.
while true; do
  /command/s6-setuidgid abc /opt/bun/bin/bun run /ephemeral/epsilon-master/src/index.ts || true
  log "epsilon-master exited — restarting in 3s..."
  sleep 3
done
