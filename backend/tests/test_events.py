from app import events


def test_emit_is_noop_without_kafka(monkeypatch):
    monkeypatch.setattr(events.settings, "kafka_bootstrap_servers", "")
    ev = events.emit("agent.reply_sent", "user:u1", {"messageId": "am-1"}, marketplace="vinted", user_id="u1")
    assert ev["kind"] == "agent.reply_sent"
    assert ev["workspace"] == "user:u1"
    assert ev["marketplace"] == "vinted"
    assert ev["ts"].endswith("Z")
    assert len(ev["id"]) == 32


def test_summary_unconfigured_is_empty(monkeypatch):
    monkeypatch.setattr(events.settings, "clickhouse_host", "")
    out = events.summary("user:u1")
    assert out["configured"] is False
    assert out["totals"] == {}
    assert out["byDay"] == []


def test_kafka_config_prefers_sasl(monkeypatch):
    monkeypatch.setattr(events.settings, "kafka_bootstrap_servers", "h:1")
    monkeypatch.setattr(events.settings, "kafka_ca_pem", "-----BEGIN\\nX\\n-----END")
    monkeypatch.setattr(events.settings, "kafka_sasl_username", "avnadmin")
    monkeypatch.setattr(events.settings, "kafka_sasl_password", "pw")
    conf = events.kafka_config()
    assert conf["security.protocol"] == "SASL_SSL"
    assert conf["sasl.mechanism"] == "SCRAM-SHA-256"
    assert "\n" in conf["ssl.ca.pem"]
