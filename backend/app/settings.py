from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    host: str = "127.0.0.1"
    port: int = 3000
    database_path: str = str(Path(__file__).resolve().parents[1] / "var" / "stockflow.db")
    # Aiven for PostgreSQL (postgres://...?sslmode=require). Empty = local sqlite file above.
    database_url: str = ""
    database_pool_size: int = 5
    media_dir: str = str(Path(__file__).resolve().parents[1] / "var" / "media")
    # Seed every new workspace with the demo shops/listings/stock (PoC). Off = real sellers start empty.
    seed_demo_data: bool = False
    cors_origins: str = (
        "https://octohandy.amirelay.com,"
        "https://stockflow-nine-ashy.vercel.app,"
        "http://localhost:3000"
    )
    app_session_secret: str = ""
    app_access_password: str = ""
    app_user_id: str = "user_3JyIq3WyP0BS44BhxVz3zz60Gos"
    app_user_email: str = "yassirboudda@gmail.com"
    clerk_secret_key: str = ""
    clerk_api_url: str = "https://api.clerk.com/v1"
    poc_allowed_emails: str = "yassirboudda@gmail.com"
    clerk_publishable_key: str = ""
    clerk_jwks_url: str = "https://clerk.amirelay.com/.well-known/jwks.json"
    nebius_api_key: str = ""
    nebius_base_url: str = "https://api.tokenfactory.nebius.com/v1"
    nebius_model: str = "deepseek-ai/DeepSeek-V4.1-Flash"
    hermes_gateway_url: str = "http://127.0.0.1:18789"
    hermes_api_url: str = "http://127.0.0.1:8642/v1"
    hermes_api_key: str = ""
    hermes_model: str = "hermes-agent"
    hermes_timeout: float = 120
    # Remote desktop (A4000): noVNC behind Caddy + token gate. Empty = feature disabled.
    desktop_base_url: str = ""
    desktop_signing_secret: str = ""
    desktop_vnc_password: str = ""
    desktop_session_ttl: int = 900
    # Screenpipe API on the A4000 (through the Caddy trusted route). Empty = teach flow disabled.
    screenpipe_api_url: str = ""
    screenpipe_api_key: str = ""

    # Stripe subscriptions (test mode for the hackathon). Empty = billing UI shows "not configured", everything stays free.
    stripe_secret_key: str = ""
    stripe_webhook_secret: str = ""
    stripe_price_pro: str = ""  # price_... of the Pro monthly plan
    app_url: str = "https://octohandy.amirelay.com"
    # Comma-separated workspaces that are Pro without paying (founder accounts, judges demo)
    billing_pro_workspaces: str = ""

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

settings = Settings()
