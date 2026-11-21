"""
Unit and integration tests for Step 7: Medication Reminder Records API.
All tests use an isolated in-memory SQLite database and fictional clinical data.
Strictly record-keeping: tests ensure unauthorized prescription mutations are forbidden.
"""

import pytest
from datetime import date
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from sqlalchemy.exc import IntegrityError

from app.database import Base, get_db
from app.main import app
from app.models.medication_reminder import MedicationReminder
from app.models.patient import Patient


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


def create_sample_patient(client, name="Kavita Devi"):
    """Helper to register a fictional patient."""
    res = client.post("/api/v1/patients/", json={
        "name": name,
        "age": 42,
        "gender": "Female",
        "contact_number": "9876543210",
        "address": "Village Anandpur, Ward 4"
    })
    return res.json()


def create_sample_visit(client, patient_id):
    """Helper to create a fictional visit."""
    res = client.post("/api/v1/visits/", json={
        "patient_id": patient_id,
        "visit_date": "2026-11-21",
        "report": {
            "chief_complaint": "Joint pain and hypertension checkup",
            "symptoms": [{"name": "Knee pain", "severity": "Moderate"}],
            "vital_signs_mentioned": {"blood_pressure": "140/90"}
        }
    })
    return res.json()


def test_successful_creation_and_med_id_format(client):
    """1. Test successful creation and MED ID format (MED-YYYY-0001)."""
    patient = create_sample_patient(client)
    p_id = patient["patient_id"]

    payload = {
        "patient_id": p_id,
        "medication_name": "Amlodipine 5mg",
        "dosage_instructions": "Take 1 tablet orally once daily in the morning",
        "frequency": "Once daily",
        "start_date": "2026-11-21",
        "end_date": "2026-12-21",
        "prescribed_by": "Dr. R. K. Sharma (Medical Officer, PHC)",
        "prescription_reference": "PHC-OPD-2026-8812",
        "notes": "Monitor BP weekly"
    }

    res = client.post("/api/v1/medication-reminders/", json=payload)
    assert res.status_code == 201
    data = res.json()

    assert data["reminder_id"].startswith("MED-")
    assert len(data["reminder_id"].split("-")) == 3
    assert data["patient_id"] == p_id
    assert data["medication_name"] == "Amlodipine 5mg"
    assert data["dosage_instructions"] == "Take 1 tablet orally once daily in the morning"
    assert data["prescribed_by"] == "Dr. R. K. Sharma (Medical Officer, PHC)"
    assert data["prescription_reference"] == "PHC-OPD-2026-8812"
    assert data["status"] == "Active"
    assert "id" not in data  # Internal DB id must never be exposed


def test_creation_with_valid_visit(client):
    """2. Test creation with a valid linked visit."""
    patient = create_sample_patient(client)
    p_id = patient["patient_id"]
    visit = create_sample_visit(client, p_id)
    v_id = visit["visit_id"]

    payload = {
        "patient_id": p_id,
        "visit_id": v_id,
        "medication_name": "Paracetamol 500mg",
        "dosage_instructions": "1 tablet every 8 hours as needed for joint pain",
        "prescribed_by": "Dr. S. Mehta",
        "prescription_reference": "RX-2026-9901"
    }

    res = client.post("/api/v1/medication-reminders/", json=payload)
    assert res.status_code == 201
    assert res.json()["visit_id"] == v_id


def test_creation_nonexistent_patient_returns_404(client):
    """3. Test creating reminder for nonexistent patient returns 404."""
    payload = {
        "patient_id": "PAT-2026-9999",
        "medication_name": "Metformin 500mg",
        "dosage_instructions": "1 tablet twice daily with meals",
        "prescribed_by": "Dr. Verma",
        "prescription_reference": "RX-1234"
    }
    res = client.post("/api/v1/medication-reminders/", json=payload)
    assert res.status_code == 404
    assert "patient" in res.json()["detail"].lower()


