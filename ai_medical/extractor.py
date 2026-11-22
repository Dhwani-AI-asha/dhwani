"""
ai_medical/extractor.py

Transcript Extraction Module for Dhwani.
Prepares the interface for extracting clinical details from ASHA worker visit transcripts.

Core Principles:
1. Grounded Extraction: Only extract information explicitly mentioned in the transcript.
2. Safe Defaults: Unmentioned details (duration, severity, site) MUST remain None.
3. No Hallucinations: Never invent symptoms, chief complaints, or patient details.
4. Intermediate Validation: Uses ExtractionResult (Pydantic model) for strong typing.
5. Evidence Preservation: Retains the original transcript text for downstream verification.
"""

from typing import List, Optional
from pydantic import BaseModel, ConfigDict, Field

# Supports running as a package or directly as a standalone script
try:
    from ai_medical.schemas import ExtractedSymptom, TranscriptInput
except ImportError:
    from schemas import ExtractedSymptom, TranscriptInput


# ============================================================================
# Intermediate Data Model
# ============================================================================

class ExtractionResult(BaseModel):
    """
    Intermediate structured result representing extracted clinical facts
    prior to final report generation and danger sign analysis.
    """
    model_config = ConfigDict(str_strip_whitespace=True)

    chief_complaint: Optional[str] = Field(
        default=None,
        description="Primary reason for the visit in patient's words if stated, else None."
    )
    symptoms: List[ExtractedSymptom] = Field(
        default_factory=list,
        description="List of explicitly stated symptoms with duration and severity if mentioned."
    )
    raw_text: str = Field(
        ...,
        description="The preserved original transcript text for evidence verification."
    )
    visit_id: Optional[str] = Field(
        default=None,
        description="Optional unique identifier for the visit session."
    )
    patient_id: Optional[str] = Field(
        default=None,
        description="Optional unique identifier for the patient if already registered."
    )


# ============================================================================
# Granular Extraction Interfaces (Safe Placeholders)
# ============================================================================

def extract_chief_complaint(text: str) -> Optional[str]:
    """
    Extract the primary reason for the patient's visit or main reported issue.

    Args:
        text (str): The transcript text.

    Returns:
        Optional[str]: The chief complaint in the patient's words if stated,
                       or None if not explicitly mentioned in the conversation.
    """
    # Safe placeholder: Return None until extraction logic is implemented
    # Never invent or assume a complaint
    return None


def extract_duration(text: str, symptom_name: str) -> Optional[str]:
    """
    Extract how long a specific symptom has been present.

    Args:
        text (str): The transcript text.
        symptom_name (str): The name of the symptom being queried.

    Returns:
        Optional[str]: The duration (e.g., '3 days', 'since yesterday') if mentioned,
                       or None if no duration was stated in the transcript.
    """
    # Safe placeholder: Return None if duration was not explicitly stated
    return None


def extract_severity(text: str, symptom_name: str) -> Optional[str]:
    """
    Extract the patient-reported severity for a specific symptom.

    Args:
        text (str): The transcript text.
        symptom_name (str): The name of the symptom being queried.

    Returns:
        Optional[str]: Reported severity (e.g., 'mild', 'moderate', 'severe') if stated,
                       or None if severity was not mentioned.
    """
    # Safe placeholder: Return None if severity was not explicitly stated
    return None


def extract_symptoms(text: str) -> List[ExtractedSymptom]:
    """
    Identify and extract all clinical symptoms explicitly reported in the transcript.

    Args:
        text (str): The transcript text.

    Returns:
        List[ExtractedSymptom]: A list of ExtractedSymptom objects.
                                Returns an empty list if no symptoms are mentioned.
    """
    # Safe placeholder: Return an empty list until extraction logic is implemented
    return []


# ============================================================================
# Main Extraction Entry Point
# ============================================================================

def extract_from_transcript(input_data: TranscriptInput) -> ExtractionResult:
    """
    Main extraction interface. Accepts a TranscriptInput object, coordinates
    symptom and chief complaint extraction, and returns a strongly-typed ExtractionResult.

    Args:
        input_data (TranscriptInput): Validated transcript input containing raw_text,
                                      language, visit_id, patient_id, etc.

    Returns:
        ExtractionResult: Validated Pydantic model containing extracted symptoms,
                          chief complaint, and the preserved original transcript text.
    """
    clean_text = input_data.raw_text.strip()

    # Call extraction placeholders
    chief_complaint = extract_chief_complaint(clean_text)
    symptoms = extract_symptoms(clean_text)

    # Return strongly-typed ExtractionResult preserving original transcript for verification
    return ExtractionResult(
        chief_complaint=chief_complaint,
        symptoms=symptoms,
        raw_text=input_data.raw_text,
        visit_id=input_data.visit_id,
        patient_id=input_data.patient_id,
    )
