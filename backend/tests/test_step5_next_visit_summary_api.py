"""
Unit and integration tests for Step 5: Next-Visit Summary API.
All tests use an isolated in-memory SQLite database and fictional clinical data.
"""

import pytest
from datetime import date, timedelta
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


def create_sample_patient(client, name="Sunita Devi", age=28):
    """Helper to register a fictional patient."""
    res = client.post("/api/v1/patients/", json={
        "name": name,
        "age": age,
        "gender": "Female",
        "contact_number": "9876543210",
        "address": "Village Rampur, Ward 2"
    })
    return res.json()


def test_next_visit_summary_patient_with_no_visits(client):
    """1. Test summary for a registered patient who has no visits yet."""
    patient = create_sample_patient(client)
    p_id = patient["patient_id"]

    # Add a pending care promise
    client.post("/api/v1/care-promises/", json={
        "patient_id": p_id,
        "description": "Initial household follow-up",
        "due_date": (date.today() + timedelta(days=5)).isoformat()
    })

    res = client.get(f"/api/v1/patients/{p_id}/next-visit-summary")
    assert res.status_code == 200
    data = res.json()

    assert data["patient"]["patient_id"] == p_id
    assert data["patient"]["name"] == "Sunita Devi"
    assert data["latest_visit"] is None
    assert data["previous_visits"] == []
    assert len(data["pending_promises"]) == 1
    assert len(data["overdue_promises"]) == 0
    assert data["attention_items"]["danger_signs"] == []
    assert data["attention_items"]["professional_review_required"] is False
    assert "no previous visits recorded" in data["briefing_text"].lower()


def test_next_visit_summary_single_visit(client):
    """2. Test summary for a patient with a single recorded visit."""
    patient = create_sample_patient(client)
    p_id = patient["patient_id"]

    # Ingest 1 visit with structured report
    client.post("/api/v1/visits/", json={
        "patient_id": p_id,
        "visit_date": "2026-11-20",
        "report": {
            "chief_complaint": "Persistent fever and headache",
            "symptoms": [
                {"name": "Fever", "duration": "3 days", "severity": "Moderate"},
                {"name": "Headache", "duration": "Since yesterday", "body_site": "Head"}
            ],
            "danger_signs": ["High fever > 48h"],
            "professional_review_required": True,
            "missing_information": [
                {
                    "field_name": "blood_pressure",
                    "reason": "Not measured",
                    "prompt_question": "Can we check blood pressure?"
                }
            ],
            "summary": "Patient has 3-day fever and headache."
        }
    })

    res = client.get(f"/api/v1/patients/{p_id}/next-visit-summary")
    assert res.status_code == 200
    data = res.json()

    assert data["latest_visit"] is not None
    assert data["latest_visit"]["visit_date"] == "2026-11-20"
    assert data["latest_visit"]["chief_complaint"] == "Persistent fever and headache"
    assert len(data["latest_visit"]["symptoms"]) == 2
    assert data["previous_visits"] == []  # Only 1 visit exists, so previous_visits must be empty

    # Attention items
    assert data["attention_items"]["danger_signs"] == ["High fever > 48h"]
    assert data["attention_items"]["professional_review_required"] is True
    assert len(data["attention_items"]["missing_information"]) == 1
    assert data["attention_items"]["missing_information"][0]["field_name"] == "blood_pressure"

    # Briefing text grounding check
    text = data["briefing_text"]
    assert "Sunita Devi" in text
    assert "High fever > 48h" in text
    assert "Can we check blood pressure?" in text


def test_next_visit_summary_multiple_visits_no_duplication(client):
    """3. Test multiple visits: latest visit separated from previous visits, newest first, no duplicate."""
    patient = create_sample_patient(client)
    p_id = patient["patient_id"]

    v1 = client.post("/api/v1/visits/", json={
        "patient_id": p_id,
        "visit_date": "2026-11-01",
        "report": {"chief_complaint": "Visit One", "symptoms": [], "danger_signs": []}
    }).json()

    v2 = client.post("/api/v1/visits/", json={
        "patient_id": p_id,
        "visit_date": "2026-11-10",
        "report": {"chief_complaint": "Visit Two", "symptoms": [], "danger_signs": []}
    }).json()

    v3 = client.post("/api/v1/visits/", json={
        "patient_id": p_id,
        "visit_date": "2026-11-20",
        "report": {"chief_complaint": "Visit Three (Latest)", "symptoms": [], "danger_signs": []}
    }).json()

    res = client.get(f"/api/v1/patients/{p_id}/next-visit-summary")
    assert res.status_code == 200
    data = res.json()

    # Latest visit must be v3
    assert data["latest_visit"]["visit_id"] == v3["visit_id"]
    assert data["latest_visit"]["chief_complaint"] == "Visit Three (Latest)"

    # Previous visits must contain v2 and v1 (in descending date order), NOT v3
    assert len(data["previous_visits"]) == 2
    prev_ids = [pv["visit_id"] for pv in data["previous_visits"]]
    assert v3["visit_id"] not in prev_ids
    assert prev_ids == [v2["visit_id"], v1["visit_id"]]
    assert data["previous_visits"][0]["visit_date"] == "2026-11-10"
    assert data["previous_visits"][1]["visit_date"] == "2026-11-01"