def test_creation_nonexistent_visit_returns_404(client):
    """4. Test creating reminder with nonexistent visit returns 404."""
    patient = create_sample_patient(client)
    payload = {
        "patient_id": patient["patient_id"],
        "visit_id": "VIS-2026-9999",
        "medication_name": "Metformin 500mg",
        "dosage_instructions": "1 tablet twice daily with meals",
        "prescribed_by": "Dr. Verma",
        "prescription_reference": "RX-1234"
    }
    res = client.post("/api/v1/medication-reminders/", json=payload)
    assert res.status_code == 404
    assert "visit" in res.json()["detail"].lower()


def test_creation_visit_patient_mismatch_returns_422(client):
    """5. Test that linking a visit belonging to another patient returns 422."""
    p1 = create_sample_patient(client, name="Patient Alpha")
    p2 = create_sample_patient(client, name="Patient Beta")
    v1 = create_sample_visit(client, p1["patient_id"])

    payload = {
        "patient_id": p2["patient_id"],
        "visit_id": v1["visit_id"],
        "medication_name": "Amoxicillin 500mg",
        "dosage_instructions": "1 capsule thrice daily for 5 days",
        "prescribed_by": "Dr. Gupta",
        "prescription_reference": "RX-5544"
    }
    res = client.post("/api/v1/medication-reminders/", json=payload)
    assert res.status_code == 422
    assert "does not belong" in res.json()["detail"].lower()


def test_missing_null_blank_required_fields_return_422(client):
    """6. Test that missing, null, blank or whitespace-only required fields return 422."""
    patient = create_sample_patient(client)
    p_id = patient["patient_id"]

    base = {
        "patient_id": p_id,
        "medication_name": "Ibuprofen 400mg",
        "dosage_instructions": "1 tablet after food",
        "prescribed_by": "Dr. Verma",
        "prescription_reference": "RX-001"
    }

    # Blank medication_name
    bad = {**base, "medication_name": "   "}
    assert client.post("/api/v1/medication-reminders/", json=bad).status_code == 422

    # Null medication_name
    bad = {**base, "medication_name": None}
    assert client.post("/api/v1/medication-reminders/", json=bad).status_code == 422

    # Blank dosage_instructions
    bad = {**base, "dosage_instructions": "   "}
    assert client.post("/api/v1/medication-reminders/", json=bad).status_code == 422

    # Null dosage_instructions
    bad = {**base, "dosage_instructions": None}
    assert client.post("/api/v1/medication-reminders/", json=bad).status_code == 422

    # Blank prescribed_by
    bad = {**base, "prescribed_by": "   "}
    assert client.post("/api/v1/medication-reminders/", json=bad).status_code == 422

    # Null prescribed_by
    bad = {**base, "prescribed_by": None}
    assert client.post("/api/v1/medication-reminders/", json=bad).status_code == 422

    # Blank prescription_reference
    bad = {**base, "prescription_reference": "   "}
    assert client.post("/api/v1/medication-reminders/", json=bad).status_code == 422

    # Null prescription_reference
    bad = {**base, "prescription_reference": None}
    assert client.post("/api/v1/medication-reminders/", json=bad).status_code == 422


def test_optional_fields_accept_null(client):
    """7. Test that optional fields accept null values."""
    patient = create_sample_patient(client)
    payload = {
        "patient_id": patient["patient_id"],
        "medication_name": "Cetirizine 10mg",
        "dosage_instructions": "1 tablet at bedtime",
        "prescribed_by": "Dr. Rao",
        "prescription_reference": "RX-8899",
        "frequency": None,
        "start_date": None,
        "end_date": None,
        "visit_id": None,
        "notes": None
    }
    res = client.post("/api/v1/medication-reminders/", json=payload)
    assert res.status_code == 201
    data = res.json()
    assert data["frequency"] is None
    assert data["start_date"] is None
    assert data["end_date"] is None
    assert data["visit_id"] is None
    assert data["notes"] is None


