"""
Unit and integration tests for Step 3: Visit Model and Structured Medical Report Ingestion API.
All tests use an isolated in-memory SQLite database and fictional clinical data.
"""

import pytest
from datetime import date
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.main import app


@pytest.fixture
def client():
    """Provides a TestClient with an isolated in-memory SQLite database for each test."""
    test_engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool
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


def create_sample_patient(client, name="Kamla Devi", age=30):
    """Helper to create a fictional patient for visit testing."""
    res = client.post("/api/v1/patients/", json={
        "name": name,
        "age": age,
        "gender": "Female",
        "contact_number": "9876500000",
        "address": "Village Ramnagar, Ward 1"
    })
    return res.json()


def test_successful_visit_creation(client):
    """1. Test successful visit creation with full structured report."""
    patient = create_sample_patient(client)
    patient_id = patient["patient_id"]

    visit_payload = {
        "patient_id": patient_id,
        "visit_date": "2026-11-21",
        "report": {
            "patient_name": None,
            "patient_age": None,
            "patient_gender": None,
            "chief_complaint": "Fever and headache",
            "symptoms": [
                {
                    "name": "Fever",
                    "duration": "3 days",
                    "severity": None,
                    "body_site": None,
                    "notes": None
                },
                {
                    "name": "Headache",
                    "duration": "Since yesterday",
                    "severity": None,
                    "body_site": "Head",
                    "notes": None
                }
            ],
            "danger_signs": [],
            "vital_signs_mentioned": None,
            "missing_information": [
                {
                    "field_name": "severity",
                    "reason": "Severity of reported symptoms was not mentioned.",
                    "prompt_question": "How severe is the fever and headache?",
                    "importance": None
                }
            ],
            "professional_review_required": False,
            "summary": "Patient reports fever for 3 days and headache since yesterday.",
            "notes": "Sample test output only. Not a clinical diagnosis."
        }
    }

    response = client.post("/api/v1/visits/", json=visit_payload)
    assert response.status_code == 201
    data = response.json()

    assert data["visit_id"].startswith("VIS-")
    assert data["patient_id"] == patient_id
    assert data["visit_date"] == "2026-11-21"
    assert data["report"]["chief_complaint"] == "Fever and headache"
    assert len(data["report"]["symptoms"]) == 2
    assert data["report"]["professional_review_required"] is False


def test_visit_creation_nonexistent_patient_returns_404(client):
    """2. Test that creating a visit for a nonexistent patient returns 404."""
    visit_payload = {
        "patient_id": "PAT-2026-9999",
        "visit_date": "2026-11-21",
        "report": {
            "chief_complaint": "General weakness",
            "symptoms": [],
            "danger_signs": []
        }
    }
    response = client.post("/api/v1/visits/", json=visit_payload)
    assert response.status_code == 404
    assert "not found" in response.json()["detail"].lower()


def test_retrieving_visit_history_for_patient(client):
    """3. Test retrieving visit history for a patient."""
    patient = create_sample_patient(client)
    patient_id = patient["patient_id"]

    # Ingest a visit
    client.post("/api/v1/visits/", json={
        "patient_id": patient_id,
        "visit_date": "2026-11-21",
        "report": {
            "chief_complaint": "Mild stomach ache",
            "symptoms": [{"name": "Abdominal pain", "duration": "1 day"}],
            "danger_signs": []
        }
    })

    response = client.get(f"/api/v1/patients/{patient_id}/visits")
    assert response.status_code == 200
    visits = response.json()
    assert len(visits) == 1
    assert visits[0]["patient_id"] == patient_id
    assert visits[0]["report"]["chief_complaint"] == "Mild stomach ache"


def test_retrieving_visits_nonexistent_patient_returns_404(client):
    """4. Test retrieving visits for a nonexistent patient returns 404."""
    response = client.get("/api/v1/patients/PAT-2026-9999/visits")
    assert response.status_code == 404
    assert "not found" in response.json()["detail"].lower()


def test_multiple_visits_stored_for_same_patient(client):
    """5. Test that multiple visits can be stored for the same patient."""
    patient = create_sample_patient(client)
    patient_id = patient["patient_id"]

    for i in range(3):
        res = client.post("/api/v1/visits/", json={
            "patient_id": patient_id,
            "visit_date": f"2026-11-{10 + i:02d}",
            "report": {
                "chief_complaint": f"Follow-up visit {i + 1}",
                "symptoms": [],
                "danger_signs": []
            }
        })
        assert res.status_code == 201

    history = client.get(f"/api/v1/patients/{patient_id}/visits").json()
    assert len(history) == 3


