"""
Step 11 Regression Tests: End-to-End SQLite Persistence for Source-Grounded Reports & Patient Identity.

Verifies:
1. Patients extracted from transcript (e.g. "राधिमा") without spoken age register with age=None (never guessed).
2. Devanagari & Hinglish patient names round-trip faithfully through SQLite persistence & search.
3. Visit reports store exact spoken vitals ("120/80") and explicit nulls (weight=None, visit_type=None,
   next_visit_date=None, booster_status=None, vaccination_status="TT injection administered").
4. Post-correction updates (BP "120/80" -> "110/90") persist across reloads without overwriting confirmed fields.
"""

from datetime import date
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.main import app


@pytest.fixture
def client():
    test_engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)
    Base.metadata.create_all(bind=test_engine)

    def override_get_db():
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client

    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=test_engine)


def test_radhima_source_grounded_visit_roundtrip_sqlite(client):
    """
    Persist exact grounded record for transcript:
    "राधिमा को TT injection लगाया है। इसका BP 120/80 है।"
    Verify zero invented age, zero fake BP/weight/visit_type/next_visit_date/booster.
    """
    # 1. Register patient with missing age -> stored as null
    p_res = client.post("/api/v1/patients/", json={"name": "राधिमा", "age": None})
    assert p_res.status_code == 201
    patient = p_res.json()
    assert patient["name"] == "राधिमा"
    assert patient["age"] is None
    pid = patient["patient_id"]

    # Search preserves exact Devanagari name
    s_res = client.get("/api/v1/patients/?search=राधिमा")
    assert s_res.status_code == 200
    assert any(p["patient_id"] == pid and p["name"] == "राधिमा" for p in s_res.json()["patients"])

    # 2. Save source-grounded visit report with explicit nulls for unmentioned fields
    report_payload = {
        "patient_name": "राधिमा",
        "patient_age": None,
        "patient_gender": None,
        "chief_complaint": "TT injection and BP check",
        "symptoms": [],
        "danger_signs": [],
        "vital_signs_mentioned": {"bp": "120/80"},
        "visit_type": None,
        "next_visit_date": None,
        "vaccination_status": "TT injection administered",
        "booster_status": None,
        "dose_number": None,
        "identity_status": "verified",
        "patient_name_source": "transcript",
        "missing_information": [
            {"field_name": "weight", "reason": "Weight not provided", "importance": "medium"}
        ],
        "professional_review_required": False,
        "summary": "Patient: राधिमा. TT injection administered. Vitals recorded: bp: 120/80.",
    }
    v_res = client.post(
        "/api/v1/visits/",
        json={
            "patient_id": pid,
            "visit_date": str(date.today()),
            "report": report_payload,
        },
    )
    assert v_res.status_code == 201
    created = v_res.json()
    vid = created["visit_id"]

    # 3. Reload from DB and assert complete identity & source-only fidelity
    fetched = client.get(f"/api/v1/visits/{vid}").json()
    r = fetched["report"]
    assert r["patient_name"] == "राधिमा"
    assert r["vital_signs_mentioned"] == {"bp": "120/80"}
    assert "weight" not in r["vital_signs_mentioned"]
    assert r["visit_type"] is None
    assert r["next_visit_date"] is None
    assert r["vaccination_status"] == "TT injection administered"
    assert r["booster_status"] is None

    # 4. Patch correction BP 120/80 -> 110/90 and verify nulls are not overwritten
    updated_report = {**r, "vital_signs_mentioned": {"bp": "110/90"}}
    p_upd = client.patch(f"/api/v1/visits/{vid}", json={"report": updated_report})
    assert p_upd.status_code == 200
    reloaded = client.get(f"/api/v1/visits/{vid}").json()["report"]
    assert reloaded["patient_name"] == "राधिमा"
    assert reloaded["vital_signs_mentioned"] == {"bp": "110/90"}
    assert reloaded["visit_type"] is None
    assert reloaded["booster_status"] is None
