import os, secrets
from pathlib import Path
from dotenv import load_dotenv

BASE = Path(__file__).resolve().parent.parent
load_dotenv(BASE / ".env")
DATA = Path(os.getenv("DATA_DIR", BASE / "data"))
DATA.mkdir(parents=True, exist_ok=True)


def _secret() -> str:
    s = os.getenv("JWT_SECRET", "")
    if s and s != "change-me-to-a-long-random-string":
        return s
    f = DATA / ".jwt_secret"          # generated once and persisted
    if not f.exists():
        f.write_text(secrets.token_hex(32))
    return f.read_text().strip()


class Settings:
    openai_api_key = os.getenv("OPENAI_API_KEY", "")
    openai_base_url = os.getenv("OPENAI_BASE_URL") or None
    model = os.getenv("LLM_MODEL", "gpt-4o-mini")
    database_url = os.getenv("DATABASE_URL", f"sqlite:///{DATA / 'agent.db'}")
    jwt_secret = _secret()
    jwt_hours = int(os.getenv("JWT_HOURS", "72"))
    cors = [o.strip() for o in os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",") if o.strip()]
    workspace = Path(os.getenv("WORKSPACE_DIR", DATA / "workspace"))
    uploads = Path(os.getenv("UPLOAD_DIR", DATA / "uploads"))
    max_upload_mb = int(os.getenv("MAX_UPLOAD_MB", "15"))
    desktop = os.getenv("DESKTOP_AUTOMATION", "false").lower() == "true"
    desktop_apps = dict(
        p.split("=", 1) for p in os.getenv("DESKTOP_ALLOWED_APPS", "").split(";") if "=" in p
    )
    max_agent_steps = int(os.getenv("MAX_AGENT_STEPS", "6"))
    history_chars = int(os.getenv("HISTORY_CHARS", "24000"))


settings = Settings()
settings.workspace.mkdir(parents=True, exist_ok=True)
settings.uploads.mkdir(parents=True, exist_ok=True)
