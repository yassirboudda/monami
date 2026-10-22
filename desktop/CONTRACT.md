# Remote desktop box (A6000) — contract with the Hetzner backend

Backend (`backend/app/main.py`) talks to `DESKTOP_BASE_URL` (Caddy, TLS, sslip.io) with header
`X-Gate-Secret: <DESKTOP_SIGNING_SECRET>` on every `/desktop/*` call. Paths proxied by Caddy:

- `GET  /vnc.html?autoconnect=1&resize=scale&reconnect=1&show_dot=1&password=<DESKTOP_VNC_PASSWORD>&t=<token>&path=websockify?t=<token>`
  token = HMAC(DESKTOP_SIGNING_SECRET) signed by the backend (`_desktop_token(workspace, marketplace, ttl)`), the gate
  only has to verify it before upgrading `/websockify` to the Xvnc of that workspace's profile.
- `GET  /desktop/health` -> 200
- `POST /desktop/open {url}` -> 200 (navigate the profile's Chrome; NEVER spawn a second chrome instance)
- `POST /desktop/browser {action, args}` -> octohandy_browser.act(); action "tabs" -> {ok, tabs:[{id,title,url}]} (tabs[0] = active)
- `GET/POST /desktop/clipboard` -> {text} / {text}
- `GET  /desktop/image?url&referer` -> image bytes downloaded through the desktop (proxy) network
- `POST /desktop/sync {marketplace}` -> {ok, loggedIn, account:{username}, listings:[{id,title,price,status,imageUrl,url,views,favorites}]} or {ok:false,error}
- `POST /desktop/inbox/run {marketplace}` -> {ok} (one immediate inbox-monitor pass)
- `POST /desktop/files/put {name, b64}` -> {ok, path}  (saved under <profile home>/Pictures/chat/)
- `POST /desktop/record/start {label}` -> {ok, id(16 hex)} ; `POST /desktop/record/stop {id}` -> {ok, id, durationSec}
- `GET  /desktop/recordings/<id>.mp4` -> video
- `/hermes/*` -> Hermes gateway 127.0.0.1:8642 (backend uses `HERMES_API_URL=<base>/hermes/v1`, Bearer HERMES_API_KEY,
  header `X-Hermes-Session-Key`)
- `/screenpipe/*` -> Screenpipe 127.0.0.1:3030 of the profile (backend `SCREENPIPE_API_URL=<base>/screenpipe`, Bearer SCREENPIPE_API_KEY)

Multi-profile (one Linux user per Clerk workspace): header `X-Workspace: <workspace>` selects the profile
(`oh-<slug>` user, display :N, VNC 5900+N, websockify, Chrome CDP 9222+N, Screenpipe 3030+N, recordings dir).
Without the header the gate falls back to the default profile (founder workspace) so the current backend keeps working.

## Tenant isolation on the box (harden-host.sh)

One Linux user `oh-<slug>` per workspace is not enough on its own: a seller who opens a terminal in their desktop
must not reach the other sellers. `provision-profile.sh` and `oh-firewall.service` therefore run `harden-host.sh`:

- `/proc` mounted `hidepid=2` → `ps` only shows the tenant's own processes.
- `/home/oh-*` are `0700`, `/etc/octohandy/gate.env` and `workspaces.json` root-only; `oh-*` are never in `sudo`/`docker`.
- Xvnc runs with `-auth ~/.Xauthority` (cookie generated at provision, `XAUTHORITY` in the profile env, mounted read-only
  into the Screenpipe container) → `DISPLAY=:N` of another profile answers "Authorization required".
- `iptables` chain `OH_TENANT` (owner match per uid): a tenant may open connections to the internet, to its own
  VNC/CDP/Screenpipe ports and to the local DNS resolver only — every other loopback port (other profiles, gate :6081,
  MCP :6082), docker/OpenShell networks (172.16/12), the Brev mesh (100.64/10) and cloud metadata (169.254/16) are rejected.
  Replies to connections opened by root (gate → CDP, websockify → Xvnc) pass through the leading conntrack rule.
- Resources: `oh-<slug>.slice` (Xvnc/Chrome units, `systemd/oh-.slice.d/limits.conf`) and `user-<uid>.slice`
  (the XFCE session, because `PAMName=login` hands it to logind) are capped at CPUQuota 250 %, MemoryMax 10 G, TasksMax 1500.
  `NoNewPrivileges=yes` on the session/Chrome/Xvnc units.

Test recipe: `provision-profile.sh sec2 2`, then as `oh-sec2`: `ls /home/oh-main`, `cat /etc/octohandy/gate.env`,
`ps -u oh-main`, `curl 127.0.0.1:{5901,9201,3031,6081,6082}`, `curl 172.18.0.1:8080`, `DISPLAY=:1 xdpyinfo` — all must fail;
`curl https://www.vinted.fr` and `DISPLAY=:2 xdpyinfo` must work. Clean up with `systemctl disable --now oh-*@sec2`,
`loginctl terminate-user oh-sec2`, `userdel -r oh-sec2`, `rm /etc/octohandy/profiles/sec2.env`, `harden-host.sh`.