def test_visits_returned_newest_first(client):
    """6. Test that visits are sorted by visit_date descending (newest first)."""
    patient = create_sample_patient(client)
    patient_id = patient["patient_id"]

    dates = ["2026-11-05", "2026-11-20", "2026-11-12"]
    for d in dates:
        client.post("/api/v1/visits/", json={
            "patient_id": patient_id,
            "visit_date": d,
            "report": {
                "chief_complaint": f"Visit on {d}",
                "symptoms": [],
                "danger_signs": []
            }
        })

    history = client.get(f"/api/v1/patients/{patient_id}/visits").json()
    returned_dates = [v["visit_date"] for v in history]
    # Newest first: 2026-11-20, 2026-11-12, 2026-11-05
    assert returned_dates == ["2026-11-20", "2026-11-12", "2026-11-05"]


def test_null_report_fields_are_preserved(client):
    """7. Test that null fields in Member 2's report are preserved as null."""
    patient = create_sample_patient(client)
    patient_id = patient["patient_id"]

    res = client.post("/api/v1/visits/", json={
        "patient_id": patient_id,
        "visit_date": "2026-11-21",
        "report": {
            "patient_name": None,
            "patient_age": None,
            "patient_gender": None,
            "vital_signs_mentioned": None,
            "summary": None,
            "notes": None,
            "symptoms": [],
            "danger_signs": []
        }
    })
    assert res.status_code == 201
    rep = res.json()["report"]
    assert rep["patient_name"] is None
    assert rep["patient_age"] is None
    assert rep["patient_gender"] is None
    assert rep["vital_signs_mentioned"] is None
    assert rep["summary"] is None
    assert rep["notes"] is None


def test_empty_danger_signs_and_symptoms_preserved(client):
    """8. Test that empty lists in danger_signs and symptoms are strictly preserved."""
    patient = create_sample_patient(client)
    patient_id = patient["patient_id"]

    res = client.post("/api/v1/visits/", json={
        "patient_id": patient_id,
        "visit_date": "2026-11-21",
        "report": {
            "chief_complaint": "Routine checkup",
            "symptoms": [],
            "danger_signs": [],
            "missing_information": []
        }
    })
    assert res.status_code == 201
    rep = res.json()["report"]
    assert rep["symptoms"] == []
    assert rep["danger_signs"] == []
    assert rep["missing_information"] == []


def test_structured_symptoms_and_missing_info_stored_correctly(client):
    """9. Test structured symptoms and missing_information objects retain all nested fields."""
    patient = create_sample_patient(client)
    patient_id = patient["patient_id"]

    res = client.post("/api/v1/visits/", json={
        "patient_id": patient_id,
        "visit_date": "2026-11-21",
        "report": {
            "chief_complaint": "Chest discomfort",
            "symptoms": [
                {
                    "name": "Chest tightness",
                    "duration": "2 hours",
                    "severity": "Moderate",
                    "body_site": "Center chest",
                    "notes": "Triggered by walking"
                }
            ],
            "danger_signs": ["Chest pain on exertion"],
            "missing_information": [
                {
                    "field_name": "blood_pressure",
                    "reason": "BP not measured during visit",
                    "prompt_question": "Can we check the patient's blood pressure?",
                    "importance": "High"
                }
            ],
            "professional_review_required": True
        }
    })
    assert res.status_code == 201
    rep = res.json()["report"]
    assert len(rep["symptoms"]) == 1
    symptom = rep["symptoms"][0]
    assert symptom["name"] == "Chest tightness"
    assert symptom["duration"] == "2 hours"
    assert symptom["severity"] == "Moderate"
    assert symptom["body_site"] == "Center chest"
    assert symptom["notes"] == "Triggered by walking"

    assert rep["danger_signs"] == ["Chest pain on exertion"]
    assert len(rep["missing_information"]) == 1
    missing = rep["missing_information"][0]
    assert missing["field_name"] == "blood_pressure"
    assert missing["importance"] == "High"
    assert rep["professional_review_required"] is True


def test_registered_patient_information_not_overwritten(client):
    """10. Test that AI report's patient_name/age does NOT overwrite registered patient details."""
    patient = create_sample_patient(client, name="Official Name", age=45)
    patient_id = patient["patient_id"]

    # Member 2's report contains a different inferred name or age
    client.post("/api/v1/visits/", json={
        "patient_id": patient_id,
        "visit_date": "2026-11-21",
        "report": {
            "patient_name": "Inferred Name From Audio",
            "patient_age": 99,
            "patient_gender": "Male",
            "chief_complaint": "Routine visit",
            "symptoms": [],
            "danger_signs": []
        }
    })

    # Retrieve registered patient profile
    patient_after = client.get(f"/api/v1/patients/{patient_id}").json()
    assert patient_after["name"] == "Official Name"   # Must NOT be overwritten
    assert patient_after["age"] == 45                 # Must NOT be overwritten
    assert patient_after["gender"] == "Female"        # Must NOT be overwritten


