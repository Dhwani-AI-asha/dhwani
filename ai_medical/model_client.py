"""
ai_medical/model_client.py

Concrete model callable for the extraction engine (Google Gemini version).

The engine only needs: (system_prompt: str, user_prompt: str) -> str.
This file calls the Gemini REST API using only the standard library, so the
rest of the package and its unit tests need no extra packages.
To use another provider (Anthropic, OpenAI, local model), write another
function with the same signature and pass it to ExtractionEngine.

Environment variables:
  LLM_API_KEY   Gemini API key (never log or print it)
  LLM_MODEL     Gemini model ID, copied from Google AI Studio (required)
  LLM_TIMEOUT   request timeout in seconds (default 60)
"""

import json
import os
import time
import urllib.error
import urllib.request

_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models"

# Temporary errors worth retrying: rate limit, server error, overloaded.
_RETRY_CODES = (429, 500, 503)
_MAX_ATTEMPTS = 4  # 1 try + 3 retries, waiting 3s, 6s, 12s


def _error_detail(exc: urllib.error.HTTPError) -> str:
    """Return Google's error message (it never contains the API key)."""
    try:
        body = json.loads(exc.read().decode("utf-8"))
        return str(body.get("error", {}).get("message", ""))[:300]
    except Exception:
        return ""


def call_model(system_prompt: str, user_prompt: str) -> str:
    """Call Gemini with temperature 0 and return the raw text response."""
    api_key = os.getenv("LLM_API_KEY")
    if not api_key:
        raise RuntimeError("LLM_API_KEY is not set.")
    model = os.getenv("LLM_MODEL")
    if not model:
        raise RuntimeError("LLM_MODEL is not set.")
    timeout = float(os.getenv("LLM_TIMEOUT", "60"))

    body = {
        "systemInstruction": {"parts": [{"text": system_prompt}]},
        "contents": [{"role": "user", "parts": [{"text": user_prompt}]}],
        "generationConfig": {"temperature": 0, "topK": 1, "seed": 42, "maxOutputTokens": 4096},
    }
    payload = json.dumps(body).encode("utf-8")
    url = f"{_API_BASE}/{model}:generateContent"
    headers = {"Content-Type": "application/json", "x-goog-api-key": api_key}

    data = None
    for attempt in range(_MAX_ATTEMPTS):
        request = urllib.request.Request(
            url, data=payload, headers=headers, method="POST"
        )
        try:
            with urllib.request.urlopen(request, timeout=timeout) as response:
                data = json.loads(response.read().decode("utf-8"))
            break
        except urllib.error.HTTPError as exc:
            if exc.code in _RETRY_CODES and attempt < _MAX_ATTEMPTS - 1:
                time.sleep(3 * (2 ** attempt))
                continue
            raise RuntimeError(
                f"Model API error (HTTP {exc.code}): {_error_detail(exc)}"
            ) from None
        except (urllib.error.URLError, TimeoutError) as exc:
            raise RuntimeError(
                f"Model API request failed: {type(exc).__name__}: "
                f"{getattr(exc, 'reason', exc)}"
            ) from None

    try:
        parts = data["candidates"][0]["content"]["parts"]
    except (KeyError, IndexError, TypeError):
        raise RuntimeError("Model returned no text (possibly blocked).") from None
    return "".join(part.get("text", "") for part in parts)