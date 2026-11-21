"""
Pydantic v2 schemas for Visit Management and Member 2 Structured Medical Report ingestion.
"""

from datetime import date, datetime
from typing import Optional, Any, Dict, List, Union
from pydantic import BaseModel, ConfigDict, Field


class Symptom(BaseModel):
    """Structured symptom object extracted by Member 2 NLP pipeline."""
    name: str = Field(..., description="Name of the symptom")
    duration: Optional[str] = Field(None, description="Duration (e.g. '3 days')")
    severity: Optional[str] = Field(None, description="Severity (e.g. 'Mild', 'Moderate', 'Severe')")
    body_site: Optional[str] = Field(None, description="Anatomical location (e.g. 'Head')")
    notes: Optional[str] = Field(None, description="Additional symptom-specific notes")

    model_config = ConfigDict(extra="allow")


class MissingInformation(BaseModel):
    """Clinical information missing from conversation, with suggested ASHA prompt question."""
    field_name: str = Field(..., description="Missing clinical data element")
    reason: Optional[str] = Field(None, description="Why this information was flagged as missing")
    prompt_question: Optional[str] = Field(None, description="Suggested follow-up question for ASHA worker")
    importance: Optional[str] = Field(None, description="Clinical priority if provided")

    model_config = ConfigDict(extra="allow")


class EmergencyEscalationRecord(BaseModel):
    """Audit record for voice-confirmed or declined emergency danger-sign escalation."""
    id: Optional[str] = Field(None, description="Client record ID")
    alert_id: Optional[str] = Field(None, description="Matched danger-sign rule identifier")
    rule_code: Optional[str] = Field(None, description="Clinical protocol rule code")
    detected_sign: str = Field(..., description="Detected validated danger sign")
    evidence: Optional[str] = Field(None, description="Verbatim transcript evidence")
    detected_at: Optional[str] = Field(None, description="ISO timestamp when sign was detected")
    confirmation_transcript: str = Field("", description="Isolated worker confirmation speech transcript")
    response: str = Field(..., description="Worker decision: yes, no, no_response, or pending")
    responded_at: Optional[str] = Field(None, description="ISO timestamp when confirmation completed")
    timestamp: Optional[str] = Field(None, description="Primary event timestamp")
    escalation_status: str = Field(..., description="confirmed, declined, no_response, or pending_confirmation")
    attempts: Optional[int] = Field(None, description="Number of voice confirmation prompts attempted")

    model_config = ConfigDict(extra="allow")


class StructuredReport(BaseModel):
    """
    Structured medical report format produced by Member 2.
    Preserves all null values, empty lists, detailed clinical entity extractions,
    and additional forward-compatible metadata fields.
    """
    patient_name: Optional[str] = Field(None, description="Patient name mentioned in voice note, if any")
    patient_age: Optional[Union[int, str]] = Field(None, description="Patient age mentioned in voice note, if any")
    patient_gender: Optional[str] = Field(None, description="Patient gender mentioned in voice note, if any")
    chief_complaint: Optional[str] = Field(None, description="Primary concern or complaint")
    symptoms: List[Symptom] = Field(default_factory=list, description="List of structured symptoms")
    danger_signs: List[Union[str, Dict[str, Any]]] = Field(default_factory=list, description="Extracted critical danger signs")
    vital_signs_mentioned: Optional[Any] = Field(None, description="Vitals mentioned (string or key-value object)")
    missing_information: List[MissingInformation] = Field(default_factory=list, description="Clinical gaps with prompts")
    professional_review_required: bool = Field(False, description="Whether doctor review is recommended")
    summary: Optional[str] = Field(None, description="Concise visit summary")
    notes: Optional[str] = Field(None, description="Disclaimers or administrative notes")
    emergency_escalations: Optional[List[EmergencyEscalationRecord]] = Field(
        None,
        description="Isolated audit records for danger-sign emergency voice confirmations"
    )
    emergency_escalation: Optional[EmergencyEscalationRecord] = Field(
        None,
        description="Latest emergency voice confirmation audit record"
    )

    model_config = ConfigDict(extra="allow")


class VisitCreate(BaseModel):
    """Request schema for ingesting a visit report from Member 2."""
    patient_id: str = Field(..., description="Existing registered patient ID (e.g. PAT-2026-0001)")
    visit_date: date = Field(..., description="Date of the visit (YYYY-MM-DD)")
    report: StructuredReport = Field(..., description="Structured medical report from Member 2")


class VisitUpdate(BaseModel):
    """Request schema for updating a stored visit report (e.g. after voice corrections or confirmation)."""
    report: StructuredReport = Field(..., description="Updated structured medical report")
    visit_date: Optional[date] = Field(None, description="Optional updated visit date (YYYY-MM-DD)")


class VisitResponse(BaseModel):
    """Response schema representing a stored visit record."""
    visit_id: str
    patient_id: str
    visit_date: date
    report: StructuredReport
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
