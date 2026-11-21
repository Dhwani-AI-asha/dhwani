import os
import sys
from pathlib import Path
from typing import Any, Dict, Optional

# Ensure project root is in sys.path when running from the voice/ folder
_project_root = str(Path(__file__).resolve().parent.parent)
if _project_root not in sys.path:
    sys.path.insert(0, _project_root)

try:
    from dotenv import load_dotenv as _dotenv_load
except ImportError:
    _dotenv_load = None

_env_path = Path(__file__).resolve().parent.parent / ".env"


def _load_project_env() -> None:
    """Load missing environment variables from project root .env without overriding shell env."""
    if _dotenv_load is not None:
        if _env_path.exists():
            _dotenv_load(dotenv_path=_env_path, override=False)
        else:
            _dotenv_load(override=False)
        return

    # Pure-stdlib fallback when python-dotenv is not installed in the active venv
    if not _env_path.exists():
        return
    try:
        for raw_line in _env_path.read_text(encoding="utf-8").splitlines():
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, val = line.split("=", 1)
            key = key.strip()
            val = val.strip().strip('"').strip("'")
            if key and val and key not in os.environ:
                os.environ[key] = val
    except OSError:
        pass


_load_project_env()

from fastapi import APIRouter
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from ai_medical.correction import CorrectionError
from ai_medical.extraction_engine import ExtractionEngine
from ai_medical.model_client import call_model, get_config_status
from ai_medical.service import (
    SAFE_REASON_MESSAGES,
    ServiceError,
    correct_report_package,
    generate_report_package,
)
from ai_medical.voice_correction import (
    apply_structured_voice_correction,
    build_confirmation_question,
)

# Module-level extraction engine
engine = ExtractionEngine(call_model)
extraction_engine = engine

router = APIRouter()


class ReportRequest(BaseModel):
    transcript: str
    language: Optional[str] = None
    selected_patient_name: Optional[str] = None


class ReportCorrectRequest(BaseModel):
    transcript: str
    correction: str
    language: Optional[str] = None
    selected_patient_name: Optional[str] = None


class VoiceCorrectionRequest(BaseModel):
    current_report: Dict[str, Any]
    utterance: str
    transcript: Optional[str] = None
    language: Optional[str] = None
    source: str = "voice"
    selected_patient_name: Optional[str] = None


def _safe_error_response(err: ServiceError) -> JSONResponse:
    """Build a safe JSON error response without exposing transcript text or API keys."""
    safe_reason = err.detail if isinstance(err.detail, str) and err.detail in SAFE_REASON_MESSAGES else None
    # Log only safe error codes (never raw exception causes, transcripts, or credentials)
    print("SERVICE ERROR:", err.code, safe_reason or "")
    content: Dict[str, Any] = {"ok": False, "error": err.code}
    if safe_reason:
        content["reason"] = safe_reason
        content["message"] = SAFE_REASON_MESSAGES[safe_reason]
    return JSONResponse(status_code=400, content=content)


@router.get("/report/status")
def report_status():
    """Safe, non-secret status check for AI report model configuration."""
    _load_project_env()
    return get_config_status()


@router.post("/report")
def report(req: ReportRequest):
    _load_project_env()
    try:
        pkg = generate_report_package(
            transcript=req.transcript,
            engine=engine,
            language=req.language,
            selected_patient_name=req.selected_patient_name,
        )
        lang = pkg.get("narration_language", "en")
        pkg["confirmation_prompt"] = build_confirmation_question(lang, updated=False)
        pkg["confirmed"] = False
        return pkg
    except ServiceError as err:
        return _safe_error_response(err)


@router.post("/report/correct")
def report_correct(req: ReportCorrectRequest):
    _load_project_env()
    try:
        pkg = correct_report_package(
            transcript=req.transcript,
            correction=req.correction,
            engine=engine,
            language=req.language,
            selected_patient_name=req.selected_patient_name,
        )
        lang = pkg.get("narration_language", "en")
        pkg["confirmation_prompt"] = build_confirmation_question(lang, updated=True)
        pkg["confirmed"] = False
        return pkg
    except ServiceError as err:
        return _safe_error_response(err)


@router.post("/report/voice-correct")
def report_voice_correct(req: VoiceCorrectionRequest):
    """
    Conversational structured voice report correction endpoint.
    Updates structured visit fields directly, preserves unrelated fields,
    handles ambiguous utterances with clarification questions, tracks audit history,
    and requires explicit worker confirmation before marking the report final.
    """
    try:
        return apply_structured_voice_correction(
            current_report=req.current_report,
            utterance=req.utterance,
            transcript=req.transcript,
            language=req.language,
            source=req.source,
            selected_patient_name=req.selected_patient_name,
        )
    except CorrectionError as err:
        print("VOICE CORRECTION ERROR:", err.code)
        return JSONResponse(
            status_code=400,
            content={"ok": False, "error": err.code},
        )


generate_report = report
correct_report = report_correct
