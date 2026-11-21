"""
Service layer for patient operations: ID generation, creation, retrieval, search, and update.
"""

from datetime import date
from typing import Optional, Tuple, List
from sqlalchemy.orm import Session
from sqlalchemy import or_

from app.models.patient import Patient
from app.schemas.patient import PatientCreate, PatientUpdate


def generate_unique_patient_id(db: Session, target_year: Optional[int] = None) -> str:
    """
    Generates a unique human-readable patient ID in the format PAT-YYYY-XXXX (e.g. PAT-2026-0001).
    Guarantees uniqueness by checking existing database records.
    """
    if target_year is None:
        target_year = date.today().year

    prefix = f"PAT-{target_year}-"

    # Query existing patient IDs with this year's prefix
    highest_patient = (
        db.query(Patient.patient_id)
        .filter(Patient.patient_id.like(f"{prefix}%"))
        .order_by(Patient.id.desc())
        .first()
    )

    next_seq = 1
    if highest_patient:
        last_id = highest_patient[0]
        try:
            suffix = last_id.split("-")[-1]
            next_seq = int(suffix) + 1
        except (ValueError, IndexError):
            next_seq = 1

    candidate_id = f"{prefix}{next_seq:04d}"

    # Collision guard
    while db.query(Patient).filter(Patient.patient_id == candidate_id).first() is not None:
        next_seq += 1
        candidate_id = f"{prefix}{next_seq:04d}"

    return candidate_id


def create_patient(db: Session, patient_in: PatientCreate) -> Patient:
    """
    Registers a new patient with an automatically generated unique patient ID.
    """
    patient_id = generate_unique_patient_id(db)
    registration_date = patient_in.registration_date or date.today()

    new_patient = Patient(
        patient_id=patient_id,
        name=patient_in.name,
        age=patient_in.age,
        gender=patient_in.gender,
        contact_number=patient_in.contact_number,
        address=patient_in.address,
        registration_date=registration_date
    )

    db.add(new_patient)
    db.commit()
    db.refresh(new_patient)
    return new_patient


def get_patient_by_id(db: Session, patient_id: str) -> Optional[Patient]:
    """
    Retrieves a single patient by their unique patient ID (e.g. PAT-2026-0001).
    """
    return db.query(Patient).filter(Patient.patient_id == patient_id).first()


def get_patients(
    db: Session,
    search: Optional[str] = None,
    skip: int = 0,
    limit: int = 100
) -> Tuple[List[Patient], int]:
    """
    Retrieves a paginated list of patients with optional search by name or contact number.
    Returns (patients, total_count).
    """
    query = db.query(Patient)

    if search:
        search_term = f"%{search.strip()}%"
        query = query.filter(
            or_(
                Patient.name.ilike(search_term),
                Patient.contact_number.ilike(search_term)
            )
        )

    total = query.count()
    patients = query.order_by(Patient.id.desc()).offset(skip).limit(limit).all()
    return patients, total


def update_patient(
    db: Session,
    patient: Patient,
    patient_in: PatientUpdate
) -> Patient:
    """
    Updates an existing patient's details from validated update schema.
    """
    update_data = patient_in.model_dump(exclude_unset=True)

    for field, value in update_data.items():
        setattr(patient, field, value)

    db.commit()
    db.refresh(patient)
    return patient
def delete_patient(db: Session, patient: Patient) -> None:
    """
    Deletes a patient and their dependent records.
    Database foreign-key cascade rules handle related records.
    """
    db.delete(patient)
    db.commit()
