"""
Pydantic v2 schemas for Care Promise Tracker.
"""

from datetime import date, datetime
from enum import Enum
from typing import Optional, List
from pydantic import BaseModel, ConfigDict, Field, field_validator


class PromiseStatusEnum(str, Enum):
    PENDING = "Pending"
    COMPLETED = "Completed"


class CarePromiseCreate(BaseModel):
    """Schema for creating a new care promise / follow-up task."""
    patient_id: str = Field(..., min_length=1, description="Registered patient ID (e.g. PAT-2026-0001)")
    description: str = Field(..., min_length=1, description="Actionable follow-up commitment description")
    due_date: date = Field(..., description="Target due date for completion (YYYY-MM-DD)")
    visit_id: Optional[str] = Field(None, description="Optional associated visit ID (e.g. VIS-2026-0001)")

    @field_validator("description")
    @classmethod
    def validate_description_not_blank(cls, v: str) -> str:
        trimmed = v.strip()
        if not trimmed:
            raise ValueError("Description cannot be empty or solely whitespace")
        return trimmed


class CarePromiseUpdate(BaseModel):
    """
    Schema for updating an existing care promise.
    Clients can only update description and due_date. Status and timestamps cannot be set via this schema.
    """
    description: Optional[str] = Field(None, min_length=1)
    due_date: Optional[date] = Field(None)

    model_config = ConfigDict(extra="forbid")

    @field_validator("description", mode="before")
    @classmethod
    def validate_description_not_null_or_blank(cls, v):
        if v is None:
            raise ValueError("Description cannot be null")
        if isinstance(v, str):
            trimmed = v.strip()
            if not trimmed:
                raise ValueError("Description cannot be empty or solely whitespace")
            return trimmed
        return v

    @field_validator("due_date", mode="before")
    @classmethod
    def validate_due_date_not_null(cls, v):
        if v is None:
            raise ValueError("Due date cannot be null")
        return v


class CarePromiseResponse(BaseModel):
    """Public representation of a care promise without internal database IDs."""
    promise_id: str
    patient_id: str
    visit_id: Optional[str] = None
    description: str
    due_date: date
    status: str
    completed_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class CarePromiseListResponse(BaseModel):
    """List response schema for care promises."""
    total: int
    care_promises: List[CarePromiseResponse]
