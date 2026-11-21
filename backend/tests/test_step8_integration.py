"""
End-to-End Backend Integration Tests for Step 8 (Dhwani).
Validates multi-module clinical workflows simulating Member 2 (structured report ingestion)
and Member 4 (ASHA worker web/mobile UI interactions).
All tests run against an isolated in-memory SQLite database.
"""

import pytest
from datetime import date, timedelta
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.main import app
from app.models.patient import Patient
from app.models.visit import Visit
from app.models.care_promise import CarePromise
from app.models.referral import Referral
from app.models.medication_reminder import MedicationReminder


@pytest.fixture
def client():
    """Provides a TestClient with an isolated in-memory SQLite database for each integration test."""
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


# ============================================================================
# WORKFLOW 1: Patient Lifecycle (Register, Retrieve, Search, Update)
# ============================================================================

def test_workflow_patient_lifecycle(client):
    """
    Workflow 1: Complete patient registration, retrieval, search, and update journey.
    """
    # 1. Register a patient
    reg_res = client.post("/api/v1/patients/", json={
        "name": "Kamala Devi",
        "age": 34,
        "gender": "Female",
        "contact_number": "9811223344",
        "address": "Village Chandpur, Ward 2"
    })
    assert reg_res.status_code == 201
    patient = reg_res.json()
    p_id = patient["patient_id"]
    assert p_id.startswith("PAT-")
    assert patient["name"] == "Kamala Devi"
    assert patient["age"] == 34

    # 2. Retrieve patient by ID
    get_res = client.get(f"/api/v1/patients/{p_id}")
    assert get_res.status_code == 200
    assert get_res.json()["patient_id"] == p_id

    # 3. Search patient by name (case-insensitive)
    search_name = client.get("/api/v1/patients/?search=kamala")
    assert search_name.status_code == 200
    assert search_name.json()["total"] == 1
    assert search_name.json()["patients"][0]["patient_id"] == p_id

    # 4. Search patient by contact number
    search_phone = client.get("/api/v1/patients/?contact_number=9811223344")
    assert search_phone.status_code == 200
    assert search_phone.json()["total"] == 1
    assert search_phone.json()["patients"][0]["patient_id"] == p_id

    # 5. Partial update patient details (PATCH contact number and address)
    patch_res = client.patch(f"/api/v1/patients/{p_id}", json={
        "contact_number": "9988776655",
        "address": "Village Chandpur, Ward 5 (Relocated)"
    })
    assert patch_res.status_code == 200
    updated = patch_res.json()
    assert updated["contact_number"] == "9988776655"
    assert updated["address"] == "Village Chandpur, Ward 5 (Relocated)"
    assert updated["name"] == "Kamala Devi"  # Omitted fields remain intact
    assert updated["age"] == 34


# ============================================================================
# WORKFLOW 2: Member 2 Audio Report Ingestion & Longitudinal Visits
# ============================================================================