def test_end_date_before_start_date_returns_422(client):
    """8. Test that end_date earlier than start_date returns 422 in POST and PATCH."""
    patient = create_sample_patient(client)
    p_id = patient["patient_id"]

    # In POST
    bad_post = {
        "patient_id": p_id,
        "medication_name": "Azithromycin 500mg",
        "dosage_instructions": "1 tablet daily for 3 days",
        "prescribed_by": "Dr. Sen",
        "prescription_reference": "RX-4433",
        "start_date": "2026-11-20",
        "end_date": "2026-11-10"  # Before start_date!
    }
    res = client.post("/api/v1/medication-reminders/", json=bad_post)
    assert res.status_code == 422

    # Create valid reminder
    valid_post = {
        "patient_id": p_id,
        "medication_name": "Azithromycin 500mg",
        "dosage_instructions": "1 tablet daily for 3 days",
        "prescribed_by": "Dr. Sen",
        "prescription_reference": "RX-4433",
        "start_date": "2026-11-20",
        "end_date": "2026-11-23"
    }
    created = client.post("/api/v1/medication-reminders/", json=valid_post).json()
    rem_id = created["reminder_id"]

    # In PATCH: update end_date earlier than existing start_date
    bad_patch = client.patch(f"/api/v1/medication-reminders/{rem_id}", json={
        "end_date": "2026-11-15"  # Earlier than start_date 2026-11-20
    })
    assert bad_patch.status_code == 422


def test_listing_and_filtering_by_patient_and_status(client):
    """9. Test listing reminders and filtering by patient and status."""
    p1 = create_sample_patient(client, name="Patient 1")
    p2 = create_sample_patient(client, name="Patient 2")

    r1 = client.post("/api/v1/medication-reminders/", json={
        "patient_id": p1["patient_id"],
        "medication_name": "Med A",
        "dosage_instructions": "1 tab daily",
        "prescribed_by": "Dr. A",
        "prescription_reference": "RX-1",
        "status": "Active"
    }).json()

    r2 = client.post("/api/v1/medication-reminders/", json={
        "patient_id": p1["patient_id"],
        "medication_name": "Med B",
        "dosage_instructions": "1 tab twice daily",
        "prescribed_by": "Dr. B",
        "prescription_reference": "RX-2",
        "status": "Inactive"
    }).json()

    r3 = client.post("/api/v1/medication-reminders/", json={
        "patient_id": p2["patient_id"],
        "medication_name": "Med C",
        "dosage_instructions": "1 tab thrice daily",
        "prescribed_by": "Dr. C",
        "prescription_reference": "RX-3",
        "status": "Active"
    }).json()

    # Total list
    all_res = client.get("/api/v1/medication-reminders/")
    assert all_res.status_code == 200
    assert all_res.json()["total"] == 3

    # Filter by patient p1
    p1_res = client.get(f"/api/v1/medication-reminders/?patient_id={p1['patient_id']}")
    assert p1_res.json()["total"] == 2

    # Filter by status Active
    act_res = client.get("/api/v1/medication-reminders/?status=Active")
    assert act_res.json()["total"] == 2

    # Filter by status Inactive
    inact_res = client.get("/api/v1/medication-reminders/?status=Inactive")
    assert inact_res.json()["total"] == 1
    assert inact_res.json()["reminders"][0]["reminder_id"] == r2["reminder_id"]


def test_retrieval_by_reminder_id(client):
    """10. Test retrieving a specific reminder by ID."""
    patient = create_sample_patient(client)
    created = client.post("/api/v1/medication-reminders/", json={
        "patient_id": patient["patient_id"],
        "medication_name": "Omeprazole 20mg",
        "dosage_instructions": "1 capsule before breakfast",
        "prescribed_by": "Dr. Joshi",
        "prescription_reference": "RX-7777"
    }).json()
    rem_id = created["reminder_id"]

    res = client.get(f"/api/v1/medication-reminders/{rem_id}")
    assert res.status_code == 200
    assert res.json()["reminder_id"] == rem_id
    assert res.json()["medication_name"] == "Omeprazole 20mg"


