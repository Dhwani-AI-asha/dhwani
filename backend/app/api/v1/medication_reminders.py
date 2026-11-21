"""
FastAPI router for Medication Reminder Records APIs.
Strictly record-keeping: copies authorized prescription details; never generates or recommends medications.
"""

from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.schemas.medication_reminder import (
    MedicationReminderCreate,
    MedicationReminderUpdate,
    MedicationReminderResponse,
    MedicationReminderListResponse,
    MedicationReminderStatusEnum
)
from app.services.medication_reminder_service import (
    create_medication_reminder,
    get_medication_reminder_by_id,
    get_medication_reminders,
    update_medication_reminder,
    deactivate_medication_reminder
)

router = APIRouter(prefix="/medication-reminders", tags=["Medication Reminders"])


@router.post(
    "/",
    response_model=MedicationReminderResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Record an authorized medication reminder",
    description=(
        "Records medication instructions copied faithfully from an authorized prescription. "
        "Verifies patient exists (404), visit exists if supplied (404), rejects visit mismatch (422), "
        "and validates date range (422). Never generates or alters prescriptions independently."
    )
)
def create_new_medication_reminder(
    reminder_in: MedicationReminderCreate,
    db: Session = Depends(get_db)
) -> MedicationReminderResponse:
    """Create a new medication reminder record from an authorized prescription."""
    reminder, error = create_medication_reminder(db=db, reminder_in=reminder_in)

    if error == "PATIENT_NOT_FOUND":
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Patient with ID '{reminder_in.patient_id}' not found."
        )
    if error == "VISIT_NOT_FOUND":
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Visit with ID '{reminder_in.visit_id}' not found."
        )
    if error == "VISIT_PATIENT_MISMATCH":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Visit '{reminder_in.visit_id}' does not belong to patient '{reminder_in.patient_id}'."
        )
    if error == "INVALID_DATE_RANGE":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="end_date cannot be earlier than start_date."
        )

    return reminder


@router.get(
    "/",
    response_model=MedicationReminderListResponse,
    status_code=status.HTTP_200_OK,
    summary="List medication reminders",
    description="Retrieves a paginated list of medication reminders with optional filters for patient_id and status ('Active' or 'Inactive')."
)
def list_medication_reminders(
    patient_id: Optional[str] = Query(None, description="Filter by patient ID"),
    reminder_status: Optional[MedicationReminderStatusEnum] = Query(None, alias="status", description="Filter by status ('Active' or 'Inactive')"),
    skip: int = Query(0, ge=0, description="Pagination offset"),
    limit: int = Query(50, ge=1, le=100, description="Pagination limit"),
    db: Session = Depends(get_db)
) -> MedicationReminderListResponse:
    """List medication reminders with optional filters."""
    status_str = reminder_status.value if reminder_status else None
    items, total = get_medication_reminders(db=db, patient_id=patient_id, status=status_str, skip=skip, limit=limit)
    return MedicationReminderListResponse(total=total, reminders=items)


@router.get(
    "/{reminder_id}",
    response_model=MedicationReminderResponse,
    status_code=status.HTTP_200_OK,
    summary="Get medication reminder by ID",
    description="Retrieves a specific medication reminder by its unique public ID (e.g. MED-2026-0001)."
)
def get_medication_reminder(
    reminder_id: str,
    db: Session = Depends(get_db)
) -> MedicationReminderResponse:
    """Retrieve medication reminder by reminder_id. Returns 404 if not found."""
    reminder = get_medication_reminder_by_id(db=db, reminder_id=reminder_id)
    if not reminder:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Medication reminder with ID '{reminder_id}' not found."
        )
    return reminder


@router.patch(
    "/{reminder_id}",
    response_model=MedicationReminderResponse,
    status_code=status.HTTP_200_OK,
    summary="Update medication reminder details",
    description="Updates reminder fields. Preserves Inactive status if editing other details without explicit status change."
)
def update_medication_reminder_details(
    reminder_id: str,
    reminder_in: MedicationReminderUpdate,
    db: Session = Depends(get_db)
) -> MedicationReminderResponse:
    """Update medication reminder details. Returns 404 if not found, 422 if invalid date range."""
    reminder = get_medication_reminder_by_id(db=db, reminder_id=reminder_id)
    if not reminder:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Medication reminder with ID '{reminder_id}' not found."
        )

    updated, error = update_medication_reminder(db=db, reminder=reminder, reminder_in=reminder_in)
    if error == "INVALID_DATE_RANGE":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="end_date cannot be earlier than start_date."
        )

    return updated


@router.patch(
    "/{reminder_id}/deactivate",
    response_model=MedicationReminderResponse,
    status_code=status.HTTP_200_OK,
    summary="Deactivate medication reminder",
    description="Explicitly marks an active medication reminder as Inactive."
)
def deactivate_reminder_endpoint(
    reminder_id: str,
    db: Session = Depends(get_db)
) -> MedicationReminderResponse:
    """Deactivate medication reminder. Returns 404 if not found."""
    reminder = get_medication_reminder_by_id(db=db, reminder_id=reminder_id)
    if not reminder:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Medication reminder with ID '{reminder_id}' not found."
        )

    return deactivate_medication_reminder(db=db, reminder=reminder)
