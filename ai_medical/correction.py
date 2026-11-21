"""
ai_medical/correction.py

Correction flow for Dhwani AI reports.

Design (safety-preserving):
- A correction from the ASHA worker is appended to the transcript as a clearly
  labelled line. The report is then regenerated from the combined transcript.
- Because extraction and validation run again on the combined text, every
  safety guarantee still applies: no fabricated danger-sign evidence, no
  invented details, schema validation.
- The correction is treated as untrusted data. Newlines are collapsed so a
  correction cannot imitate transcript structure, and its length is capped.
"""

import re

CORRECTION_PREFIX = "ASHA correction: "
MAX_CORRECTION_CHARS = 500


class CorrectionError(ValueError):
    """Raised when a correction is empty or too long."""

    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code


def normalize_correction(correction: str) -> str:
    """Strip the correction and collapse all whitespace/newlines to single spaces."""
    if not isinstance(correction, str):
        raise CorrectionError("empty_correction", "Correction must be a string.")
    cleaned = re.sub(r"\s+", " ", correction).strip()
    if not cleaned:
        raise CorrectionError("empty_correction", "Correction cannot be empty.")
    if len(cleaned) > MAX_CORRECTION_CHARS:
        raise CorrectionError(
            "correction_too_long",
            f"Correction must be at most {MAX_CORRECTION_CHARS} characters.",
        )
    return cleaned


def build_corrected_transcript(transcript: str, correction: str) -> str:
    """
    Append a labelled correction line to the transcript.

    The original transcript text is left unchanged and stays a prefix of the
    result, so evidence quoted from it remains valid.
    """
    if not isinstance(transcript, str) or not transcript.strip():
        raise CorrectionError("empty_transcript", "Transcript cannot be empty.")
    cleaned = normalize_correction(correction)
    return f"{transcript.rstrip()}\n{CORRECTION_PREFIX}{cleaned}"
