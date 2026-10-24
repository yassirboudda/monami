#!/bin/bash
# Turn a fresh Ubuntu 22.04 GPU box (Brev / Shadeform, docker + nvidia driver preinstalled) into the monami
# remote-desktop host. Idempotent; run as root from a checkout of desktop/:  sudo ./bootstrap-host.sh
# Before the first run write /etc/octohandy/gate.env (see CONTRACT.md) and /etc/octohandy/workspaces.json.
# Afterwards: provision-profile.sh <slug> <N> per workspace (the gate also does it on demand), then Hermes (see README).
set -euo pipefail
SRC="$(cd "$(dirname "$0")" && pwd)"
export DEBIAN_FRONTEND=noninteractive
PUBLIC_HOST="${OH_PUBLIC_HOST:-$(curl -fsS -m 10 https://ifconfig.me | tr . -).sslip.io}"

echo "== packages"
apt-get update -q
apt-get install -y -q --no-install-recommends \
  tigervnc-standalone-server tigervnc-tools xfce4 xfce4-terminal dbus-x11 xauth x11-utils xdotool \
  ffmpeg novnc fonts-noto-core fonts-noto-color-emoji fonts-liberation locales \
  tinyproxy python3-venv python3-pip ufw iptables curl ca-certificates gnupg util-linux jq
sed -i 's/^# *fr_FR.UTF-8/fr_FR.UTF-8/' /etc/locale.gen && locale-gen >/dev/null
timedatectl set-timezone Europe/Paris || true

if ! command -v google-chrome >/dev/null; then
  echo "== google chrome"
  curl -fsSL https://dl.google.com/linux/linux_signing_key.pub | gpg --dearmor -o /usr/share/keyrings/google-chrome.gpg
  echo "deb [arch=amd64 signed-by=/usr/share/keyrings/google-chrome.gpg] http://dl.google.com/linux/chrome/deb/ stable main" > /etc/apt/sources.list.d/google-chrome.list
  apt-get update -q && apt-get install -y -q google-chrome-stable
fi

if ! command -v caddy >/dev/null; then
  echo "== caddy"
  curl -fsSL 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -fsSL 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -q && apt-get install -y -q caddy
fi

echo "== code -> /opt/octohandy"
install -d -m 755 /opt/octohandy
install -d -m 700 /etc/octohandy /etc/octohandy/profiles
install -m 644 "$SRC"/gate.py "$SRC"/octohandy_browser.py "$SRC"/octohandy_sync.py "$SRC"/octohandy_mcp.py /opt/octohandy/
install -m 755 "$SRC"/harden-host.sh "$SRC"/provision-profile.sh "$SRC"/bootstrap-host.sh "$SRC"/render-tinyproxy.sh /opt/octohandy/
install -m 644 "$SRC"/CONTRACT.md /opt/octohandy/
[ -x /opt/octohandy/venv/bin/python ] || python3 -m venv /opt/octohandy/venv
/opt/octohandy/venv/bin/pip install -q -U pip wheel
/opt/octohandy/venv/bin/pip install -q -U fastapi "uvicorn[standard]" httpx websocket-client

echo "== systemd units"
install -m 644 "$SRC"/systemd/*.service /etc/systemd/system/
install -d /etc/systemd/system/oh-.slice.d
install -m 644 "$SRC"/systemd/oh-.slice.d/* /etc/systemd/system/oh-.slice.d/
systemctl daemon-reload

echo "== screenpipe image"
docker image inspect octohandy-screenpipe >/dev/null 2>&1 || docker build -q -t octohandy-screenpipe "$SRC/screenpipe-docker"

echo "== caddy on https://$PUBLIC_HOST"
sed "s/__HOST__/$PUBLIC_HOST/" "$SRC/Caddyfile" > /etc/caddy/Caddyfile
systemctl enable -q caddy
systemctl reload caddy 2>/dev/null || systemctl restart caddy

if [ ! -s /etc/octohandy/gate.env ]; then
  echo "!! /etc/octohandy/gate.env missing: DESKTOP_SIGNING_SECRET, DESKTOP_VNC_PASSWORD, SCREENPIPE_API_KEY, OH_BACKEND_URL, OH_BACKEND_TOKEN, OH_MCP_WORKSPACE, OH_DEFAULT_SLUG (then re-run)"
  exit 1
fi
chmod 600 /etc/octohandy/gate.env
[ -s /etc/octohandy/workspaces.json ] || echo '{}' > /etc/octohandy/workspaces.json
chmod 600 /etc/octohandy/workspaces.json

echo "== services"
systemctl disable -q --now tinyproxy.service 2>/dev/null || true
[ -s /etc/octohandy/proxy.env ] && systemctl enable -q --now oh-proxy.service
systemctl enable -q --now oh-firewall.service oh-gate.service oh-mcp.service
systemctl restart oh-gate.service oh-mcp.service
sleep 2
curl -fsS -m 5 http://127.0.0.1:6081/desktop/health && echo
echo "OK  base url: https://$PUBLIC_HOST   (set DESKTOP_BASE_URL / HERMES_API_URL / SCREENPIPE_API_URL on the API host)"
