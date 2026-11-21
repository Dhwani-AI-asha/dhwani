"""
Unit and integration tests for Step 6: Referral Tracking APIs.
All tests use an isolated in-memory SQLite database and fictional clinical data.
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
from app.models.referral import Referral


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


def create_sample_patient(client, name="Geeta Verma"):
    """Helper to register a fictional patient."""
    res = client.post("/api/v1/patients/", json={
        "name": name,
        "age": 30,
        "gender": "Female",
        "contact_number": "9876543210",
        "address": "Village Anandpur, Ward 3"
    })
    return res.json()


def create_sample_visit(client, patient_id):
    """Helper to create a fictional visit."""
    res = client.post("/api/v1/visits/", json={
        "patient_id": patient_id,
        "visit_date": "2026-11-21",
        "report": {
            "chief_complaint": "Severe abdominal pain",
            "symptoms": [{"name": "Pain", "severity": "Severe"}],
            "danger_signs": ["Acute abdomen"]
        }
    })
    return res.json()


def test_successful_referral_creation_and_id_format(client):
    """1. Test successful referral creation and verify generated ID format REF-YYYY-0001."""
    patient = create_sample_patient(client)
    p_id = patient["patient_id"]

    payload = {
        "patient_id": p_id,
        "reason": "Severe anemia requiring blood transfusion",
        "facility_name": "District Civil Hospital",
        "referred_by": "ASHA Sunita",
        "notes": "Arranged 108 ambulance transport",
        "referral_date": "2026-11-21"
    }
    res = client.post("/api/v1/referrals/", json=payload)
    assert res.status_code == 201
    data = res.json()

    assert data["referral_id"].startswith("REF-")
    assert len(data["referral_id"].split("-")) == 3
    assert data["patient_id"] == p_id
    assert data["reason"] == "Severe anemia requiring blood transfusion"
    assert data["facility_name"] == "District Civil Hospital"
    assert data["referred_by"] == "ASHA Sunita"
    assert data["status"] == "Pending"
    assert data["notes"] == "Arranged 108 ambulance transport"
    assert "id" not in data  # Internal DB id must never be exposed


def test_referral_with_valid_visit(client):
    """2. Test referral creation linked to a valid visit."""
    patient = create_sample_patient(client)
    p_id = patient["patient_id"]
    visit = create_sample_visit(client, p_id)
    v_id = visit["visit_id"]

    payload = {
        "patient_id": p_id,
        "visit_id": v_id,
        "reason": "Suspected appendicitis",
        "facility_name": "Sub-Divisional Hospital"
    }
    res = client.post("/api/v1/referrals/", json=payload)
    assert res.status_code == 201
    assert res.json()["visit_id"] == v_id


def test_create_referral_nonexistent_patient_returns_404(client):
    """3. Test creating a referral for a nonexistent patient returns 404."""
    payload = {
        "patient_id": "PAT-2026-9999",
        "reason": "Emergency referral",
        "facility_name": "Community Health Center"
    }
    res = client.post("/api/v1/referrals/", json=payload)
    assert res.status_code == 404
    assert "not found" in res.json()["detail"].lower()


def test_create_referral_nonexistent_visit_returns_404(client):
    """4. Test creating a referral with a nonexistent visit_id returns 404."""
    patient = create_sample_patient(client)
    payload = {
        "patient_id": patient["patient_id"],
        "visit_id": "VIS-2026-9999",
        "reason": "Specialist consult",
        "facility_name": "District Hospital"
    }
    res = client.post("/api/v1/referrals/", json=payload)
    assert res.status_code == 404
    assert "visit" in res.json()["detail"].lower()


def test_create_referral_visit_patient_mismatch_returns_422(client):
    """5. Test that linking a visit belonging to another patient returns 422."""
    p1 = create_sample_patient(client, name="Patient Alpha")
    p2 = create_sample_patient(client, name="Patient Beta")
    v1 = create_sample_visit(client, p1["patient_id"])

    payload = {
        "patient_id": p2["patient_id"],
        "visit_id": v1["visit_id"],
        "reason": "Mismatched referral",
        "facility_name": "City Hospital"
    }
    res = client.post("/api/v1/referrals/", json=payload)
    assert res.status_code == 422
    assert "does not belong" in res.json()["detail"].lower()


def test_blank_reason_and_facility_name_rejected_422(client):
    """6. Test that blank or whitespace-only reason or facility_name return 422."""
    patient = create_sample_patient(client)
    p_id = patient["patient_id"]

    # Blank reason
    r1 = client.post("/api/v1/referrals/", json={
        "patient_id": p_id,
        "reason": "   ",
        "facility_name": "Valid Facility"
    })
    assert r1.status_code == 422

    # Blank facility_name
    r2 = client.post("/api/v1/referrals/", json={
        "patient_id": p_id,
        "reason": "Valid Reason",
        "facility_name": "   "
    })
    assert r2.status_code == 422


def test_list_referrals_and_filtering(client):
    """7. Test listing referrals and filtering by patient_id and status."""
    p1 = create_sample_patient(client, name="Patient One")
    p2 = create_sample_patient(client, name="Patient Two")

    ref1 = client.post("/api/v1/referrals/", json={
        "patient_id": p1["patient_id"],
        "reason": "Cardiac evaluation",
        "facility_name": "District Hospital",
        "status": "Pending"
    }).json()

    ref2 = client.post("/api/v1/referrals/", json={
        "patient_id": p1["patient_id"],
        "reason": "Ophthalmology consult",
        "facility_name": "Eye Care Center",
        "status": "Completed"
    }).json()

    ref3 = client.post("/api/v1/referrals/", json={
        "patient_id": p2["patient_id"],
        "reason": "High risk pregnancy consult",
        "facility_name": "Maternity Hospital",
        "status": "Pending"
    }).json()

    # Total list
    all_res = client.get("/api/v1/referrals/")
    assert all_res.status_code == 200
    assert all_res.json()["total"] == 3

    # Filter by patient p1
    p1_res = client.get(f"/api/v1/referrals/?patient_id={p1['patient_id']}")
    assert p1_res.json()["total"] == 2

    # Filter by status Completed
    comp_res = client.get("/api/v1/referrals/?status=Completed")
    assert comp_res.json()["total"] == 1
    assert comp_res.json()["referrals"][0]["referral_id"] == ref2["referral_id"]


def test_get_referral_by_id(client):
    """8. Test retrieving a referral by its unique ID."""
    patient = create_sample_patient(client)
    created = client.post("/api/v1/referrals/", json={
        "patient_id": patient["patient_id"],
        "reason": "Persistent jaundice",
        "facility_name": "General Hospital"
    }).json()
    ref_id = created["referral_id"]

    res = client.get(f"/api/v1/referrals/{ref_id}")
    assert res.status_code == 200
    assert res.json()["referral_id"] == ref_id
    assert res.json()["reason"] == "Persistent jaundice"

    # Nonexistent referral returns 404
    r_404 = client.get("/api/v1/referrals/REF-2026-9999")
    assert r_404.status_code == 404


def test_update_referral_details_and_validation(client):
    """9. Test updating referral details and status with validation."""
    patient = create_sample_patient(client)
    created = client.post("/api/v1/referrals/", json={
        "patient_id": patient["patient_id"],
        "reason": "Suspected fracture",
        "facility_name": "Civil Hospital"
    }).json()
    ref_id = created["referral_id"]

    # Update facility and status to Completed
    patch_res = client.patch(f"/api/v1/referrals/{ref_id}", json={
        "facility_name": "Orthopedic Specialty Center",
        "status": "Completed",
        "notes": "Patient treated and discharged"
    })
    assert patch_res.status_code == 200
    data = patch_res.json()
    assert data["facility_name"] == "Orthopedic Specialty Center"
    assert data["status"] == "Completed"
    assert data["notes"] == "Patient treated and discharged"
    assert data["reason"] == "Suspected fracture"  # Unchanged

    # Invalid status rejected with 422
    inv_res = client.patch(f"/api/v1/referrals/{ref_id}", json={"status": "Discarded"})
    assert inv_res.status_code == 422

    # Explicit null reason rejected with 422
    null_reason = client.patch(f"/api/v1/referrals/{ref_id}", json={"reason": None})
    assert null_reason.status_code == 422

    # Attempt to change patient_id or referral_id rejected with 422
    forbid_res = client.patch(f"/api/v1/referrals/{ref_id}", json={"patient_id": "PAT-9999"})
    assert forbid_res.status_code == 422


def test_patient_referral_history_newest_first(client):
    """10. Test patient-specific referral history endpoint, ordered newest first."""
    patient = create_sample_patient(client)
    p_id = patient["patient_id"]

    dates = ["2026-11-05", "2026-11-20", "2026-11-12"]
    for d in dates:
        client.post("/api/v1/referrals/", json={
            "patient_id": p_id,
            "reason": f"Referral on {d}",
            "facility_name": "CHC",
            "referral_date": d
        })

    res = client.get(f"/api/v1/patients/{p_id}/referrals")
    assert res.status_code == 200
    history = res.json()
    assert len(history) == 3
    ret_dates = [r["referral_date"] for r in history]
    assert ret_dates == ["2026-11-20", "2026-11-12", "2026-11-05"]

    # Nonexistent patient returns 404
    res_404 = client.get("/api/v1/patients/PAT-2026-9999/referrals")
    assert res_404.status_code == 404


def test_optional_fields_accept_null(client):
    """11. Test that optional fields (referred_by, notes) accept null."""
    patient = create_sample_patient(client)
    created = client.post("/api/v1/referrals/", json={
        "patient_id": patient["patient_id"],
        "reason": "Dental evaluation",
        "facility_name": "Dental Clinic",
        "referred_by": None,
        "notes": None
    }).json()

    assert created["referred_by"] is None
    assert created["notes"] is None


def test_referral_not_automatically_completed(client):
    """12. Test that referrals remain Pending and are never automatically marked Completed."""
    patient = create_sample_patient(client)
    created = client.post("/api/v1/referrals/", json={
        "patient_id": patient["patient_id"],
        "reason": "Ultrasound scan",
        "facility_name": "Diagnostic Center",
        "referral_date": "2026-10-01"  # In the past
    }).json()

    assert created["status"] == "Pending"

    # Query referral after creation
    ref = client.get(f"/api/v1/referrals/{created['referral_id']}").json()
    assert ref["status"] == "Pending"


def test_cancelled_referral_cannot_be_silently_reactivated(client):
    """13. Test that updating notes or facility on a Cancelled referral does not silently reactivate it."""
    patient = create_sample_patient(client)
    created = client.post("/api/v1/referrals/", json={
        "patient_id": patient["patient_id"],
        "reason": "ENT evaluation",
        "facility_name": "City Clinic"
    }).json()
    ref_id = created["referral_id"]

    # Cancel the referral
    client.patch(f"/api/v1/referrals/{ref_id}", json={"status": "Cancelled"})
    cancelled_ref = client.get(f"/api/v1/referrals/{ref_id}").json()
    assert cancelled_ref["status"] == "Cancelled"

    # Perform unrelated update (e.g. updating notes or facility)
    patch_unrelated = client.patch(f"/api/v1/referrals/{ref_id}", json={
        "notes": "Added explanation for why it was cancelled"
    })
    assert patch_unrelated.status_code == 200
    assert patch_unrelated.json()["status"] == "Cancelled"  # Must remain Cancelled!


def test_sqlite_foreign_key_enforcement_for_referrals():
    """14. Test that SQLite foreign key enforcement rejects invalid patient references at DB level."""
    test_engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool
    )
    Base.metadata.create_all(bind=test_engine)
    TestingSession = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)
    session = TestingSession()

    try:
        invalid_ref = Referral(
            referral_id="REF-2026-FAILFK",
            patient_id="PAT-NONEXISTENT",
            reason="Testing FK error",
            facility_name="Anywhere"
        )
        session.add(invalid_ref)
        with pytest.raises(IntegrityError):
            session.commit()
    finally:
        session.close()
        Base.metadata.drop_all(bind=test_engine)


def test_referral_status_transition_rules(client):
    """15. Test explicit status transition rules:
       - Pending -> Completed is allowed.
       - Pending -> Cancelled is allowed.
       - Cancelled -> Pending is rejected with 422.
       - Cancelled -> Completed is rejected with 422.
       - Updating notes or reason on a Cancelled referral preserves Cancelled status.
    """
    patient = create_sample_patient(client, name="Transition Test Patient")
    p_id = patient["patient_id"]

    # 1. Pending -> Completed
    r1 = client.post("/api/v1/referrals/", json={
        "patient_id": p_id,
        "reason": "Audiometry test",
        "facility_name": "District ENT Clinic"
    }).json()
    r1_id = r1["referral_id"]
    assert r1["status"] == "Pending"

    comp_res = client.patch(f"/api/v1/referrals/{r1_id}", json={"status": "Completed"})
    assert comp_res.status_code == 200
    assert comp_res.json()["status"] == "Completed"

    # 2. Pending -> Cancelled
    r2 = client.post("/api/v1/referrals/", json={
        "patient_id": p_id,
        "reason": "Dermatology review",
        "facility_name": "Skin Specialty Clinic"
    }).json()
    r2_id = r2["referral_id"]

    canc_res = client.patch(f"/api/v1/referrals/{r2_id}", json={"status": "Cancelled"})
    assert canc_res.status_code == 200
    assert canc_res.json()["status"] == "Cancelled"

    # 3. Cancelled -> Pending must be rejected with 422
    rej_pending = client.patch(f"/api/v1/referrals/{r2_id}", json={"status": "Pending"})
    assert rej_pending.status_code == 422
    assert "cannot transition" in rej_pending.json()["detail"].lower()

    # 4. Cancelled -> Completed must be rejected with 422
    rej_completed = client.patch(f"/api/v1/referrals/{r2_id}", json={"status": "Completed"})
    assert rej_completed.status_code == 422
    assert "cannot transition" in rej_completed.json()["detail"].lower()

    # 5. Updating notes or reason on a Cancelled referral preserves Cancelled status
    note_update = client.patch(f"/api/v1/referrals/{r2_id}", json={
        "notes": "Patient opted for alternative local remedy",
        "facility_name": "Updated Community Center"
    })
    assert note_update.status_code == 200
    assert note_update.json()["status"] == "Cancelled"
    assert note_update.json()["notes"] == "Patient opted for alternative local remedy"
    assert note_update.json()["facility_name"] == "Updated Community Center"


def test_patch_validation_null_and_blank_required_fields(client):
    """16. Test PATCH validation:
       - reason and facility_name cannot be explicitly set to null (HTTP 422).
       - blank or whitespace-only reason or facility_name return HTTP 422.
       - omitted fields remain unchanged.
       - unknown fields rejected with HTTP 422 (extra='forbid').
    """
    patient = create_sample_patient(client, name="Validation Test Patient")
    ref = client.post("/api/v1/referrals/", json={
        "patient_id": patient["patient_id"],
        "reason": "Original Reason",
        "facility_name": "Original Facility"
    }).json()
    ref_id = ref["referral_id"]

    # Explicit null reason -> 422
    r_null_reason = client.patch(f"/api/v1/referrals/{ref_id}", json={"reason": None})
    assert r_null_reason.status_code == 422

    # Blank reason -> 422
    r_blank_reason = client.patch(f"/api/v1/referrals/{ref_id}", json={"reason": "   "})
    assert r_blank_reason.status_code == 422

    # Explicit null facility_name -> 422
    r_null_fac = client.patch(f"/api/v1/referrals/{ref_id}", json={"facility_name": None})
    assert r_null_fac.status_code == 422

    # Blank facility_name -> 422
    r_blank_fac = client.patch(f"/api/v1/referrals/{ref_id}", json={"facility_name": "   "})
    assert r_blank_fac.status_code == 422

    # Extra/unknown field forbidden -> 422
    r_extra = client.patch(f"/api/v1/referrals/{ref_id}", json={"unexpected_key": "some value"})
    assert r_extra.status_code == 422

    # Omitted field remains unchanged
    r_ok = client.patch(f"/api/v1/referrals/{ref_id}", json={"facility_name": "Updated Facility"})
    assert r_ok.status_code == 200
    assert r_ok.json()["facility_name"] == "Updated Facility"
    assert r_ok.json()["reason"] == "Original Reason"  # Preserved!


def test_clear_optional_fields_with_null(client):
    """17. Test that optional fields (referred_by, notes) can be cleared with explicit null."""
    patient = create_sample_patient(client, name="Clear Fields Patient")
    ref = client.post("/api/v1/referrals/", json={
        "patient_id": patient["patient_id"],
        "reason": "Physiotherapy referral",
        "facility_name": "Rehabilitation Center",
        "referred_by": "Dr. Sharma",
        "notes": "Weekly therapy required"
    }).json()
    ref_id = ref["referral_id"]
    assert ref["referred_by"] == "Dr. Sharma"
    assert ref["notes"] == "Weekly therapy required"

    # Clear both optional fields via PATCH
    clear_res = client.patch(f"/api/v1/referrals/{ref_id}", json={
        "referred_by": None,
        "notes": None
    })
    assert clear_res.status_code == 200
    cleared = clear_res.json()
    assert cleared["referred_by"] is None
    assert cleared["notes"] is None
    assert cleared["reason"] == "Physiotherapy referral"  # Unchanged
    assert cleared["facility_name"] == "Rehabilitation Center"  # Unchanged


def test_unsupported_status_values_rejected_with_422(client):
    """18. Test that unsupported status values return HTTP 422 in POST, PATCH, and GET query."""
    patient = create_sample_patient(client, name="Status Validation Patient")
    p_id = patient["patient_id"]

    # In POST
    r_post = client.post("/api/v1/referrals/", json={
        "patient_id": p_id,
        "reason": "Test reason",
        "facility_name": "Test clinic",
        "status": "InReview"
    })
    assert r_post.status_code == 422

    # In PATCH
    valid_ref = client.post("/api/v1/referrals/", json={
        "patient_id": p_id,
        "reason": "Valid reason",
        "facility_name": "Valid clinic"
    }).json()
    r_patch = client.patch(f"/api/v1/referrals/{valid_ref['referral_id']}", json={
        "status": "Archived"
    })
    assert r_patch.status_code == 422

    # In GET filter
    r_query = client.get("/api/v1/referrals/?status=InvalidStatus")
    assert r_query.status_code == 422


def test_sequential_referral_ids_and_uniqueness(client):
    """19. Test sequential referral ID generation and database uniqueness enforcement."""
    patient = create_sample_patient(client, name="Sequential ID Patient")
    p_id = patient["patient_id"]

    r1 = client.post("/api/v1/referrals/", json={
        "patient_id": p_id,
        "reason": "Referral 1",
        "facility_name": "Clinic 1"
    }).json()
    r2 = client.post("/api/v1/referrals/", json={
        "patient_id": p_id,
        "reason": "Referral 2",
        "facility_name": "Clinic 2"
    }).json()
    r3 = client.post("/api/v1/referrals/", json={
        "patient_id": p_id,
        "reason": "Referral 3",
        "facility_name": "Clinic 3"
    }).json()

    s1 = int(r1["referral_id"].split("-")[-1])
    s2 = int(r2["referral_id"].split("-")[-1])
    s3 = int(r3["referral_id"].split("-")[-1])
    assert s2 == s1 + 1
    assert s3 == s2 + 1

    # Database uniqueness enforcement
    test_engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool
    )
    Base.metadata.create_all(bind=test_engine)
    TestingSession = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)
    session = TestingSession()

    try:
        from app.models.patient import Patient
        p_db = Patient(
            patient_id="PAT-2026-TEST",
            name="DB Patient",
            age=25
        )
        session.add(p_db)
        session.commit()

        dup1 = Referral(
            referral_id="REF-2026-SAME",
            patient_id="PAT-2026-TEST",
            reason="Reason 1",
            facility_name="Facility 1"
        )
        dup2 = Referral(
            referral_id="REF-2026-SAME",
            patient_id="PAT-2026-TEST",
            reason="Reason 2",
            facility_name="Facility 2"
        )
        session.add(dup1)
        session.commit()

        session.add(dup2)
        with pytest.raises(IntegrityError):
            session.commit()
    finally:
        session.close()
        Base.metadata.drop_all(bind=test_engine)
