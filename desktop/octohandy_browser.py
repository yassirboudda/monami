"""CDP browser actions for the OctoHandy desktop Chrome (loopback DevTools 9222)."""
import json, re, time, random, math, urllib.request
from websocket import create_connection

CDP_PORT = 9222

def _cdp(): return f"http://127.0.0.1:{CDP_PORT}"
DANGER = re.compile(r"(envoyer|send|publier|publish|mettre en vente|confirmer|confirm|payer|pay|acheter|buy|supprimer|delete|faire une offre|proposer|valider|submit|accepter|accept|refuser|decline|baisser le prix|modifier le prix|commander|order)", re.I)

INDEX_JS = r"""(() => {
  const vis = e => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 2 && r.height > 2 && s.visibility !== 'hidden' && s.display !== 'none' && r.bottom > 0 && r.top < innerHeight + 1200; };
  const sel = 'a[href],button,input,textarea,select,[role=button],[role=link],[role=tab],[role=menuitem],[role=option],[contenteditable=true],[onclick],[tabindex]:not([tabindex="-1"])';
  const els = Array.from(document.querySelectorAll(sel)).filter(vis);
  const items = []; globalThis.__ohEls = els;
  els.forEach((e, i) => {
    const r = e.getBoundingClientRect();
    const txt = (e.innerText || e.value || e.getAttribute('aria-label') || e.getAttribute('placeholder') || e.getAttribute('title') || e.alt || '').replace(/\s+/g, ' ').trim().slice(0, 90);
    items.push({ i, tag: e.tagName.toLowerCase(), type: e.type || e.getAttribute('role') || null, text: txt, href: e.href ? String(e.href).slice(0, 160) : null,
      name: e.name || e.id || e.getAttribute('data-testid') || null, value: (e.value && e.type !== 'password') ? String(e.value).slice(0, 80) : null,
      above: r.top < 0 ? true : undefined, below: r.top > innerHeight ? true : undefined, checked: e.checked });
  });
  const txt = (document.body && document.body.innerText || '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n');
  return JSON.stringify({ url: location.href, title: document.title, scrollY: Math.round(scrollY), height: Math.round(document.body ? document.body.scrollHeight : 0), vh: innerHeight, text: txt, items });
})()"""

def _tabs():
    return [t for t in json.load(urllib.request.urlopen(f"{_cdp()}/json", timeout=5)) if t.get("type") == "page" and not t["url"].startswith(("devtools://", "chrome://"))]

class Tab:
    def __init__(self, tab_id=None):
        tabs = _tabs()
        if not tabs: raise RuntimeError("aucun onglet Chrome ouvert")
        t = next((x for x in tabs if x["id"] == tab_id), None) if tab_id else tabs[0]
        if not t: raise RuntimeError("onglet introuvable")
        self.info, self._i, self.ctx = t, 0, None
        self.ws = create_connection(t["webSocketDebuggerUrl"], timeout=30, suppress_origin=True)
    def world(self):
        if self.ctx is None:
            tree = self.rpc("Page.getFrameTree")
            fid = tree["frameTree"]["frame"]["id"]
            self.ctx = self.rpc("Page.createIsolatedWorld", {"frameId": fid, "worldName": "oh", "grantUniveralAccess": False}).get("executionContextId")
        return self.ctx
    def rpc(self, method, params=None):
        self._i += 1; i = self._i
        self.ws.send(json.dumps({"id": i, "method": method, "params": params or {}}))
        while True:
            m = json.loads(self.ws.recv())
            if m.get("id") == i:
                if "error" in m: raise RuntimeError(m["error"].get("message", "cdp error"))
                return m.get("result", {})
    def js(self, expr, await_promise=False):
        params = {"expression": expr, "returnByValue": True, "awaitPromise": await_promise}
        try:
            params["contextId"] = self.world()
            r = self.rpc("Runtime.evaluate", params)
        except RuntimeError:
            self.ctx = None; params["contextId"] = self.world(); r = self.rpc("Runtime.evaluate", params)
        if "exceptionDetails" in r: raise RuntimeError(r["exceptionDetails"].get("text", "js error"))
        return r.get("result", {}).get("value")
    def close(self): self.ws.close()

