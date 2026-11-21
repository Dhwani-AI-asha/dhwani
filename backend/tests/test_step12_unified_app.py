"""
Step 12 Deployment Tests: Unified FastAPI App (Patient CRUD + Voice STT/TTS + AI Reports + Health).

Verifies:
1. Root `main:app` and `backend/app/main:app` serve all required routes without duplicates.
2. Temporary SQLite DB seeds the exact 5 synthetic beneficiaries idempotently (no duplicates).
3. `/health`, `/report/status`, `/api/v1/patients/`, and `/tts` (missing key error) respond cleanly.
4. CORS preflight accepts HTTPS Vercel origins cleanly.
"""

import os
import sys
from pathlib import Path
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

_PROJECT_ROOT = str(Path(__file__).resolve().parent.parent.parent)
if _PROJECT_ROOT not in sys.path:
    sys.path.insert(0, _PROJECT_ROOT)

import main as root_entry  # noqa: E402
from app.database import Base, get_db  # noqa: E402
from app.services.seed_service import seed_synthetic_beneficiaries  # noqa: E402


@pytest.fixture
def unified_client():
    test_engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)
    Base.metadata.create_all(bind=test_engine)

    # Seed the 5 synthetic beneficiaries idempotently twice to guarantee zero duplicates
    db = TestingSessionLocal()
    try:
        first_count = seed_synthetic_beneficiaries(db)
        second_count = seed_synthetic_beneficiaries(db)
        assert first_count == 5
        assert second_count == 0
    finally:
        db.close()

    def override_get_db():
        s = TestingSessionLocal()
        try:
            yield s
        finally:
            s.close()

    root_entry.app.dependency_overrides[get_db] = override_get_db
    with TestClient(root_entry.app) as client:
        yield client

    root_entry.app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=test_engine)


def _collect_all_routes(app_obj):
    collected = []
    def _walk(routes_list, prefix=""):
        for r in routes_list:
            sub_router = getattr(r, "router", None) or getattr(r, "original_router", None)
            sub_prefix = getattr(r, "prefix", "") or ""
            if sub_router is not None and hasattr(sub_router, "routes"):
                _walk(sub_router.routes, prefix + sub_prefix)
            else:
                path = getattr(r, "path", None)
                if path:
                    methods = tuple(sorted(getattr(r, "methods", None) or ("WEBSOCKET",)))
                    collected.append((prefix + path, methods))
    _walk(app_obj.routes)
    return collected


def test_unified_app_exposes_all_required_routes_without_duplicates():
    routes_by_path = {}
    for path, methods in _collect_all_routes(root_entry.app):
        key = (path, methods)
        assert key not in routes_by_path, f"Duplicate route registered: {key}"
        routes_by_path[key] = True

    paths = {p for p, _ in routes_by_path}
    openapi_paths = set(root_entry.app.openapi()["paths"].keys())
    all_paths = paths | openapi_paths

    for required in (
        "/health",
        "/api/v1/patients/",
        "/api/v1/visits/",
        "/ws/stt",
        "/tts",
        "/report",
        "/report/correct",
        "/report/voice-correct",
        "/report/status",
    ):
        assert required in all_paths, f"Missing route in unified app: {required}"


def test_unified_health_patients_and_report_status(unified_client):
    h = unified_client.get("/health")
    assert h.status_code == 200
    assert h.json() == {"status": "healthy"}

    # 5 seeded synthetic beneficiaries returned without duplicates
    p = unified_client.get("/api/v1/patients/")
    assert p.status_code == 200
    data = p.json()
    assert data["total"] == 5
    names = {item["name"] for item in data["patients"]}
    assert {"Pooja Devi", "Meena Kumari", "Aarav Sharma", "Savitri Devi", "Geeta Patel"} == names

    rs = unified_client.get("/report/status")
    assert rs.status_code == 200
    body = rs.json()
    assert "configured" in body
    assert "has_api_key" in body
    # Must never expose actual key value or secrets
    assert "AIza" not in str(body)


def test_tts_and_ws_missing_key_fail_gracefully_and_cors_supports_vercel(unified_client):
    with patch.dict(os.environ, {"GNANI_API_KEY": ""}, clear=False):
        res = unified_client.post("/tts", json={"text": "नमस्ते", "language": "hi-IN"})
        assert res.status_code == 500
        assert "GNANI_API_KEY" in res.json()["detail"]

        with unified_client.websocket_connect("/ws/stt") as ws:
            msg = ws.receive_json()
            assert msg["type"] == "error"
            assert "GNANI_API_KEY" in msg["message"]

    cors_preflight = unified_client.options(
        "/api/v1/patients/",
        headers={
            "Origin": "https://dhwani-demo.vercel.app",
            "Access-Control-Request-Method": "GET",
        },
    )
    assert cors_preflight.status_code in (200, 204)
    allow_origin = cors_preflight.headers.get("access-control-allow-origin")
    assert allow_origin in ("*", "https://dhwani-demo.vercel.app")
