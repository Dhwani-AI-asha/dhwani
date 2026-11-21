"""
Pydantic v2 schemas for Patient registration, updates, and responses.
Separates API request and response data contracts from internal ORM models.
"""

from datetime import date, datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict, Field, field_validator


class PatientBase(BaseModel):
    """Common fields for patient demographic records."""
    name: str = Field(..., min_length=1, max_length=120, description="Full name of patient")
    age: Optional[int] = Field(None, ge=0, le=130, description="Patient age in years if explicitly known")
    gender: Optional[str] = Field(None, max_length=20, description="Optional gender: Female, Male, Other")
    contact_number: Optional[str] = Field(None, max_length=20, description="Optional phone number")
    address: Optional[str] = Field(None, max_length=255, description="Optional residential address or village/ward")

    @field_validator("name")
    @classmethod
    def validate_name_not_empty(cls, v: str) -> str:
        trimmed = v.strip()
        if not trimmed:
            raise ValueError("Patient name cannot be empty or solely whitespace")
        return trimmed


class PatientCreate(PatientBase):
    """Schema for registering a new patient."""
    registration_date: Optional[date] = Field(
        None,
        description="Date of registration. Defaults to current date if omitted."
    )


class PatientUpdate(BaseModel):
    """
    Schema for updating an existing patient.
    All fields are optional when omitted. Explicitly supplying null for required
    fields (name, age) is rejected with validation error (HTTP 422).
    Optional fields (gender, contact_number, address) accept explicit null to clear them.
    """
    name: Optional[str] = Field(None, min_length=1, max_length=120)
    age: Optional[int] = Field(None, ge=0, le=130)
    gender: Optional[str] = Field(None, max_length=20)
    contact_number: Optional[str] = Field(None, max_length=20)
    address: Optional[str] = Field(None, max_length=255)

    @field_validator("name", mode="before")
    @classmethod
    def validate_name_not_null(cls, v):
        if v is None:
            raise ValueError("Patient name cannot be null")
        if isinstance(v, str):
            trimmed = v.strip()
            if not trimmed:
                raise ValueError("Patient name cannot be empty or solely whitespace")
            return trimmed
        return v

    @field_validator("age", mode="before")
    @classmethod
    def validate_age_not_null(cls, v):
        if v is None:
            raise ValueError("Patient age cannot be null")
        return v


class PatientResponse(BaseModel):
    """
    Public response schema for a patient.
    Exposes only the unique human-readable patient_id without internal database IDs.
    """
    patient_id: str
    name: str
    age: Optional[int] = None
    gender: Optional[str] = None
    contact_number: Optional[str] = None
    address: Optional[str] = None
    registration_date: date
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class PatientListResponse(BaseModel):
    """Response schema for listing and searching patients."""
    total: int
    patients: list[PatientResponse]
