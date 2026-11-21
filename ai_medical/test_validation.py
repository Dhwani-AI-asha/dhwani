"""
ai_medical/test_validation.py

Unit tests for Dhwani AI's standalone report validation layer (validation.py).
Tests JSON parsing, Markdown code fence extraction, schema validation,
verbatim transcript evidence verification, and agreed output structure.
All tests use synthetic data only.
"""

import json
import unittest

try:
    from ai_medical.schemas import DangerSign, MedicalReportOutput
    from ai_medical.validation import (
        EvidenceValidationError,
        JSONParseError,
        ReportValidationError,
        SchemaValidationError,
        extract_json_str,
        parse_report_json,
        validate_danger_sign_evidence,
        validate_medical_report,
    )
except ImportError:
    from schemas import DangerSign, MedicalReportOutput
    from validation import (
        EvidenceValidationError,
        JSONParseError,
        ReportValidationError,
        SchemaValidationError,
        extract_json_str,
        parse_report_json,
        validate_danger_sign_evidence,
        validate_medical_report,
    )


class TestReportValidation(unittest.TestCase):
    """
    Test suite for report parsing, schema validation, and verbatim evidence verification.
    """

    def setUp(self):
        """Set up standard synthetic transcripts and JSON payloads."""
        self.synthetic_transcript = (
            "Namaste didi, mujhe 2 din se tez bukhar hai aur chhati me dard bahut zyada ho raha hai. "
            "Saans lene me dikkat ho rahi hai."
        )

        self.valid_report_dict = {
            "patient_name": None,
            "patient_age": None,
            "patient_gender": None,
            "chief_complaint": "chhati me dard aur tez bukhar",
            "symptoms": [
                {
                    "name": "fever",
                    "duration": "2 din",
                    "severity": "tez bukhar",
                    "body_site": None,
                    "notes": "Patient reported tez bukhar"
                }
            ],
            "danger_signs": [
                {
                    "sign": "Chest pain",
                    "evidence": "chhati me dard bahut zyada ho raha hai",
                    "is_present": True,
                    "urgency_level": "high"
                }
            ],
            "vital_signs_mentioned": None,
            "missing_information": [
                {
                    "field_name": "measured_temperature",
                    "reason": "Exact body temperature was not mentioned in the transcript.",
                    "prompt_question": "Kya aapne thermometer se bukhar naapa tha?",
                    "importance": "high"
                }
            ],
            "professional_review_required": True,
            "summary": "Patient reports fever for 2 days and chest pain with breathing difficulty.",
            "notes": None
        }

        self.valid_plain_json = json.dumps(self.valid_report_dict)

    def test_valid_plain_json_parsed_and_validated(self):
        """
        Test 1: Verify that a valid plain JSON string is successfully
        parsed and validated into a MedicalReportOutput instance.
        """
        report = validate_medical_report(
            raw_response=self.valid_plain_json,
            original_transcript=self.synthetic_transcript
        )

        self.assertIsInstance(report, MedicalReportOutput)
        self.assertEqual(report.chief_complaint, "chhati me dard aur tez bukhar")
        self.assertEqual(len(report.symptoms), 1)
        self.assertEqual(report.symptoms[0].name, "fever")
        self.assertEqual(len(report.danger_signs), 1)
        self.assertEqual(report.danger_signs[0].sign, "Chest pain")
        self.assertTrue(report.professional_review_required)

    def test_valid_json_inside_markdown_code_fence(self):
        """
        Test 2: Verify that JSON wrapped inside Markdown code fences
        (```json ... ```) is extracted, parsed, and validated cleanly.
        """
        markdown_wrapped = f"Here is the report:\n```json\n{self.valid_plain_json}\n```\nHope this helps!"

        report = validate_medical_report(
            raw_response=markdown_wrapped,
            original_transcript=self.synthetic_transcript
        )

        self.assertIsInstance(report, MedicalReportOutput)
        self.assertEqual(report.summary, self.valid_report_dict["summary"])

    def test_malformed_json_raises_json_parse_error(self):
        """
        Test 3: Verify that malformed or syntax-error JSON strings
        raise a clear JSONParseError (subclass of ReportValidationError).
        """
        malformed_inputs = [
            "{ 'patient_name': null, 'broken': ",
            "This is just plain conversational text with no JSON at all.",
            "```json\n{ invalid json content }\n```",
            ""
        ]

        for malformed in malformed_inputs:
            with self.subTest(malformed=malformed):
                with self.assertRaises(JSONParseError):
                    parse_report_json(malformed)

    def test_invalid_report_fields_raise_schema_validation_error(self):
        """
        Test 4: Verify that schema violations (missing required fields,
        invalid types, or unapproved urgency_level) raise SchemaValidationError.
        """
        # Case A: Missing required 'summary' field
        bad_dict_missing_summary = dict(self.valid_report_dict)
        del bad_dict_missing_summary["summary"]

        with self.assertRaises(SchemaValidationError):
            parse_report_json(json.dumps(bad_dict_missing_summary))

        # Case B: Invalid urgency_level not in allowed set {'low', 'moderate', 'high', 'critical'}
        bad_dict_invalid_urgency = json.loads(self.valid_plain_json)
        bad_dict_invalid_urgency["danger_signs"][0]["urgency_level"] = "extreme_emergency"

        with self.assertRaises(SchemaValidationError):
            parse_report_json(json.dumps(bad_dict_invalid_urgency))

        # Case C: Symptoms provided as a string instead of a list
        bad_dict_wrong_type = json.loads(self.valid_plain_json)
        bad_dict_wrong_type["symptoms"] = "fever and cough"

        with self.assertRaises(SchemaValidationError):
            parse_report_json(json.dumps(bad_dict_wrong_type))

    def test_evidence_exactly_matches_transcript(self):
        """
        Test 5: Verify that when all DangerSign.evidence quotes match
        verbatim substrings in the original transcript, validation passes.
        """
        # Exact quote from self.synthetic_transcript
        report = parse_report_json(self.valid_plain_json)

        # Should execute cleanly without raising an exception
        try:
            validate_danger_sign_evidence(report, self.synthetic_transcript)
        except EvidenceValidationError as e:
            self.fail(f"Evidence validation failed unexpectedly: {e}")

    def test_evidence_not_in_transcript_raises_evidence_error(self):
        """
        Test 6: Verify that if a danger sign contains fabricated or hallucinated
        evidence not present verbatim in the transcript, validation fails.
        """
        fabricated_dict = json.loads(self.valid_plain_json)
        fabricated_dict["danger_signs"][0]["evidence"] = "patient is having epileptic seizures"

        report = parse_report_json(json.dumps(fabricated_dict))

        with self.assertRaises(EvidenceValidationError) as context:
            validate_danger_sign_evidence(report, self.synthetic_transcript)

        self.assertIn("was not found verbatim", str(context.exception))

    def test_multiple_danger_signs_one_invalid_fails(self):
        """
        Test 7: Verify that if multiple danger signs exist and even one has
        an ungrounded evidence string, the entire report is rejected.
        """
        multi_dict = json.loads(self.valid_plain_json)
        multi_dict["danger_signs"] = [
            {
                "sign": "Chest pain",
                "evidence": "chhati me dard bahut zyada ho raha hai",  # Valid verbatim
                "is_present": True,
                "urgency_level": "high"
            },
            {
                "sign": "Respiratory distress",
                "evidence": "patient turn blue and gasped for air",    # Fabricated / ungrounded
                "is_present": True,
                "urgency_level": "critical"
            }
        ]

        report = parse_report_json(json.dumps(multi_dict))

        with self.assertRaises(EvidenceValidationError) as context:
            validate_danger_sign_evidence(report, self.synthetic_transcript)

        self.assertIn("patient turn blue", str(context.exception))

    def test_empty_danger_sign_list_passes(self):
        """
        Test 8: Verify that an empty danger_signs list (visits where no
        red flags were reported) validates successfully.
        """
        no_danger_dict = json.loads(self.valid_plain_json)
        no_danger_dict["danger_signs"] = []
        no_danger_dict["professional_review_required"] = False

        report = validate_medical_report(
            raw_response=json.dumps(no_danger_dict),
            original_transcript=self.synthetic_transcript
        )

        self.assertEqual(report.danger_signs, [])
        self.assertFalse(report.professional_review_required)

    def test_validated_report_retains_agreed_json_structure(self):
        """
        Test 9: Verify that the validated MedicalReportOutput object serializes
        to the exact agreed JSON structure shared with Member 3 without extra fields.
        """
        report = validate_medical_report(
            raw_response=self.valid_plain_json,
            original_transcript=self.synthetic_transcript
        )

        dumped_dict = report.model_dump()

        # Expected keys defined in schemas.py for MedicalReportOutput
        expected_keys = {
            "patient_name",
            "patient_age",
            "patient_gender",
            "chief_complaint",
            "symptoms",
            "danger_signs",
            "vital_signs_mentioned",
            "missing_information",
            "professional_review_required",
            "summary",
            "notes"
        }

        self.assertEqual(set(dumped_dict.keys()), expected_keys)

        # Critical contract rule: session identifiers must NOT be in the report
        self.assertNotIn("visit_id", dumped_dict)
        self.assertNotIn("patient_id", dumped_dict)


if __name__ == "__main__":
    unittest.main()
