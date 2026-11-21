
"""
Application configuration for Dhwani Backend.
"""

import os
from pathlib import Path

from typing import Optional

# Resolve base directory (backend/)
BASE_DIR = Path(__file__).resolve().parent.parent

# Default to a local SQLite database in the backend directory (matches .gitignore db.sqlite3)
DEFAULT_DB_PATH = BASE_DIR / "db.sqlite3"
DEFAULT_DB_URL = f"sqlite:///{DEFAULT_DB_PATH.as_posix()}"


def _parse_cors_origins() -> list[str]:
    """Build CORS allowed origins list from CORS_ORIGINS / FRONTEND_URL or local dev defaults."""
    raw_cors = os.getenv("CORS_ORIGINS", "")
    frontend_url = os.getenv("FRONTEND_URL", "").strip()
    origins = (
        [o.strip() for o in raw_cors.split(",") if o.strip()]
        if raw_cors.strip()
        else [
            "http://localhost",
            "http://localhost:3000",
            "http://localhost:5173",
            "http://127.0.0.1:3000",
            "http://127.0.0.1:5173",
            "*",
        ]
    )
    if frontend_url and frontend_url not in origins:
        origins.append(frontend_url)
    return origins


class Settings:
    PROJECT_NAME: str = "Dhwani - Patient Management & Care Continuity Backend"
    VERSION: str = "0.1.0"
    API_V1_STR: str = "/api/v1"
    DATABASE_URL: str = os.getenv("DATABASE_URL", DEFAULT_DB_URL)

    # CORS: Supports comma-separated CORS_ORIGINS / FRONTEND_URL / CORS_ORIGIN_REGEX in production (Vercel + Render),
    # while keeping local development defaults when unset.
    CORS_ORIGINS: list[str] = _parse_cors_origins()
    CORS_ORIGIN_REGEX: Optional[str] = os.getenv("CORS_ORIGIN_REGEX", "").strip() or None


settings = Settings()