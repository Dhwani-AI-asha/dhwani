import sys
from pathlib import Path
from typing import Optional

# Ensure project root is in sys.path when running from the voice/ folder
_project_root = str(Path(__file__).resolve().parent.parent)
if _project_root not in sys.path:
    sys.path.insert(0, _project_root)

from dotenv import load_dotenv

_env_path = Path(__file__).resolve().parent.parent / ".env"
if _env_path.exists():
    load_dotenv(dotenv_path=_env_path)
else:
    load_dotenv()

from fastapi import APIRouter
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from ai_medical.extraction_engine import ExtractionEngine
from ai_medical.model_client import call_model
from ai_medical.service import (
    ServiceError,
    correct_report_package,
    generate_report_package,
)

# Module-level extraction engine
engine = ExtractionEngine(call_model)
extraction_engine = engine

router = APIRouter()


class ReportRequest(BaseModel):
    transcript: str
    language: Optional[str] = None


class ReportCorrectRequest(BaseModel):
    transcript: str
    correction: str
    language: Optional[str] = None


@router.post("/report")
def report(req: ReportRequest):
    try:
        return generate_report_package(
            transcript=req.transcript,
            engine=engine,
            language=req.language,
        )
    except ServiceError as err:
        print("SERVICE ERROR:", err.code, repr(err.__cause__), repr(err.__context__))
        return JSONResponse(
            status_code=400,
            content={"ok": False, "error": err.code},
        )


@router.post("/report/correct")
def report_correct(req: ReportCorrectRequest):
    try:
        return correct_report_package(
            transcript=req.transcript,
            correction=req.correction,
            engine=engine,
            language=req.language,
        )
    except ServiceError as err:
        print("SERVICE ERROR:", err.code, repr(err.__cause__), repr(err.__context__))
        return JSONResponse(
            status_code=400,
            content={"ok": False, "error": err.code},
        )


generate_report = report
correct_report = report_correct