def test_nonexistent_reminder_returns_404(client):
    """11. Test that nonexistent reminder ID returns 404 in GET and PATCH."""
    assert client.get("/api/v1/medication-reminders/MED-2026-9999").status_code == 404
    assert client.patch("/api/v1/medication-reminders/MED-2026-9999", json={"notes": "test"}).status_code == 404
    assert client.patch("/api/v1/medication-reminders/MED-2026-9999/deactivate").status_code == 404


def test_updating_details_while_preserving_omitted_fields(client):
    """12. Test updating reminder details while preserving omitted fields."""
    patient = create_sample_patient(client)
    created = client.post("/api/v1/medication-reminders/", json={
        "patient_id": patient["patient_id"],
        "medication_name": "Losartan 50mg",
        "dosage_instructions": "1 tablet daily",
        "prescribed_by": "Dr. Patel",
        "prescription_reference": "RX-1122",
        "frequency": "Once daily"
    }).json()
    rem_id = created["reminder_id"]

    # Update only dosage_instructions and frequency
    patch_res = client.patch(f"/api/v1/medication-reminders/{rem_id}", json={
        "dosage_instructions": "1 tablet twice daily with water",
        "frequency": "Twice daily"
    })
    assert patch_res.status_code == 200
    data = patch_res.json()
    assert data["dosage_instructions"] == "1 tablet twice daily with water"
    assert data["frequency"] == "Twice daily"
    assert data["medication_name"] == "Losartan 50mg"  # Preserved
    assert data["prescribed_by"] == "Dr. Patel"        # Preserved
    assert data["prescription_reference"] == "RX-1122" # Preserved
    assert data["status"] == "Active"                  # Preserved


def test_deactivation_works(client):
    """13. Test explicit deactivation via /deactivate endpoint."""
    patient = create_sample_patient(client)
    created = client.post("/api/v1/medication-reminders/", json={
        "patient_id": patient["patient_id"],
        "medication_name": "Ciprofloxacin 500mg",
        "dosage_instructions": "1 tab twice daily for 5 days",
        "prescribed_by": "Dr. Roy",
        "prescription_reference": "RX-9911"
    }).json()
    rem_id = created["reminder_id"]
    assert created["status"] == "Active"

    res = client.patch(f"/api/v1/medication-reminders/{rem_id}/deactivate")
    assert res.status_code == 200
    assert res.json()["status"] == "Inactive"

    # Confirm via GET
    get_res = client.get(f"/api/v1/medication-reminders/{rem_id}").json()
    assert get_res["status"] == "Inactive"


def test_editing_inactive_reminder_does_not_reactivate(client):
    """14. Test that editing notes or other details on an Inactive reminder does not reactivate it."""
    patient = create_sample_patient(client)
    created = client.post("/api/v1/medication-reminders/", json={
        "patient_id": patient["patient_id"],
        "medication_name": "Doxycycline 100mg",
        "dosage_instructions": "1 cap twice daily",
        "prescribed_by": "Dr. Roy",
        "prescription_reference": "RX-3322"
    }).json()
    rem_id = created["reminder_id"]

    # Deactivate
    client.patch(f"/api/v1/medication-reminders/{rem_id}/deactivate")

    # Update notes
    patch_res = client.patch(f"/api/v1/medication-reminders/{rem_id}", json={
        "notes": "Course completed as prescribed"
    })
    assert patch_res.status_code == 200
    data = patch_res.json()
    assert data["status"] == "Inactive"  # Must remain Inactive!
    assert data["notes"] == "Course completed as prescribed"


