"""
Pydantic v2 schemas for Next-Visit Summary API.
Provides structured briefing and fact-grounded synthesis for ASHA workers.
"""

from datetime import date
from typing import Optional, List, Any
from pydantic import BaseModel, ConfigDict, Field

from app.schemas.visit import Symptom, MissingInformation


class PatientBrief(BaseModel):
    """Patient demographic overview."""
    patient_id: str
    name: str
    age: int
    gender: Optional[str] = None
    contact_number: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class LatestVisitBrief(BaseModel):
    """Full detail of the patient's most recent visit."""
    visit_id: str
    visit_date: date
    chief_complaint: Optional[str] = None
    summary: Optional[str] = None
    symptoms: List[Symptom] = Field(default_factory=list)
    danger_signs: List[str] = Field(default_factory=list)
    vital_signs_mentioned: Optional[Any] = None
    professional_review_required: bool = False
    missing_information: List[MissingInformation] = Field(default_factory=list)
    notes: Optional[str] = None


class PreviousVisitBrief(BaseModel):
    """Concise record of an earlier visit (excludes the latest visit)."""
    visit_id: str
    visit_date: date
    chief_complaint: Optional[str] = None
    summary: Optional[str] = None
    danger_signs: List[str] = Field(default_factory=list)
    professional_review_required: bool = False


class CarePromiseBrief(BaseModel):
    """Follow-up task / commitment brief."""
    promise_id: str
    description: str
    due_date: date
    status: str
    is_overdue: bool = False


class AttentionItems(BaseModel):
    """Urgent items requiring ASHA worker attention during the next visit."""
    danger_signs: List[str] = Field(default_factory=list)
    professional_review_required: bool = False
    missing_information: List[MissingInformation] = Field(default_factory=list)


class NextVisitSummaryResponse(BaseModel):
    """Complete next-visit summary response for ASHA worker pre-visit preparation."""
    patient: PatientBrief
    latest_visit: Optional[LatestVisitBrief] = None
    previous_visits: List[PreviousVisitBrief] = Field(default_factory=list)
    pending_promises: List[CarePromiseBrief] = Field(default_factory=list)
    overdue_promises: List[CarePromiseBrief] = Field(default_factory=list)
    attention_items: AttentionItems
    briefing_text: str
