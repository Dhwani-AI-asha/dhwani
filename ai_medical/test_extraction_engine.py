"""
ai_medical/test_extraction_engine.py

Unit tests for Dhwani AI's model-independent extraction engine (extraction_engine.py).
Tests end-to-end pipeline execution with mock AI callables:
- Valid report generation (plain and markdown-wrapped JSON).
- Rejection of malformed JSON.
- Rejection of schema violations.
- Rejection of fabricated danger-sign evidence.
- Handling of model invocation failures and timeouts.
- Prompt construction and verbatim transcript preservation.
"""

import json
import unittest

try:
    from ai_medical.schemas import MedicalReportOutput, TranscriptInput
    from ai_medical.prompts import SYSTEM_PROMPT
    from ai_medical.validation import (
        EvidenceValidationError,
        JSONParseError,
        SchemaValidationError,
    )
    from ai_medical.extraction_engine import (
        ExtractionEngine,
        ModelInvocationError,
        extract_medical_report,
        format_user_prompt,
    )
except ImportError:
    from schemas import MedicalReportOutput, TranscriptInput
    from prompts import SYSTEM_PROMPT
    from validation import (
        EvidenceValidationError,
        JSONParseError,
        SchemaValidationError,
    )
    from extraction_engine import (
        ExtractionEngine,
        ModelInvocationError,
        extract_medical_report,
        format_user_prompt,
    )