def test_vital_signs_mentioned_accepts_structured_dict(client):
    """11. Test that vital_signs_mentioned accepts and preserves a structured dictionary."""
    patient = create_sample_patient(client)
    patient_id = patient["patient_id"]

    vitals_dict = {"bp": "120/80", "pulse": 72, "spo2": 98, "temp": "98.4F"}
    res = client.post("/api/v1/visits/", json={
        "patient_id": patient_id,
        "visit_date": "2026-11-21",
        "report": {
            "chief_complaint": "General health checkup",
            "vital_signs_mentioned": vitals_dict,
            "symptoms": [],
            "danger_signs": []
        }
    })
    assert res.status_code == 201
    visit_id = res.json()["visit_id"]

    # Verify directly and via GET
    retrieved = client.get(f"/api/v1/visits/{visit_id}").json()
    assert retrieved["report"]["vital_signs_mentioned"] == vitals_dict


def test_visits_on_same_date_returned_newest_created_first(client):
    """12. Test that visits occurring on the exact same date are returned newest-created first."""
    patient = create_sample_patient(client)
    patient_id = patient["patient_id"]

    v1 = client.post("/api/v1/visits/", json={
        "patient_id": patient_id,
        "visit_date": "2026-11-21",
        "report": {"chief_complaint": "Morning visit", "symptoms": [], "danger_signs": []}
    }).json()

    v2 = client.post("/api/v1/visits/", json={
        "patient_id": patient_id,
        "visit_date": "2026-11-21",
        "report": {"chief_complaint": "Evening follow-up", "symptoms": [], "danger_signs": []}
    }).json()

    history = client.get(f"/api/v1/patients/{patient_id}/visits").json()
    assert len(history) == 2
    # v2 (created second) must appear before v1 (created first)
    assert history[0]["visit_id"] == v2["visit_id"]
    assert history[1]["visit_id"] == v1["visit_id"]
    assert history[0]["report"]["chief_complaint"] == "Evening follow-up"


def test_get_single_visit_by_id(client):
    """13. Test retrieving an individual visit record by its visit_id."""
    patient = create_sample_patient(client)
    patient_id = patient["patient_id"]

    created = client.post("/api/v1/visits/", json={
        "patient_id": patient_id,
        "visit_date": "2026-11-21",
        "report": {
            "chief_complaint": "Eye irritation",
            "symptoms": [{"name": "Itching", "body_site": "Left eye"}],
            "danger_signs": []
        }
    }).json()
    visit_id = created["visit_id"]

    res = client.get(f"/api/v1/visits/{visit_id}")
    assert res.status_code == 200
    data = res.json()
    assert data["visit_id"] == visit_id
    assert data["patient_id"] == patient_id
    assert data["report"]["chief_complaint"] == "Eye irritation"

    # Nonexistent visit ID returns 404
    res_404 = client.get("/api/v1/visits/VIS-2026-9999")
    assert res_404.status_code == 404
    assert "not found" in res_404.json()["detail"].lower()


def test_additional_unknown_report_metadata_preserved(client):
    """14. Test that unanticipated metadata fields in report and symptoms survive validation and storage."""
    patient = create_sample_patient(client)
    patient_id = patient["patient_id"]

    payload = {
        "patient_id": patient_id,
        "visit_date": "2026-11-21",
        "report": {
            "chief_complaint": "Joint pain",
            "symptoms": [
                {
                    "name": "Knee ache",
                    "onset_trigger": "climbing stairs",
                    "pain_scale": 6
                }
            ],
            "danger_signs": [],
            "transcription_confidence": 0.96,
            "audio_duration_seconds": 45.2,
            "pipeline_version": "2.1.0"
        }
    }

    res = client.post("/api/v1/visits/", json=payload)
    assert res.status_code == 201
    visit_id = res.json()["visit_id"]

    retrieved = client.get(f"/api/v1/visits/{visit_id}").json()
    rep = retrieved["report"]
    # Check top-level extra fields
    assert rep["transcription_confidence"] == 0.96
    assert rep["audio_duration_seconds"] == 45.2
    assert rep["pipeline_version"] == "2.1.0"
    # Check nested extra fields in symptoms
    assert rep["symptoms"][0]["onset_trigger"] == "climbing stairs"
    assert rep["symptoms"][0]["pain_scale"] == 6


def test_sqlite_foreign_key_enforcement_at_db_level():
    """15. Test that SQLite foreign key enforcement is active and rejects invalid references at DB level."""
    from sqlalchemy.exc import IntegrityError
    from app.models.visit import Visit

    # Create fresh engine and session to verify Engine listener activates
    test_engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool
    )
    Base.metadata.create_all(bind=test_engine)
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)
    session = TestingSessionLocal()

    try:
        # Attempt to insert visit referencing nonexistent patient ID directly
        invalid_visit = Visit(
            visit_id="VIS-2026-FKFAIL",
            patient_id="PAT-NONEXISTENT",
            visit_date=date(2026, 11, 21),
            report={}
        )
        session.add(invalid_visit)
        with pytest.raises(IntegrityError):
            session.commit()
    finally:
        session.close()
        Base.metadata.drop_all(bind=test_engine)