def test_care_continuity_pending_and_overdue_separation(client):
    """4. Test separate identification of pending vs overdue care promises."""
    patient = create_sample_patient(client)
    p_id = patient["patient_id"]

    # Overdue task (due 3 days ago)
    past_due = (date.today() - timedelta(days=3)).isoformat()
    client.post("/api/v1/care-promises/", json={
        "patient_id": p_id,
        "description": "Overdue hemoglobin test",
        "due_date": past_due
    })

    # Pending future task (due in 4 days)
    future_due = (date.today() + timedelta(days=4)).isoformat()
    client.post("/api/v1/care-promises/", json={
        "patient_id": p_id,
        "description": "Upcoming tetanus toxoid booster",
        "due_date": future_due
    })

    # Completed task (due in past, but completed) -> should NOT appear in pending or overdue
    comp_task = client.post("/api/v1/care-promises/", json={
        "patient_id": p_id,
        "description": "Finished nutritional counseling",
        "due_date": past_due
    }).json()
    client.patch(f"/api/v1/care-promises/{comp_task['promise_id']}/complete")

    res = client.get(f"/api/v1/patients/{p_id}/next-visit-summary")
    assert res.status_code == 200
    data = res.json()

    # Overdue list check
    assert len(data["overdue_promises"]) == 1
    assert data["overdue_promises"][0]["description"] == "Overdue hemoglobin test"
    assert data["overdue_promises"][0]["is_overdue"] is True

    # Pending list check
    assert len(data["pending_promises"]) == 1
    assert data["pending_promises"][0]["description"] == "Upcoming tetanus toxoid booster"
    assert data["pending_promises"][0]["is_overdue"] is False

    # Completed task should not be in either list
    all_listed = [p["promise_id"] for p in data["overdue_promises"] + data["pending_promises"]]
    assert comp_task["promise_id"] not in all_listed

    # Briefing text checks
    assert "Overdue Follow-Up Tasks" in data["briefing_text"]
    assert "Overdue hemoglobin test" in data["briefing_text"]
    assert "Upcoming Care Promises" in data["briefing_text"]
    assert "Upcoming tetanus toxoid booster" in data["briefing_text"]


def test_next_visit_summary_nonexistent_patient_returns_404(client):
    """5. Test that requesting summary for a nonexistent patient returns 404."""
    res = client.get("/api/v1/patients/PAT-2026-9999/next-visit-summary")
    assert res.status_code == 404
    assert "not found" in res.json()["detail"].lower()


def test_briefing_text_does_not_hallucinate(client):
    """6. Test that briefing text contains only stored information, avoiding hallucinations."""
    patient = create_sample_patient(client, name="Meera Bai", age=35)
    p_id = patient["patient_id"]

    client.post("/api/v1/visits/", json={
        "patient_id": p_id,
        "visit_date": "2026-11-21",
        "report": {
            "chief_complaint": "Joint stiffness",
            "symptoms": [{"name": "Knee pain", "duration": "1 week"}],
            "danger_signs": [],
            "professional_review_required": False
        }
    })

    res = client.get(f"/api/v1/patients/{p_id}/next-visit-summary").json()
    briefing = res["briefing_text"]

    # Must contain stored facts
    assert "Meera Bai" in briefing
    assert "Joint stiffness" in briefing
    assert "Knee pain" in briefing

    # Must NOT invent unmentioned clinical conclusions
    assert "diabetes" not in briefing.lower()
    assert "hypertension" not in briefing.lower()
    assert "malaria" not in briefing.lower()
    assert "resolved" not in briefing.lower()
    assert "cure" not in briefing.lower()


