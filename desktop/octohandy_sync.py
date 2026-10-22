"""Read the seller's own account + listings from the logged-in desktop Chrome (in-page fetch via CDP, same session)."""
from __future__ import annotations
import json, time
import octohandy_browser as browser

ACCOUNT_URLS = {"vinted": "https://www.vinted.fr/member/general/account", "ebay": "https://www.ebay.fr/sh/lst/active",
                "leboncoin": "https://www.leboncoin.fr/compte/part/mes-annonces", "etsy": "https://www.etsy.com/your/shops/me/dashboard"}

VINTED_JS = r"""(async () => {
  const h = {"accept": "application/json"};
  const me = await fetch('/api/v2/users/current', {headers: h}).then(r => r.ok ? r.json() : null).catch(() => null);
  const u = me && me.user; if (!u || !u.id) return JSON.stringify({loggedIn: false});
  let page = 1, items = [];
  while (page <= 5) {
    const d = await fetch(`/api/v2/users/${u.id}/items?page=${page}&per_page=96&order=relevance`, {headers: h}).then(r => r.ok ? r.json() : null).catch(() => null);
    if (!d || !d.items || !d.items.length) break;
    items = items.concat(d.items); if (d.items.length < 96) break; page++;
  }
  return JSON.stringify({loggedIn: true, account: {username: u.login, id: String(u.id), url: u.profile_url, items: u.item_count},
    listings: items.map(i => ({id: 'vinted-' + i.id, title: i.title, price: parseFloat((i.price && i.price.amount) || i.price || 0), currency: (i.price && i.price.currency_code) || 'EUR',
      status: i.is_closed ? 'sold' : (i.is_reserved ? 'reserved' : 'active'), imageUrl: i.photo && (i.photo.full_size_url || i.photo.url), url: i.url, views: i.view_count, favorites: i.favourite_count}))});
})()"""

GENERIC_JS = r"""(() => { const t = document.body ? document.body.innerText : ''; const loggedOut = /se connecter|s'identifier|sign in|log in|connexion/i.test(t.slice(0, 4000)) && !/déconnexion|se déconnecter|sign out|log out/i.test(t);
  return JSON.stringify({loggedIn: !loggedOut, account: {}, listings: [], url: location.href, title: document.title}); })()"""


def sync(marketplace: str, port: int) -> dict:
    url = ACCOUNT_URLS.get(marketplace)
    if not url:
        return {"ok": False, "error": f"unknown marketplace {marketplace}"}
    browser.CDP_PORT = int(port)
    tabs = browser._tabs()
    host = url.split("/")[2].split(".")[-2]
    tab_id = next((t["id"] for t in tabs if host in t["url"]), None)
    tab = browser.Tab(tab_id)
    try:
        if not tab_id or host not in tab.info["url"]:
            tab.rpc("Page.navigate", {"url": url}); tab.ctx = None; time.sleep(4)
        js = VINTED_JS if marketplace == "vinted" else GENERIC_JS
        raw = tab.js(js, await_promise=(marketplace == "vinted"))
        data = json.loads(raw or "{}")
        data["ok"] = True
        data.setdefault("listings", []); data.setdefault("account", {})
        return data
    finally:
        tab.close()
