"""
Tests for Part 2 (Patient Not Found / Canonical Beneficiary Mapping) &
Part 4F (Backend Persistence of Voice-Corrected Visit Reports across reloads).

Uses an isolated in-memory SQLite database (does not alter production db.sqlite3).
"""

import pytest
from datetime import date
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.models.patient import Patient
from app.schemas.visit import StructuredReport, VisitCreate, VisitUpdate
from app.services.patient_service import get_patient_by_id
from app.services.seed_service import SYNTHETIC_BENEFICIARIES, seed_synthetic_beneficiaries
from app.services.visit_service import create_visit, get_visit_by_id, update_visit_report
from app.services.next_visit_service import generate_next_visit_summary
from app.api.v1.visits import ingest_visit_report, get_visit, patch_visit
from fastapi import HTTPException


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


def test_seed_synthetic_beneficiaries_is_idempotent_and_preserves_existing(db_session_factory):
    """Part 6 Item 2: Synthetic beneficiaries map to stable PAT-2026-XXXX IDs without duplicates."""
    db = db_session_factory()
    try:
        # Pre-existing patient PAT-2026-0001 must remain untouched
        db.add(Patient(patient_id="PAT-2026-0001", name="Test Patient", age=28))
        db.commit()

        inserted_first = seed_synthetic_beneficiaries(db)
        assert inserted_first == len(SYNTHETIC_BENEFICIARIES)

        # Running a second time creates ZERO duplicates
        inserted_second = seed_synthetic_beneficiaries(db)
        assert inserted_second == 0

        all_patients = db.query(Patient).all()
        assert len(all_patients) == 1 + len(SYNTHETIC_BENEFICIARIES)

        pooja = get_patient_by_id(db, "PAT-2026-0002")
        assert pooja is not None
        assert pooja.name == "Pooja Devi"
        assert "#9842-8819" in (pooja.address or "")
    finally:
        db.close()


def test_visit_creation_for_existing_synthetic_beneficiary_succeeds(db_session_factory):
    """Part 6 Item 3: Report generation/saving for existing synthetic beneficiary (Pooja Devi)."""
    db = db_session_factory()
    try:
        seed_synthetic_beneficiaries(db)

        visit_in = VisitCreate(
            patient_id="PAT-2026-0002",
            visit_date=date(2026, 11, 22),
            report=StructuredReport(
                patient_name="Pooja Devi",
                patient_age="24 years",  # String format from ai_medical must validate cleanly
                patient_gender="Female",
                visit_type="ANC",
                next_visit_date="25 November",
                vital_signs_mentioned={"bp": "120/80", "weight": "55 kg"},
                danger_signs=[{"sign": "Headache", "evidence": "sar dard", "is_present": True}],
                professional_review_required=True,
                summary="Blood pressure: 120/80. Weight: 55 kg. Visit type: ANC.",
                confirmed=False,
            ),
        )
        created = ingest_visit_report(visit_in=visit_in, db=db)
        assert created.visit_id.startswith("VIS-")
        assert created.patient_id == "PAT-2026-0002"
        assert created.report["vital_signs_mentioned"]["bp"] == "120/80"

        # Next-visit briefing must also handle structured DangerSign dicts cleanly
        briefing = generate_next_visit_summary(db=db, patient_id="PAT-2026-0002")
        assert briefing is not None
        assert "Headache" in briefing.attention_items.danger_signs
    finally:
        db.close()


def test_genuinely_missing_beneficiary_returns_404_and_never_attaches_to_another(db_session_factory):
    """Part 6 Item 4: Missing patient IDs (including raw RCH ID '#9842-8819' or unknown PAT ID) return 404."""
    db = db_session_factory()
    try:
        seed_synthetic_beneficiaries(db)

        for missing_id in ("#9842-8819", "PAT-2026-9999"):
            visit_in = VisitCreate(
                patient_id=missing_id,
                visit_date=date(2026, 11, 22),
                report=StructuredReport(summary="Test visit for missing beneficiary"),
            )
            with pytest.raises(HTTPException) as exc_info:
                ingest_visit_report(visit_in=visit_in, db=db)
            assert exc_info.value.status_code == 404
            assert missing_id in exc_info.value.detail

        # Confirm Pooja Devi has zero visits erroneously attached
        pooja_briefing = generate_next_visit_summary(db=db, patient_id="PAT-2026-0002")
        assert pooja_briefing is not None
        assert pooja_briefing.latest_visit is None
    finally:
        db.close()


