#!/bin/bash
# Render /run/tinyproxy/tinyproxy.conf from /etc/octohandy/proxy.env (PROXY_HOST/PORT/USER/PASS). Called by oh-proxy.service.
set -euo pipefail
. /etc/octohandy/proxy.env
mkdir -p /run/tinyproxy
cat > /run/tinyproxy/tinyproxy.conf <<CONF
User nobody
Group nogroup
Port 3128
Listen 127.0.0.1
Timeout 600
MaxClients 200
LogLevel Warning
PidFile "/run/tinyproxy/tinyproxy.pid"
Allow 127.0.0.1
DisableViaHeader Yes
ConnectPort 443
ConnectPort 80
upstream http ${PROXY_USER}:${PROXY_PASS}@${PROXY_HOST}:${PROXY_PORT}
CONF
chmod 600 /run/tinyproxy/tinyproxy.conf
