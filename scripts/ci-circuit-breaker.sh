#!/usr/bin/env bash
# ci-circuit-breaker.sh — manage promote circuit breaker state
#
# State file: /var/lib/sandbox-ci/promote-history.json
# Schema:
#   { "locked": bool, "lock_reason": str, "consecutive_failures": int,
#     "history": [{ "sha7": str, "status": "pass"|"fail", "ts": ISO8601 }] }
#
# Commands:
#   record-pass  <sha7>   — record a successful promote; reset failure count
#   record-fail  <sha7>   — record a failed promote; lock after 3 consecutive
#   status                — print locked|unlocked and consecutive_failures
#   unlock                — manually unlock the circuit breaker
#   reset                 — wipe state file (use with caution)

set -euo pipefail

STATE_FILE=/var/lib/sandbox-ci/promote-history.json
MAX_CONSECUTIVE_FAILURES=3

init_state() {
  mkdir -p "$(dirname "$STATE_FILE")"
  if [ ! -f "$STATE_FILE" ]; then
    echo '{"locked":false,"lock_reason":null,"consecutive_failures":0,"history":[]}' > "$STATE_FILE"
  fi
}

cmd="${1:-status}"
sha7="${2:-unknown}"

case "$cmd" in
  record-pass)
    init_state
    NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
    jq --arg sha "$sha7" --arg ts "$NOW" '
      .consecutive_failures = 0 |
      .history = ([{ sha7: $sha, status: "pass", ts: $ts }] + .history)[0:20]
    ' "$STATE_FILE" > "${STATE_FILE}.tmp" && mv "${STATE_FILE}.tmp" "$STATE_FILE"
    echo "circuit-breaker: recorded PASS for $sha7 (failures reset to 0)"
    ;;

  record-fail)
    init_state
    NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
    CURRENT_FAILS=$(jq -r '.consecutive_failures // 0' "$STATE_FILE")
    NEW_FAILS=$((CURRENT_FAILS + 1))

    if [ "$NEW_FAILS" -ge "$MAX_CONSECUTIVE_FAILURES" ]; then
      LOCK=true
      REASON="$MAX_CONSECUTIVE_FAILURES consecutive promote failures (last: $sha7 at $NOW)"
      echo "::error::Circuit breaker LOCKING after $NEW_FAILS failures. Reason: $REASON"
    else
      LOCK=false
      REASON=$(jq -r '.lock_reason // null' "$STATE_FILE")
      echo "::warning::Promote failure $NEW_FAILS/$MAX_CONSECUTIVE_FAILURES for $sha7"
    fi

    jq --arg sha "$sha7" --arg ts "$NOW" \
       --argjson fails "$NEW_FAILS" \
       --argjson lock "$LOCK" \
       --arg reason "$REASON" '
      .consecutive_failures = $fails |
      .locked = $lock |
      .lock_reason = (if $lock then $reason else .lock_reason end) |
      .history = ([{ sha7: $sha, status: "fail", ts: $ts }] + .history)[0:20]
    ' "$STATE_FILE" > "${STATE_FILE}.tmp" && mv "${STATE_FILE}.tmp" "$STATE_FILE"
    echo "circuit-breaker: recorded FAIL for $sha7 (consecutive: $NEW_FAILS)"
    ;;

  status)
    init_state
    LOCKED=$(jq -r '.locked // false' "$STATE_FILE")
    FAILS=$(jq -r '.consecutive_failures // 0' "$STATE_FILE")
    REASON=$(jq -r '.lock_reason // "N/A"' "$STATE_FILE")
    echo "locked=$LOCKED"
    echo "consecutive_failures=$FAILS"
    echo "lock_reason=$REASON"
    if [ "$LOCKED" = "true" ]; then
      exit 2  # distinct exit code so workflows can detect locked state
    fi
    ;;

  unlock)
    init_state
    NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
    jq --arg ts "$NOW" '
      .locked = false |
      .lock_reason = null |
      .consecutive_failures = 0 |
      .history = ([{ sha7: "manual-unlock", status: "pass", ts: $ts }] + .history)[0:20]
    ' "$STATE_FILE" > "${STATE_FILE}.tmp" && mv "${STATE_FILE}.tmp" "$STATE_FILE"
    echo "circuit-breaker: manually UNLOCKED at $NOW"
    ;;

  reset)
    rm -f "$STATE_FILE"
    init_state
    echo "circuit-breaker: state RESET"
    ;;

  *)
    echo "Usage: $0 {record-pass|record-fail|status|unlock|reset} [sha7]"
    exit 1
    ;;
esac
