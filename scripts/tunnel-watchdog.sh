#!/usr/bin/env bash
# tunnel-watchdog.sh — Auto-sync cloudflared quick-tunnel URL to Dokploy api env.
#
# Background:
# Daytona Tier 1/2 firewall only allows *.trycloudflare.com SUBDOMAIN reachability.
# Custom domains (bridge.chainlens.net, *.cfargotunnel.com) and apex domains are blocked
# (verified 2026-05-18). Therefore named tunnels are infeasible for free-tier Daytona.
#
# Quick tunnels are reachable but URL changes on cloudflared restart.
# This watchdog detects URL drift in cloudflared container logs and:
#   1. Patches Dokploy api env via Dokploy API
#   2. Triggers Dokploy redeploy
#   3. Recovery time: ~2-3 minutes from URL change to chat-working again
#
# Deployment:
# Run as systemd service on prod server (167.172.66.16). See companion
# tunnel-watchdog.service file.
#
# Required env vars:
#   DOKPLOY_URL      — http://localhost:3000/api (Dokploy API base on prod)
#   DOKPLOY_API_KEY  — Dokploy API key with write access to api app
#   APP_ID           — Dokploy applicationId for api-djcsof (SESgs1lTKXGJz0YMXmoxs)
#   TUNNEL_CONTAINER — cloudflared docker container name (cloudflared-api-bridge)

set -euo pipefail

DOKPLOY_URL="${DOKPLOY_URL:-http://localhost:3000/api}"
DOKPLOY_API_KEY="${DOKPLOY_API_KEY:?DOKPLOY_API_KEY required}"
APP_ID="${APP_ID:-SESgs1lTKXGJz0YMXmoxs}"
TUNNEL_CONTAINER="${TUNNEL_CONTAINER:-cloudflared-api-bridge}"
POLL_SEC="${POLL_SEC:-30}"
STATE_FILE="${STATE_FILE:-/var/lib/tunnel-watchdog/last-url}"

mkdir -p "$(dirname "$STATE_FILE")"

log() {
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*"
}

extract_tunnel_url() {
  # Pull most-recent URL from cloudflared logs
  docker logs "$TUNNEL_CONTAINER" 2>&1 \
    | grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' \
    | tail -1
}

get_current_dokploy_url() {
  curl -sS "$DOKPLOY_URL/application.one" \
    -H "x-api-key: $DOKPLOY_API_KEY" \
    -G --data-urlencode "applicationId=$APP_ID" \
    | jq -r '.env // ""' \
    | grep -oE '^EPSILON_URL=https://[^ ]+' \
    | head -1 \
    | sed 's|^EPSILON_URL=||; s|/v1/router/*$||'
}

patch_dokploy_env() {
  local new_url="$1"
  # Get current env, replace only EPSILON_URL line(s)
  local env
  env=$(curl -sS "$DOKPLOY_URL/application.one" \
    -H "x-api-key: $DOKPLOY_API_KEY" \
    -G --data-urlencode "applicationId=$APP_ID" \
    | jq -r '.env // ""')
  local new_env
  new_env=$(echo "$env" | sed -E "s|^EPSILON_URL=.*|EPSILON_URL=${new_url}/v1/router|")

  # Dokploy returns boolean true on success, object {error,...} on failure
  local resp
  resp=$(curl -sS -X POST "$DOKPLOY_URL/application.update" \
    -H "x-api-key: $DOKPLOY_API_KEY" \
    -H "Content-Type: application/json" \
    -d "$(jq -nc --arg id "$APP_ID" --arg env "$new_env" --arg name "api" \
        '{applicationId:$id, env:$env, name:$name}')")
  if [ "$resp" = "true" ]; then
    log "  → env update OK"
  else
    log "  → env update response: $resp"
  fi
}

trigger_redeploy() {
  local resp
  resp=$(curl -sS -X POST "$DOKPLOY_URL/application.redeploy" \
    -H "x-api-key: $DOKPLOY_API_KEY" \
    -H "Content-Type: application/json" \
    -d "$(jq -nc --arg id "$APP_ID" \
        '{applicationId:$id, title:"watchdog: tunnel URL drift auto-recovery"}')")
  if [ "$resp" = "true" ]; then
    log "  → redeploy queued"
  else
    log "  → redeploy response: $resp"
  fi
}

main_loop() {
  log "tunnel-watchdog starting (poll=${POLL_SEC}s, app=$APP_ID, container=$TUNNEL_CONTAINER)"
  local last_seen_url=""
  if [ -f "$STATE_FILE" ]; then
    last_seen_url=$(cat "$STATE_FILE" 2>/dev/null || true)
    log "resumed last_seen_url=${last_seen_url:-<none>}"
  fi

  while true; do
    local current_url
    current_url=$(extract_tunnel_url || true)

    if [ -z "$current_url" ]; then
      log "WARN: cannot extract URL from $TUNNEL_CONTAINER logs"
      sleep "$POLL_SEC"
      continue
    fi

    if [ "$current_url" != "$last_seen_url" ]; then
      log "tunnel URL changed: ${last_seen_url:-<none>} → $current_url"

      local dokploy_url
      dokploy_url=$(get_current_dokploy_url || true)

      if [ "$dokploy_url" = "$current_url" ]; then
        log "Dokploy already in sync, just updating local state"
      else
        log "patching Dokploy env: $dokploy_url → $current_url"
        patch_dokploy_env "$current_url"
        log "triggering api redeploy..."
        trigger_redeploy
        log "redeploy queued, recovery in ~90s"
      fi

      echo "$current_url" > "$STATE_FILE"
      last_seen_url="$current_url"
    fi

    sleep "$POLL_SEC"
  done
}

main_loop