def test_invalid_status_returns_422(client):
    """15. Test that invalid status values return 422 in POST, PATCH, and GET query."""
    patient = create_sample_patient(client)
    p_id = patient["patient_id"]

    # In POST
    bad_post = client.post("/api/v1/medication-reminders/", json={
        "patient_id": p_id,
        "medication_name": "Aspirin 75mg",
        "dosage_instructions": "1 tab daily",
        "prescribed_by": "Dr. A",
        "prescription_reference": "RX-1",
        "status": "Archived"
    })
    assert bad_post.status_code == 422

    # In PATCH
    valid = client.post("/api/v1/medication-reminders/", json={
        "patient_id": p_id,
        "medication_name": "Aspirin 75mg",
        "dosage_instructions": "1 tab daily",
        "prescribed_by": "Dr. A",
        "prescription_reference": "RX-1"
    }).json()
    bad_patch = client.patch(f"/api/v1/medication-reminders/{valid['reminder_id']}", json={
        "status": "Suspended"
    })
    assert bad_patch.status_code == 422

    # In GET filter
    bad_get = client.get("/api/v1/medication-reminders/?status=Unknown")
    assert bad_get.status_code == 422


def test_unknown_fields_return_422(client):
    """16. Test that unknown fields are forbidden (extra='forbid') in POST and PATCH."""
    patient = create_sample_patient(client)
    p_id = patient["patient_id"]

    # In POST
    r_post = client.post("/api/v1/medication-reminders/", json={
        "patient_id": p_id,
        "medication_name": "Med A",
        "dosage_instructions": "1 tab daily",
        "prescribed_by": "Dr. A",
        "prescription_reference": "RX-1",
        "unauthorized_field": "injected value"
    })
    assert r_post.status_code == 422

    # In PATCH
    valid = client.post("/api/v1/medication-reminders/", json={
        "patient_id": p_id,
        "medication_name": "Med A",
        "dosage_instructions": "1 tab daily",
        "prescribed_by": "Dr. A",
        "prescription_reference": "RX-1"
    }).json()

    r_patch = client.patch(f"/api/v1/medication-reminders/{valid['reminder_id']}", json={
        "patient_id": "PAT-HACK",
        "reminder_id": "MED-HACK"
    })
    assert r_patch.status_code == 422


def test_sqlite_foreign_key_enforcement_for_medication_reminders():
    """17. Test that SQLite foreign key enforcement rejects invalid patient references at DB level."""
    test_engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool
    )
    Base.metadata.create_all(bind=test_engine)
    TestingSession = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)
    session = TestingSession()

    try:
        invalid_rem = MedicationReminder(
            reminder_id="MED-2026-FAILFK",
            patient_id="PAT-NONEXISTENT",
            medication_name="Test Med",
            dosage_instructions="1 tab daily",
            prescribed_by="Dr. Test",
            prescription_reference="RX-TEST"
        )
        session.add(invalid_rem)
        with pytest.raises(IntegrityError):
            session.commit()
    finally:
        session.close()
        Base.metadata.drop_all(bind=test_engine)


def test_sequential_unique_ids(client):
    """18. Test sequential ID generation and database uniqueness enforcement."""
    patient = create_sample_patient(client)
    p_id = patient["patient_id"]

    r1 = client.post("/api/v1/medication-reminders/", json={
        "patient_id": p_id,
        "medication_name": "Med 1",
        "dosage_instructions": "1 tab",
        "prescribed_by": "Dr. 1",
        "prescription_reference": "RX-1"
    }).json()
    r2 = client.post("/api/v1/medication-reminders/", json={
        "patient_id": p_id,
        "medication_name": "Med 2",
        "dosage_instructions": "2 tabs",
        "prescribed_by": "Dr. 2",
        "prescription_reference": "RX-2"
    }).json()
    r3 = client.post("/api/v1/medication-reminders/", json={
        "patient_id": p_id,
        "medication_name": "Med 3",
        "dosage_instructions": "3 tabs",
        "prescribed_by": "Dr. 3",
        "prescription_reference": "RX-3"
    }).json()

    s1 = int(r1["reminder_id"].split("-")[-1])
    s2 = int(r2["reminder_id"].split("-")[-1])
    s3 = int(r3["reminder_id"].split("-")[-1])
    assert s2 == s1 + 1
    assert s3 == s2 + 1

    # Database uniqueness constraint test
    test_engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool
    )
    Base.metadata.create_all(bind=test_engine)
    TestingSession = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)
    session = TestingSession()

    try:
        p_db = Patient(patient_id="PAT-2026-UNIQ", name="DB Patient", age=30)
        session.add(p_db)
        session.commit()

        dup1 = MedicationReminder(
            reminder_id="MED-2026-SAME",
            patient_id="PAT-2026-UNIQ",
            medication_name="Med 1",
            dosage_instructions="1 tab",
            prescribed_by="Dr. 1",
            prescription_reference="RX-1"
        )
        dup2 = MedicationReminder(
            reminder_id="MED-2026-SAME",
            patient_id="PAT-2026-UNIQ",
            medication_name="Med 2",
            dosage_instructions="2 tabs",
            prescribed_by="Dr. 2",
            prescription_reference="RX-2"
        )
        session.add(dup1)
        session.commit()

        session.add(dup2)
        with pytest.raises(IntegrityError):
            session.commit()
    finally:
        session.close()
        Base.metadata.drop_all(bind=test_engine)