def test_voice_corrected_structured_values_persist_across_session_reload(db_session_factory):
    """Part 6 Item 12: Voice corrections + audit trail + confirmation persist in DB across reload/restart."""
    # Session 1: Create initial unconfirmed visit
    db1 = db_session_factory()
    try:
        seed_synthetic_beneficiaries(db1)
        created = ingest_visit_report(
            visit_in=VisitCreate(
                patient_id="PAT-2026-0002",
                visit_date=date(2026, 11, 22),
                report=StructuredReport(
                    patient_name="Pooja Devi",
                    visit_type="ANC",
                    next_visit_date="25 November",
                    vital_signs_mentioned={"bp": "120/80", "weight": "55 kg"},
                    summary="Blood pressure: 120/80. Weight: 55 kg.",
                    confirmed=False,
                    correction_history=[],
                ),
            ),
            db=db1,
        )
        visit_id = created.visit_id
    finally:
        db1.close()

    # Session 2: Apply voice corrections via PATCH /api/v1/visits/{visit_id}
    db2 = db_session_factory()
    try:
        updated = patch_visit(
            visit_id=visit_id,
            visit_update=VisitUpdate(
                report=StructuredReport(
                    patient_name="Pooja Devi",
                    visit_type="ANC",
                    next_visit_date="28 November",
                    vaccination_status="TT injection administered",
                    vital_signs_mentioned={"bp": "110/90", "weight": "58 kg"},
                    summary="Blood pressure: 110/90. Weight: 58 kg. Next visit: 28 November.",
                    confirmed=True,
                    confirmed_at="2026-11-22T03:00:00Z",
                    correction_history=[
                        {
                            "field": "blood_pressure",
                            "original_value": "120/80",
                            "corrected_value": "110/90",
                            "timestamp": "2026-11-22T02:59:00Z",
                            "source": "voice",
                        },
                        {
                            "field": "weight",
                            "original_value": "55 kg",
                            "corrected_value": "58 kg",
                            "timestamp": "2026-11-22T02:59:20Z",
                            "source": "voice",
                        },
                    ],
                )
            ),
            db=db2,
        )
        assert updated.report["vital_signs_mentioned"]["bp"] == "110/90"
        assert updated.report["confirmed"] is True
    finally:
        db2.close()

    # Session 3 (simulates page refresh / app restart): Re-read visit from SQLite
    db3 = db_session_factory()
    try:
        reloaded = get_visit(visit_id=visit_id, db=db3)
        assert reloaded.patient_id == "PAT-2026-0002"
        assert reloaded.report["vital_signs_mentioned"]["bp"] == "110/90"
        assert reloaded.report["vital_signs_mentioned"]["weight"] == "58 kg"
        assert reloaded.report["next_visit_date"] == "28 November"
        assert reloaded.report["vaccination_status"] == "TT injection administered"
        assert reloaded.report["confirmed"] is True
        assert len(reloaded.report["correction_history"]) == 2
        assert reloaded.report["correction_history"][0]["original_value"] == "120/80"
        assert reloaded.report["correction_history"][0]["corrected_value"] == "110/90"

        # Verify nonexistent visit patch returns 404
        with pytest.raises(HTTPException) as exc_404:
            patch_visit(
                visit_id="VIS-2026-9999",
                visit_update=VisitUpdate(report=StructuredReport(summary="Nope")),
                db=db3,
            )
        assert exc_404.value.status_code == 404
    finally:
        db3.close()