def test_workflow_member2_visit_ingestion_and_history(client):
    """
    Workflow 2: Simulating Member 2 (audio processing module) ingesting structured
    medical reports for a patient across multiple longitudinal visits.
    """
    # Register patient
    patient = client.post("/api/v1/patients/", json={
        "name": "Ramesh Kumar",
        "age": 52,
        "gender": "Male",
        "contact_number": "9123456780"
    }).json()
    p_id = patient["patient_id"]

    # Visit 1: Initial visit with symptoms, vital signs, danger signs, missing info
    visit1_payload = {
        "patient_id": p_id,
        "visit_date": "2026-11-01",
        "report": {
            "chief_complaint": "Persistent cough and mild chest tightness",
            "symptoms": [
                {"name": "Cough", "duration": "2 weeks", "severity": "Moderate"},
                {"name": "Chest tightness", "duration": "3 days", "severity": "Mild"}
            ],
            "vital_signs_mentioned": {"temperature": "98.6 F", "pulse": "78 bpm"},
            "danger_signs": ["Night sweats"],
            "professional_review_required": True,
            "missing_information": [
                {"field_name": "smoking_history", "prompt_question": "Do you smoke bidi or cigarettes?"}
            ]
        }
    }
    v1_res = client.post("/api/v1/visits/", json=visit1_payload)
    assert v1_res.status_code == 201
    v1_data = v1_res.json()
    assert v1_data["visit_id"].startswith("VIS-")
    assert v1_data["report"]["chief_complaint"] == "Persistent cough and mild chest tightness"

    # Visit 2: Follow-up visit 2 weeks later
    visit2_payload = {
        "patient_id": p_id,
        "visit_date": "2026-11-15",
        "report": {
            "chief_complaint": "Follow-up for cough, feeling much better",
            "symptoms": [
                {"name": "Cough", "duration": "Resolving", "severity": "Mild"}
            ],
            "vital_signs_mentioned": {"temperature": "98.4 F"},
            "danger_signs": [],
            "requires_professional_review": False
        }
    }
    v2_res = client.post("/api/v1/visits/", json=visit2_payload)
    assert v2_res.status_code == 201
    v2_data = v2_res.json()

    # Retrieve patient visit history: must be ordered newest first (Visit 2, then Visit 1)
    history_res = client.get(f"/api/v1/patients/{p_id}/visits")
    assert history_res.status_code == 200
    visits = history_res.json()
    assert len(visits) == 2
    assert visits[0]["visit_id"] == v2_data["visit_id"]
    assert visits[1]["visit_id"] == v1_data["visit_id"]

    # Ensure patient demographic information was never modified or overwritten by visit data
    pat_check = client.get(f"/api/v1/patients/{p_id}").json()
    assert pat_check["name"] == "Ramesh Kumar"
    assert pat_check["age"] == 52


# ============================================================================
# WORKFLOW 3: End-to-End ASHA Care Continuity & Next-Visit Summary Journey
# ============================================================================