class TestExtractionEngine(unittest.TestCase):
    """
    Test suite for extraction engine using synthetic data and mock AI callables.
    """

    def setUp(self):
        """Set up standard synthetic transcript inputs and response fixtures."""
        self.raw_transcript = (
            "Namaste didi, mujhe 2 din se tez bukhar hai aur saans lene me bahut zyada dikkat ho rahi hai."
        )
        self.input_data = TranscriptInput(
            raw_text=self.raw_transcript,
            visit_id="VISIT-ASHA-001",
            patient_id="PAT-999",
            language="hi-Latn",
        )

        self.valid_response_dict = {
            "patient_name": None,
            "patient_age": None,
            "patient_gender": None,
            "chief_complaint": "tez bukhar aur saans lene me dikkat",
            "symptoms": [
                {
                    "name": "fever",
                    "duration": "2 din",
                    "severity": "tez bukhar",
                    "body_site": None,
                    "notes": "Patient reported tez bukhar",
                }
            ],
            "danger_signs": [
                {
                    "sign": "Severe breathing difficulty",
                    "evidence": "saans lene me bahut zyada dikkat ho rahi hai",
                    "is_present": True,
                    "urgency_level": "high",
                }
            ],
            "vital_signs_mentioned": None,
            "missing_information": [
                {
                    "field_name": "temperature_reading",
                    "reason": "Exact temperature was not measured.",
                    "prompt_question": "Kya bukhar thermometer se naapa tha?",
                    "importance": "high",
                }
            ],
            "professional_review_required": True,
            "summary": "Patient reports high fever for 2 days and severe breathing difficulty.",
            "notes": None,
        }
        self.valid_json_response = json.dumps(self.valid_response_dict)

    def test_valid_output_extraction_functional(self):
        """
        Test 1: Verify extract_medical_report succeeds with a valid mock model callable
        returning plain JSON, yielding a valid MedicalReportOutput.
        """
        def mock_model(system_prompt: str, user_prompt: str) -> str:
            return self.valid_json_response

        report = extract_medical_report(self.input_data, mock_model)

        self.assertIsInstance(report, MedicalReportOutput)
        self.assertEqual(report.chief_complaint, "tez bukhar aur saans lene me dikkat")
        self.assertEqual(len(report.symptoms), 1)
        self.assertEqual(report.symptoms[0].name, "fever")
        self.assertEqual(len(report.danger_signs), 1)
        self.assertEqual(
            report.danger_signs[0].evidence,
            "saans lene me bahut zyada dikkat ho rahi hai",
        )
        self.assertTrue(report.professional_review_required)

    def test_valid_output_with_markdown_fences_and_class_engine(self):
        """
        Test 2: Verify ExtractionEngine class interface processes markdown-wrapped JSON
        (```json ... ```) correctly.
        """
        markdown_wrapped = f"```json\n{self.valid_json_response}\n```"

        def mock_model(system_prompt: str, user_prompt: str) -> str:
            return markdown_wrapped

        engine = ExtractionEngine(model_callable=mock_model)
        report = engine.process(self.input_data)

        self.assertIsInstance(report, MedicalReportOutput)
        self.assertEqual(report.summary, self.valid_response_dict["summary"])

    def test_invalid_json_raises_json_parse_error(self):
        """
        Test 3: Verify that an AI model returning malformed/non-JSON text
        raises JSONParseError.
        """
        def broken_model(system_prompt: str, user_prompt: str) -> str:
            return "Sorry, I cannot provide medical information. Please consult a doctor."

        with self.assertRaises(JSONParseError):
            extract_medical_report(self.input_data, broken_model)

    def test_invalid_schema_raises_schema_validation_error(self):
        """
        Test 4: Verify that an AI model returning JSON missing required fields
        (e.g., missing 'summary') raises SchemaValidationError.
        """
        bad_dict = dict(self.valid_response_dict)
        del bad_dict["summary"]

        def invalid_schema_model(system_prompt: str, user_prompt: str) -> str:
            return json.dumps(bad_dict)

        with self.assertRaises(SchemaValidationError):
            extract_medical_report(self.input_data, invalid_schema_model)

    def test_fabricated_danger_sign_evidence_raises_evidence_error(self):
        """
        Test 5: Verify that when the AI invents or hallucinates danger-sign evidence
        not found verbatim in the transcript, EvidenceValidationError is raised.
        """
        hallucinated_dict = json.loads(self.valid_json_response)
        hallucinated_dict["danger_signs"][0]["evidence"] = (
            "patient has bluish lips and uncontrolled convulsions"
        )

        def hallucinating_model(system_prompt: str, user_prompt: str) -> str:
            return json.dumps(hallucinated_dict)

        with self.assertRaises(EvidenceValidationError) as ctx:
            extract_medical_report(self.input_data, hallucinating_model)

        self.assertIn("was not found verbatim", str(ctx.exception))

    def test_model_failure_raises_model_invocation_error(self):
        """
        Test 6: Verify that when the AI callable throws an exception
        (e.g., network error, timeout, crash), ModelInvocationError is raised.
        """
        def failing_model(system_prompt: str, user_prompt: str) -> str:
            raise ConnectionError("Gnani AI API endpoint unreachable.")

        with self.assertRaises(ModelInvocationError) as ctx:
            extract_medical_report(self.input_data, failing_model)

        self.assertIn("Gnani AI API endpoint unreachable", str(ctx.exception))

    def test_empty_model_response_raises_model_invocation_error(self):
        """
        Test 7: Verify that an empty or whitespace-only response from the AI
        raises ModelInvocationError.
        """
        def empty_model(system_prompt: str, user_prompt: str) -> str:
            return "   \n  "

        with self.assertRaises(ModelInvocationError):
            extract_medical_report(self.input_data, empty_model)

    def test_transcript_preservation_and_prompt_formatting(self):
        """
        Test 8: Verify that the exact original transcript and metadata
        are passed into the model callable without modification or loss.
        """
        captured_prompts = {}

        def inspecting_model(system_prompt: str, user_prompt: str) -> str:
            captured_prompts["system"] = system_prompt
            captured_prompts["user"] = user_prompt
            return self.valid_json_response

        extract_medical_report(self.input_data, inspecting_model)

        # 1. System prompt matches the official SYSTEM_PROMPT exactly
        self.assertEqual(captured_prompts["system"], SYSTEM_PROMPT)

        # 2. User prompt contains exact transcript text verbatim
        self.assertIn(self.raw_transcript, captured_prompts["user"])

        # 3. User prompt contains exact metadata
        self.assertIn("Visit ID: VISIT-ASHA-001", captured_prompts["user"])
        self.assertIn("Patient ID: PAT-999", captured_prompts["user"])
        self.assertIn("Recorded Language: hi-Latn", captured_prompts["user"])

        # 4. Transcript is positioned under the untrusted dialogue section header
        header = "[Transcript Content - Untrusted Patient Dialogue]"
        self.assertIn(header, captured_prompts["user"])
        self.assertGreater(
            captured_prompts["user"].find(self.raw_transcript),
            captured_prompts["user"].find(header),
        )

    def test_input_type_validation(self):
        """
        Test 9: Verify that invalid input types for input_data or model_callable
        raise TypeError with clear descriptions.
        """
        # Non-TranscriptInput
        with self.assertRaises(TypeError):
            extract_medical_report("not a transcript input", lambda s, u: "")  # type: ignore

        # Non-callable model
        with self.assertRaises(TypeError):
            extract_medical_report(self.input_data, "not-a-callable")  # type: ignore


if __name__ == "__main__":
    unittest.main()
