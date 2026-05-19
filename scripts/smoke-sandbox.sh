#!/usr/bin/env bash
# smoke-sandbox.sh — run 5 smoke checks against a live Daytona sandbox
#
# Usage:
#   smoke-sandbox.sh <sandbox-external-id>
#
# Env vars required:
#   DAYTONA_API_KEY  — Daytona API key
#
# Exit codes:
#   0  — all checks passed
#   1  — one or more checks failed
#
# Checks:
#   1. /epsilon/health returns { runtimeReady: true }
#   2. opencode binary responds (--version)
#   3. bun binary responds (--version)
#   4. epsilon-master HTTP server alive (port 8000 /epsilon/health)
#   5. agent-browser binary present

set -euo pipefail

SBID="${1:?Usage: $0 <sandbox-external-id>}"
TOK="${DAYTONA_API_KEY:?DAYTONA_API_KEY not set}"
TOOLBOX_BASE="https://proxy.app-eu.daytona.io/toolbox/$SBID"
TIMEOUT=10

PASS=0
FAIL=0

run_check() {
  local name="$1"
  local cmd="$2"
  local expect="${3:-}"

  echo -n "CHECK: $name ... "
  RESULT=$(curl -sf -X POST \
    -H "Authorization: Bearer $TOK" \
    -H "Content-Type: application/json" \
    "$TOOLBOX_BASE/process/execute" \
    -d "{\"command\":\"$cmd\",\"timeout\":$TIMEOUT}" 2>&1) || {
    echo "FAIL (toolbox unreachable)"
    FAIL=$((FAIL + 1))
    return
  }

  OUTPUT=$(echo "$RESULT" | jq -r '.result // .output // ""' 2>/dev/null || echo "$RESULT")

  if [ -n "$expect" ]; then
    if echo "$OUTPUT" | grep -q "$expect"; then
      echo "PASS"
      PASS=$((PASS + 1))
    else
      echo "FAIL (expected '$expect', got: $(echo "$OUTPUT" | head -1))"
      FAIL=$((FAIL + 1))
    fi
  else
    if [ -n "$OUTPUT" ]; then
      echo "PASS ($OUTPUT)"
      PASS=$((PASS + 1))
    else
      echo "FAIL (empty output)"
      FAIL=$((FAIL + 1))
    fi
  fi
}

echo "=== Smoke tests for sandbox $SBID ==="
echo ""

# 1. epsilon/health → runtimeReady
run_check "epsilon health" \
  "curl -sf http://localhost:8000/epsilon/health" \
  "runtimeReady"

# 2. opencode binary present
run_check "opencode binary" \
  "opencode --version 2>&1 | head -1" \
  ""

# 3. bun binary present
run_check "bun binary" \
  "bun --version 2>&1" \
  ""

# 4. epsilon-master server responding (same as check 1 but via process)
run_check "epsilon-master HTTP" \
  "curl -sf http://localhost:8000/epsilon/health | jq -r '.runtimeReady'" \
  "true"

# 5. agent-browser binary
run_check "agent-browser binary" \
  "command -v agent-browser && echo present" \
  "present"

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
exit 0
