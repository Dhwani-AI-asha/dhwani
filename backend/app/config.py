
"""
Application configuration for Dhwani Backend.
"""

import os
from pathlib import Path

# Resolve base directory (backend/)
BASE_DIR = Path(__file__).resolve().parent.parent

# Default to a local SQLite database in the backend directory (matches .gitignore db.sqlite3)
DEFAULT_DB_PATH = BASE_DIR / "db.sqlite3"
DEFAULT_DB_URL = f"sqlite:///{DEFAULT_DB_PATH.as_posix()}"


class Settings:
    PROJECT_NAME: str = "Dhwani - Patient Management & Care Continuity Backend"
    VERSION: str = "0.1.0"
    API_V1_STR: str = "/api/v1"
    DATABASE_URL: str = os.getenv("DATABASE_URL", DEFAULT_DB_URL)

    
    # CORS: Allow local frontend development origins
    CORS_ORIGINS: list[str] = [
        "http://localhost:3000",
        "http://localhost:3001",
        "http://localhost:5173",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:3001",
        "http://127.0.0.1:5173",
    ]


settings = Settings()