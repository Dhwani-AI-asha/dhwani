"""
Root ASGI entrypoint for unified Render deployment.

Ensures both the repository root (ai_medical, voice) and backend/ (app.*)
are importable so `uvicorn main:app --host 0.0.0.0 --port $PORT` works directly
from the repository root without extra PYTHONPATH configuration.
"""

import os
import sys
from pathlib import Path

_ROOT_DIR = Path(__file__).resolve().parent
_BACKEND_DIR = _ROOT_DIR / "backend"

for _p in (str(_ROOT_DIR), str(_BACKEND_DIR)):
    if _p not in sys.path:
        sys.path.insert(0, _p)

from app.main import app  # noqa: E402


if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("PORT", "8000"))
    uvicorn.run(app, host="0.0.0.0", port=port)