def test_workflow_asha_care_continuity_and_summary_briefing(client):
    """
    Workflow 3: Full end-to-end integration simulating an ASHA worker:
    1. Registers a patient.
    2. Ingests a clinical visit with danger signs and review flags.
    3. Records Care Promises (commitments).
    4. Records an authorized medication reminder.
    5. Records a clinical referral to a secondary hospital.
    6. Generates a Next-Visit Summary briefing before the follow-up visit.
    7. Fulfills a care promise and referral, and verifies the briefing dynamically updates.
    """
    today = date.today()
    ref_overdue_date = today + timedelta(days=5)

    # 1. Register patient
    patient = client.post("/api/v1/patients/", json={
        "name": "Meera Bai",
        "age": 28,
        "gender": "Female",
        "contact_number": "9776655443",
        "address": "Kalyanpur Tola"
    }).json()
    p_id = patient["patient_id"]

    # 2. Record Visit 1
    v1 = client.post("/api/v1/visits/", json={
        "patient_id": p_id,
        "visit_date": str(today - timedelta(days=7)),
        "report": {
            "chief_complaint": "Severe fatigue, pallor, and breathlessness on exertion",
            "symptoms": [{"name": "Fatigue", "duration": "1 month", "severity": "Severe"}],
            "vital_signs_mentioned": {"hb_level": "7.2 g/dL"},
            "danger_signs": ["Severe Pallor", "Breathlessness"],
            "professional_review_required": True,
            "missing_information": [
                {"field_name": "iron_supplementation", "prompt_question": "Are you taking IFA tablets daily?"}
            ]
        }
    }).json()
    v1_id = v1["visit_id"]

    # 3. Create Care Promises:
    # Promise 1: Due in 2 days from today
    cp1 = client.post("/api/v1/care-promises/", json={
        "patient_id": p_id,
        "visit_id": v1_id,
        "description": "Deliver 30 iron folic acid (IFA) tablets and demonstrate daily intake",
        "due_date": str(today + timedelta(days=2))
    }).json()
    cp1_id = cp1["promise_id"]

    # Promise 2: Due in 14 days from today
    cp2 = client.post("/api/v1/care-promises/", json={
        "patient_id": p_id,
        "visit_id": v1_id,
        "description": "Accompany to PHC for hemoglobin re-check",
        "due_date": str(today + timedelta(days=14))
    }).json()

    # 4. Create an authorized Medication Reminder (from MO prescription)
    med = client.post("/api/v1/medication-reminders/", json={
        "patient_id": p_id,
        "visit_id": v1_id,
        "medication_name": "Iron and Folic Acid (IFA) Tablets",
        "dosage_instructions": "1 tablet daily after main meal with water",
        "frequency": "Once daily",
        "start_date": str(today - timedelta(days=7)),
        "end_date": str(today + timedelta(days=90)),
        "prescribed_by": "Dr. Ananya Ray (Medical Officer, Kalyanpur PHC)",
        "prescription_reference": "KPHC-ANC-2026-049",
        "notes": "Do not take with tea or milk"
    }).json()
    assert med["status"] == "Active"

    # 5. Create a clinical referral
    ref = client.post("/api/v1/referrals/", json={
        "patient_id": p_id,
        "visit_id": v1_id,
        "reason": "Severe anemia (Hb 7.2) requiring blood test and specialist evaluation",
        "facility_name": "Sub-District Hospital Kalyanpur",
        "referred_by": "ASHA Shanti Devi",
        "notes": "Provided referral slip to patient's husband"
    }).json()
    ref_id = ref["referral_id"]
    assert ref["status"] == "Pending"

    # 6. Generate Next-Visit Summary as of today
    summary_res = client.get(f"/api/v1/patients/{p_id}/next-visit-summary")
    assert summary_res.status_code == 200
    summary = summary_res.json()

    # Validate briefing structure
    assert summary["patient"]["patient_id"] == p_id
    assert summary["patient"]["name"] == "Meera Bai"
    assert summary["latest_visit"]["visit_id"] == v1_id
    assert summary["latest_visit"]["chief_complaint"] == "Severe fatigue, pallor, and breathlessness on exertion"

    # Danger signs and review requirement preserved
    assert "Severe Pallor" in summary["attention_items"]["danger_signs"]
    assert summary["attention_items"]["professional_review_required"] is True
    assert len(summary["attention_items"]["missing_information"]) == 1

    # Care promises as of today: both are Pending, none are overdue yet
    assert len(summary["pending_promises"]) == 2
    assert len(summary["overdue_promises"]) == 0

    # 7. Advance time perspective to ref_overdue_date (+5 days)
    # Promise 1 was due on day +2, so on day +5 it is overdue!
    overdue_summary = client.get(
        f"/api/v1/patients/{p_id}/next-visit-summary?as_of_date={ref_overdue_date}"
    ).json()
    assert len(overdue_summary["overdue_promises"]) == 1
    assert overdue_summary["overdue_promises"][0]["promise_id"] == cp1_id

    # 8. Complete Promise 1 and complete Referral
    comp_promise = client.patch(f"/api/v1/care-promises/{cp1_id}/complete")
    assert comp_promise.status_code == 200
    assert comp_promise.json()["status"] == "Completed"

    comp_ref = client.patch(f"/api/v1/referrals/{ref_id}", json={
        "status": "Completed",
        "notes": "Patient attended SDH, received injectable iron therapy"
    })
    assert comp_ref.status_code == 200
    assert comp_ref.json()["status"] == "Completed"

    # 9. Verify updated Next-Visit Summary: Completed promise is excluded from both lists
    updated_summary = client.get(
        f"/api/v1/patients/{p_id}/next-visit-summary?as_of_date={ref_overdue_date}"
    ).json()
    assert len(updated_summary["overdue_promises"]) == 0
    assert len(updated_summary["pending_promises"]) == 1
    assert updated_summary["pending_promises"][0]["promise_id"] == cp2["promise_id"]


# ============================================================================
# WORKFLOW 4: Cross-Patient Isolation & Entity Boundary Enforcement
# ============================================================================