def test_danger_signs_preserved_accurately(client):
    """7. Regression: Danger signs are preserved accurately in latest visit and attention items."""
    patient = create_sample_patient(client, name="Anandi Devi")
    p_id = patient["patient_id"]

    danger_list = ["Convulsions", "Severe breathlessness"]
    client.post("/api/v1/visits/", json={
        "patient_id": p_id,
        "visit_date": "2026-11-21",
        "report": {
            "chief_complaint": "Acute distress",
            "symptoms": [{"name": "Shortness of breath"}],
            "danger_signs": danger_list,
            "professional_review_required": True
        }
    })

    res = client.get(f"/api/v1/patients/{p_id}/next-visit-summary").json()
    assert res["latest_visit"]["danger_signs"] == danger_list
    assert res["attention_items"]["danger_signs"] == danger_list
    for ds in danger_list:
        assert ds in res["briefing_text"]


def test_professional_review_flag_preserved(client):
    """8. Regression: Professional-review flag is preserved in latest visit and attention items."""
    patient = create_sample_patient(client, name="Radha Kumari")
    p_id = patient["patient_id"]

    client.post("/api/v1/visits/", json={
        "patient_id": p_id,
        "visit_date": "2026-11-21",
        "report": {
            "chief_complaint": "Elevated blood pressure observed",
            "symptoms": [],
            "danger_signs": [],
            "professional_review_required": True
        }
    })

    res = client.get(f"/api/v1/patients/{p_id}/next-visit-summary").json()
    assert res["latest_visit"]["professional_review_required"] is True
    assert res["attention_items"]["professional_review_required"] is True
    assert "doctor review is flagged" in res["briefing_text"].lower()


def test_missing_information_fields_and_prompts_preserved(client):
    """9. Regression: Missing-information fields and prompt questions are preserved."""
    patient = create_sample_patient(client, name="Sarita Devi")
    p_id = patient["patient_id"]

    missing_info = [
        {
            "field_name": "fever_pattern",
            "reason": "Temperature pattern not specified",
            "prompt_question": "Does the fever spike in the evening?"
        },
        {
            "field_name": "medication_history",
            "reason": "Prior treatments not mentioned",
            "prompt_question": "Did the patient take any medicine?"
        }
    ]

    client.post("/api/v1/visits/", json={
        "patient_id": p_id,
        "visit_date": "2026-11-21",
        "report": {
            "chief_complaint": "High fever",
            "symptoms": [{"name": "Fever"}],
            "danger_signs": [],
            "missing_information": missing_info
        }
    })

    res = client.get(f"/api/v1/patients/{p_id}/next-visit-summary").json()
    assert len(res["latest_visit"]["missing_information"]) == 2
    assert len(res["attention_items"]["missing_information"]) == 2

    fields = [m["field_name"] for m in res["attention_items"]["missing_information"]]
    prompts = [m["prompt_question"] for m in res["attention_items"]["missing_information"]]
    assert fields == ["fever_pattern", "medication_history"]
    assert "Does the fever spike in the evening?" in prompts
    assert "Did the patient take any medicine?" in prompts


def test_patient_with_no_care_promises_receives_empty_lists(client):
    """10. Regression: Patient with visits but no care promises receives empty pending/overdue lists."""
    patient = create_sample_patient(client, name="Kamlesh Bai")
    p_id = patient["patient_id"]

    client.post("/api/v1/visits/", json={
        "patient_id": p_id,
        "visit_date": "2026-11-21",
        "report": {"chief_complaint": "Routine ANC", "symptoms": [], "danger_signs": []}
    })

    res = client.get(f"/api/v1/patients/{p_id}/next-visit-summary").json()
    assert res["pending_promises"] == []
    assert res["overdue_promises"] == []


def test_null_fields_and_empty_lists_handled_safely(client):
    """11. Regression: Null fields and empty lists in patient and visit are handled safely."""
    # Register minimal patient with null optional fields
    p_res = client.post("/api/v1/patients/", json={
        "name": "Minimal Patient",
        "age": 22,
        "gender": None,
        "contact_number": None,
        "address": None
    }).json()
    p_id = p_res["patient_id"]

    # Ingest visit with nulls
    client.post("/api/v1/visits/", json={
        "patient_id": p_id,
        "visit_date": "2026-11-21",
        "report": {
            "chief_complaint": None,
            "summary": None,
            "notes": None,
            "vital_signs_mentioned": None,
            "symptoms": [],
            "danger_signs": [],
            "missing_information": []
        }
    })

    res = client.get(f"/api/v1/patients/{p_id}/next-visit-summary")
    assert res.status_code == 200
    data = res.json()
    assert data["patient"]["gender"] is None
    assert data["patient"]["contact_number"] is None
    assert data["latest_visit"]["chief_complaint"] is None
    assert data["latest_visit"]["symptoms"] == []
    assert data["latest_visit"]["danger_signs"] == []
    assert data["latest_visit"]["missing_information"] == []
    assert "Minimal Patient" in data["briefing_text"]


