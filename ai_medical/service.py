"""
ai_medical/service.py

Application-level service layer for Dhwani AI report generation.
Used by the HTTP API (voice/report_api.py) and testable without any web framework.

Pipeline:
  transcript -> ExtractionEngine (prompt, model, JSON + schema + evidence validation)
             -> language-matched narration -> response package

Safety:
- Every attempt is fully validated; a retry never skips validation.
- Failures return short error codes only. Transcript text and model output are
  never included in errors.
- The package carries a fixed disclaimer. It does not diagnose, prescribe, or triage.
"""

import re
from typing import Any, Dict, Optional

try:
    from ai_medical.schemas import MedicalReportOutput, TranscriptInput
    from ai_medical.extraction_engine import ExtractionEngine, ModelInvocationError
    from ai_medical.validation import ReportValidationError
    from ai_medical.report_narration import generate_narration_result
    from ai_medical.grounding import ground_report_dict
    from ai_medical.correction import (
        CorrectionError,
        build_corrected_transcript,
    )
except ImportError:
    from schemas import MedicalReportOutput, TranscriptInput
    from extraction_engine import ExtractionEngine, ModelInvocationError
    from validation import ReportValidationError
    from report_narration import generate_narration_result
    from grounding import ground_report_dict
    from correction import CorrectionError, build_corrected_transcript


MAX_TRANSCRIPT_CHARS = 20000

DISCLAIMER = (
    "AI-generated documentation aid. This is not a diagnosis or a prescription. "
    "An empty danger-sign list does not mean the patient is safe, and "
    "professional_review_required = false does not mean review is unnecessary. "
    "Decisions about referral and care belong to qualified healthcare professionals."
)


class ServiceError(Exception):
    """Service-level failure carrying a short, safe error code."""

    def __init__(self, code: str, detail: Optional[str] = None):
        super().__init__(code)
        self.code = code
        self.detail = detail

    def to_dict(self) -> Dict[str, Any]:
        return {"ok": False, "error": self.code}


def to_speech_text(narration: str) -> str:
    """
    Convert on-screen narration into text suitable for text-to-speech.

    Removes decorative markers (=== headings, bullets, quote marks) so a speech
    engine does not read them aloud, and ensures each line ends with sentence
    punctuation so the voice pauses naturally. Wording is otherwise unchanged.
    """
    pieces = []
    for line in narration.splitlines():
        text = re.sub(r"^[\s=•*\-]+|[\s=]+$", "", line)
        text = text.replace('"', "").replace("\u201c", "").replace("\u201d", "")
        text = text.strip()
        if not text:
            continue
        if text[-1] not in ".?!।:;":
            text += "."
        pieces.append(text)
    return " ".join(pieces)


SAFE_REASON_MESSAGES: Dict[str, str] = {
    "missing_api_key": (
        "AI report model is not configured: LLM_API_KEY (or GEMINI_API_KEY) is missing in .env. "
        "Your recorded transcript and visit data have been preserved."
    ),
    "missing_model": (
        "AI report model is not configured: LLM_MODEL is missing in .env (for example, gemini-2.5-flash). "
        "Your recorded transcript and visit data have been preserved."
    ),
    "invalid_model": (
        "Configured LLM_MODEL is not supported or not found by the Gemini provider. "
        "Update LLM_MODEL in .env to a valid Gemini model ID. Visit data has been preserved."
    ),
    "auth_error": (
        "AI model authentication failed. Check that LLM_API_KEY in .env is valid and has Gemini API access. "
        "Visit data has been preserved."
    ),
    "rate_limited": (
        "AI model provider rate limit or quota was exceeded. Please try again shortly. "
        "Visit data has been preserved."
    ),
    "network_error": (
        "Could not reach the AI model provider. Check internet connectivity and try again. "
        "Visit data has been preserved."
    ),
    "provider_error": (
        "AI model provider returned an error. Please try again shortly. "
        "Visit data has been preserved."
    ),
    "empty_response": (
        "AI model returned an empty response. Please try again. "
        "Visit data has been preserved."
    ),
}


