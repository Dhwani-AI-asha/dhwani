"""
Pydantic v2 schemas for Medication Reminder Records APIs.
Stores medication instructions copied strictly from authorized prescriptions.
"""

from datetime import date, datetime
from enum import Enum
from typing import Optional, List
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class MedicationReminderStatusEnum(str, Enum):
    ACTIVE = "Active"
    INACTIVE = "Inactive"


class MedicationReminderCreate(BaseModel):
    """
    Schema for recording an authorized medication prescription reminder.
    Record-keeping only: all prescription details must come from an authorized provider.
    """
    patient_id: str = Field(..., min_length=1, description="Registered patient ID (e.g. PAT-2026-0001)")
    medication_name: str = Field(..., min_length=1, description="Name of prescribed medication copied from prescription")
    dosage_instructions: str = Field(..., min_length=1, description="Exact dosage instructions copied from prescription")
    prescribed_by: str = Field(..., min_length=1, description="Name/designation of authorized prescribing professional")
    prescription_reference: str = Field(..., min_length=1, description="Reference confirming authorized prescription (e.g. Rx ID/slip)")
    frequency: Optional[str] = Field(None, description="Prescribed dosage frequency (e.g. 'Twice daily after food')")
    start_date: Optional[date] = Field(None, description="Medication course start date")
    end_date: Optional[date] = Field(None, description="Medication course end date")
    visit_id: Optional[str] = Field(None, description="Optional associated visit ID (e.g. VIS-2026-0001)")
    status: Optional[MedicationReminderStatusEnum] = Field(MedicationReminderStatusEnum.ACTIVE, description="Status (Active or Inactive)")
    notes: Optional[str] = Field(None, description="Optional administration or food interaction notes")

    model_config = ConfigDict(extra="forbid")

    @field_validator("medication_name", "dosage_instructions", "prescribed_by", "prescription_reference", "patient_id")
    @classmethod
    def validate_required_not_blank(cls, v: str) -> str:
        trimmed = v.strip() if isinstance(v, str) else ""
        if not trimmed:
            raise ValueError("Field cannot be empty or solely whitespace")
        return trimmed

    @field_validator("visit_id")
    @classmethod
    def validate_visit_id(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            trimmed = v.strip()
            if not trimmed:
                raise ValueError("Visit ID cannot be blank if provided")
            return trimmed
        return None

    @model_validator(mode="after")
    def validate_date_range(self) -> "MedicationReminderCreate":
        if self.start_date is not None and self.end_date is not None:
            if self.end_date < self.start_date:
                raise ValueError("end_date cannot be earlier than start_date")
        return self


class MedicationReminderUpdate(BaseModel):
    """
    Schema for updating medication reminder details.
    Disallows client updates to reminder_id, patient_id, visit_id, or created_at.
    """
    medication_name: Optional[str] = Field(None, min_length=1)
    dosage_instructions: Optional[str] = Field(None, min_length=1)
    frequency: Optional[str] = Field(None)
    start_date: Optional[date] = Field(None)
    end_date: Optional[date] = Field(None)
    prescribed_by: Optional[str] = Field(None, min_length=1)
    prescription_reference: Optional[str] = Field(None, min_length=1)
    status: Optional[MedicationReminderStatusEnum] = Field(None)
    notes: Optional[str] = Field(None)

    model_config = ConfigDict(extra="forbid")

    @field_validator(
        "medication_name",
        "dosage_instructions",
        "prescribed_by",
        "prescription_reference",
        mode="before"
    )
    @classmethod
    def validate_required_fields_not_null_or_blank(cls, v):
        if v is None:
            raise ValueError("Field cannot be null")
        if isinstance(v, str):
            trimmed = v.strip()
            if not trimmed:
                raise ValueError("Field cannot be empty or solely whitespace")
            return trimmed
        return v

    @field_validator("status", mode="before")
    @classmethod
    def validate_status_not_null(cls, v):
        if v is None:
            raise ValueError("Status cannot be null")
        if isinstance(v, str):
            allowed = {s.value for s in MedicationReminderStatusEnum}
            if v not in allowed:
                raise ValueError(f"Status must be one of {allowed}")
        return v

    @model_validator(mode="after")
    def validate_update_date_range(self) -> "MedicationReminderUpdate":
        if self.start_date is not None and self.end_date is not None:
            if self.end_date < self.start_date:
                raise ValueError("end_date cannot be earlier than start_date")
        return self


class MedicationReminderResponse(BaseModel):
    """Public representation of a medication reminder record without internal primary key."""
    reminder_id: str
    patient_id: str
    visit_id: Optional[str] = None
    medication_name: str
    dosage_instructions: str
    frequency: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    prescribed_by: str
    prescription_reference: str
    status: str
    notes: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class MedicationReminderListResponse(BaseModel):
    """List response schema for medication reminders."""
    total: int
    reminders: List[MedicationReminderResponse]
