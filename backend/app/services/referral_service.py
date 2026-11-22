"""
Service layer for Referral Tracking: creation, retrieval, filtering, and updates.
"""

from datetime import date
from typing import Optional, List, Tuple
from sqlalchemy.orm import Session

from app.models.referral import Referral, ReferralStatus
from app.models.patient import Patient
from app.models.visit import Visit
from app.schemas.referral import ReferralCreate, ReferralUpdate


def generate_unique_referral_id(db: Session, target_year: Optional[int] = None) -> str:
    """
    Generates a unique human-readable referral ID in the format REF-YYYY-XXXX (e.g. REF-2026-0001).
    Guarantees uniqueness by checking existing database records.
    """
    if target_year is None:
        target_year = date.today().year

    prefix = f"REF-{target_year}-"

    highest_referral = (
        db.query(Referral.referral_id)
        .filter(Referral.referral_id.like(f"{prefix}%"))
        .order_by(Referral.id.desc())
        .first()
    )

    next_seq = 1
    if highest_referral:
        last_id = highest_referral[0]
        try:
            suffix = last_id.split("-")[-1]
            next_seq = int(suffix) + 1
        except (ValueError, IndexError):
            next_seq = 1

    candidate_id = f"{prefix}{next_seq:04d}"

    while db.query(Referral).filter(Referral.referral_id == candidate_id).first() is not None:
        next_seq += 1
        candidate_id = f"{prefix}{next_seq:04d}"

    return candidate_id


def create_referral(
    db: Session,
    referral_in: ReferralCreate
) -> Tuple[Optional[Referral], Optional[str]]:
    """
    Creates a new clinical referral linked to a patient and optional visit.
    Validates:
      - Patient must exist (returns None, "PATIENT_NOT_FOUND" if not).
      - If visit_id supplied, visit must exist (returns None, "VISIT_NOT_FOUND" if not).
      - If visit_id supplied, visit.patient_id must match referral_in.patient_id
        (returns None, "VISIT_PATIENT_MISMATCH" if mismatch).
    Returns (created_referral, None) on success.
    """
    patient = db.query(Patient).filter(Patient.patient_id == referral_in.patient_id).first()
    if not patient:
        return None, "PATIENT_NOT_FOUND"

    if referral_in.visit_id:
        visit = db.query(Visit).filter(Visit.visit_id == referral_in.visit_id).first()
        if not visit:
            return None, "VISIT_NOT_FOUND"
        if visit.patient_id != referral_in.patient_id:
            return None, "VISIT_PATIENT_MISMATCH"

    referral_id = generate_unique_referral_id(db)
    ref_date = referral_in.referral_date or date.today()
    status_val = referral_in.status.value if referral_in.status else ReferralStatus.PENDING.value

    new_referral = Referral(
        referral_id=referral_id,
        patient_id=referral_in.patient_id,
        visit_id=referral_in.visit_id,
        reason=referral_in.reason,
        facility_name=referral_in.facility_name,
        referred_by=referral_in.referred_by,
        referral_date=ref_date,
        status=status_val,
        notes=referral_in.notes
    )

    db.add(new_referral)
    db.commit()
    db.refresh(new_referral)
    return new_referral, None


def get_referral_by_id(db: Session, referral_id: str) -> Optional[Referral]:
    """Retrieves a single referral by its unique public ID (e.g. REF-2026-0001)."""
    return db.query(Referral).filter(Referral.referral_id == referral_id).first()


def get_referrals(
    db: Session,
    patient_id: Optional[str] = None,
    status: Optional[str] = None,
    skip: int = 0,
    limit: int = 100
) -> Tuple[List[Referral], int]:
    """Retrieves a paginated list of referrals with optional patient and status filters."""
    query = db.query(Referral)

    if patient_id:
        query = query.filter(Referral.patient_id == patient_id)
    if status:
        query = query.filter(Referral.status == status)

    total = query.count()
    items = query.order_by(Referral.referral_date.desc(), Referral.id.desc()).offset(skip).limit(limit).all()
    return items, total


def update_referral(
    db: Session,
    referral: Referral,
    referral_in: ReferralUpdate
) -> Tuple[Optional[Referral], Optional[str]]:
    """
    Updates referral fields.
    Rules:
      - Pending -> Completed is allowed.
      - Pending -> Cancelled is allowed.
      - Cancelled -> Pending is rejected with error 'CANCELLED_TRANSITION_NOT_ALLOWED'.
      - Cancelled -> Completed is rejected with error 'CANCELLED_TRANSITION_NOT_ALLOWED'.
      - Updating notes or other details on a Cancelled referral preserves its Cancelled status.
      - No referral is automatically completed or cancelled.
    Returns (updated_referral, None) on success or (None, error_code).
    """
    update_data = referral_in.model_dump(exclude_unset=True)

    was_cancelled = referral.status == ReferralStatus.CANCELLED.value

    # Reject transition from Cancelled to Pending or Completed
    if was_cancelled and "status" in update_data:
        target_status = update_data["status"]
        target_status_val = target_status.value if hasattr(target_status, "value") else str(target_status)
        if target_status_val in (ReferralStatus.PENDING.value, ReferralStatus.COMPLETED.value):
            return None, "CANCELLED_TRANSITION_NOT_ALLOWED"

    for field, value in update_data.items():
        if field == "status":
            status_val = value.value if hasattr(value, "value") else str(value)
            referral.status = status_val
        elif field in ("reason", "facility_name", "referral_date", "referred_by", "notes"):
            setattr(referral, field, value)

    # Ensure cancelled referrals are not silently reactivated by unrelated field updates
    if was_cancelled and "status" not in update_data:
        referral.status = ReferralStatus.CANCELLED.value

    db.commit()
    db.refresh(referral)
    return referral, None


def get_patient_referrals(
    db: Session,
    patient_id: str
) -> List[Referral]:
    """Retrieves all referrals recorded for a patient, ordered newest first."""
    return (
        db.query(Referral)
        .filter(Referral.patient_id == patient_id)
        .order_by(Referral.referral_date.desc(), Referral.id.desc())
        .all()
    )
