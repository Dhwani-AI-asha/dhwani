"""
ai_medical/extraction_engine.py

Model-independent extraction engine for Dhwani AI.
Orchestrates AI prompt formatting, model invocation via a callable interface,
and strict validation against MedicalReportOutput with verbatim evidence checking.

Architecture:
- Decoupled from specific LLM providers (Gnani AI, Gemini, OpenAI, Claude, local models).
- Accepts any callable: (system_prompt: str, user_prompt: str) -> str.
- Validates the model response through validation.py.
- Verifies DangerSign evidence against the original transcript.
- Returns a fully-validated MedicalReportOutput instance.
"""

from typing import Callable, Optional

try:
    from ai_medical.schemas import MedicalReportOutput, TranscriptInput
    from ai_medical.prompts import SYSTEM_PROMPT, USER_PROMPT_TEMPLATE
    from ai_medical.validation import (
        EvidenceValidationError,
        JSONParseError,
        ReportValidationError,
        SchemaValidationError,
        validate_medical_report,
    )
except ImportError:
    from schemas import MedicalReportOutput, TranscriptInput
    from prompts import SYSTEM_PROMPT, USER_PROMPT_TEMPLATE
    from validation import (
        EvidenceValidationError,
        JSONParseError,
        ReportValidationError,
        SchemaValidationError,
        validate_medical_report,
    )


# Type alias for any AI model callable
ModelCallable = Callable[[str, str], str]


# ============================================================================
# Engine Exceptions
# ============================================================================

class ExtractionEngineError(Exception):
    """Base exception for extraction engine errors."""
    pass


class ModelInvocationError(ExtractionEngineError):
    """Raised when the AI model callable fails, raises an error, or returns invalid data."""
    pass


# ============================================================================
# Core Extraction Pipeline
# ============================================================================

def format_user_prompt(input_data: TranscriptInput) -> str:
    """
    Format the user prompt template with metadata and transcript text.

    Args:
        input_data (TranscriptInput): Validated transcript input.

    Returns:
        str: Formatted user prompt string.
    """
    return USER_PROMPT_TEMPLATE.format(
        visit_id=input_data.visit_id,
        patient_id=input_data.patient_id,
        language=input_data.language,
        raw_text=input_data.raw_text,
    )


def extract_medical_report(
    input_data: TranscriptInput,
    model_callable: ModelCallable,
    system_prompt: Optional[str] = None,
) -> MedicalReportOutput:
    """
    Execute the medical report extraction pipeline.

    Steps:
    1. Formats the user prompt using input_data and USER_PROMPT_TEMPLATE.
    2. Invokes model_callable(system_prompt, user_prompt).
    3. Handles model invocation failures with ModelInvocationError.
    4. Validates raw response via validate_medical_report(), which:
       - Extracts JSON (handling plain text or Markdown code fences).
       - Validates schema against MedicalReportOutput.
       - Enforces verbatim evidence matching for danger signs against input_data.raw_text.
    5. Returns the validated MedicalReportOutput object.

    Args:
        input_data (TranscriptInput): Validated consultation transcript input.
        model_callable (ModelCallable): Function accepting (system_prompt, user_prompt) -> raw_response_str.
        system_prompt (Optional[str]): System prompt to use; defaults to prompts.SYSTEM_PROMPT.

    Returns:
        MedicalReportOutput: Validated report object matching the contract with Member 3.

    Raises:
        ModelInvocationError: If the model callable fails or returns empty/invalid output.
        JSONParseError: If model response is malformed JSON.
        SchemaValidationError: If response fails MedicalReportOutput schema.
        EvidenceValidationError: If danger-sign evidence is not found verbatim in transcript.
    """
    if not isinstance(input_data, TranscriptInput):
        raise TypeError(
            f"input_data must be an instance of TranscriptInput, got {type(input_data).__name__}."
        )

    if not callable(model_callable):
        raise TypeError("model_callable must be a callable accepting (system_prompt, user_prompt).")

    active_system_prompt = system_prompt if system_prompt is not None else SYSTEM_PROMPT
    user_prompt = format_user_prompt(input_data)

    # Invoke the model callable with error guarding
    try:
        raw_response = model_callable(active_system_prompt, user_prompt)
    except Exception as err:
        raise ModelInvocationError(
            f"AI model callable failed during invocation: {err}"
        ) from err

    if not isinstance(raw_response, str) or not raw_response.strip():
        raise ModelInvocationError(
            "AI model callable returned an empty or non-string response."
        )

    # Validate JSON, schema, and verbatim evidence
    return validate_medical_report(
        raw_response=raw_response,
        original_transcript=input_data.raw_text,
    )


class ExtractionEngine:
    """
    Class-based interface wrapping a model callable for reuse across multiple visits.
    """

    def __init__(
        self,
        model_callable: ModelCallable,
        system_prompt: Optional[str] = None,
    ):
        """
        Initialize the ExtractionEngine with a model callable.

        Args:
            model_callable (ModelCallable): Callable taking (system_prompt, user_prompt) -> str.
            system_prompt (Optional[str]): Optional custom system prompt.
        """
        if not callable(model_callable):
            raise TypeError("model_callable must be callable.")
        self.model_callable = model_callable
        self.system_prompt = system_prompt if system_prompt is not None else SYSTEM_PROMPT

    def process(self, input_data: TranscriptInput) -> MedicalReportOutput:
        """
        Process a single visit transcript and return the validated MedicalReportOutput.

        Args:
            input_data (TranscriptInput): Validated transcript input.

        Returns:
            MedicalReportOutput: Fully validated medical report.
        """
        return extract_medical_report(
            input_data=input_data,
            model_callable=self.model_callable,
            system_prompt=self.system_prompt,
        )