def test_patient_medication_reminder_history_newest_first(client):
    """19. Test patient medication reminder history endpoint returns reminders newest first."""
    patient = create_sample_patient(client)
    p_id = patient["patient_id"]

    meds = ["Med Alpha", "Med Beta", "Med Gamma"]
    created_ids = []
    for med in meds:
        res = client.post("/api/v1/medication-reminders/", json={
            "patient_id": p_id,
            "medication_name": med,
            "dosage_instructions": f"Take {med}",
            "prescribed_by": "Dr. Specialist",
            "prescription_reference": "RX-HIST"
        })
        created_ids.append(res.json()["reminder_id"])

    res = client.get(f"/api/v1/patients/{p_id}/medication-reminders")
    assert res.status_code == 200
    history = res.json()
    assert len(history) == 3

    # Ordered newest first (last created appears first)
    returned_ids = [r["reminder_id"] for r in history]
    assert returned_ids == list(reversed(created_ids))

    # Nonexistent patient returns 404
    r_404 = client.get("/api/v1/patients/PAT-2026-9999/medication-reminders")
    assert r_404.status_code == 404


def test_no_automatic_deactivation_based_on_dates(client):
    """20. Test that reminders with past end dates remain Active and are never auto-deactivated."""
    patient = create_sample_patient(client)
    p_id = patient["patient_id"]

    res = client.post("/api/v1/medication-reminders/", json={
        "patient_id": p_id,
        "medication_name": "Past Antibiotic Course",
        "dosage_instructions": "1 tab daily",
        "prescribed_by": "Dr. Primary",
        "prescription_reference": "RX-PAST",
        "start_date": "2026-09-01",
        "end_date": "2026-09-07"  # In the past
    })
    assert res.status_code == 201
    created = res.json()
    assert created["status"] == "Active"

    # Query reminder: remains Active
    fetched = client.get(f"/api/v1/medication-reminders/{created['reminder_id']}").json()
    assert fetched["status"] == "Active"


def test_patch_explicit_null_required_fields_return_422(client):
    """21. Test that setting required fields to null in PATCH returns 422."""
    patient = create_sample_patient(client)
    created = client.post("/api/v1/medication-reminders/", json={
        "patient_id": patient["patient_id"],
        "medication_name": "Atenolol 50mg",
        "dosage_instructions": "1 tab daily",
        "prescribed_by": "Dr. Cardiologist",
        "prescription_reference": "RX-CARDIO-1"
    }).json()
    rem_id = created["reminder_id"]

    assert client.patch(f"/api/v1/medication-reminders/{rem_id}", json={"medication_name": None}).status_code == 422
    assert client.patch(f"/api/v1/medication-reminders/{rem_id}", json={"dosage_instructions": None}).status_code == 422
    assert client.patch(f"/api/v1/medication-reminders/{rem_id}", json={"prescribed_by": None}).status_code == 422
    assert client.patch(f"/api/v1/medication-reminders/{rem_id}", json={"prescription_reference": None}).status_code == 422
    assert client.patch(f"/api/v1/medication-reminders/{rem_id}", json={"status": None}).status_code == 422


