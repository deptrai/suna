#!/bin/sh
# Deny-by-default egress policy. Allows only loopback, established connections,
# DNS, epsilon-api, and vibe-trading (port 8899). All other outbound traffic
# is logged and dropped.
set -eu

sleep 1

EPSILON_API_IP=$(getent hosts epsilon-api | awk '{ print $1 }' || echo "")
VIBE_TRADING_IP=$(getent hosts vibe-trading | awk '{ print $1 }' || echo "")

iptables -F OUTPUT
iptables -P OUTPUT DROP

iptables -A OUTPUT -o lo -j ACCEPT
iptables -A OUTPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
iptables -A OUTPUT -p udp --dport 53 -j ACCEPT
iptables -A OUTPUT -p tcp --dport 53 -j ACCEPT

if [ -n "$EPSILON_API_IP" ]; then
  iptables -A OUTPUT -d "$EPSILON_API_IP" -j ACCEPT
fi
if [ -n "$VIBE_TRADING_IP" ]; then
  iptables -A OUTPUT -d "$VIBE_TRADING_IP" -p tcp --dport 8899 -j ACCEPT
fi

iptables -A OUTPUT -j LOG --log-prefix "EGRESS-DENY: " --log-level 4
iptables -A OUTPUT -j DROP

echo "[egress-whitelist] applied"
