"""
Unit and integration tests for Step 4: Care Promise Tracker APIs.
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


def create_sample_patient(client, name="Kalyani Devi"):
    """Helper to create a fictional patient for care promise tests."""
    res = client.post("/api/v1/patients/", json={
        "name": name,
        "age": 28,
        "gender": "Female",
        "contact_number": "9876543210",
        "address": "Ward 4, Shivpur"
    })
    return res.json()


def create_sample_visit(client, patient_id):
    """Helper to create a fictional visit for care promise tests."""
    res = client.post("/api/v1/visits/", json={
        "patient_id": patient_id,
        "visit_date": "2026-11-21",
        "report": {
            "chief_complaint": "ANC checkup",
            "symptoms": [],
            "danger_signs": []
        }
    })
    return res.json()


def test_create_care_promise_without_visit(client):
    """1. Test creating a care promise without visit_id."""
    patient = create_sample_patient(client)
    patient_id = patient["patient_id"]

    due = (date.today() + timedelta(days=7)).isoformat()
    payload = {
        "patient_id": patient_id,
        "description": "Follow up on iron and folic acid tablet adherence",
        "due_date": due
    }
    res = client.post("/api/v1/care-promises/", json=payload)
    assert res.status_code == 201
    data = res.json()

    assert data["promise_id"].startswith("CP-")
    assert data["patient_id"] == patient_id
    assert data["visit_id"] is None
    assert data["description"] == "Follow up on iron and folic acid tablet adherence"
    assert data["due_date"] == due
    assert data["status"] == "Pending"
    assert data["completed_at"] is None
    assert "id" not in data  # Internal DB id must not be exposed


def test_create_care_promise_with_valid_visit(client):
    """2. Test creating a care promise linked to an existing visit of the same patient."""
    patient = create_sample_patient(client)
    patient_id = patient["patient_id"]
    visit = create_sample_visit(client, patient_id)
    visit_id = visit["visit_id"]

    due = (date.today() + timedelta(days=3)).isoformat()
    payload = {
        "patient_id": patient_id,
        "visit_id": visit_id,
        "description": "Check blood pressure follow-up reading",
        "due_date": due
    }
    res = client.post("/api/v1/care-promises/", json=payload)
    assert res.status_code == 201
    data = res.json()
    assert data["patient_id"] == patient_id
    assert data["visit_id"] == visit_id


def test_create_care_promise_nonexistent_patient_returns_404(client):
    """3. Test that creating a promise for a nonexistent patient returns 404."""
    payload = {
        "patient_id": "PAT-2026-9999",
        "description": "General checkup",
        "due_date": "2026-11-25"
    }
    res = client.post("/api/v1/care-promises/", json=payload)
    assert res.status_code == 404
    assert "not found" in res.json()["detail"].lower()


def test_create_care_promise_nonexistent_visit_returns_404(client):
    """4. Test that supplying a nonexistent visit_id returns 404."""
    patient = create_sample_patient(client)
    patient_id = patient["patient_id"]

    payload = {
        "patient_id": patient_id,
        "visit_id": "VIS-2026-9999",
        "description": "Check vitals",
        "due_date": "2026-11-25"
    }
    res = client.post("/api/v1/care-promises/", json=payload)
    assert res.status_code == 404
    assert "visit" in res.json()["detail"].lower()
    assert "not found" in res.json()["detail"].lower()


def test_create_care_promise_visit_patient_mismatch_returns_422(client):
    """5. Test that linking a visit belonging to Patient A with Patient B returns 422."""
    p1 = create_sample_patient(client, name="Patient One")
    p2 = create_sample_patient(client, name="Patient Two")
    visit_p1 = create_sample_visit(client, p1["patient_id"])

    # Attempt to link p1's visit to p2
    payload = {
        "patient_id": p2["patient_id"],
        "visit_id": visit_p1["visit_id"],
        "description": "Mismatched follow-up",
        "due_date": "2026-11-25"
    }
    res = client.post("/api/v1/care-promises/", json=payload)
    assert res.status_code == 422
    assert "does not belong" in res.json()["detail"].lower()


def test_validation_empty_description_rejected_422(client):
    """6. Test that blank or whitespace-only description returns 422."""
    patient = create_sample_patient(client)
    patient_id = patient["patient_id"]

    # Whitespace only
    res = client.post("/api/v1/care-promises/", json={
        "patient_id": patient_id,
        "description": "   ",
        "due_date": "2026-11-25"
    })
    assert res.status_code == 422


def test_validation_missing_due_date_rejected_422(client):
    """7. Test that missing due_date returns 422."""
    patient = create_sample_patient(client)
    patient_id = patient["patient_id"]

    res = client.post("/api/v1/care-promises/", json={
        "patient_id": patient_id,
        "description": "Deliver test results"
    })
    assert res.status_code == 422


def test_get_care_promise_by_id(client):
    """8. Test retrieving a single care promise by promise_id."""
    patient = create_sample_patient(client)
    created = client.post("/api/v1/care-promises/", json={
        "patient_id": patient["patient_id"],
        "description": "Check child immunization status",
        "due_date": "2026-11-28"
    }).json()

    promise_id = created["promise_id"]
    res = client.get(f"/api/v1/care-promises/{promise_id}")
    assert res.status_code == 200
    assert res.json()["promise_id"] == promise_id
    assert res.json()["description"] == "Check child immunization status"

    # Nonexistent promise returns 404
    res_404 = client.get("/api/v1/care-promises/CP-2026-9999")
    assert res_404.status_code == 404


def test_get_pending_care_promises(client):
    """9. Test retrieving all pending care promises."""
    patient = create_sample_patient(client)
    p_id = patient["patient_id"]

    # Create 2 pending promises and 1 completed promise
    p1 = client.post("/api/v1/care-promises/", json={
        "patient_id": p_id,
        "description": "Pending Task 1",
        "due_date": "2026-11-25"
    }).json()
    p2 = client.post("/api/v1/care-promises/", json={
        "patient_id": p_id,
        "description": "Pending Task 2",
        "due_date": "2026-11-26"
    }).json()
    p3 = client.post("/api/v1/care-promises/", json={
        "patient_id": p_id,
        "description": "Task to complete",
        "due_date": "2026-11-27"
    }).json()
    client.patch(f"/api/v1/care-promises/{p3['promise_id']}/complete")

    pending = client.get("/api/v1/care-promises/pending").json()
    pending_ids = [p["promise_id"] for p in pending]

    assert p1["promise_id"] in pending_ids
    assert p2["promise_id"] in pending_ids
    assert p3["promise_id"] not in pending_ids


def test_get_overdue_care_promises(client):
    """10. Test retrieving overdue care promises without auto-completing them."""
    patient = create_sample_patient(client)
    p_id = patient["patient_id"]

    past_date = (date.today() - timedelta(days=5)).isoformat()
    future_date = (date.today() + timedelta(days=5)).isoformat()

    # Overdue task (past date, Pending)
    overdue_task = client.post("/api/v1/care-promises/", json={
        "patient_id": p_id,
        "description": "Overdue follow-up check",
        "due_date": past_date
    }).json()

    # Future task (future date, Pending)
    future_task = client.post("/api/v1/care-promises/", json={
        "patient_id": p_id,
        "description": "Future scheduled visit",
        "due_date": future_date
    }).json()

    # Past completed task (past date, Completed) -> Should NOT be in overdue
    completed_task = client.post("/api/v1/care-promises/", json={
        "patient_id": p_id,
        "description": "Past completed visit",
        "due_date": past_date
    }).json()
    client.patch(f"/api/v1/care-promises/{completed_task['promise_id']}/complete")

    overdue_res = client.get("/api/v1/care-promises/overdue")
    assert overdue_res.status_code == 200
    overdue_list = overdue_res.json()
    overdue_ids = [p["promise_id"] for p in overdue_list]

    assert overdue_task["promise_id"] in overdue_ids
    assert future_task["promise_id"] not in overdue_ids
    assert completed_task["promise_id"] not in overdue_ids

    # Verify task was NOT automatically marked as Completed
    check_task = client.get(f"/api/v1/care-promises/{overdue_task['promise_id']}").json()
    assert check_task["status"] == "Pending"
    assert check_task["completed_at"] is None


def test_complete_care_promise_endpoint(client):
    """11. Test marking a promise complete sets status and completed_at."""
    patient = create_sample_patient(client)
    promise = client.post("/api/v1/care-promises/", json={
        "patient_id": patient["patient_id"],
        "description": "Deliver oral rehydration salts",
        "due_date": "2026-11-23"
    }).json()
    p_id = promise["promise_id"]

    res = client.patch(f"/api/v1/care-promises/{p_id}/complete")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "Completed"
    assert data["completed_at"] is not None


def test_patch_care_promise_fields(client):
    """12. Test updating care promise details via PATCH."""
    patient = create_sample_patient(client)
    promise = client.post("/api/v1/care-promises/", json={
        "patient_id": patient["patient_id"],
        "description": "Initial task description",
        "due_date": "2026-11-25"
    }).json()
    p_id = promise["promise_id"]

    # Update description and due_date
    res = client.patch(f"/api/v1/care-promises/{p_id}", json={
        "description": "Updated detailed description",
        "due_date": "2026-11-30"
    })
    assert res.status_code == 200
    data = res.json()
    assert data["description"] == "Updated detailed description"
    assert data["due_date"] == "2026-11-30"
    assert data["status"] == "Pending"
    assert data["completed_at"] is None

    # Omitted due_date remains unchanged
    res_desc = client.patch(f"/api/v1/care-promises/{p_id}", json={"description": "Final description"})
    assert res_desc.status_code == 200
    assert res_desc.json()["description"] == "Final description"
    assert res_desc.json()["due_date"] == "2026-11-30"


def test_patch_care_promise_validation_errors(client):
    """13. Test validation errors on PATCH."""
    patient = create_sample_patient(client)
    promise = client.post("/api/v1/care-promises/", json={
        "patient_id": patient["patient_id"],
        "description": "Task for validation testing",
        "due_date": "2026-11-25"
    }).json()
    p_id = promise["promise_id"]

    # Explicit null description
    r1 = client.patch(f"/api/v1/care-promises/{p_id}", json={"description": None})
    assert r1.status_code == 422

    # Blank description
    r2 = client.patch(f"/api/v1/care-promises/{p_id}", json={"description": "   "})
    assert r2.status_code == 422

    # Explicit null due_date
    r3 = client.patch(f"/api/v1/care-promises/{p_id}", json={"due_date": None})
    assert r3.status_code == 422

    # Attempting to change patient_id or promise_id directly is forbidden
    r4 = client.patch(f"/api/v1/care-promises/{p_id}", json={"patient_id": "PAT-9999"})
    assert r4.status_code == 422

    r5 = client.patch(f"/api/v1/care-promises/{p_id}", json={"promise_id": "CP-9999-9999"})
    assert r5.status_code == 422


def test_patch_status_and_completed_at_rejected_422(client):
    """Regression: Verify PATCH with status or completed_at returns HTTP 422."""
    patient = create_sample_patient(client)
    promise = client.post("/api/v1/care-promises/", json={
        "patient_id": patient["patient_id"],
        "description": "Task to test restricted fields",
        "due_date": "2026-11-25"
    }).json()
    p_id = promise["promise_id"]

    # 1. PATCH with {"status": "Pending"} returns 422
    r_pend = client.patch(f"/api/v1/care-promises/{p_id}", json={"status": "Pending"})
    assert r_pend.status_code == 422

    # 2. PATCH with {"status": "Completed"} returns 422
    r_comp = client.patch(f"/api/v1/care-promises/{p_id}", json={"status": "Completed"})
    assert r_comp.status_code == 422

    # 3. PATCH with {"completed_at": null} returns 422
    r_cat = client.patch(f"/api/v1/care-promises/{p_id}", json={"completed_at": None})
    assert r_cat.status_code == 422


def test_completed_promise_preserves_status_and_timestamp_on_update(client):
    """Regression: Completed promise cannot be reopened; updates preserve status and original completed_at."""
    patient = create_sample_patient(client)
    promise = client.post("/api/v1/care-promises/", json={
        "patient_id": patient["patient_id"],
        "description": "Task to be completed",
        "due_date": "2026-11-25"
    }).json()
    p_id = promise["promise_id"]

    # Complete the promise
    comp_res = client.patch(f"/api/v1/care-promises/{p_id}/complete")
    assert comp_res.status_code == 200
    original_completed_at = comp_res.json()["completed_at"]
    assert original_completed_at is not None

    # 4. Completed promise cannot be reopened (PATCH status is forbidden)
    reopen_res = client.patch(f"/api/v1/care-promises/{p_id}", json={"status": "Pending"})
    assert reopen_res.status_code == 422

    # 5. Updating description of completed promise preserves Completed status and original completed_at
    upd_desc = client.patch(f"/api/v1/care-promises/{p_id}", json={"description": "Updated note for completed task"})
    assert upd_desc.status_code == 200
    assert upd_desc.json()["description"] == "Updated note for completed task"
    assert upd_desc.json()["status"] == "Completed"
    assert upd_desc.json()["completed_at"] == original_completed_at

    # 6. Updating due date of completed promise preserves Completed status and original completed_at
    upd_date = client.patch(f"/api/v1/care-promises/{p_id}", json={"due_date": "2026-11-29"})
    assert upd_date.status_code == 200
    assert upd_date.json()["due_date"] == "2026-11-29"
    assert upd_date.json()["status"] == "Completed"
    assert upd_date.json()["completed_at"] == original_completed_at

    # 7. Repeating completion request does not reset completed_at
    repeat_comp = client.patch(f"/api/v1/care-promises/{p_id}/complete")
    assert repeat_comp.status_code == 200
    assert repeat_comp.json()["completed_at"] == original_completed_at


def test_patient_care_promises_endpoint(client):
    """14. Test GET /api/v1/patients/{patient_id}/care-promises."""
    patient = create_sample_patient(client)
    p_id = patient["patient_id"]

    client.post("/api/v1/care-promises/", json={
        "patient_id": p_id,
        "description": "Patient specific task 1",
        "due_date": "2026-11-25"
    })
    client.post("/api/v1/care-promises/", json={
        "patient_id": p_id,
        "description": "Patient specific task 2",
        "due_date": "2026-11-28"
    })

    res = client.get(f"/api/v1/patients/{p_id}/care-promises")
    assert res.status_code == 200
    assert len(res.json()) == 2

    # Nonexistent patient returns 404
    res_404 = client.get("/api/v1/patients/PAT-2026-9999/care-promises")
    assert res_404.status_code == 404


def test_sequential_care_promise_ids(client):
    """15. Test that consecutive care promises receive sequential IDs."""
    patient = create_sample_patient(client)
    p_id = patient["patient_id"]

    p1 = client.post("/api/v1/care-promises/", json={
        "patient_id": p_id,
        "description": "Task Alpha",
        "due_date": "2026-11-25"
    }).json()

    p2 = client.post("/api/v1/care-promises/", json={
        "patient_id": p_id,
        "description": "Task Beta",
        "due_date": "2026-11-26"
    }).json()

    assert p1["promise_id"] != p2["promise_id"]
    seq1 = int(p1["promise_id"].split("-")[-1])
    seq2 = int(p2["promise_id"].split("-")[-1])
    assert seq2 == seq1 + 1
