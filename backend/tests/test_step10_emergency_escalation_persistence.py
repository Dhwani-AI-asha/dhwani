"""
Backend persistence tests for Emergency Danger-Sign Voice Confirmation audit records.

Verifies Requirement 10 using FastAPI API handlers + isolated in-memory SQLite DB:
- Persists detected_sign, confirmation_transcript, response, timestamp, and escalation_status
  inside Visits (POST /api/v1/visits/ and PATCH /api/v1/visits/{visit_id}).
- Survives session reloads cleanly for both worker YES consent and NO refusal,
  while keeping original_transcript and symptoms free of confirmation words.
"""

from datetime import date
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.api.v1.visits import get_visit, ingest_visit_report, patch_visit
from app.database import Base
from app.schemas.visit import StructuredReport, VisitCreate, VisitUpdate
from app.services.seed_service import seed_synthetic_beneficiaries


@pytest.fixture
def db_session_factory():
    """Provides a sessionmaker backed by an isolated in-memory SQLite DB."""
    test_engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)
    Base.metadata.create_all(bind=test_engine)
    try:
        yield TestingSessionLocal
    finally:
        Base.metadata.drop_all(bind=test_engine)


def test_persist_emergency_escalation_yes_and_no_across_reloads(db_session_factory):
    """Persist detected sign, confirmation transcript, response, timestamp & escalation status."""
    db1 = db_session_factory()
    try:
        seed_synthetic_beneficiaries(db1)
        created = ingest_visit_report(
            visit_in=VisitCreate(
                patient_id="PAT-2026-0002",
                visit_date=date(2026, 11, 22),
                report=StructuredReport(
                    patient_name="Pooja Devi",
                    symptoms=[{"name": "vaginal bleeding"}],
                    danger_signs=[{"sign": "Heavy bleeding", "evidence": "bahut zyada khoon beh raha hai", "is_present": True}],
                    professional_review_required=True,
                    summary="Patient reported heavy bleeding.",
                    original_transcript="Didi delivery ke baad se bahut zyada khoon beh raha hai.",
                    emergency_escalations=[
                        {
                            "id": "emg-1",
                            "alert_id": "DS-BLEEDING",
                            "rule_code": "ANC-APH-01",
                            "detected_sign": "Heavy / Vaginal Bleeding",
                            "evidence": "bahut zyada khoon beh raha hai",
                            "detected_at": "2026-11-22T03:45:00Z",
                            "confirmation_transcript": "haan bulao",
                            "response": "yes",
                            "responded_at": "2026-11-22T03:45:07Z",
                            "timestamp": "2026-11-22T03:45:07Z",
                            "escalation_status": "confirmed",
                            "attempts": 1,
                        }
                    ],
                ),
            ),
            db=db1,
        )
        visit_id = created.visit_id
    finally:
        db1.close()

    # Second DB session simulates appending a second declined escalation or reopening after reload
    db2 = db_session_factory()
    try:
        reloaded = get_visit(visit_id=visit_id, db=db2)
        esc_list = reloaded.report["emergency_escalations"]
        assert len(esc_list) == 1
        assert esc_list[0]["detected_sign"] == "Heavy / Vaginal Bleeding"
        assert esc_list[0]["confirmation_transcript"] == "haan bulao"
        assert esc_list[0]["response"] == "yes"
        assert esc_list[0]["timestamp"] == "2026-11-22T03:45:07Z"
        assert esc_list[0]["escalation_status"] == "confirmed"
        assert "haan bulao" not in reloaded.report["original_transcript"]
        assert len(reloaded.report["symptoms"]) == 1

        # Update with a second distinct danger sign declined by worker ("Nahi, mat bulao")
        patch_visit(
            visit_id=visit_id,
            visit_update=VisitUpdate(
                report=StructuredReport(
                    patient_name="Pooja Devi",
                    symptoms=[{"name": "vaginal bleeding"}],
                    original_transcript=reloaded.report["original_transcript"],
                    emergency_escalations=esc_list
                    + [
                        {
                            "id": "emg-2",
                            "alert_id": "DS-PREECLAMPSIA",
                            "rule_code": "ANC-PIH-04",
                            "detected_sign": "Severe Pre-Eclampsia Signs",
                            "evidence": "dhundhla dikh raha hai",
                            "detected_at": "2026-11-22T03:46:00Z",
                            "confirmation_transcript": "Nahi, mat bulao",
                            "response": "no",
                            "responded_at": "2026-11-22T03:46:08Z",
                            "timestamp": "2026-11-22T03:46:08Z",
                            "escalation_status": "declined",
                            "attempts": 1,
                        }
                    ],
                )
            ),
            db=db2,
        )
    finally:
        db2.close()

    # Third session verifies both YES consent & NO refusal persisted cleanly
    db3 = db_session_factory()
    try:
        final_visit = get_visit(visit_id=visit_id, db=db3)
        history = final_visit.report["emergency_escalations"]
        assert len(history) == 2
        assert history[0]["escalation_status"] == "confirmed"
        assert history[1]["escalation_status"] == "declined"
        assert history[1]["confirmation_transcript"] == "Nahi, mat bulao"
        assert history[1]["response"] == "no"
        assert "mat bulao" not in final_visit.report["original_transcript"]
    finally:
        db3.close()
