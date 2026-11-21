"""
ai_medical/test_model_client_and_voice_correction.py

Unit and API-layer tests for:
- Part 1: Gemini model configuration validation & unavailable-model error handling (MOCKED HTTP / env)
- Part 3, 4, 5: Conversational voice report correction (BP, weight, next visit date,
  adding vaccination status, multiple corrections, ambiguous clarification, preserving
  unrelated fields, spoken read-back regeneration, audit trail, explicit confirmation gating).

NOTE: All LLM HTTP tests in this file use unittest.mock and synthetic data only.
Live Gemini API and live Gnani STT/TTS are NOT called here.
"""

import io
import json
import os
import sys
from pathlib import Path
import unittest
from unittest.mock import MagicMock, patch
import urllib.error

_ROOT = str(Path(__file__).resolve().parent.parent)
if _ROOT not in sys.path:
    sys.path.insert(0, _ROOT)

from ai_medical.extraction_engine import ExtractionEngine
from ai_medical.model_client import (
    ModelAPIError,
    ModelConfigError,
    call_model,
    get_config_status,
    get_model_config,
    normalize_model_name,
)
from ai_medical.service import ServiceError, generate_report_package
from ai_medical.voice_correction import (
    apply_structured_voice_correction,
    classify_utterance_intent,
    extract_field_updates,
)


def _base_anc_report():
    return {
        "patient_name": "Pooja Devi",
        "patient_age": "24 years",
        "patient_gender": "Female",
        "beneficiary_id": "PAT-2026-0002",
        "visit_type": "ANC",
        "next_visit_date": "25 November",
        "chief_complaint": "Routine ANC checkup",
        "symptoms": [
            {"name": "mild headache", "duration": "1 day", "severity": "mild", "body_site": "head", "notes": None}
        ],
        "danger_signs": [],
        "vital_signs_mentioned": {
            "bp": "120/80",
            "weight": "55 kg",
            "pulse": "78 bpm",
        },
        "missing_information": [],
        "professional_review_required": False,
        "summary": "Blood pressure: 120/80. Weight: 55 kg. Visit type: ANC.",
        "notes": None,
        "confirmed": False,
    }


