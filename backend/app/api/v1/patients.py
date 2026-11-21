"""
FastAPI router for patient registration, search, retrieval, and updates.
"""

from datetime import date
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.schemas.patient import (
    PatientCreate,
    PatientUpdate,
    PatientResponse,
    PatientListResponse
)
from app.schemas.visit import VisitResponse
from app.schemas.care_promise import CarePromiseResponse
from app.schemas.next_visit import NextVisitSummaryResponse
from app.schemas.referral import ReferralResponse
from app.schemas.medication_reminder import MedicationReminderResponse
from app.services.patient_service import (
    create_patient,
    get_patient_by_id,
    get_patients,
    update_patient
)
from app.services.visit_service import get_visits_by_patient_id
from app.services.care_promise_service import get_care_promises
from app.services.next_visit_service import generate_next_visit_summary
from app.services.referral_service import get_patient_referrals
from app.services.medication_reminder_service import get_patient_medication_reminders

router = APIRouter(prefix="/patients", tags=["Patients"])


@router.post(
    "/",
    response_model=PatientResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Register a new patient",
    description="Registers a new patient, validates input, and auto-generates a unique patient ID (e.g. PAT-2026-0001)."
)
def register_patient(
    patient_in: PatientCreate,
    db: Session = Depends(get_db)
) -> PatientResponse:
    """Register a new patient with unique ID generation."""
    new_patient = create_patient(db=db, patient_in=patient_in)
    return new_patient


@router.get(
    "/",
    response_model=PatientListResponse,
    status_code=status.HTTP_200_OK,
    summary="List and search patients",
    description="Retrieves a list of patients with optional filtering by name or contact number."
)
def list_patients(
    search: Optional[str] = Query(None, description="Search keyword for patient name or contact number"),
    skip: int = Query(0, ge=0, description="Pagination offset"),
    limit: int = Query(50, ge=1, le=100, description="Pagination limit"),
    db: Session = Depends(get_db)
) -> PatientListResponse:
    """Retrieve patients with optional name or contact search."""
    patients, total = get_patients(db=db, search=search, skip=skip, limit=limit)
    return PatientListResponse(total=total, patients=patients)


@router.get(
    "/{patient_id}",
    response_model=PatientResponse,
    status_code=status.HTTP_200_OK,
    summary="Get patient by unique ID",
    description="Retrieves a patient's complete profile using their unique patient ID (e.g. PAT-2026-0001)."
)
def get_patient(
    patient_id: str,
    db: Session = Depends(get_db)
) -> PatientResponse:
    """Retrieve one patient by patient_id. Returns 404 if not found."""
    patient = get_patient_by_id(db=db, patient_id=patient_id)
    if not patient:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Patient with ID '{patient_id}' not found."
        )
    return patient


@router.patch(
    "/{patient_id}",
    response_model=PatientResponse,
    status_code=status.HTTP_200_OK,
    summary="Update patient information",
    description="Updates existing patient fields. Only fields provided in the request body are modified."
)
def update_patient_info(
    patient_id: str,
    patient_in: PatientUpdate,
    db: Session = Depends(get_db)
) -> PatientResponse:
    """Update patient details. Returns 404 if patient is not found."""
    patient = get_patient_by_id(db=db, patient_id=patient_id)
    if not patient:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Patient with ID '{patient_id}' not found."
        )

    updated = update_patient(db=db, patient=patient, patient_in=patient_in)
    return updated


@router.get(
    "/{patient_id}/visits",
    response_model=List[VisitResponse],
    status_code=status.HTTP_200_OK,
    summary="Get patient visit history",
    description="Retrieves all visits recorded for a patient, ordered by visit date newest first."
)
def get_patient_visits(
    patient_id: str,
    db: Session = Depends(get_db)
) -> List[VisitResponse]:
    """Retrieve visit history for a patient. Returns 404 if patient not found."""
    patient = get_patient_by_id(db=db, patient_id=patient_id)
    if not patient:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Patient with ID '{patient_id}' not found."
        )

    visits = get_visits_by_patient_id(db=db, patient_id=patient_id)
    return visits


@router.get(
    "/{patient_id}/care-promises",
    response_model=List[CarePromiseResponse],
    status_code=status.HTTP_200_OK,
    summary="Get patient care promises",
    description="Retrieves all care promises recorded for a patient, ordered by target due date."
)
def get_patient_care_promises(
    patient_id: str,
    promise_status: Optional[str] = Query(None, alias="status", description="Optional status filter ('Pending' or 'Completed')"),
    db: Session = Depends(get_db)
) -> List[CarePromiseResponse]:
    """Retrieve care promises for a patient. Returns 404 if patient not found."""
    patient = get_patient_by_id(db=db, patient_id=patient_id)
    if not patient:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Patient with ID '{patient_id}' not found."
        )

    promises, _ = get_care_promises(db=db, patient_id=patient_id, status=promise_status)
    return promises


@router.get(
    "/{patient_id}/next-visit-summary",
    response_model=NextVisitSummaryResponse,
    status_code=status.HTTP_200_OK,
    summary="Get next-visit briefing for ASHA worker",
    description="Assembles patient profile, latest visit, previous visits, attention items, and care promises into a factually grounded briefing."
)
def get_patient_next_visit_summary(
    patient_id: str,
    as_of_date: Optional[date] = Query(None, description="Reference date for overdue task calculation (defaults to today)"),
    db: Session = Depends(get_db)
) -> NextVisitSummaryResponse:
    """Retrieve fact-grounded next-visit briefing for a patient. Returns 404 if patient not found."""
    summary = generate_next_visit_summary(db=db, patient_id=patient_id, as_of_date=as_of_date)
    if not summary:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Patient with ID '{patient_id}' not found."
        )
    return summary


@router.get(
    "/{patient_id}/referrals",
    response_model=List[ReferralResponse],
    status_code=status.HTTP_200_OK,
    summary="Get patient referral history",
    description="Retrieves all clinical referrals recorded for a patient, ordered by referral date newest first."
)
def get_patient_referral_history(
    patient_id: str,
    db: Session = Depends(get_db)
) -> List[ReferralResponse]:
    """Retrieve referral history for a patient. Returns 404 if patient not found."""
    patient = get_patient_by_id(db=db, patient_id=patient_id)
    if not patient:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Patient with ID '{patient_id}' not found."
        )

    referrals = get_patient_referrals(db=db, patient_id=patient_id)
    return referrals


@router.get(
    "/{patient_id}/medication-reminders",
    response_model=List[MedicationReminderResponse],
    status_code=status.HTTP_200_OK,
    summary="Get patient medication reminders",
    description="Retrieves all authorized medication reminder records for a patient, ordered newest first."
)
def get_patient_medication_reminder_history(
    patient_id: str,
    db: Session = Depends(get_db)
) -> List[MedicationReminderResponse]:
    """Retrieve medication reminder history for a patient. Returns 404 if patient not found."""
    patient = get_patient_by_id(db=db, patient_id=patient_id)
    if not patient:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Patient with ID '{patient_id}' not found."
        )

    reminders = get_patient_medication_reminders(db=db, patient_id=patient_id)
    return reminders