def test_workflow_cross_patient_isolation_and_mismatch_rejection(client):
    """
    Workflow 4: Ensures strict patient data isolation.
    Associating child entities (care promises, referrals, medication reminders)
    with a visit belonging to a different patient is strictly rejected with HTTP 422.
    """
    p1 = client.post("/api/v1/patients/", json={"name": "Patient One", "age": 25}).json()
    p2 = client.post("/api/v1/patients/", json={"name": "Patient Two", "age": 30}).json()

    # Visit belongs to Patient 1
    v1 = client.post("/api/v1/visits/", json={
        "patient_id": p1["patient_id"],
        "visit_date": "2026-11-20",
        "report": {"chief_complaint": "Fever"}
    }).json()
    v1_id = v1["visit_id"]

    # 1. Reject Care Promise for Patient 2 linked to Visit 1
    cp_res = client.post("/api/v1/care-promises/", json={
        "patient_id": p2["patient_id"],
        "visit_id": v1_id,
        "description": "Cross-patient task",
        "due_date": "2026-11-25"
    })
    assert cp_res.status_code == 422
    assert "does not belong" in cp_res.json()["detail"].lower()

    # 2. Reject Referral for Patient 2 linked to Visit 1
    ref_res = client.post("/api/v1/referrals/", json={
        "patient_id": p2["patient_id"],
        "visit_id": v1_id,
        "reason": "Cross-patient referral",
        "facility_name": "General Hospital"
    })
    assert ref_res.status_code == 422
    assert "does not belong" in ref_res.json()["detail"].lower()

    # 3. Reject Medication Reminder for Patient 2 linked to Visit 1
    med_res = client.post("/api/v1/medication-reminders/", json={
        "patient_id": p2["patient_id"],
        "visit_id": v1_id,
        "medication_name": "Paracetamol",
        "dosage_instructions": "1 tab",
        "prescribed_by": "Dr. A",
        "prescription_reference": "RX-01"
    })
    assert med_res.status_code == 422
    assert "does not belong" in med_res.json()["detail"].lower()

    # 4. Patient query isolation
    p1_promises = client.get(f"/api/v1/patients/{p1['patient_id']}/care-promises").json()
    p2_promises = client.get(f"/api/v1/patients/{p2['patient_id']}/care-promises").json()
    assert len(p1_promises) == 0
    assert len(p2_promises) == 0


# ============================================================================
# WORKFLOW 5: Deletion & Relational Cascade Workflows
# ============================================================================

def test_workflow_deletion_and_cascade_behavior():
    """
    Workflow 5: Verifies SQLite foreign-key enforcement and relationship cascades:
    - Deleting a Visit sets visit_id = NULL on linked care promises, referrals, and medication reminders.
    - Deleting a Patient cascades and removes all dependent records.
    """
    test_engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool
    )
    Base.metadata.create_all(bind=test_engine)
    TestingSession = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)
    session = TestingSession()

    try:
        # Create Patient
        p = Patient(patient_id="PAT-CASCADE-1", name="Cascade Test", age=40)
        session.add(p)
        session.commit()

        # Create Visit
        v = Visit(
            visit_id="VIS-CASCADE-1",
            patient_id="PAT-CASCADE-1",
            visit_date=date(2026, 11, 21),
            report={"chief_complaint": "Cascade check"}
        )
        session.add(v)
        session.commit()

        # Create linked records
        cp = CarePromise(
            promise_id="CP-CASCADE-1",
            patient_id="PAT-CASCADE-1",
            visit_id="VIS-CASCADE-1",
            description="Linked promise",
            due_date=date(2026, 11, 28)
        )
        ref = Referral(
            referral_id="REF-CASCADE-1",
            patient_id="PAT-CASCADE-1",
            visit_id="VIS-CASCADE-1",
            reason="Linked referral",
            facility_name="Civil Hospital"
        )
        med = MedicationReminder(
            reminder_id="MED-CASCADE-1",
            patient_id="PAT-CASCADE-1",
            visit_id="VIS-CASCADE-1",
            medication_name="Linked med",
            dosage_instructions="1 tab",
            prescribed_by="Dr. Cas",
            prescription_reference="RX-CAS"
        )
        session.add_all([cp, ref, med])
        session.commit()

        # 1. Delete the Visit -> visit_id should become NULL on all 3 records (ON DELETE SET NULL)
        session.delete(v)
        session.commit()

        session.refresh(cp)
        session.refresh(ref)
        session.refresh(med)
        assert cp.visit_id is None
        assert ref.visit_id is None
        assert med.visit_id is None

        # 2. Delete the Patient -> all linked records must be cascaded (ON DELETE CASCADE)
        session.delete(p)
        session.commit()

        assert session.query(CarePromise).filter(CarePromise.promise_id == "CP-CASCADE-1").first() is None
        assert session.query(Referral).filter(Referral.referral_id == "REF-CASCADE-1").first() is None
        assert session.query(MedicationReminder).filter(MedicationReminder.reminder_id == "MED-CASCADE-1").first() is None
    finally:
        session.close()
        Base.metadata.drop_all(bind=test_engine)


