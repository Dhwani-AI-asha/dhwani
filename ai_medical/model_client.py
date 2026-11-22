"""
ai_medical/model_client.py

Concrete model callable for the extraction engine (Google Gemini version).

The engine only needs: (system_prompt: str, user_prompt: str) -> str.
This file calls the Gemini REST API using only the standard library, so the
rest of the package and its unit tests need no extra packages.
To use another provider (Anthropic, OpenAI, local model), write another
function with the same signature and pass it to ExtractionEngine.

Environment variables:
  LLM_API_KEY   Gemini API key (never log or print it; also falls back to
                GEMINI_API_KEY or GOOGLE_API_KEY if LLM_API_KEY is unset)
  LLM_MODEL     Gemini model ID, copied from Google AI Studio (required;
                a leading "models/" prefix is normalized automatically)
  LLM_TIMEOUT   request timeout in seconds (default 60)
"""

import json
import os
import re
import time
import urllib.error
import urllib.request
from typing import Dict, Optional, Tuple

_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models"

# Temporary errors worth retrying: rate limit, server error, overloaded.
_RETRY_CODES = (429, 500, 503)
_MAX_ATTEMPTS = 4  # 1 try + 3 retries, waiting 3s, 6s, 12s
_VALID_MODEL_RE = re.compile(r"^[A-Za-z0-9._-]+$")


class ModelConfigError(RuntimeError):
    """Raised when required LLM configuration is missing or malformed."""

    def __init__(self, reason: str, message: str):
        super().__init__(message)
        self.reason = reason


class ModelAPIError(RuntimeError):
    """Raised when the upstream Gemini API request fails."""

    def __init__(self, reason: str, message: str, status_code: Optional[int] = None):
        super().__init__(message)
        self.reason = reason
        self.status_code = status_code


def normalize_model_name(raw_model: Optional[str]) -> str:
    """Trim whitespace and strip an optional leading 'models/' prefix."""
    model = (raw_model or "").strip()
    if model.startswith("models/"):
        model = model[len("models/"):].strip()
    return model


def get_model_config() -> Tuple[str, str, float]:
    """
    Read and validate Gemini configuration from environment variables.

    Returns (api_key, normalized_model_id, timeout_seconds).
    Never includes API key values in error messages.
    """
    api_key = (
        os.getenv("LLM_API_KEY")
        or os.getenv("GEMINI_API_KEY")
        or os.getenv("GOOGLE_API_KEY")
        or ""
    ).strip()
    if not api_key:
        raise ModelConfigError("missing_api_key", "LLM_API_KEY is not set.")

    model = normalize_model_name(os.getenv("LLM_MODEL"))
    if not model:
        raise ModelConfigError("missing_model", "LLM_MODEL is not set.")
    if not _VALID_MODEL_RE.match(model):
        raise ModelConfigError("invalid_model", "LLM_MODEL contains invalid characters.")

    raw_timeout = (os.getenv("LLM_TIMEOUT") or "60").strip()
    try:
        timeout = float(raw_timeout)
        if timeout <= 0:
            raise ValueError("Timeout must be positive.")
    except ValueError:
        raise ModelConfigError("invalid_timeout", "LLM_TIMEOUT must be a positive number.") from None

    return api_key, model, timeout


def get_config_status() -> Dict[str, Optional[object]]:
    """Return safe, non-secret configuration diagnostics (never exposes API keys)."""
    has_api_key = bool(
        (os.getenv("LLM_API_KEY") or os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY") or "").strip()
    )
    model = normalize_model_name(os.getenv("LLM_MODEL")) or None
    model_valid = bool(model and _VALID_MODEL_RE.match(model))
    missing = []
    if not has_api_key:
        missing.append("LLM_API_KEY")
    if not model:
        missing.append("LLM_MODEL")
    elif not model_valid:
        missing.append("LLM_MODEL (invalid format)")
    return {
        "configured": has_api_key and model_valid,
        "provider": "google_gemini",
        "has_api_key": has_api_key,
        "model": model,
        "missing": missing,
    }


def _error_detail(exc: urllib.error.HTTPError) -> str:
    """Return Google's error message (it never contains the API key)."""
    try:
        body = json.loads(exc.read().decode("utf-8"))
        return str(body.get("error", {}).get("message", ""))[:300]
    except Exception:
        return ""


def _classify_http_error(status_code: int, detail: str) -> str:
    """Map an HTTP status from Gemini to a safe diagnostic reason code."""
    lower = detail.lower()
    if status_code in (401, 403):
        return "auth_error"
    if status_code == 404 or "not found" in lower or "is not supported for generatecontent" in lower:
        return "invalid_model"
    if status_code == 429:
        return "rate_limited"
    if status_code == 400 and ("api key" in lower or "api_key" in lower):
        return "auth_error"
    if status_code >= 500:
        return "provider_error"
    return "provider_error"


def call_model(system_prompt: str, user_prompt: str) -> str:
    """Call Gemini with temperature 0 and return the raw text response."""
    api_key, model, timeout = get_model_config()

    generation_config: Dict[str, object] = {
        "temperature": 0,
        "topK": 1,
        "seed": 42,
        "maxOutputTokens": 4096,
    }

    def _build_payload(gen_cfg: Dict[str, object]) -> bytes:
        body = {
            "systemInstruction": {"parts": [{"text": system_prompt}]},
            "contents": [{"role": "user", "parts": [{"text": user_prompt}]}],
            "generationConfig": gen_cfg,
        }
        return json.dumps(body).encode("utf-8")

    payload = _build_payload(generation_config)
    url = f"{_API_BASE}/{model}:generateContent"
    headers = {"Content-Type": "application/json", "x-goog-api-key": api_key}

    data = None
    retried_without_seed = False
    for attempt in range(_MAX_ATTEMPTS):
        request = urllib.request.Request(
            url, data=payload, headers=headers, method="POST"
        )
        try:
            with urllib.request.urlopen(request, timeout=timeout) as response:
                data = json.loads(response.read().decode("utf-8"))
            break
        except urllib.error.HTTPError as exc:
            detail = _error_detail(exc)
            # Some Gemini model revisions reject 'seed' in generationConfig; retry once without it.
            if exc.code == 400 and "seed" in detail.lower() and not retried_without_seed:
                retried_without_seed = True
                fallback_cfg = {k: v for k, v in generation_config.items() if k != "seed"}
                payload = _build_payload(fallback_cfg)
                continue
            if exc.code in _RETRY_CODES and attempt < _MAX_ATTEMPTS - 1:
                time.sleep(3 * (2 ** attempt))
                continue
            reason = _classify_http_error(exc.code, detail)
            raise ModelAPIError(
                reason=reason,
                message=f"Model API error (HTTP {exc.code}): {detail}",
                status_code=exc.code,
            ) from None
        except (urllib.error.URLError, TimeoutError) as exc:
            raise ModelAPIError(
                reason="network_error",
                message=(
                    f"Model API request failed: {type(exc).__name__}: "
                    f"{getattr(exc, 'reason', exc)}"
                ),
            ) from None

    try:
        parts = data["candidates"][0]["content"]["parts"]
    except (KeyError, IndexError, TypeError):
        raise ModelAPIError(
            reason="empty_response",
            message="Model returned no text (possibly blocked).",
        ) from None
    return "".join(part.get("text", "") for part in parts)