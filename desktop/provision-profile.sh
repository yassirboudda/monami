#!/bin/bash
# Create (idempotently) one isolated Linux desktop profile on the GPU box.
# usage: sudo provision-profile.sh <slug> <N>   -> user oh-<slug>, display :N, VNC 5900+N, CDP 9200+N, Screenpipe 3030+N
set -euo pipefail
SLUG="$1"; N="$2"; U="oh-$SLUG"; HOME_DIR="/home/$U"
VNC_PASS="$(grep -E '^DESKTOP_VNC_PASSWORD=' /etc/octohandy/gate.env | cut -d= -f2- | tr -d "'\"")"
id -u "$U" >/dev/null 2>&1 || useradd -m -s /bin/bash -G audio,video "$U"
mkdir -p /etc/octohandy/profiles
cat > "/etc/octohandy/profiles/$SLUG.env" <<ENV
OH_SLUG=$SLUG
OH_USER=$U
OH_HOME=$HOME_DIR
OH_N=$N
DISPLAY=:$N
OH_VNC_PORT=$((5900+N))
OH_CDP_PORT=$((9200+N))
OH_SP_PORT=$((3030+N))
XAUTHORITY=$HOME_DIR/.Xauthority
ENV
UID_N="$(id -u "$U")"
chmod 700 "$HOME_DIR"
install -d -o "$U" -g "$U" -m 700 "$HOME_DIR/.vnc" "$HOME_DIR/.config" "$HOME_DIR/Pictures/chat" "$HOME_DIR/recordings" "$HOME_DIR/.screenpipe"
# MIT-MAGIC-COOKIE: only this user (and the root gate) can open display :N — another tenant on the box cannot.
if [ ! -s "$HOME_DIR/.Xauthority" ]; then
  touch "$HOME_DIR/.Xauthority"; chown "$U:$U" "$HOME_DIR/.Xauthority"; chmod 600 "$HOME_DIR/.Xauthority"
  sudo -u "$U" xauth -f "$HOME_DIR/.Xauthority" add ":$N" MIT-MAGIC-COOKIE-1 "$(mcookie)" 2>/dev/null
fi
echo "$VNC_PASS" | vncpasswd -f > "$HOME_DIR/.vnc/passwd"; chown "$U:$U" "$HOME_DIR/.vnc/passwd"; chmod 600 "$HOME_DIR/.vnc/passwd"
# xfce without screensaver/lock/power popups, French locale
sudo -u "$U" mkdir -p "$HOME_DIR/.config/xfce4/xfconf/xfce-perchannel-xml" "$HOME_DIR/.config/autostart"
cat > "$HOME_DIR/.config/xfce4/xfconf/xfce-perchannel-xml/xfce4-screensaver.xml" <<'X'
<?xml version="1.0" encoding="UTF-8"?>
<channel name="xfce4-screensaver" version="1.0"><property name="saver" type="empty"><property name="enabled" type="bool" value="false"/></property><property name="lock" type="empty"><property name="enabled" type="bool" value="false"/></property></channel>
X
chown -R "$U:$U" "$HOME_DIR/.config"
loginctl enable-linger "$U" >/dev/null 2>&1 || true
# The XFCE session (PAMName=login) lands in user-<uid>.slice, not oh-<slug>.slice: cap both so a tenant's terminal can't starve the box.
systemctl set-property "user-$UID_N.slice" CPUQuota=250% MemoryMax=10G MemorySwapMax=0 TasksMax=1500 >/dev/null 2>&1 || true
for unit in oh-vnc oh-desktop oh-chrome oh-screenpipe; do
  systemctl enable --now "$unit@$SLUG.service" >/dev/null 2>&1 || systemctl restart "$unit@$SLUG.service" || true
done
/opt/octohandy/harden-host.sh >/dev/null 2>&1 || true
echo "profile $SLUG ready: user=$U display=:$N vnc=$((5900+N)) cdp=$((9200+N)) screenpipe=$((3030+N))"