def test_patient_deletion_with_loaded_visits_cascades_successfully():
    """
    Regression test for Step 8 audit finding:
    Verifies that deleting a Patient with Visit records already loaded in the ORM session
    cascades and deletes associated Visits without throwing NOT NULL constraint failed on visits.patient_id,
    and leaves no orphan visit records.
    """
    test_engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool
    )
    Base.metadata.create_all(bind=test_engine)
    TestingSession = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)
    session = TestingSession()

    try:
        # 1. Create a patient
        patient = Patient(
            patient_id="PAT-CASCADE-LOADED",
            name="Sita Devi",
            age=29,
            gender="Female",
            contact_number="9876501234",
            address="Village Rampur"
        )
        session.add(patient)
        session.commit()

        # 2. Create one or more visits linked to that patient
        visit1 = Visit(
            visit_id="VIS-CASCADE-L1",
            patient_id="PAT-CASCADE-LOADED",
            visit_date=date(2026, 11, 1),
            report={"chief_complaint": "Headache and mild fever"}
        )
        visit2 = Visit(
            visit_id="VIS-CASCADE-L2",
            patient_id="PAT-CASCADE-LOADED",
            visit_date=date(2026, 11, 15),
            report={"chief_complaint": "Follow-up visit"}
        )
        session.add_all([visit1, visit2])
        session.commit()

        # 3. Ensure visits are loaded into the ORM session
        loaded_patient = session.query(Patient).filter(Patient.patient_id == "PAT-CASCADE-LOADED").first()
        assert loaded_patient is not None
        assert len(loaded_patient.visits) == 2
        assert {v.visit_id for v in loaded_patient.visits} == {"VIS-CASCADE-L1", "VIS-CASCADE-L2"}

        # 4. Delete the patient without manually deleting visits first
        session.delete(loaded_patient)
        session.commit()

        # 5. Verifies patient and visit records are deleted successfully
        assert session.query(Patient).filter(Patient.patient_id == "PAT-CASCADE-LOADED").first() is None
        assert session.query(Visit).filter(Visit.visit_id.in_(["VIS-CASCADE-L1", "VIS-CASCADE-L2"])).all() == []

        # 6. Verifies no integrity error or orphan records occur
        remaining_visits = session.query(Visit).all()
        assert len(remaining_visits) == 0
    finally:
        session.close()
        Base.metadata.drop_all(bind=test_engine)


# ============================================================================
# WORKFLOW 6: Health and Root Endpoints
# ============================================================================

def test_workflow_service_health_and_root(client):
    """
    Workflow 6: Tests application root and health endpoints.
    """
    root_res = client.get("/")
    assert root_res.status_code == 200
    assert root_res.json()["status"] == "ok"
    assert "Dhwani" in root_res.json()["service"]

    health_res = client.get("/health")
    assert health_res.status_code == 200
    assert health_res.json()["status"] == "healthy"
