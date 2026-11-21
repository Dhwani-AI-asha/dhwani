"""
Pydantic v2 schemas for Referral Tracking APIs.
"""

from datetime import date, datetime
from enum import Enum
from typing import Optional, List
from pydantic import BaseModel, ConfigDict, Field, field_validator


class ReferralStatusEnum(str, Enum):
    PENDING = "Pending"
    COMPLETED = "Completed"
    CANCELLED = "Cancelled"


class ReferralCreate(BaseModel):
    """Schema for recording a clinical referral."""
    patient_id: str = Field(..., min_length=1, description="Registered patient ID (e.g. PAT-2026-0001)")
    reason: str = Field(..., min_length=1, description="Clinical reason for referral")
    facility_name: str = Field(..., min_length=1, description="Target healthcare facility or specialist")
    referral_date: Optional[date] = Field(None, description="Date of referral (defaults to today if omitted)")
    visit_id: Optional[str] = Field(None, description="Optional associated visit ID (e.g. VIS-2026-0001)")
    referred_by: Optional[str] = Field(None, description="Referring health worker or ASHA name/ID")
    status: Optional[ReferralStatusEnum] = Field(ReferralStatusEnum.PENDING, description="Referral status")
    notes: Optional[str] = Field(None, description="Optional referral remarks or transport notes")

    model_config = ConfigDict(extra="forbid")

    @field_validator("reason")
    @classmethod
    def validate_reason_not_blank(cls, v: str) -> str:
        trimmed = v.strip()
        if not trimmed:
            raise ValueError("Referral reason cannot be empty or solely whitespace")
        return trimmed

    @field_validator("facility_name")
    @classmethod
    def validate_facility_not_blank(cls, v: str) -> str:
        trimmed = v.strip()
        if not trimmed:
            raise ValueError("Facility name cannot be empty or solely whitespace")
        return trimmed


class ReferralUpdate(BaseModel):
    """
    Schema for updating referral details or status.
    Disallows client updates to referral_id, patient_id, or visit_id.
    """
    reason: Optional[str] = Field(None, min_length=1)
    facility_name: Optional[str] = Field(None, min_length=1)
    referral_date: Optional[date] = Field(None)
    referred_by: Optional[str] = Field(None)
    status: Optional[ReferralStatusEnum] = Field(None)
    notes: Optional[str] = Field(None)

    model_config = ConfigDict(extra="forbid")

    @field_validator("reason", mode="before")
    @classmethod
    def validate_reason_not_null_or_blank(cls, v):
        if v is None:
            raise ValueError("Referral reason cannot be null")
        if isinstance(v, str):
            trimmed = v.strip()
            if not trimmed:
                raise ValueError("Referral reason cannot be empty or solely whitespace")
            return trimmed
        return v

    @field_validator("facility_name", mode="before")
    @classmethod
    def validate_facility_not_null_or_blank(cls, v):
        if v is None:
            raise ValueError("Facility name cannot be null")
        if isinstance(v, str):
            trimmed = v.strip()
            if not trimmed:
                raise ValueError("Facility name cannot be empty or solely whitespace")
            return trimmed
        return v

    @field_validator("referral_date", mode="before")
    @classmethod
    def validate_date_not_null(cls, v):
        if v is None:
            raise ValueError("Referral date cannot be null")
        return v

    @field_validator("status", mode="before")
    @classmethod
    def validate_status_not_null(cls, v):
        if v is None:
            raise ValueError("Referral status cannot be null")
        if isinstance(v, str):
            allowed = {s.value for s in ReferralStatusEnum}
            if v not in allowed:
                raise ValueError(f"Status must be one of {allowed}")
        return v


class ReferralResponse(BaseModel):
    """Public representation of a clinical referral without internal database IDs."""
    referral_id: str
    patient_id: str
    visit_id: Optional[str] = None
    reason: str
    facility_name: str
    referred_by: Optional[str] = None
    referral_date: date
    status: str
    notes: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ReferralListResponse(BaseModel):
    """List response schema for referrals."""
    total: int
    referrals: List[ReferralResponse]
