"""
ai_medical/schemas.py

Pydantic v2 Data Models for Dhwani - Voice-First Visit Record Assistant.
Designed for ASHA workers conducting community health visits.

Core Principles:
1. Strict Fidelity: Unmentioned information must remain null (None) or be
   recorded in MissingInformation.
2. Grounded Evidence: Danger signs require exact verbatim evidence from the
   transcript and do not automatically assign urgency.
3. No Hallucinations: Never invent patient details or diagnoses.
4. Human-in-the-Loop: Clinical decisions and urgency ratings are reserved for
   human healthcare professionals.
"""

from datetime import datetime
from typing import Dict, List, Optional
from pydantic import BaseModel, ConfigDict, Field, field_validator


# ============================================================================
# 1. TranscriptInput
# ============================================================================
class TranscriptInput(BaseModel):
    """
    Represents the input audio transcription from an ASHA worker's visit.
    This is the raw conversational text that will be analyzed.
    """
    model_config = ConfigDict(str_strip_whitespace=True)

    raw_text: str = Field(
        ...,
        description="The raw transcription text of the consultation or visit conversation."
    )
    language: Optional[str] = Field(
        default=None,
        description="Spoken language or dialect if identified (e.g., 'en', 'hi', 'kn'). Defaults to None."
    )
    visit_id: Optional[str] = Field(
        default=None,
        description="Optional unique identifier for the visit session. Defaults to None."
    )
    patient_id: Optional[str] = Field(
        default=None,
        description="Optional unique identifier for the patient if already registered. Defaults to None."
    )
    recorded_at: Optional[datetime] = Field(
        default=None,
        description="Timestamp when the conversation was recorded. Defaults to None."
    )

    @field_validator("raw_text")
    @classmethod
    def validate_raw_text(cls, value: str) -> str:
        """Ensure the transcript is not empty or composed solely of whitespace."""
        if not value or not value.strip():
            raise ValueError("Transcript text cannot be empty or blank.")
        return value.strip()


# ============================================================================
# 2. ExtractedSymptom
# ============================================================================
class ExtractedSymptom(BaseModel):
    """
    Represents a single clinical symptom explicitly stated in the conversation.

    Rule: If duration, severity, or body site was NOT mentioned by the patient,
    the corresponding field MUST remain None.
    """
    model_config = ConfigDict(str_strip_whitespace=True)

    name: str = Field(
        ...,
        description="The name of the symptom (e.g., 'fever', 'cough', 'headache')."
    )
    duration: Optional[str] = Field(
        default=None,
        description="How long the symptom has lasted (e.g., '3 days', 'since morning'). None if unmentioned."
    )
    severity: Optional[str] = Field(
        default=None,
        description="Reported severity (e.g., 'mild', 'moderate', 'severe'). None if unmentioned."
    )
    body_site: Optional[str] = Field(
        default=None,
        description="Anatomical location if stated (e.g., 'chest', 'lower back', 'throat'). None if unmentioned."
    )
    notes: Optional[str] = Field(
        default=None,
        description="Verbatim patient remarks or extra context directly from the transcript. None if unmentioned."
    )

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: str) -> str:
        """Validate that the symptom name is provided."""
        if not value or not value.strip():
            raise ValueError("Symptom name cannot be empty.")
        return value.strip()


# ============================================================================
# 3. DangerSign
# ============================================================================
class DangerSign(BaseModel):
    """
    Represents an acute warning sign or red flag observed/reported during the visit.
    Examples in community health: convulsions, severe respiratory distress,
    uncontrolled bleeding, extreme lethargy, chest pain.

    Safety requirements:
    - `evidence` is required and must contain the exact phrase from the transcript.
    - `is_present` is a required boolean without a default.
    - `urgency_level` is optional (defaults to None) to avoid automated triage assumptions.
    """
    model_config = ConfigDict(str_strip_whitespace=True)

    sign: str = Field(
        ...,
        description="Description of the danger sign (e.g., 'Difficulty breathing', 'High fever with stiff neck')."
    )
    evidence: str = Field(
        ...,
        description="Exact phrase or quote from the transcript supporting this finding."
    )
    is_present: bool = Field(
        ...,
        description="Whether this danger sign is currently present."
    )
    urgency_level: Optional[str] = Field(
        default=None,
        description="Optional level of urgency (e.g., 'moderate', 'high', 'critical'). None if unassigned."
    )

    @field_validator("sign", "evidence")
    @classmethod
    def validate_non_empty_str(cls, value: str) -> str:
        """Ensure sign and evidence text are not empty or blank."""
        if not value or not value.strip():
            raise ValueError("Field cannot be empty or blank.")
        return value.strip()

    @field_validator("urgency_level")
    @classmethod
    def validate_urgency_level(cls, value: Optional[str]) -> Optional[str]:
        """Validate urgency level if provided; allows None without assigning defaults."""
        if value is None:
            return None
        allowed = {"low", "moderate", "high", "critical"}
        normalized = value.strip().lower()
        if normalized not in allowed:
            raise ValueError(f"Urgency level must be one of {allowed}, got '{value}'.")
        return normalized