def _target_js(args):
    if args.get("index") is not None: return f"(globalThis.__ohEls || [])[{int(args['index'])}]"
    if args.get("selector"): return f"document.querySelector({json.dumps(args['selector'])})"
    if args.get("text"):
        t = json.dumps(str(args["text"]).lower())
        return ("Array.from(document.querySelectorAll('a,button,input,textarea,[role=button],[role=link],[role=tab],label,span,div,li')).filter(e=>e.getBoundingClientRect().width>2)"
                f".find(e=>((e.innerText||e.value||e.getAttribute('aria-label')||e.placeholder||'').replace(/\\s+/g,' ').trim().toLowerCase())==={t})"
                "||Array.from(document.querySelectorAll('a,button,input,textarea,[role=button],[role=link],[role=tab],label')).filter(e=>e.getBoundingClientRect().width>2)"
                f".find(e=>(e.innerText||e.value||e.getAttribute('aria-label')||e.placeholder||'').toLowerCase().includes({t}))")
    raise ValueError("cible manquante : index, selector ou text")

def _describe(tab, tjs):
    return tab.js(f"""(() => {{ const e = {tjs}; if (!e) return null; e.scrollIntoView({{block:'center', inline:'center'}}); const r = e.getBoundingClientRect();
      const label = (e.innerText || e.value || e.getAttribute('aria-label') || e.placeholder || e.title || '').replace(/\\s+/g,' ').trim().slice(0,120);
      const form = e.closest('form'); const submitLike = e.type === 'submit' || (form && e.tagName === 'BUTTON' && !e.type);
      const isSearch = e.type === 'search' || /recherch|search|chercher/i.test((e.name||'') + ' ' + (e.placeholder||'') + ' ' + (e.getAttribute('aria-label')||'') + ' ' + (form && form.getAttribute('role') || '') + ' ' + (form && form.action || ''));
      const ctx = form ? (form.innerText || '').slice(0, 600) : '';
      const composer = e.tagName === 'TEXTAREA' || e.isContentEditable || (form && !!form.querySelector('textarea,[contenteditable=true]'));
      return JSON.stringify({{ x: r.left + r.width/2, y: r.top + r.height/2, w: r.width, h: r.height, tag: e.tagName.toLowerCase(), type: e.type || null, label, href: e.href || null, submitLike, isSearch, composer, ctx, editable: e.isContentEditable || ['INPUT','TEXTAREA'].includes(e.tagName) }}); }})()""")

_POS = {"x": 800.0, "y": 450.0}

def _pause(a=0.04, b=0.14): time.sleep(random.uniform(a, b))

def _bezier_path(x0, y0, x1, y1):
    dist = math.hypot(x1 - x0, y1 - y0)
    n = max(8, min(40, int(dist / 18)))
    # two control points off the straight line, like a wrist arc
    spread = max(12.0, dist * random.uniform(0.12, 0.3))
    c1 = (x0 + (x1 - x0) * random.uniform(0.2, 0.4) + random.uniform(-spread, spread), y0 + (y1 - y0) * random.uniform(0.2, 0.4) + random.uniform(-spread, spread))
    c2 = (x0 + (x1 - x0) * random.uniform(0.6, 0.8) + random.uniform(-spread, spread), y0 + (y1 - y0) * random.uniform(0.6, 0.8) + random.uniform(-spread, spread))
    pts = []
    for i in range(1, n + 1):
        t = i / n
        t = t * t * (3 - 2 * t)  # ease in/out
        x = (1-t)**3*x0 + 3*(1-t)**2*t*c1[0] + 3*(1-t)*t**2*c2[0] + t**3*x1
        y = (1-t)**3*y0 + 3*(1-t)**2*t*c1[1] + 3*(1-t)*t**2*c2[1] + t**3*y1
        if i < n:
            x += random.uniform(-1.2, 1.2); y += random.uniform(-1.2, 1.2)
        pts.append((x, y))
    return pts

def _move_to(tab, x, y):
    for px, py in _bezier_path(_POS["x"], _POS["y"], x, y):
        tab.rpc("Input.dispatchMouseEvent", {"type": "mouseMoved", "x": px, "y": py})
        time.sleep(random.uniform(0.004, 0.018))
    _POS["x"], _POS["y"] = x, y

def _target_point(d):
    # somewhere inside the element, biased to the centre, never the exact centre
    w, h = max(4.0, d.get("w", 10)), max(4.0, d.get("h", 10))
    x = d["x"] + random.gauss(0, w / 6); y = d["y"] + random.gauss(0, h / 6)
    x = min(max(x, d["x"] - w / 2 + 2), d["x"] + w / 2 - 2); y = min(max(y, d["y"] - h / 2 + 2), d["y"] + h / 2 - 2)
    return x, y

