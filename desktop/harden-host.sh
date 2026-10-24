#!/bin/bash
# Host-level isolation between desktop profiles (one Linux user oh-<slug> per workspace). Idempotent; run as root.
# A tenant with a terminal in its own desktop must not see or reach the other tenants:
#   - /proc hidepid=2        -> cannot list other users' processes
#   - homes 0700             -> cannot read other users' files (Chrome profiles, recordings, cookies)
#   - X authority cookies    -> cannot open another profile's display (Xvnc runs with -auth)
#   - iptables owner match   -> cannot reach loopback/LAN/docker services (other VNC/CDP/Screenpipe ports, gate, Hermes, MCP, metadata)
#   - oh-<slug>.slice limits -> cannot starve CPU/RAM/pids (see systemd/oh-.slice.d/limits.conf)
set -euo pipefail
PROFILES=/etc/octohandy/profiles

# 1. processes
if ! grep -qE '^proc\s+/proc\s+proc\s+\S*hidepid=' /etc/fstab; then
  sed -i -E '/^proc\s+\/proc\s+/d' /etc/fstab
  echo 'proc /proc proc defaults,nosuid,nodev,noexec,hidepid=2 0 0' >> /etc/fstab
fi
mount -o remount,hidepid=2 /proc

# 2. files
chmod 700 /home/oh-* 2>/dev/null || true
chmod 600 /etc/octohandy/workspaces.json 2>/dev/null || true
chmod 1777 /tmp/.X11-unix
for u in $(getent passwd | awk -F: '$1 ~ /^oh-/ {print $1}'); do
  for g in sudo docker adm; do gpasswd -d "$u" "$g" >/dev/null 2>&1 || true; done
done

# 3. network: per-uid OUTPUT rules
iptables -N OH_TENANT 2>/dev/null || iptables -F OH_TENANT
iptables -C OUTPUT -j OH_TENANT 2>/dev/null || iptables -I OUTPUT 1 -j OH_TENANT
# replies to connections someone else opened towards a tenant process (gate -> CDP, websockify -> Xvnc) must pass:
# only the tenant's own NEW connections are filtered below
iptables -A OH_TENANT -m conntrack --ctstate ESTABLISHED,RELATED -j RETURN
for f in "$PROFILES"/*.env; do
  [ -e "$f" ] || continue
  # shellcheck disable=SC1090
  . "$f"
  uid="$(id -u "$OH_USER" 2>/dev/null || true)"; [ -n "$uid" ] || continue
  # own display stack only (the gate, running as root, is the one that talks to CDP/Screenpipe) + local DNS resolver
  for port in 3128 "$OH_VNC_PORT" "$OH_CDP_PORT" "$OH_SP_PORT"; do
    iptables -A OH_TENANT -m owner --uid-owner "$uid" -o lo -p tcp --dport "$port" -j ACCEPT
  done
  iptables -A OH_TENANT -m owner --uid-owner "$uid" -o lo -p udp --dport 53 -j ACCEPT
  iptables -A OH_TENANT -m owner --uid-owner "$uid" -o lo -p tcp --dport 53 -j ACCEPT
  iptables -A OH_TENANT -m owner --uid-owner "$uid" -o lo -j REJECT --reject-with icmp-port-unreachable
  # Zero-leak egress: when the FR proxy is configured, a tenant may only reach the internet through tinyproxy (127.0.0.1:3128).
  if [ -s /etc/octohandy/proxy.env ]; then
    iptables -A OH_TENANT -m owner --uid-owner "$uid" ! -o lo -j REJECT --reject-with icmp-port-unreachable
  fi
  for net in 10.0.0.0/8 172.16.0.0/12 192.168.0.0/16 100.64.0.0/10 169.254.0.0/16; do
    iptables -A OH_TENANT -m owner --uid-owner "$uid" -d "$net" -j REJECT --reject-with icmp-port-unreachable
  done
done
echo "harden-host: $(ls "$PROFILES"/*.env 2>/dev/null | wc -l) profile(s) isolated"
