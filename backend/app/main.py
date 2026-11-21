"""
Main FastAPI application entry point for Dhwani backend.
"""

import os
import sys
from pathlib import Path
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Ensure both repo root (for ai_medical, voice) and backend/ (for app.*) are importable
_BACKEND_DIR = Path(__file__).resolve().parent.parent
_PROJECT_ROOT = _BACKEND_DIR.parent
for _p in (str(_PROJECT_ROOT), str(_BACKEND_DIR)):
    if _p not in sys.path:
        sys.path.insert(0, _p)

from app.config import settings
from app.database import init_db
from app.api.v1.router import api_router
from voice.main import voice_router
from voice.report_api import router as report_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan event to create database tables on startup."""
    init_db()
    yield


app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="Backend API for Member 3: Patient Management & Care Continuity in the Dhwani ASHA Worker Assistant.",
    lifespan=lifespan
)

# Configure CORS to permit local development and deployed Vercel frontend origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_origin_regex=settings.CORS_ORIGIN_REGEX,
    allow_credentials="*" not in settings.CORS_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount unified routers (Patient/Visit DB v1 + Voice STT/TTS + AI Report Generation/Correction)
app.include_router(api_router, prefix=settings.API_V1_STR)
app.include_router(voice_router)
app.include_router(report_router)


@app.get("/", tags=["Health"])
def root():
    """Root health and welcome endpoint."""
    return {
        "status": "ok",
        "service": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "docs_url": "/docs"
    }


@app.get("/health", tags=["Health"])
def health():
    """Service health check."""
    return {"status": "healthy"}


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", "8001"))
    uvicorn.run(app, host="0.0.0.0", port=port)