def test_patch_blank_required_fields_return_422(client):
    """22. Test that passing blank or whitespace-only strings for required fields in PATCH returns 422."""
    patient = create_sample_patient(client)
    created = client.post("/api/v1/medication-reminders/", json={
        "patient_id": patient["patient_id"],
        "medication_name": "Thyroxine 50mcg",
        "dosage_instructions": "1 tab daily fasting",
        "prescribed_by": "Dr. Endocrine",
        "prescription_reference": "RX-THY-1"
    }).json()
    rem_id = created["reminder_id"]

    assert client.patch(f"/api/v1/medication-reminders/{rem_id}", json={"medication_name": "   "}).status_code == 422
    assert client.patch(f"/api/v1/medication-reminders/{rem_id}", json={"medication_name": ""}).status_code == 422
    assert client.patch(f"/api/v1/medication-reminders/{rem_id}", json={"dosage_instructions": "   "}).status_code == 422
    assert client.patch(f"/api/v1/medication-reminders/{rem_id}", json={"prescribed_by": "   "}).status_code == 422
    assert client.patch(f"/api/v1/medication-reminders/{rem_id}", json={"prescription_reference": "   "}).status_code == 422


def test_partial_date_updates_and_clearing(client):
    """23. Test partial date updates (comparing with existing dates) and clearing dates with null."""
    patient = create_sample_patient(client)
    created = client.post("/api/v1/medication-reminders/", json={
        "patient_id": patient["patient_id"],
        "medication_name": "Pantoprazole 40mg",
        "dosage_instructions": "1 tab daily",
        "prescribed_by": "Dr. Med",
        "prescription_reference": "RX-DATE-1",
        "start_date": "2026-11-20",
        "end_date": "2026-11-30"
    }).json()
    rem_id = created["reminder_id"]

    # 1. Update start_date later than existing end_date (2026-11-30) -> 422
    bad_start = client.patch(f"/api/v1/medication-reminders/{rem_id}", json={
        "start_date": "2026-12-05"
    })
    assert bad_start.status_code == 422

    # 2. Update end_date earlier than existing start_date (2026-11-20) -> 422
    bad_end = client.patch(f"/api/v1/medication-reminders/{rem_id}", json={
        "end_date": "2026-11-10"
    })
    assert bad_end.status_code == 422

    # 3. Clear start_date with null -> 200
    clear_start = client.patch(f"/api/v1/medication-reminders/{rem_id}", json={
        "start_date": None
    })
    assert clear_start.status_code == 200
    assert clear_start.json()["start_date"] is None
    assert clear_start.json()["end_date"] == "2026-11-30"  # Kept

    # 4. Clear end_date with null -> 200
    clear_end = client.patch(f"/api/v1/medication-reminders/{rem_id}", json={
        "end_date": None
    })
    assert clear_end.status_code == 200
    assert clear_end.json()["start_date"] is None
    assert clear_end.json()["end_date"] is None

    # 5. Reset both dates to valid range
    reset_dates = client.patch(f"/api/v1/medication-reminders/{rem_id}", json={
        "start_date": "2026-12-01",
        "end_date": "2026-12-15"
    })
    assert reset_dates.status_code == 200
    assert reset_dates.json()["start_date"] == "2026-12-01"
    assert reset_dates.json()["end_date"] == "2026-12-15"


def test_intentional_reactivation_and_inactive_protection(client):
    """24. Test that an Inactive reminder can be reactivated only via explicit status change."""
    patient = create_sample_patient(client)
    created = client.post("/api/v1/medication-reminders/", json={
        "patient_id": patient["patient_id"],
        "medication_name": "Salbutamol Inhaler",
        "dosage_instructions": "2 puffs as needed",
        "prescribed_by": "Dr. Chest",
        "prescription_reference": "RX-CHEST-1"
    }).json()
    rem_id = created["reminder_id"]
    assert created["status"] == "Active"

    # Explicitly deactivate
    deact = client.patch(f"/api/v1/medication-reminders/{rem_id}/deactivate")
    assert deact.status_code == 200
    assert deact.json()["status"] == "Inactive"

    # Editing notes or dosage instructions preserves Inactive
    edit_details = client.patch(f"/api/v1/medication-reminders/{rem_id}", json={
        "dosage_instructions": "1 puff as needed",
        "notes": "Reduced dosage on review"
    })
    assert edit_details.status_code == 200
    assert edit_details.json()["status"] == "Inactive"
    assert edit_details.json()["dosage_instructions"] == "1 puff as needed"

    # Intentional reactivation via explicit status update
    reactivate = client.patch(f"/api/v1/medication-reminders/{rem_id}", json={
        "status": "Active"
    })
    assert reactivate.status_code == 200
    assert reactivate.json()["status"] == "Active"


