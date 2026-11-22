"""
Service layer for Care Promise Tracker: task creation, status updates, pending and overdue retrieval.
"""

from datetime import date, datetime, timezone
from typing import Optional, List, Tuple
from sqlalchemy.orm import Session

from app.models.care_promise import CarePromise, PromiseStatus
from app.models.patient import Patient
from app.models.visit import Visit
from app.schemas.care_promise import CarePromiseCreate, CarePromiseUpdate


def utc_now():
    """Return current UTC timestamp without timezone offset for clean SQLite storage."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


def generate_unique_promise_id(db: Session, target_year: Optional[int] = None) -> str:
    """
    Generates a unique human-readable care promise ID in the format CP-YYYY-XXXX (e.g. CP-2026-0001).
    Guarantees uniqueness by checking existing database records.
    """
    if target_year is None:
        target_year = date.today().year

    prefix = f"CP-{target_year}-"

    highest_promise = (
        db.query(CarePromise.promise_id)
        .filter(CarePromise.promise_id.like(f"{prefix}%"))
        .order_by(CarePromise.id.desc())
        .first()
    )

    next_seq = 1
    if highest_promise:
        last_id = highest_promise[0]
        try:
            suffix = last_id.split("-")[-1]
            next_seq = int(suffix) + 1
        except (ValueError, IndexError):
            next_seq = 1

    candidate_id = f"{prefix}{next_seq:04d}"

    while db.query(CarePromise).filter(CarePromise.promise_id == candidate_id).first() is not None:
        next_seq += 1
        candidate_id = f"{prefix}{next_seq:04d}"

    return candidate_id


def create_care_promise(
    db: Session,
    promise_in: CarePromiseCreate
) -> Tuple[Optional[CarePromise], Optional[str]]:
    """
    Creates a new care promise linked to a patient and optional visit.
    Validates:
      - Patient must exist (returns None, "PATIENT_NOT_FOUND" if not).
      - If visit_id supplied, visit must exist (returns None, "VISIT_NOT_FOUND" if not).
      - If visit_id supplied, visit.patient_id must match promise_in.patient_id
        (returns None, "VISIT_PATIENT_MISMATCH" if mismatch).
    Returns (created_promise, None) on success.
    """
    patient = db.query(Patient).filter(Patient.patient_id == promise_in.patient_id).first()
    if not patient:
        return None, "PATIENT_NOT_FOUND"

    if promise_in.visit_id:
        visit = db.query(Visit).filter(Visit.visit_id == promise_in.visit_id).first()
        if not visit:
            return None, "VISIT_NOT_FOUND"
        if visit.patient_id != promise_in.patient_id:
            return None, "VISIT_PATIENT_MISMATCH"

    promise_id = generate_unique_promise_id(db)

    new_promise = CarePromise(
        promise_id=promise_id,
        patient_id=promise_in.patient_id,
        visit_id=promise_in.visit_id,
        description=promise_in.description,
        due_date=promise_in.due_date,
        status=PromiseStatus.PENDING.value,
        completed_at=None
    )

    db.add(new_promise)
    db.commit()
    db.refresh(new_promise)
    return new_promise, None


def get_care_promise_by_id(db: Session, promise_id: str) -> Optional[CarePromise]:
    """Retrieves a single care promise by its unique promise ID (e.g. CP-2026-0001)."""
    return db.query(CarePromise).filter(CarePromise.promise_id == promise_id).first()


def get_care_promises(
    db: Session,
    patient_id: Optional[str] = None,
    status: Optional[str] = None,
    skip: int = 0,
    limit: int = 100
) -> Tuple[List[CarePromise], int]:
    """Retrieves a paginated list of care promises with optional patient and status filters."""
    query = db.query(CarePromise)

    if patient_id:
        query = query.filter(CarePromise.patient_id == patient_id)
    if status:
        query = query.filter(CarePromise.status == status)

    total = query.count()
    items = query.order_by(CarePromise.due_date.asc(), CarePromise.id.desc()).offset(skip).limit(limit).all()
    return items, total


def get_pending_care_promises(
    db: Session,
    patient_id: Optional[str] = None
) -> List[CarePromise]:
    """Retrieves all pending care promises, ordered soonest due date first."""
    query = db.query(CarePromise).filter(CarePromise.status == PromiseStatus.PENDING.value)
    if patient_id:
        query = query.filter(CarePromise.patient_id == patient_id)
    return query.order_by(CarePromise.due_date.asc(), CarePromise.id.desc()).all()


def get_overdue_care_promises(
    db: Session,
    patient_id: Optional[str] = None,
    as_of_date: Optional[date] = None
) -> List[CarePromise]:
    """
    Retrieves all overdue care promises (status == 'Pending' and due_date < as_of_date).
    Does NOT automatically complete or modify any task records.
    """
    ref_date = as_of_date or date.today()
    query = db.query(CarePromise).filter(
        CarePromise.status == PromiseStatus.PENDING.value,
        CarePromise.due_date < ref_date
    )
    if patient_id:
        query = query.filter(CarePromise.patient_id == patient_id)
    return query.order_by(CarePromise.due_date.asc(), CarePromise.id.desc()).all()


def update_care_promise(
    db: Session,
    promise: CarePromise,
    promise_in: CarePromiseUpdate
) -> CarePromise:
    """
    Updates description and/or due_date on a care promise.
    Never modifies status or completed_at. If already Completed, status and completed_at are preserved.
    """
    update_data = promise_in.model_dump(exclude_unset=True)

    for field, value in update_data.items():
        if field in ("description", "due_date"):
            setattr(promise, field, value)

    db.commit()
    db.refresh(promise)
    return promise


def complete_care_promise(
    db: Session,
    promise: CarePromise
) -> CarePromise:
    """
    Marks a care promise as Completed and records the completion timestamp.
    Calling completion on an already completed promise does not reset its original completed_at timestamp.
    """
    if promise.status != PromiseStatus.COMPLETED.value:
        promise.status = PromiseStatus.COMPLETED.value
        promise.completed_at = utc_now()
        db.commit()
        db.refresh(promise)
    return promise