class TestModelConfigurationAndUnavailableHandling(unittest.TestCase):
    """Part 6 Item 1: AI model configuration and unavailable-model error handling (mocked)."""

    def test_missing_api_key_raises_config_error_and_maps_to_model_unavailable(self):
        with patch.dict(os.environ, {}, clear=True):
            with self.assertRaises(ModelConfigError) as cfg_ctx:
                get_model_config()
            self.assertEqual(cfg_ctx.exception.reason, "missing_api_key")

            engine = ExtractionEngine(call_model)
            with self.assertRaises(ServiceError) as svc_ctx:
                generate_report_package("Patient has fever since 2 days.", engine)
            self.assertEqual(svc_ctx.exception.code, "model_unavailable")
            self.assertEqual(svc_ctx.exception.detail, "missing_api_key")

    def test_missing_model_raises_config_error_and_never_leaks_key(self):
        secret_key = "SUPER_SECRET_KEY_123456789"
        with patch.dict(os.environ, {"LLM_API_KEY": secret_key}, clear=True):
            with self.assertRaises(ModelConfigError) as cfg_ctx:
                get_model_config()
            self.assertEqual(cfg_ctx.exception.reason, "missing_model")
            self.assertNotIn(secret_key, str(cfg_ctx.exception))

            status = get_config_status()
            self.assertFalse(status["configured"])
            self.assertTrue(status["has_api_key"])
            self.assertIsNone(status["model"])
            self.assertNotIn(secret_key, json.dumps(status))

    def test_gemini_api_key_fallback_and_models_prefix_normalization(self):
        with patch.dict(
            os.environ,
            {"GEMINI_API_KEY": "test-key-xyz", "LLM_MODEL": "  models/gemini-2.5-flash  "},
            clear=True,
        ):
            api_key, model, timeout = get_model_config()
            self.assertEqual(api_key, "test-key-xyz")
            self.assertEqual(model, "gemini-2.5-flash")
            self.assertEqual(timeout, 60.0)
        self.assertEqual(normalize_model_name("models/gemini-2.0-flash"), "gemini-2.0-flash")

    def test_invalid_model_http_404_classified_as_invalid_model(self):
        err_body = io.BytesIO(
            json.dumps({"error": {"message": "models/bad-model is not found for API version v1beta"}}).encode("utf-8")
        )
        http_err = urllib.error.HTTPError(
            url="https://generativelanguage.googleapis.com/v1beta/models/bad-model:generateContent",
            code=404,
            msg="Not Found",
            hdrs=None,
            fp=err_body,
        )
        with patch.dict(os.environ, {"LLM_API_KEY": "secret-k", "LLM_MODEL": "bad-model"}, clear=True):
            with patch("urllib.request.urlopen", side_effect=http_err):
                with self.assertRaises(ModelAPIError) as api_ctx:
                    call_model("sys", "user")
                self.assertEqual(api_ctx.exception.reason, "invalid_model")
                self.assertNotIn("secret-k", str(api_ctx.exception))

                engine = ExtractionEngine(call_model)
                with self.assertRaises(ServiceError) as svc_ctx:
                    generate_report_package("Patient has cough.", engine)
                self.assertEqual(svc_ctx.exception.code, "model_unavailable")
                self.assertEqual(svc_ctx.exception.detail, "invalid_model")

    def test_auth_error_http_403_classified_safely(self):
        err_body = io.BytesIO(json.dumps({"error": {"message": "API key not valid."}}).encode("utf-8"))
        http_err = urllib.error.HTTPError(url="https://example.invalid", code=403, msg="Forbidden", hdrs=None, fp=err_body)
        with patch.dict(os.environ, {"LLM_API_KEY": "bad-secret-key", "LLM_MODEL": "gemini-2.5-flash"}, clear=True):
            with patch("urllib.request.urlopen", side_effect=http_err):
                engine = ExtractionEngine(call_model)
                with self.assertRaises(ServiceError) as svc_ctx:
                    generate_report_package("Patient has fever.", engine)
                self.assertEqual(svc_ctx.exception.code, "model_unavailable")
                self.assertEqual(svc_ctx.exception.detail, "auth_error")
                self.assertNotIn("bad-secret-key", str(svc_ctx.exception))

    def test_seed_400_retries_without_seed_and_succeeds(self):
        seed_err = urllib.error.HTTPError(
            url="https://example.invalid",
            code=400,
            msg="Bad Request",
            hdrs=None,
            fp=io.BytesIO(json.dumps({"error": {"message": "Unknown name 'seed' at generation_config"}}).encode("utf-8")),
        )
        ok_resp = MagicMock()
        ok_resp.__enter__.return_value.read.return_value = json.dumps(
            {"candidates": [{"content": {"parts": [{"text": '{"ok": true}'}]}}]}
        ).encode("utf-8")

        with patch.dict(os.environ, {"LLM_API_KEY": "k", "LLM_MODEL": "gemini-1.5-flash"}, clear=True):
            with patch("urllib.request.urlopen", side_effect=[seed_err, ok_resp]) as mocked_open:
                text = call_model("sys", "usr")
                self.assertEqual(text, '{"ok": true}')
                self.assertEqual(mocked_open.call_count, 2)
                second_req = mocked_open.call_args_list[1][0][0]
                sent_body = json.loads(second_req.data.decode("utf-8"))
                self.assertNotIn("seed", sent_body["generationConfig"])


