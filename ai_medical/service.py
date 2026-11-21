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
    from ai_medical.correction import (
        CorrectionError,
        build_corrected_transcript,
    )
except ImportError:
    from schemas import MedicalReportOutput, TranscriptInput
    from extraction_engine import ExtractionEngine, ModelInvocationError
    from validation import ReportValidationError
    from report_narration import generate_narration_result
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
            raise ServiceError("model_unavailable") from err
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
    narration = generate_narration_result(report, transcript=input_data.raw_text)

    return {
        "ok": True,
        "report": report.model_dump(),
        "narration": narration.narration_text,
        "narration_speech": to_speech_text(narration.narration_text),
        "narration_language": narration.language,
        "language_fallback_used": narration.language_detection.fallback_used,
        "transcript_used": input_data.raw_text,
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
    )
