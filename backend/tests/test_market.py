from app import market


def test_normalize_ebay_sold_row():
    row = {"title": "T-shirt Uniqlo UT", "soldPrice": "17.00", "soldCurrency": "EUR", "endedAt": "2026-10-12",
           "itemId": "198701750849", "url": "https://www.ebay.fr/itm/198701750849", "condition": "Occasion",
           "thumbnailUrl": "https://i.ebayimg.com/x.webp"}
    out = market.normalize_item("ebay", row, "uniqlo t-shirt")
    assert out["price"] == 17.0 and out["currency"] == "EUR" and out["kind"] == "sold"
    assert out["item_id"] == "198701750849" and out["listed_at"] == "2026-10-12"


def test_normalize_handles_nested_price_and_cents():
    assert market.normalize_item("vinted", {"title": "Pull", "price": {"amount": "12,50", "currency_code": "EUR"}}, "pull")["price"] == 12.5
    assert market.normalize_item("vinted", {"title": "Pull", "price_cents": 1999}, "pull")["price"] == 19.99
    assert market.normalize_item("vinted", {"title": "Pull"}, "pull") is None
    assert market.normalize_item("vinted", {"price": 3}, "pull") is None


def test_stats_median_and_delta():
    rows = [{"price": p} for p in (10, 20, 30, 40)]
    s = market.stats(rows, own_price=50)
    assert s["n"] == 4 and s["median"] == 25 and s["p25"] == 17.5 and s["p75"] == 32.5
    assert s["deltaPct"] == 100
    assert market.stats([])["n"] == 0


def test_comps_requires_configuration(monkeypatch):
    monkeypatch.setattr(market.settings, "apify_token", "")
    try:
        market.comps("uniqlo", "ebay")
    except market.MarketError as e:
        assert "not configured" in str(e)
    else:
        raise AssertionError("expected MarketError")