class TestConversationalVoiceReportCorrection(unittest.TestCase):
    """Part 6 Items 5-11, 13, 14: Structured conversational voice corrections."""

    def test_item5_bp_correction_120_80_to_110_90_and_preserves_unrelated_fields(self):
        """Example 1 & Item 5 & Item 11: 'Nahi, BP 110/90 hai.' updates BP only."""
        original = _base_anc_report()
        res = apply_structured_voice_correction(
            current_report=original,
            utterance="Nahi, BP 110/90 hai.",
            transcript="Pooja Devi ANC visit, BP 120/80, weight 55 kg.",
            source="voice",
        )
        self.assertTrue(res["ok"])
        self.assertEqual(res["action"], "updated")
        self.assertFalse(res["confirmed"])
        # Structured source of truth updated
        self.assertEqual(res["report"]["vital_signs_mentioned"]["bp"], "110/90")
        # Unrelated fields strictly preserved (Item 11)
        self.assertEqual(res["report"]["vital_signs_mentioned"]["weight"], "55 kg")
        self.assertEqual(res["report"]["vital_signs_mentioned"]["pulse"], "78 bpm")
        self.assertEqual(res["report"]["visit_type"], "ANC")
        self.assertEqual(res["report"]["next_visit_date"], "25 November")
        self.assertEqual(res["report"]["beneficiary_id"], "PAT-2026-0002")
        self.assertEqual(res["report"]["patient_name"], "Pooja Devi")
        self.assertEqual(res["report"]["symptoms"], original["symptoms"])
        # Original object not mutated
        self.assertEqual(original["vital_signs_mentioned"]["bp"], "120/80")
        # Audit trail captured
        self.assertEqual(len(res["changes"]), 1)
        self.assertEqual(res["changes"][0]["field"], "blood_pressure")
        self.assertEqual(res["changes"][0]["original_value"], "120/80")
        self.assertEqual(res["changes"][0]["corrected_value"], "110/90")
        self.assertEqual(res["changes"][0]["source"], "voice")
        self.assertTrue(res["changes"][0]["timestamp"].endswith("Z"))
        # Item 13: Updated report read aloud includes 110/90 and confirmation question
        self.assertIn("110/90", res["narration_speech"])
        self.assertNotIn("120/80", res["narration_speech"])
        self.assertIn("110/90", res["assistant_reply_speech"])
        self.assertTrue(len(res["confirmation_prompt"]) > 0)

    def test_item5_bp_replacement_phrasing_bp_nahi_110_90(self):
        """Example 4: 'BP nahi, 110/90.' replaces BP with 110/90."""
        res = apply_structured_voice_correction(_base_anc_report(), "BP nahi, 110/90.")
        self.assertEqual(res["action"], "updated")
        self.assertEqual(res["report"]["vital_signs_mentioned"]["bp"], "110/90")
        self.assertEqual(res["report"]["vital_signs_mentioned"]["weight"], "55 kg")

    def test_item5_bp_correction_hindi_devanagari_bata(self):
        """Hindi Devanagari BP correction: 'नहीं, बीपी 110 बटा 90 है।'"""
        res = apply_structured_voice_correction(_base_anc_report(), "नहीं, बीपी 110 बटा 90 है।")
        self.assertEqual(res["action"], "updated")
        self.assertEqual(res["report"]["vital_signs_mentioned"]["bp"], "110/90")
        self.assertEqual(res["narration_language"], "hi")
        self.assertIn("110 बटा 90", res["assistant_reply_speech"])

    def test_item6_weight_correction(self):
        """Example 2 & Item 6: 'Weight 58 kg hai.' updates weight to 58 kg, preserves BP."""
        res = apply_structured_voice_correction(_base_anc_report(), "Weight 58 kg hai.")
        self.assertEqual(res["action"], "updated")
        self.assertEqual(res["report"]["vital_signs_mentioned"]["weight"], "58 kg")
        self.assertEqual(res["report"]["vital_signs_mentioned"]["bp"], "120/80")
        self.assertEqual(res["changes"][0]["field"], "weight")
        self.assertEqual(res["changes"][0]["original_value"], "55 kg")
        self.assertEqual(res["changes"][0]["corrected_value"], "58 kg")
        self.assertIn("58 kg", res["narration_speech"])

    def test_item7_next_visit_date_correction(self):
        """Example 3 & Item 7: 'Next visit 28 November ko hai.' updates next_visit_date."""
        res = apply_structured_voice_correction(_base_anc_report(), "Next visit 28 November ko hai.")
        self.assertEqual(res["action"], "updated")
        self.assertEqual(res["report"]["next_visit_date"], "28 November")
        self.assertEqual(res["report"]["vital_signs_mentioned"]["bp"], "120/80")
        self.assertEqual(res["report"]["vital_signs_mentioned"]["weight"], "55 kg")
        self.assertEqual(res["changes"][0]["original_value"], "25 November")
        self.assertEqual(res["changes"][0]["corrected_value"], "28 November")
        self.assertIn("28 November", res["narration_speech"])

    def test_item8_add_vaccination_status_through_voice(self):
        """Example 5 & Item 8: Add TT injection vaccination status only when explicitly stated."""
        res = apply_structured_voice_correction(
            _base_anc_report(),
            "Report mein vaccination status bhi add karo. TT injection diya gaya hai.",
        )
        self.assertEqual(res["action"], "updated")
        self.assertEqual(res["report"]["vaccination_status"], "TT injection administered")
        self.assertEqual(res["changes"][0]["field"], "vaccination_status")
        self.assertIsNone(res["changes"][0]["original_value"])
        self.assertEqual(res["changes"][0]["corrected_value"], "TT injection administered")
        # Unrelated fields untouched
        self.assertEqual(res["report"]["vital_signs_mentioned"]["bp"], "120/80")
        self.assertIn("TT injection administered", res["narration_speech"])

    def test_item8_negative_vaccination_statement_not_marked_given(self):
        """Safety: 'TT injection nahi diya gaya hai' must NOT mark vaccination as administered."""
        res = apply_structured_voice_correction(
            _base_anc_report(),
            "Vaccination status add karo: TT injection nahi diya gaya hai.",
        )
        self.assertEqual(res["action"], "updated")
        self.assertIn("not given", res["report"]["vaccination_status"].lower())

    def test_item9_and_14_multiple_corrections_in_one_session_and_explicit_confirmation(self):
        """Items 9, 11, 13, 14: Sequential BP -> Weight -> Next Visit -> Vaccination -> Confirm."""
        report = _base_anc_report()
        transcript = "Pooja Devi ANC visit, BP 120/80, weight 55 kg, next visit 25 November."

        # Turn 1: Correct BP
        r1 = apply_structured_voice_correction(report, "Nahi, BP 110/90 hai.", transcript=transcript)
        self.assertEqual(r1["action"], "updated")
        self.assertFalse(r1["confirmed"])

        # Turn 2: Correct weight
        r2 = apply_structured_voice_correction(r1["report"], "Weight 58 kg hai.", transcript=r1["transcript_used"])
        self.assertEqual(r2["action"], "updated")
        self.assertFalse(r2["confirmed"])

        # Turn 3: Correct next visit date
        r3 = apply_structured_voice_correction(
            r2["report"], "Next visit 28 November ko hai.", transcript=r2["transcript_used"]
        )
        self.assertEqual(r3["action"], "updated")
        self.assertFalse(r3["confirmed"])

        # Turn 4: Add vaccination status
        r4 = apply_structured_voice_correction(
            r3["report"],
            "Report mein vaccination status bhi add karo. TT injection diya gaya hai.",
            transcript=r3["transcript_used"],
        )
        self.assertEqual(r4["action"], "updated")
        self.assertFalse(r4["confirmed"])

        # Verify all 4 corrections accumulated cleanly and unrelated fields remained intact
        final_draft = r4["report"]
        self.assertEqual(final_draft["vital_signs_mentioned"]["bp"], "110/90")
        self.assertEqual(final_draft["vital_signs_mentioned"]["weight"], "58 kg")
        self.assertEqual(final_draft["next_visit_date"], "28 November")
        self.assertEqual(final_draft["vaccination_status"], "TT injection administered")
        self.assertEqual(final_draft["visit_type"], "ANC")
        self.assertEqual(final_draft["beneficiary_id"], "PAT-2026-0002")
        self.assertEqual(len(final_draft["correction_history"]), 4)
        self.assertEqual(
            [c["field"] for c in final_draft["correction_history"]],
            ["blood_pressure", "weight", "next_visit_date", "vaccination_status"],
        )
        # Still NOT confirmed until worker explicitly confirms (Item 14)
        self.assertFalse(final_draft["confirmed"])

        # Turn 5: Explicit confirmation
        r5 = apply_structured_voice_correction(final_draft, "Haan, correct hai.", transcript=r4["transcript_used"])
        self.assertEqual(r5["action"], "confirmed")
        self.assertTrue(r5["confirmed"])
        self.assertTrue(r5["report"]["confirmed"])
        self.assertIsNotNone(r5["report"].get("confirmed_at"))
        self.assertEqual(len(r5["correction_history"]), 4)

    def test_item10_ambiguous_correction_asks_clarification_and_mutates_nothing(self):
        """Part 4D & Item 10: 'Nahi, woh galat hai.' -> asks clarification, leaves all fields unchanged."""
        original = _base_anc_report()
        res = apply_structured_voice_correction(original, "Nahi, woh galat hai.")
        self.assertEqual(res["action"], "clarify")
        self.assertFalse(res["confirmed"])
        self.assertEqual(res["changes"], [])
        self.assertIn("Kaunsi information correct karni hai?", res["assistant_reply"])
        self.assertEqual(res["report"]["vital_signs_mentioned"], original["vital_signs_mentioned"])
        self.assertEqual(res["report"]["next_visit_date"], original["next_visit_date"])
        self.assertEqual(res["report"]["visit_type"], original["visit_type"])

    def test_item10_field_mentioned_without_value_asks_targeted_clarification(self):
        """'BP galat hai' without a value must clarify rather than invent a BP reading."""
        res = apply_structured_voice_correction(_base_anc_report(), "Nahi, BP galat hai.")
        self.assertEqual(res["action"], "clarify")
        self.assertFalse(res["confirmed"])
        self.assertEqual(res["report"]["vital_signs_mentioned"]["bp"], "120/80")
        self.assertIn("blood pressure", res["assistant_reply"].lower())

    def test_affirmative_plus_correction_is_treated_as_correction_not_confirm(self):
        intent, updates = classify_utterance_intent("Haan, lekin BP 110/90 hai")
        self.assertEqual(intent, "correction")
        self.assertEqual(updates["blood_pressure"], "110/90")

    def test_report_api_endpoint_handlers_work_directly(self):
        """Verify voice/report_api.py route functions return safe errors and voice corrections."""
        import voice.report_api as report_api

        # 1. Missing LLM credentials -> safe 400 with error='model_unavailable' and safe reason
        with patch.dict(os.environ, {}, clear=True):
            with patch.object(report_api, "_load_project_env", lambda: None):
                resp = report_api.report(report_api.ReportRequest(transcript="Pooja Devi has fever."))
                self.assertEqual(resp.status_code, 400)
                body = json.loads(resp.body.decode("utf-8"))
                self.assertEqual(body["ok"], False)
                self.assertEqual(body["error"], "model_unavailable")
                self.assertEqual(body["reason"], "missing_api_key")
                self.assertIn("preserved", body["message"].lower())

        # 2. Voice correction endpoint updates BP and keeps confirmed=False
        vc_resp = report_api.report_voice_correct(
            report_api.VoiceCorrectionRequest(
                current_report=_base_anc_report(),
                utterance="Nahi, BP 110/90 hai.",
                transcript="BP 120/80, weight 55 kg.",
                source="voice",
            )
        )
        self.assertTrue(vc_resp["ok"])
        self.assertEqual(vc_resp["action"], "updated")
        self.assertEqual(vc_resp["report"]["vital_signs_mentioned"]["bp"], "110/90")
        self.assertFalse(vc_resp["confirmed"])


if __name__ == "__main__":
    unittest.main()