def _mouse(tab, x, y, button="left", clicks=1):
    _move_to(tab, x, y)
    _pause(0.05, 0.18)
    for _ in range(clicks):
        tab.rpc("Input.dispatchMouseEvent", {"type": "mousePressed", "x": x, "y": y, "button": button, "clickCount": 1})
        time.sleep(random.uniform(0.045, 0.12))
        tab.rpc("Input.dispatchMouseEvent", {"type": "mouseReleased", "x": x, "y": y, "button": button, "clickCount": 1})
        _pause(0.06, 0.15)

def _wander(tab):
    """small idle mouse drift after an action, like a hand resting"""
    if random.random() < 0.6:
        _move_to(tab, _POS["x"] + random.uniform(-40, 40), _POS["y"] + random.uniform(-25, 25))

def _sensitive(d):
    if d.get("isSearch"): return False
    if DANGER.search(d.get("label") or ""): return True
    if d.get("submitLike") and (d.get("composer") or DANGER.search(d.get("ctx") or "")): return True
    return False

def _needs_approval(d, args):
    if args.get("approved"):
        if _sensitive(d): print(f"[audit] APPROVED by agent: {d.get('tag')} {d.get('label')!r} on {d.get('href') or ''}", flush=True)
        return False
    return _sensitive(d)

def _submit_needs_approval(d, args):
    if d.get("isSearch") and not d.get("composer"): return False
    if args.get("approved"):
        print(f"[audit] APPROVED submit by agent in {d.get('tag')} {d.get('label')!r}", flush=True); return False
    return True