def _safe_model_failure_reason(err: Exception) -> Optional[str]:
    """
    Extract a strictly allowlisted diagnostic reason from a ModelInvocationError chain.
    Never returns raw exception messages, transcript text, or credentials.
    """
    cause = getattr(err, "__cause__", None)
    reason = getattr(cause, "reason", None)
    if isinstance(reason, str) and reason in SAFE_REASON_MESSAGES:
        return reason
    return None


def _run_extraction(
    engine: ExtractionEngine,
    input_data: TranscriptInput,
    max_attempts: int,
) -> MedicalReportOutput:
    """Run extraction, retrying only when the model output fails validation."""
    last_error: Optional[Exception] = None
    for _ in range(max(1, max_attempts)):
        try:
            return engine.process(input_data)
        except ModelInvocationError as err:
            raise ServiceError(
                "model_unavailable",
                detail=_safe_model_failure_reason(err),
            ) from err
        except ReportValidationError as err:
            last_error = err  # fully re-validated on the next attempt
    raise ServiceError(
        "report_rejected",
        detail=type(last_error).__name__ if last_error else None,
    ) from last_error


def generate_report_package(
    transcript: str,
    engine: ExtractionEngine,
    visit_id: Optional[str] = None,
    patient_id: Optional[str] = None,
    language: Optional[str] = None,
    max_attempts: int = 2,
    selected_patient_name: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Generate a validated report plus language-matched narration.

    Returns a dict with: ok, report, narration, narration_language,
    language_fallback_used, transcript_used, disclaimer.

    Raises:
        ServiceError: with code empty_transcript, transcript_too_long,
                      model_unavailable, or report_rejected.
    """
    if not isinstance(transcript, str) or not transcript.strip():
        raise ServiceError("empty_transcript")
    if len(transcript) > MAX_TRANSCRIPT_CHARS:
        raise ServiceError("transcript_too_long")

    try:
        input_data = TranscriptInput(
            raw_text=transcript,
            visit_id=visit_id,
            patient_id=patient_id,
            language=language,
        )
    except ValueError as err:
        raise ServiceError("empty_transcript") from err

    report = _run_extraction(engine, input_data, max_attempts)
    grounded_dict = ground_report_dict(
        report.model_dump(),
        transcript=input_data.raw_text,
        selected_patient_name=selected_patient_name,
    )
    grounded_model = MedicalReportOutput.model_validate(
        {k: grounded_dict[k] for k in MedicalReportOutput.model_fields}
    )
    narration = generate_narration_result(
        grounded_model,
        transcript=input_data.raw_text,
        grounded_extras=grounded_dict,
    )

    return {
        "ok": True,
        "report": grounded_dict,
        "narration": narration.narration_text,
        "narration_speech": to_speech_text(narration.narration_text),
        "narration_language": narration.language,
        "language_fallback_used": narration.language_detection.fallback_used,
        "transcript_used": input_data.raw_text,
        "identity_status": grounded_dict.get("identity_status"),
        "disclaimer": DISCLAIMER,
    }


def correct_report_package(
    transcript: str,
    correction: str,
    engine: ExtractionEngine,
    visit_id: Optional[str] = None,
    patient_id: Optional[str] = None,
    language: Optional[str] = None,
    max_attempts: int = 2,
    selected_patient_name: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Apply an ASHA correction by appending it to the transcript and regenerating
    the full report. The returned transcript_used includes the correction line,
    and the client should send it back for any further correction.
    """
    if not isinstance(transcript, str) or not transcript.strip():
        raise ServiceError("empty_transcript")
    try:
        corrected = build_corrected_transcript(transcript, correction)
    except CorrectionError as err:
        raise ServiceError(err.code) from err

    return generate_report_package(
        transcript=corrected,
        engine=engine,
        visit_id=visit_id,
        patient_id=patient_id,
        language=language,
        max_attempts=max_attempts,
        selected_patient_name=selected_patient_name,
    )
