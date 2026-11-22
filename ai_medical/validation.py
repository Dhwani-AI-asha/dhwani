"""
ai_medical/validation.py

Standalone validation layer for AI-generated medical reports in Dhwani AI.
Parses model responses (plain JSON or Markdown-fenced) and validates them
against the agreed MedicalReportOutput schema, while strictly enforcing
verbatim transcript evidence grounding for all danger signs.

Core Principles:
1. Strict Schema Enforcement: Validates against MedicalReportOutput.
2. Markdown Fence Stripping: Gracefully handles ```json ... ``` formatting.
3. Verbatim Evidence Grounding: Every DangerSign.evidence MUST exist as an
   exact substring in the original transcript.
4. No Hallucinations / No Fuzzy Tolerances: Rejects ungrounded or fabricated evidence.
5. No Autonomous Triage / No Diagnoses: Performs structural and grounding validation only.
"""

import json
import re
from typing import Any, Dict
from pydantic import ValidationError

try:
    from ai_medical.schemas import DangerSign, MedicalReportOutput
except ImportError:
    from schemas import DangerSign, MedicalReportOutput


# ============================================================================
# Custom Validation Exceptions
# ============================================================================

class ReportValidationError(ValueError):
    """Base exception for all report validation errors."""
    pass


class JSONParseError(ReportValidationError):
    """Raised when the AI response cannot be parsed as valid JSON."""
    pass


class SchemaValidationError(ReportValidationError):
    """Raised when the parsed JSON fails MedicalReportOutput schema validation."""
    pass


class EvidenceValidationError(ReportValidationError):
    """Raised when a danger sign's evidence is not found verbatim in the transcript."""
    pass


# ============================================================================
# JSON Extraction & Parsing
# ============================================================================

def extract_json_str(raw_response: str) -> str:
    """
    Extracts a JSON string from an AI-generated response string.
    Supports both plain JSON and JSON wrapped in Markdown code fences.

    Args:
        raw_response (str): The raw response string from an AI model.

    Returns:
        str: The extracted JSON string.

    Raises:
        JSONParseError: If raw_response is empty or whitespace-only.
    """
    if not isinstance(raw_response, str) or not raw_response.strip():
        raise JSONParseError("Response is empty or contains only whitespace.")

    cleaned = raw_response.strip()

    # Match standard markdown code fence: ```json ... ``` or ``` ... ```
    fence_pattern = r"```(?:json)?\s*([\s\S]*?)\s*```"
    match = re.search(fence_pattern, cleaned, re.IGNORECASE)
    if match:
        extracted = match.group(1).strip()
        if not extracted:
            raise JSONParseError("Markdown code fence contains no JSON content.")
        return extracted

    # If no fence is present, attempt to locate the outer JSON object { ... }
    first_brace = cleaned.find("{")
    last_brace = cleaned.rfind("}")
    if first_brace != -1 and last_brace != -1 and last_brace > first_brace:
        return cleaned[first_brace : last_brace + 1].strip()

    return cleaned


def parse_report_json(raw_response: str) -> MedicalReportOutput:
    """
    Parses a raw AI response string (plain JSON or markdown-fenced)
    and validates it against the MedicalReportOutput schema.

    Args:
        raw_response (str): The raw response from the AI.

    Returns:
        MedicalReportOutput: The validated Pydantic model instance.

    Raises:
        JSONParseError: If the response is not valid JSON.
        SchemaValidationError: If the JSON does not conform to MedicalReportOutput.
    """
    json_text = extract_json_str(raw_response)

    try:
        data: Any = json.loads(json_text)
    except json.JSONDecodeError as err:
        raise JSONParseError(f"Malformed JSON in AI response: {err}") from err

    if not isinstance(data, dict):
        raise SchemaValidationError(
            f"Expected a JSON object (dict) at root, got {type(data).__name__}."
        )

    try:
        return MedicalReportOutput.model_validate(data)
    except ValidationError as err:
        raise SchemaValidationError(
            f"Report data failed MedicalReportOutput schema validation: {err}"
        ) from err


# ============================================================================
# Verbatim Evidence Verification
# ============================================================================

def validate_danger_sign_evidence(
    report: MedicalReportOutput,
    original_transcript: str
) -> None:
    """
    Validates that every DangerSign in the report has an 'evidence' string that
    occurs EXACTLY as a verbatim substring in the original transcript.

    Strict Safety Rules:
    - Exact substring search: `ds.evidence in original_transcript`.
    - The original transcript remains completely unchanged.
    - No fuzzy matching is used, preventing fabricated or approximate quotes.
    - If any danger sign has missing, empty, or ungrounded evidence, rejects the report.

    Args:
        report (MedicalReportOutput): The parsed and schema-validated report.
        original_transcript (str): The untouched verbatim transcript text.

    Raises:
        EvidenceValidationError: If original_transcript is invalid, or if any
                                 evidence string is not found verbatim.
    """
    if not isinstance(original_transcript, str):
        raise EvidenceValidationError(
            f"Original transcript must be a string, got {type(original_transcript).__name__}."
        )

    # An empty danger signs list is valid (indicates no red flags identified)
    if not report.danger_signs:
        return

    for idx, ds in enumerate(report.danger_signs):
        evidence = ds.evidence
        if not evidence or not evidence.strip():
            raise EvidenceValidationError(
                f"Danger sign '{ds.sign}' (index {idx}) has empty evidence."
            )

        # Exact verbatim substring check on the untouched original transcript
        if evidence not in original_transcript:
            raise EvidenceValidationError(
                f"Danger sign evidence '{evidence}' for sign '{ds.sign}' (index {idx}) "
                f"was not found verbatim in the original transcript."
            )


# ============================================================================
# Unified Validation Orchestrator
# ============================================================================

def validate_medical_report(
    raw_response: str,
    original_transcript: str
) -> MedicalReportOutput:
    """
    Convenient all-in-one validation function that:
    1. Extracts JSON from plain text or Markdown code fences.
    2. Parses and validates against the MedicalReportOutput schema.
    3. Verifies that all danger sign evidence appears verbatim in the original transcript.
    4. Returns the validated MedicalReportOutput object.

    Args:
        raw_response (str): The raw string output from the AI model.
        original_transcript (str): The untouched original transcript text.

    Returns:
        MedicalReportOutput: The fully validated, evidence-grounded report.

    Raises:
        JSONParseError: If JSON parsing fails.
        SchemaValidationError: If schema validation fails.
        EvidenceValidationError: If danger-sign evidence is not verbatim in the transcript.
    """
    # Step 1 & 2: Parse JSON and validate schema
    report = parse_report_json(raw_response)

    # Step 3: Verify verbatim grounding of all danger signs
    validate_danger_sign_evidence(report, original_transcript)

    return report
