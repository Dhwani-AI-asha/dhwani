"""
FastAPI router for Referral Tracking APIs.
"""

from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.schemas.referral import (
    ReferralCreate,
    ReferralUpdate,
    ReferralResponse,
    ReferralListResponse,
    ReferralStatusEnum
)
from app.services.referral_service import (
    create_referral,
    get_referral_by_id,
    get_referrals,
    update_referral
)

router = APIRouter(prefix="/referrals", tags=["Referrals"])


@router.post(
    "/",
    response_model=ReferralResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Record a clinical referral",
    description="Records a clinical referral to a healthcare facility. Verifies patient exists (404), visit exists if supplied (404), and rejects mismatched patient/visit with 422."
)
def create_new_referral(
    referral_in: ReferralCreate,
    db: Session = Depends(get_db)
) -> ReferralResponse:
    """Create a new clinical referral."""
    referral, error = create_referral(db=db, referral_in=referral_in)

    if error == "PATIENT_NOT_FOUND":
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Patient with ID '{referral_in.patient_id}' not found."
        )
    if error == "VISIT_NOT_FOUND":
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Visit with ID '{referral_in.visit_id}' not found."
        )
    if error == "VISIT_PATIENT_MISMATCH":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Visit '{referral_in.visit_id}' does not belong to patient '{referral_in.patient_id}'."
        )

    return referral


@router.get(
    "/",
    response_model=ReferralListResponse,
    status_code=status.HTTP_200_OK,
    summary="List clinical referrals",
    description="Retrieves a paginated list of referrals with optional filters for patient_id and status."
)
def list_referrals(
    patient_id: Optional[str] = Query(None, description="Filter by patient ID"),
    referral_status: Optional[ReferralStatusEnum] = Query(None, alias="status", description="Filter by status ('Pending', 'Completed', 'Cancelled')"),
    skip: int = Query(0, ge=0, description="Pagination offset"),
    limit: int = Query(50, ge=1, le=100, description="Pagination limit"),
    db: Session = Depends(get_db)
) -> ReferralListResponse:
    """List referrals with optional filters."""
    status_str = referral_status.value if referral_status else None
    items, total = get_referrals(db=db, patient_id=patient_id, status=status_str, skip=skip, limit=limit)
    return ReferralListResponse(total=total, referrals=items)


@router.get(
    "/{referral_id}",
    response_model=ReferralResponse,
    status_code=status.HTTP_200_OK,
    summary="Get referral by ID",
    description="Retrieves a specific referral record by its unique referral ID (e.g. REF-2026-0001)."
)
def get_referral(
    referral_id: str,
    db: Session = Depends(get_db)
) -> ReferralResponse:
    """Retrieve referral by referral_id. Returns 404 if not found."""
    referral = get_referral_by_id(db=db, referral_id=referral_id)
    if not referral:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Referral with ID '{referral_id}' not found."
        )
    return referral


@router.patch(
    "/{referral_id}",
    response_model=ReferralResponse,
    status_code=status.HTTP_200_OK,
    summary="Update referral details or status",
    description="Updates referral fields. Cancelled referrals cannot be transitioned to Pending or Completed."
)
def update_referral_details(
    referral_id: str,
    referral_in: ReferralUpdate,
    db: Session = Depends(get_db)
) -> ReferralResponse:
    """Update referral details. Returns 404 if not found, 422 if transition is disallowed."""
    referral = get_referral_by_id(db=db, referral_id=referral_id)
    if not referral:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Referral with ID '{referral_id}' not found."
        )

    updated, error = update_referral(db=db, referral=referral, referral_in=referral_in)
    if error == "CANCELLED_TRANSITION_NOT_ALLOWED":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Cannot transition a Cancelled referral to Pending or Completed."
        )

    return updated