def act(action, args, port=None):
    global CDP_PORT
    if port: CDP_PORT = int(port)
    args = args or {}
    if action == "tabs":
        return {"ok": True, "tabs": [{"id": t["id"], "title": t.get("title", "")[:80], "url": t["url"][:160]} for t in _tabs()]}
    tab = Tab(args.get("tab_id"))
    try:
        tab.rpc("Page.bringToFront")
        if action == "navigate":
            url = str(args.get("url", ""))
            if not url.startswith(("http://", "https://")): return {"ok": False, "error": "URL refusée"}
            tab.rpc("Page.navigate", {"url": url}); tab.ctx = None; time.sleep(float(args.get("wait", 4)) + random.uniform(0.3, 1.2))
            action = "read"
        if action == "read":
            page = json.loads(tab.js(INDEX_JS) or "{}")
            lim = int(args.get("max_chars", 6000))
            page["text"] = page.get("text", "")[:lim]
            if args.get("filter"):
                f = str(args["filter"]).lower()
                page["items"] = [it for it in page["items"] if f in json.dumps(it, ensure_ascii=False).lower()]
            page["items"] = page["items"][: int(args.get("max_items", 80))]
            page["ok"] = True
            return page
        if action == "click":
            tjs = _target_js(args)
            d = json.loads(_describe(tab, tjs) or "null")
            if not d: return {"ok": False, "error": "élément introuvable (fais browser_read d'abord)"}
            if _needs_approval(d, args):
                return {"ok": False, "needsApproval": True, "element": d, "error": "action sensible (envoi/validation/paiement) : demande l'accord explicite du vendeur, puis rappelle avec approved=true"}
            time.sleep(0.3)
            d = json.loads(_describe(tab, tjs) or "null") or d
            px, py = _target_point(d)
            _mouse(tab, px, py, clicks=2 if args.get("double") else 1)
            time.sleep(float(args.get("wait", 1.5)) + random.uniform(0.2, 0.9)); _wander(tab)
            return {"ok": True, "clicked": d, "url": tab.js("location.href"), "title": tab.js("document.title")}
        if action == "type":
            text = str(args.get("text", ""))[:4000]
            tjs = _target_js(args) if any(args.get(k) is not None for k in ("index", "selector", "text_target")) else "document.activeElement"
            if args.get("text_target"): tjs = _target_js({"text": args["text_target"]})
            d = json.loads(_describe(tab, tjs) or "null")
            if not d: return {"ok": False, "error": "champ introuvable"}
            if not d.get("editable"): return {"ok": False, "error": f"la cible n'est pas un champ de saisie ({d.get('tag')})"}
            px, py = _target_point(d); _mouse(tab, px, py); _pause(0.15, 0.4)
            if args.get("clear", True):
                tab.rpc("Input.dispatchKeyEvent", {"type": "keyDown", "key": "a", "code": "KeyA", "modifiers": 2, "windowsVirtualKeyCode": 65})
                tab.rpc("Input.dispatchKeyEvent", {"type": "keyUp", "key": "a", "code": "KeyA", "modifiers": 2, "windowsVirtualKeyCode": 65})
                tab.rpc("Input.dispatchKeyEvent", {"type": "keyDown", "key": "Backspace", "code": "Backspace", "windowsVirtualKeyCode": 8})
                tab.rpc("Input.dispatchKeyEvent", {"type": "keyUp", "key": "Backspace", "code": "Backspace", "windowsVirtualKeyCode": 8})
            for ch in text:
                if ch == "\n":
                    tab.rpc("Input.dispatchKeyEvent", {"type": "keyDown", "key": "Enter", "code": "Enter", "windowsVirtualKeyCode": 13, "modifiers": 8})
                    tab.rpc("Input.dispatchKeyEvent", {"type": "keyUp", "key": "Enter", "code": "Enter", "windowsVirtualKeyCode": 13, "modifiers": 8})
                else:
                    tab.rpc("Input.insertText", {"text": ch})
                time.sleep(random.gauss(0.11, 0.035) if ch.isalnum() else random.uniform(0.15, 0.35))
                if random.random() < 0.04: time.sleep(random.uniform(0.4, 1.1))
            out = {"ok": True, "typed": len(text), "field": d}
            if args.get("submit"):
                if _submit_needs_approval(d, args):
                    out.update({"ok": False, "needsApproval": True, "error": "submit = envoi : demande l'accord explicite du vendeur, puis rappelle avec approved=true"}); return out
                _pause(0.3, 0.8)
                tab.rpc("Input.dispatchKeyEvent", {"type": "keyDown", "key": "Enter", "code": "Enter", "windowsVirtualKeyCode": 13, "text": "\r"})
                tab.rpc("Input.dispatchKeyEvent", {"type": "keyUp", "key": "Enter", "code": "Enter", "windowsVirtualKeyCode": 13})
                time.sleep(1.5); out["submitted"] = True
            return out
        if action == "scroll":
            dy = int(args.get("dy", 600))
            vh = int(tab.js("innerHeight") or 800)
            sx, sy = _POS["x"] + random.uniform(-30, 30), min(max(_POS["y"] + random.uniform(-30, 30), 80), vh - 60)
            done = 0
            while abs(done) < abs(dy):
                step = max(40, min(abs(dy) - abs(done), int(random.gauss(110, 30)))) * (1 if dy > 0 else -1)
                tab.rpc("Input.dispatchMouseEvent", {"type": "mouseWheel", "x": sx, "y": sy, "deltaX": 0, "deltaY": step})
                done += step; time.sleep(random.uniform(0.03, 0.09))
            time.sleep(random.uniform(0.5, 1.0))
            return {"ok": True, "scrollY": tab.js("Math.round(scrollY)"), "height": tab.js("document.body.scrollHeight")}
        if action == "press":
            key = str(args.get("key", "Escape"))
            if key.lower() in ("enter", "return"):
                d = json.loads(_describe(tab, "document.activeElement") or "null") or {}
                if _submit_needs_approval(d, args):
                    return {"ok": False, "needsApproval": True, "element": d, "error": "Entrée peut envoyer un message/formulaire : accord du vendeur requis (approved=true)"}
            codes = {"Escape": 27, "Enter": 13, "Tab": 9, "Backspace": 8, "ArrowDown": 40, "ArrowUp": 38, "PageDown": 34, "PageUp": 33, "End": 35, "Home": 36}
            k = {"enter": "Enter", "esc": "Escape"}.get(key.lower(), key)
            p = {"key": k, "code": k, "windowsVirtualKeyCode": codes.get(k, 0)}
            tab.rpc("Input.dispatchKeyEvent", {"type": "keyDown", **p}); tab.rpc("Input.dispatchKeyEvent", {"type": "keyUp", **p})
            time.sleep(0.5); return {"ok": True}
        if action == "back":
            tab.js("history.back()"); time.sleep(2); return {"ok": True, "url": tab.js("location.href")}
        if action == "wait":
            time.sleep(min(float(args.get("seconds", 2)), 20)); return {"ok": True, "url": tab.js("location.href"), "title": tab.js("document.title")}
        if action == "screenshot":
            r = tab.rpc("Page.captureScreenshot", {"format": "jpeg", "quality": 60})
            return {"ok": True, "jpegBase64": r.get("data")}
        return {"ok": False, "error": f"action inconnue {action}"}
    finally:
        tab.close()