# ============================================================================
# 4. MissingInformation
# ============================================================================
class MissingInformation(BaseModel):
    """
    Tracks vital clinical information that was NOT mentioned during the visit.
    This assists the ASHA worker or doctor in asking targeted follow-up questions.
    """
    model_config = ConfigDict(str_strip_whitespace=True)

    field_name: str = Field(
        ...,
        description="Name of the missing clinical detail (e.g., 'fever_duration', 'current_medications', 'patient_age')."
    )
    reason: str = Field(
        ...,
        description="Why this information is important for the patient's care."
    )
    prompt_question: Optional[str] = Field(
        default=None,
        description="A suggested follow-up question the ASHA worker can ask the patient."
    )
    importance: Optional[str] = Field(
        default=None,
        description="Priority of obtaining this information: 'low', 'medium', or 'high'. None if unassigned."
    )

    @field_validator("field_name", "reason")
    @classmethod
    def validate_non_empty(cls, value: str) -> str:
        """Ensure required text fields are not blank."""
        if not value or not value.strip():
            raise ValueError("Field cannot be empty.")
        return value.strip()

    @field_validator("importance")
    @classmethod
    def validate_importance(cls, value: Optional[str]) -> Optional[str]:
        """
        Validate importance if provided: 'low', 'medium', or 'high'.
        'moderate' is accepted as an alias and normalized to 'medium' so the
        output stays consistent with the documented contract. None is allowed.
        """
        if value is None:
            return None
        normalized = value.strip().lower()
        if normalized == "moderate":
            normalized = "medium"
        if normalized not in {"low", "medium", "high"}:
            raise ValueError(
                f"Importance must be one of 'low', 'medium', 'high', got '{value}'."
            )
        return normalized


# ============================================================================
# 5. MedicalReportOutput
# ============================================================================
class MedicalReportOutput(BaseModel):
    """
    The structured medical report generated from the visit transcript.

    Strict Safety Constraints:
    - Never generate diagnoses (only summarize reported symptoms and signs).
    - Never invent patient demographics. If unmentioned, they MUST remain None.
    - Professional review flag defaults to False; no automated decision is forced.
    """
    model_config = ConfigDict(str_strip_whitespace=True)

    # Patient demographics (strictly None if not stated in conversation)
    patient_name: Optional[str] = Field(
        default=None,
        description="Patient's name if explicitly mentioned. MUST remain None if not stated."
    )
    patient_age: Optional[str] = Field(
        default=None,
        description="Patient's age if explicitly mentioned (e.g., '35 years', '8 months'). MUST remain None if not stated."
    )
    patient_gender: Optional[str] = Field(
        default=None,
        description="Patient's gender if explicitly mentioned. MUST remain None if not stated."
    )

    # Clinical findings directly from the transcript
    chief_complaint: Optional[str] = Field(
        default=None,
        description="Primary reason for the visit in patient's words. None if not mentioned."
    )
    symptoms: List[ExtractedSymptom] = Field(
        default_factory=list,
        description="List of all symptoms explicitly reported in the transcript."
    )
    danger_signs: List[DangerSign] = Field(
        default_factory=list,
        description="List of acute warning signs or red flags identified."
    )
    vital_signs_mentioned: Optional[Dict[str, str]] = Field(
        default=None,
        description="Vital signs explicitly cited in the conversation (e.g., {'temperature': '102 F', 'bp': '120/80'}). None if not stated."
    )

    # Gaps and follow-ups
    missing_information: List[MissingInformation] = Field(
        default_factory=list,
        description="Critical clinical gaps identified that need follow-up inquiry."
    )

    # Clinical workflow and safety flags
    professional_review_required: bool = Field(
        default=False,
        description="Flag indicating if the report requires review by a qualified healthcare professional."
    )

    # Objective factual overview (no fabricated diagnoses)
    summary: str = Field(
        ...,
        description="A concise, factual summary of the consultation based strictly on the transcript."
    )
    notes: Optional[str] = Field(
        default=None,
        description="Additional factual observations from the visit. None if not provided."
    )

    @field_validator("summary")
    @classmethod
    def validate_summary(cls, value: str) -> str:
        """Ensure the summary is non-empty."""
        if not value or not value.strip():
            raise ValueError("Summary cannot be empty.")
        return value.strip()
