"""
Service layer for Visit Management: ID generation, report ingestion, and history retrieval.
"""

from datetime import date
from typing import Optional, List
from sqlalchemy.orm import Session

from app.models.visit import Visit
from app.models.patient import Patient
from app.schemas.visit import VisitCreate, VisitUpdate


def generate_unique_visit_id(db: Session, target_year: Optional[int] = None) -> str:
    """
    Generates a unique human-readable visit ID in the format VIS-YYYY-XXXX (e.g. VIS-2026-0001).
    Guarantees uniqueness by checking existing database records.
    """
    if target_year is None:
        target_year = date.today().year

    prefix = f"VIS-{target_year}-"

    highest_visit = (
        db.query(Visit.visit_id)
        .filter(Visit.visit_id.like(f"{prefix}%"))
        .order_by(Visit.id.desc())
        .first()
    )

    next_seq = 1
    if highest_visit:
        last_id = highest_visit[0]
        try:
            suffix = last_id.split("-")[-1]
            next_seq = int(suffix) + 1
        except (ValueError, IndexError):
            next_seq = 1

    candidate_id = f"{prefix}{next_seq:04d}"

    # Collision guard
    while db.query(Visit).filter(Visit.visit_id == candidate_id).first() is not None:
        next_seq += 1
        candidate_id = f"{prefix}{next_seq:04d}"

    return candidate_id


def create_visit(db: Session, visit_in: VisitCreate) -> Optional[Visit]:
    """
    Ingests and stores a structured medical report for an existing patient.
    Does NOT overwrite any registered patient details.
    Returns None if patient does not exist.
    """
    patient = db.query(Patient).filter(Patient.patient_id == visit_in.patient_id).first()
    if not patient:
        return None

    visit_id = generate_unique_visit_id(db)
    report_dict = visit_in.report.model_dump()

    new_visit = Visit(
        visit_id=visit_id,
        patient_id=visit_in.patient_id,
        visit_date=visit_in.visit_date,
        report=report_dict
    )

    db.add(new_visit)
    db.commit()
    db.refresh(new_visit)
    return new_visit


def get_visits_by_patient_id(db: Session, patient_id: str) -> List[Visit]:
    """
    Retrieves all visits for a given patient, ordered newest first (by visit_date desc, id desc).
    """
    return (
        db.query(Visit)
        .filter(Visit.patient_id == patient_id)
        .order_by(Visit.visit_date.desc(), Visit.id.desc())
        .all()
    )


def get_visit_by_id(db: Session, visit_id: str) -> Optional[Visit]:
    """
    Retrieves a single visit by its unique visit ID (e.g. VIS-2026-0001).
    """
    return db.query(Visit).filter(Visit.visit_id == visit_id).first()


def update_visit_report(
    db: Session,
    visit: Visit,
    visit_update: VisitUpdate
) -> Visit:
    """
    Persist an updated structured medical report (including voice corrections,
    audit trail, and confirmation status) onto an existing visit record.
    Does NOT overwrite registered patient profile details.
    """
    visit.report = visit_update.report.model_dump()
    if visit_update.visit_date is not None:
        visit.visit_date = visit_update.visit_date

    db.commit()
    db.refresh(visit)
    return visit
