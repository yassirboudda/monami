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