def test_promise_due_today_not_classified_as_overdue(client):
    """12. Regression: A care promise due today is classified as pending, NOT overdue."""
    patient = create_sample_patient(client, name="Today Due Patient")
    p_id = patient["patient_id"]

    today_str = date.today().isoformat()
    client.post("/api/v1/care-promises/", json={
        "patient_id": p_id,
        "description": "Task due today",
        "due_date": today_str
    })

    # Summary with default as_of_date
    res1 = client.get(f"/api/v1/patients/{p_id}/next-visit-summary").json()
    assert len(res1["pending_promises"]) == 1
    assert res1["pending_promises"][0]["description"] == "Task due today"
    assert res1["pending_promises"][0]["is_overdue"] is False
    assert res1["overdue_promises"] == []

    # Summary with explicit as_of_date equal to today
    res2 = client.get(f"/api/v1/patients/{p_id}/next-visit-summary?as_of_date={today_str}").json()
    assert len(res2["pending_promises"]) == 1
    assert res2["pending_promises"][0]["is_overdue"] is False
    assert res2["overdue_promises"] == []


def test_completed_promises_excluded_from_both_sections(client):
    """13. Regression: Completed promises are excluded from both pending and overdue sections."""
    patient = create_sample_patient(client, name="Completed Promise Patient")
    p_id = patient["patient_id"]

    past_date = (date.today() - timedelta(days=5)).isoformat()
    future_date = (date.today() + timedelta(days=5)).isoformat()

    p_past = client.post("/api/v1/care-promises/", json={
        "patient_id": p_id,
        "description": "Past task done",
        "due_date": past_date
    }).json()
    client.patch(f"/api/v1/care-promises/{p_past['promise_id']}/complete")

    p_future = client.post("/api/v1/care-promises/", json={
        "patient_id": p_id,
        "description": "Future task done early",
        "due_date": future_date
    }).json()
    client.patch(f"/api/v1/care-promises/{p_future['promise_id']}/complete")

    res = client.get(f"/api/v1/patients/{p_id}/next-visit-summary").json()
    assert res["pending_promises"] == []
    assert res["overdue_promises"] == []


def test_summary_generation_does_not_modify_database_records(client):
    """14. Regression: Generating the summary does not modify stored patient, visit, or promise records."""
    patient = create_sample_patient(client, name="Immutable Patient")
    p_id = patient["patient_id"]

    visit = client.post("/api/v1/visits/", json={
        "patient_id": p_id,
        "visit_date": "2026-11-21",
        "report": {"chief_complaint": "Checkup", "symptoms": [], "danger_signs": []}
    }).json()

    promise = client.post("/api/v1/care-promises/", json={
        "patient_id": p_id,
        "description": "Sample commitment",
        "due_date": (date.today() + timedelta(days=2)).isoformat()
    }).json()

    # Call summary multiple times
    for _ in range(3):
        res = client.get(f"/api/v1/patients/{p_id}/next-visit-summary")
        assert res.status_code == 200

    # Verify patient record in DB remains identical
    patient_after = client.get(f"/api/v1/patients/{p_id}").json()
    assert patient_after["name"] == "Immutable Patient"
    assert patient_after["created_at"] == patient["created_at"]
    assert patient_after["updated_at"] == patient["updated_at"]

    # Verify visit record in DB remains identical
    visit_after = client.get(f"/api/v1/visits/{visit['visit_id']}").json()
    assert visit_after["report"] == visit["report"]
    assert visit_after["updated_at"] == visit["updated_at"]

    # Verify promise record in DB remains identical
    promise_after = client.get(f"/api/v1/care-promises/{promise['promise_id']}").json()
    assert promise_after["status"] == "Pending"
    assert promise_after["updated_at"] == promise["updated_at"]


def test_multiple_previous_visits_returned_in_correct_order(client):
    """15. Regression: Multiple previous visits are returned strictly in newest-first date order."""
    patient = create_sample_patient(client, name="Multi Visit Patient")
    p_id = patient["patient_id"]

    dates = ["2026-11-02", "2026-11-08", "2026-11-15", "2026-11-21"]
    for d in dates:
        client.post("/api/v1/visits/", json={
            "patient_id": p_id,
            "visit_date": d,
            "report": {"chief_complaint": f"Visit on {d}", "symptoms": [], "danger_signs": []}
        })

    res = client.get(f"/api/v1/patients/{p_id}/next-visit-summary").json()
    assert res["latest_visit"]["visit_date"] == "2026-11-21"
    assert len(res["previous_visits"]) == 3

    prev_dates = [pv["visit_date"] for pv in res["previous_visits"]]
    # Expected strictly descending order
    assert prev_dates == ["2026-11-15", "2026-11-08", "2026-11-02"]