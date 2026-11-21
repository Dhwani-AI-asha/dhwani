"""
FastAPI router for Care Promise Tracker: task creation, retrieval, updates, and completion.
"""

from datetime import date
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.schemas.care_promise import (
    CarePromiseCreate,
    CarePromiseUpdate,
    CarePromiseResponse,
    CarePromiseListResponse
)
from app.services.care_promise_service import (
    create_care_promise,
    get_care_promise_by_id,
    get_care_promises,
    get_pending_care_promises,
    get_overdue_care_promises,
    update_care_promise,
    complete_care_promise
)

router = APIRouter(prefix="/care-promises", tags=["Care Promises"])


@router.post(
    "/",
    response_model=CarePromiseResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new care promise / follow-up task",
    description="Creates a commitment for a patient. Verifies patient exists (404), visit exists if supplied (404), and rejects mismatched patient/visit with 422."
)
def create_promise(
    promise_in: CarePromiseCreate,
    db: Session = Depends(get_db)
) -> CarePromiseResponse:
    """Create a new care promise."""
    promise, error = create_care_promise(db=db, promise_in=promise_in)

    if error == "PATIENT_NOT_FOUND":
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Patient with ID '{promise_in.patient_id}' not found."
        )
    if error == "VISIT_NOT_FOUND":
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Visit with ID '{promise_in.visit_id}' not found."
        )
    if error == "VISIT_PATIENT_MISMATCH":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Visit '{promise_in.visit_id}' does not belong to patient '{promise_in.patient_id}'."
        )

    return promise


@router.get(
    "/",
    response_model=CarePromiseListResponse,
    status_code=status.HTTP_200_OK,
    summary="List care promises",
    description="Retrieves a paginated list of care promises with optional filters for patient_id and status."
)
def list_care_promises(
    patient_id: Optional[str] = Query(None, description="Filter by patient ID"),
    promise_status: Optional[str] = Query(None, alias="status", description="Filter by status ('Pending' or 'Completed')"),
    skip: int = Query(0, ge=0, description="Pagination offset"),
    limit: int = Query(50, ge=1, le=100, description="Pagination limit"),
    db: Session = Depends(get_db)
) -> CarePromiseListResponse:
    """List care promises with optional filters."""
    items, total = get_care_promises(db=db, patient_id=patient_id, status=promise_status, skip=skip, limit=limit)
    return CarePromiseListResponse(total=total, care_promises=items)


@router.get(
    "/pending",
    response_model=List[CarePromiseResponse],
    status_code=status.HTTP_200_OK,
    summary="Get pending care promises",
    description="Retrieves all active pending care promises, ordered soonest due date first."
)
def list_pending_care_promises(
    patient_id: Optional[str] = Query(None, description="Optional patient ID filter"),
    db: Session = Depends(get_db)
) -> List[CarePromiseResponse]:
    """Retrieve pending care promises."""
    return get_pending_care_promises(db=db, patient_id=patient_id)


@router.get(
    "/overdue",
    response_model=List[CarePromiseResponse],
    status_code=status.HTTP_200_OK,
    summary="Get overdue care promises",
    description="Retrieves pending care promises past their target due date. Tasks are NEVER auto-completed."
)
def list_overdue_care_promises(
    patient_id: Optional[str] = Query(None, description="Optional patient ID filter"),
    as_of_date: Optional[date] = Query(None, description="Reference date for overdue evaluation (defaults to today)"),
    db: Session = Depends(get_db)
) -> List[CarePromiseResponse]:
    """Retrieve overdue care promises."""
    return get_overdue_care_promises(db=db, patient_id=patient_id, as_of_date=as_of_date)


@router.get(
    "/{promise_id}",
    response_model=CarePromiseResponse,
    status_code=status.HTTP_200_OK,
    summary="Get care promise by ID",
    description="Retrieves a specific care promise by its unique ID (e.g. CP-2026-0001)."
)
def get_care_promise(
    promise_id: str,
    db: Session = Depends(get_db)
) -> CarePromiseResponse:
    """Retrieve care promise by promise_id. Returns 404 if not found."""
    promise = get_care_promise_by_id(db=db, promise_id=promise_id)
    if not promise:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Care promise with ID '{promise_id}' not found."
        )
    return promise


@router.patch(
    "/{promise_id}",
    response_model=CarePromiseResponse,
    status_code=status.HTTP_200_OK,
    summary="Update care promise details",
    description="Updates description, due date, or status. Sets/clears completed_at on status changes."
)
def update_promise_details(
    promise_id: str,
    promise_in: CarePromiseUpdate,
    db: Session = Depends(get_db)
) -> CarePromiseResponse:
    """Update care promise. Returns 404 if not found."""
    promise = get_care_promise_by_id(db=db, promise_id=promise_id)
    if not promise:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Care promise with ID '{promise_id}' not found."
        )

    updated = update_care_promise(db=db, promise=promise, promise_in=promise_in)
    return updated


@router.patch(
    "/{promise_id}/complete",
    response_model=CarePromiseResponse,
    status_code=status.HTTP_200_OK,
    summary="Mark care promise as Completed",
    description="Marks task as Completed and records the current completion timestamp."
)
def mark_promise_completed(
    promise_id: str,
    db: Session = Depends(get_db)
) -> CarePromiseResponse:
    """Mark care promise as completed. Returns 404 if not found."""
    promise = get_care_promise_by_id(db=db, promise_id=promise_id)
    if not promise:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Care promise with ID '{promise_id}' not found."
        )

    completed = complete_care_promise(db=db, promise=promise)
    return completed
