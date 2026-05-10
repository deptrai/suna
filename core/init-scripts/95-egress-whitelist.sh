#!/bin/sh
# Deny-by-default egress policy. Allows only loopback, established connections,
# DNS to Docker internal resolver, epsilon-api, and vibe-trading (port 8899).
# All other outbound traffic is logged (rate-limited) and dropped.
#
# Defense-in-depth limitation: NET_ADMIN cap allows in-container code to flush
# these rules. Real security boundary is epsilon-api API key auth + billing.
# Proper fix (host-level iptables / internal Docker network + egress proxy)
# tracked in deferred-work.md (Story 5.0 review).
set -eu

# Verify conntrack module loaded — without it, ESTABLISHED rule fails and
# `set -e` aborts the script with OUTPUT DROP and no ACCEPT rules. Better to
# fail-fast with a clear message than brick the sandbox silently.
if ! iptables -m conntrack --help >/dev/null 2>&1; then
  echo "[egress-whitelist] FATAL: conntrack module not loaded; cannot apply ESTABLISHED rule" >&2
  exit 1
fi

# DNS readiness retry — Docker DNS may not be ready immediately on container start.
# Retry up to 10 seconds total (sleep 1 between attempts) before failing fast.
EPSILON_API_IP=""
VIBE_TRADING_IP=""
for i in 1 2 3 4 5 6 7 8 9 10; do
  EPSILON_API_IP=$(getent hosts epsilon-api 2>/dev/null | awk '{ print $1 }')
  VIBE_TRADING_IP=$(getent hosts vibe-trading 2>/dev/null | awk '{ print $1 }')
  if [ -n "$EPSILON_API_IP" ]; then
    break
  fi
  sleep 1
done

# Fail-fast: epsilon-api MUST be reachable for sandbox to function. Without it,
# OpenCode tools (LLM proxy + billing) are dead. Better to refuse to boot than
# come up half-functional.
if [ -z "$EPSILON_API_IP" ]; then
  echo "[egress-whitelist] FATAL: epsilon-api hostname unresolvable after 10s — sandbox cannot function" >&2
  exit 1
fi
# vibe-trading is optional (Story 5.0 may not be deployed); warn but continue.
if [ -z "$VIBE_TRADING_IP" ]; then
  echo "[egress-whitelist] WARN: vibe-trading hostname unresolvable — backtest tool will fail. OK if Story 5.0 not deployed." >&2
fi

# Build entire IPv4 ruleset atomically via iptables-restore. Avoids the
# blackhole window between flush + policy-DROP and ACCEPT rule additions.
DOCKER_DNS_RULE=""
VIBE_RULE=""
if [ -n "$VIBE_TRADING_IP" ]; then
  VIBE_RULE="-A OUTPUT -d $VIBE_TRADING_IP -p tcp --dport 8899 -j ACCEPT"
fi
# Restrict DNS to Docker's embedded resolver at 127.0.0.11 (standard Docker DNS).
# Falls back to allowing port 53 within RFC1918 ranges if 127.0.0.11 unavailable.
DOCKER_DNS_RULE="-A OUTPUT -d 127.0.0.11 -p udp --dport 53 -j ACCEPT
-A OUTPUT -d 127.0.0.11 -p tcp --dport 53 -j ACCEPT
-A OUTPUT -p udp --dport 53 -d 172.16.0.0/12 -j ACCEPT
-A OUTPUT -p tcp --dport 53 -d 172.16.0.0/12 -j ACCEPT"

iptables-restore <<EOF
*filter
:INPUT ACCEPT [0:0]
:FORWARD ACCEPT [0:0]
:OUTPUT DROP [0:0]
-A OUTPUT -o lo -j ACCEPT
-A OUTPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
$DOCKER_DNS_RULE
-A OUTPUT -d $EPSILON_API_IP -j ACCEPT
$VIBE_RULE
-A OUTPUT -m limit --limit 10/min --limit-burst 20 -j LOG --log-prefix "EGRESS-DENY: " --log-level 4
-A OUTPUT -j DROP
COMMIT
EOF

# IPv6 — block entirely. Without this, IPv6 routes (if any) bypass the whitelist.
# Sandbox doesn't need IPv6; epsilon-api + vibe-trading are reached via IPv4 Docker DNS.
if command -v ip6tables >/dev/null 2>&1; then
  ip6tables-restore <<EOF
*filter
:INPUT ACCEPT [0:0]
:FORWARD ACCEPT [0:0]
:OUTPUT DROP [0:0]
-A OUTPUT -o lo -j ACCEPT
-A OUTPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
-A OUTPUT -m limit --limit 10/min --limit-burst 20 -j LOG --log-prefix "EGRESS-DENY-V6: " --log-level 4
-A OUTPUT -j DROP
COMMIT
EOF
else
  echo "[egress-whitelist] WARN: ip6tables unavailable — IPv6 egress not restricted" >&2
fi

echo "[egress-whitelist] applied (epsilon-api=$EPSILON_API_IP vibe-trading=${VIBE_TRADING_IP:-n/a})"