def test_list_pagination_and_query_filters(client):
    """25. Test list pagination (skip, limit) and patient filtering."""
    patient = create_sample_patient(client, name="Pagination Test Patient")
    p_id = patient["patient_id"]

    for i in range(5):
        client.post("/api/v1/medication-reminders/", json={
            "patient_id": p_id,
            "medication_name": f"Medicine {i + 1}",
            "dosage_instructions": f"Instruction {i + 1}",
            "prescribed_by": "Dr. Page",
            "prescription_reference": f"RX-PAGE-{i + 1}"
        })

    # Page 1: skip=0, limit=2
    p1 = client.get(f"/api/v1/medication-reminders/?patient_id={p_id}&skip=0&limit=2")
    assert p1.status_code == 200
    assert p1.json()["total"] == 5
    assert len(p1.json()["reminders"]) == 2

    # Page 2: skip=2, limit=2
    p2 = client.get(f"/api/v1/medication-reminders/?patient_id={p_id}&skip=2&limit=2")
    assert p2.status_code == 200
    assert p2.json()["total"] == 5
    assert len(p2.json()["reminders"]) == 2

    # Page 3: skip=4, limit=2
    p3 = client.get(f"/api/v1/medication-reminders/?patient_id={p_id}&skip=4&limit=2")
    assert p3.status_code == 200
    assert p3.json()["total"] == 5
    assert len(p3.json()["reminders"]) == 1


def test_orm_relationship_navigation_and_cascade_delete():
    """26. Test SQLAlchemy ORM relationships (patient.medication_reminders, visit.medication_reminders)
       and verify cascade deletion on patient and SET NULL on visit."""
    test_engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool
    )
    Base.metadata.create_all(bind=test_engine)
    TestingSession = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)
    session = TestingSession()

    try:
        from app.models.visit import Visit
        p = Patient(patient_id="PAT-REL-1", name="Rel Patient", age=35)
        v = Visit(visit_id="VIS-REL-1", patient_id="PAT-REL-1", visit_date=date(2026, 11, 21), report={"chief_complaint": "Checkup"})
        session.add(p)
        session.add(v)
        session.commit()

        rem = MedicationReminder(
            reminder_id="MED-REL-1",
            patient_id="PAT-REL-1",
            visit_id="VIS-REL-1",
            medication_name="Rel Med",
            dosage_instructions="1 tab",
            prescribed_by="Dr. Rel",
            prescription_reference="RX-REL"
        )
        session.add(rem)
        session.commit()

        # Navigate from patient
        session.refresh(p)
        assert len(p.medication_reminders) == 1
        assert p.medication_reminders[0].reminder_id == "MED-REL-1"

        # Navigate from visit
        session.refresh(v)
        assert len(v.medication_reminders) == 1
        assert v.medication_reminders[0].reminder_id == "MED-REL-1"

        # Delete visit -> reminder.visit_id becomes NULL (SET NULL)
        session.delete(v)
        session.commit()
        session.refresh(rem)
        assert rem.visit_id is None

        # Delete patient -> reminder cascaded (CASCADE)
        session.delete(p)
        session.commit()
        assert session.query(MedicationReminder).filter(MedicationReminder.reminder_id == "MED-REL-1").first() is None
    finally:
        session.close()
        Base.metadata.drop_all(bind=test_engine)
