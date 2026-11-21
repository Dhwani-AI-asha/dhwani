"""
Service layer for Medication Reminder Records: creation, retrieval, filtering, updates, and deactivation.
Strictly record-keeping: never prescribes, alters dosages, or infers clinical information.
"""

from datetime import date
from typing import Optional, List, Tuple
from sqlalchemy.orm import Session

from app.models.medication_reminder import MedicationReminder, MedicationReminderStatus
from app.models.patient import Patient
from app.models.visit import Visit
from app.schemas.medication_reminder import MedicationReminderCreate, MedicationReminderUpdate


def generate_unique_reminder_id(db: Session, target_year: Optional[int] = None) -> str:
    """
    Generates a unique human-readable medication reminder ID in the format MED-YYYY-XXXX (e.g. MED-2026-0001).
    Guarantees uniqueness by checking existing database records.
    """
    if target_year is None:
        target_year = date.today().year

    prefix = f"MED-{target_year}-"

    highest_reminder = (
        db.query(MedicationReminder.reminder_id)
        .filter(MedicationReminder.reminder_id.like(f"{prefix}%"))
        .order_by(MedicationReminder.id.desc())
        .first()
    )

    next_seq = 1
    if highest_reminder:
        last_id = highest_reminder[0]
        try:
            suffix = last_id.split("-")[-1]
            next_seq = int(suffix) + 1
        except (ValueError, IndexError):
            next_seq = 1

    candidate_id = f"{prefix}{next_seq:04d}"

    while db.query(MedicationReminder).filter(MedicationReminder.reminder_id == candidate_id).first() is not None:
        next_seq += 1
        candidate_id = f"{prefix}{next_seq:04d}"

    return candidate_id


def create_medication_reminder(
    db: Session,
    reminder_in: MedicationReminderCreate
) -> Tuple[Optional[MedicationReminder], Optional[str]]:
    """
    Creates a new medication reminder record linked to an existing patient and optional visit.
    Strictly copies prescription instructions; never infers or creates treatments.
    Validates:
      - Patient must exist (returns None, "PATIENT_NOT_FOUND" if not).
      - If visit_id supplied, visit must exist (returns None, "VISIT_NOT_FOUND" if not).
      - If visit_id supplied, visit.patient_id must match reminder_in.patient_id
        (returns None, "VISIT_PATIENT_MISMATCH" if mismatch).
      - end_date cannot be earlier than start_date (returns None, "INVALID_DATE_RANGE" if invalid).
    Returns (created_reminder, None) on success.
    """
    patient = db.query(Patient).filter(Patient.patient_id == reminder_in.patient_id).first()
    if not patient:
        return None, "PATIENT_NOT_FOUND"

    if reminder_in.visit_id:
        visit = db.query(Visit).filter(Visit.visit_id == reminder_in.visit_id).first()
        if not visit:
            return None, "VISIT_NOT_FOUND"
        if visit.patient_id != reminder_in.patient_id:
            return None, "VISIT_PATIENT_MISMATCH"

    if reminder_in.start_date and reminder_in.end_date and reminder_in.end_date < reminder_in.start_date:
        return None, "INVALID_DATE_RANGE"

    reminder_id = generate_unique_reminder_id(db)
    status_val = reminder_in.status.value if reminder_in.status else MedicationReminderStatus.ACTIVE.value

    new_reminder = MedicationReminder(
        reminder_id=reminder_id,
        patient_id=reminder_in.patient_id,
        visit_id=reminder_in.visit_id,
        medication_name=reminder_in.medication_name,
        dosage_instructions=reminder_in.dosage_instructions,
        frequency=reminder_in.frequency,
        start_date=reminder_in.start_date,
        end_date=reminder_in.end_date,
        prescribed_by=reminder_in.prescribed_by,
        prescription_reference=reminder_in.prescription_reference,
        status=status_val,
        notes=reminder_in.notes
    )

    db.add(new_reminder)
    db.commit()
    db.refresh(new_reminder)
    return new_reminder, None


def get_medication_reminder_by_id(db: Session, reminder_id: str) -> Optional[MedicationReminder]:
    """Retrieves a single medication reminder by its unique public ID (e.g. MED-2026-0001)."""
    return db.query(MedicationReminder).filter(MedicationReminder.reminder_id == reminder_id).first()


def get_medication_reminders(
    db: Session,
    patient_id: Optional[str] = None,
    status: Optional[str] = None,
    skip: int = 0,
    limit: int = 100
) -> Tuple[List[MedicationReminder], int]:
    """Retrieves a paginated list of medication reminders with optional patient and status filters."""
    query = db.query(MedicationReminder)

    if patient_id:
        query = query.filter(MedicationReminder.patient_id == patient_id)
    if status:
        query = query.filter(MedicationReminder.status == status)

    total = query.count()
    items = query.order_by(MedicationReminder.created_at.desc(), MedicationReminder.id.desc()).offset(skip).limit(limit).all()
    return items, total


def update_medication_reminder(
    db: Session,
    reminder: MedicationReminder,
    reminder_in: MedicationReminderUpdate
) -> Tuple[Optional[MedicationReminder], Optional[str]]:
    """
    Updates medication reminder details.
    Rules:
      - Validates effective date range: end_date cannot be earlier than start_date.
      - Editing an inactive reminder does not silently reactivate it.
      - Omitted fields remain unchanged.
    Returns (updated_reminder, None) on success or (None, error_code).
    """
    update_data = reminder_in.model_dump(exclude_unset=True)

    # Validate effective date range
    eff_start = update_data["start_date"] if "start_date" in update_data else reminder.start_date
    eff_end = update_data["end_date"] if "end_date" in update_data else reminder.end_date
    if eff_start is not None and eff_end is not None and eff_end < eff_start:
        return None, "INVALID_DATE_RANGE"

    was_inactive = reminder.status == MedicationReminderStatus.INACTIVE.value

    for field, value in update_data.items():
        if field == "status":
            status_val = value.value if hasattr(value, "value") else str(value)
            reminder.status = status_val
        elif field in (
            "medication_name",
            "dosage_instructions",
            "frequency",
            "start_date",
            "end_date",
            "prescribed_by",
            "prescription_reference",
            "notes"
        ):
            setattr(reminder, field, value)

    # Do not silently reactivate an inactive reminder when editing its other details
    if was_inactive and "status" not in update_data:
        reminder.status = MedicationReminderStatus.INACTIVE.value

    db.commit()
    db.refresh(reminder)
    return reminder, None


def deactivate_medication_reminder(
    db: Session,
    reminder: MedicationReminder
) -> MedicationReminder:
    """Explicitly deactivates a medication reminder."""
    reminder.status = MedicationReminderStatus.INACTIVE.value
    db.commit()
    db.refresh(reminder)
    return reminder


def get_patient_medication_reminders(
    db: Session,
    patient_id: str
) -> List[MedicationReminder]:
    """Retrieves all medication reminders recorded for a patient, ordered newest first."""
    return (
        db.query(MedicationReminder)
        .filter(MedicationReminder.patient_id == patient_id)
        .order_by(MedicationReminder.created_at.desc(), MedicationReminder.id.desc())
        .all()
    )
