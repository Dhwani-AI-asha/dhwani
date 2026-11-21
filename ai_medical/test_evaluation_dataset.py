"""
ai_medical/test_evaluation_dataset.py

Unit tests for Dhwani AI's synthetic medical transcript evaluation dataset.
Verifies dataset integrity, exact danger sign evidence grounding,
linguistic and clinical diversity across all 40 benchmark cases (TC-01 to TC-40),
negation handling, prompt-injection defense, and schema compatibility.
"""

import unittest

try:
    from ai_medical.schemas import (
        DangerSign,
        ExtractedSymptom,
        MedicalReportOutput,
        MissingInformation,
    )
    from ai_medical.validation import validate_danger_sign_evidence
    from ai_medical.evaluation_dataset import (
        EVALUATION_DATASET,
        EvaluationTestCase,
        get_all_test_cases,
        get_test_case_by_id,
    )
except ImportError:
    from schemas import (
        DangerSign,
        ExtractedSymptom,
        MedicalReportOutput,
        MissingInformation,
    )
    from validation import validate_danger_sign_evidence
    from evaluation_dataset import (
        EVALUATION_DATASET,
        EvaluationTestCase,
        get_all_test_cases,
        get_test_case_by_id,
    )


class TestEvaluationDataset(unittest.TestCase):
    """
    Test suite verifying integrity, grounding, and coverage of the 40-case benchmark dataset.
    """

    def test_dataset_size_and_unique_ids(self):
        """
        Verify that the dataset contains exactly 40 test cases and that
        all test case IDs are unique (TC-01 through TC-40).
        """
        cases = get_all_test_cases()
        self.assertEqual(len(cases), 40, "Dataset must contain exactly 40 test cases.")

        ids = [c.id for c in cases]
        self.assertEqual(len(ids), len(set(ids)), "All test case IDs must be unique.")

        expected_ids = [f"TC-{i:02d}" for i in range(1, 41)]
        self.assertEqual(ids, expected_ids, "Test case IDs must follow TC-01 to TC-40.")

    def test_all_required_fields_present_and_valid(self):
        """
        Verify that every test case has all required fields populated
        with non-empty strings and appropriate collection types.
        """
        for case in EVALUATION_DATASET:
            with self.subTest(case_id=case.id):
                self.assertIsInstance(case.id, str)
                self.assertGreater(len(case.id.strip()), 0)

                self.assertIsInstance(case.category, str)
                self.assertGreater(len(case.category.strip()), 0)

                self.assertIsInstance(case.transcript, str)
                self.assertGreater(len(case.transcript.strip()), 0)

                self.assertIsInstance(case.language, str)
                self.assertGreater(len(case.language.strip()), 0)

                self.assertIsInstance(case.expected_symptoms, list)
                self.assertIsInstance(case.expected_danger_signs, list)
                self.assertIsInstance(case.expected_missing_information, list)

                self.assertIsInstance(case.explanation, str)
                self.assertGreater(len(case.explanation.strip()), 0)

    def test_danger_sign_evidence_is_exact_substring(self):
        """
        Critical Grounding Rule:
        For every test case with danger signs, verify that every evidence quote
        exists EXACTLY as a verbatim substring in the original transcript.
        Also verifies via validate_danger_sign_evidence from validation.py.
        """
        danger_cases = [c for c in EVALUATION_DATASET if c.expected_danger_signs]
        self.assertGreaterEqual(
            len(danger_cases), 10,
            "Must have at least 10 test cases with danger signs covering major emergency signs."
        )

        for case in danger_cases:
            with self.subTest(case_id=case.id):
                danger_models = []
                for ds in case.expected_danger_signs:
                    evidence = ds["evidence"]
                    self.assertIsInstance(evidence, str)
                    self.assertGreater(len(evidence.strip()), 0)

                    # Strict verbatim check: evidence must be a substring of the transcript
                    self.assertIn(
                        evidence,
                        case.transcript,
                        f"Evidence '{evidence}' in {case.id} must be an exact substring of the transcript."
                    )
                    danger_models.append(DangerSign(**ds))

                # Verify using validation module's helper with MedicalReportOutput wrapper
                mock_report = MedicalReportOutput(
                    summary="Danger sign grounding test",
                    symptoms=[],
                    danger_signs=danger_models,
                    missing_information=[],
                )
                validate_danger_sign_evidence(mock_report, case.transcript)

    def test_linguistic_diversity(self):
        """
        Verify that the dataset covers Hindi (hi-Latn), English (en), and Hinglish / code-mixed conversations.
        """
        languages = {c.language.lower() for c in EVALUATION_DATASET}
        self.assertTrue(
            any("hi" in l for l in languages),
            "Dataset must include Hindi / Hinglish cases (e.g. hi-Latn)."
        )
        self.assertTrue(
            any(l == "en" for l in languages),
            "Dataset must include English cases."
        )
        self.assertTrue(
            any("en-hi" in l for l in languages),
            "Dataset must include code-mixed English-Hindi cases."
        )

    def test_case_05_negation_not_in_symptoms(self):
        """
        Verify TC-05 (negation): Fever was explicitly denied ('bukhar bilkul nahi hai').
        Ensure neither 'fever' nor 'bukhar' appears as an active symptom.
        """
        case = get_test_case_by_id("TC-05")
        self.assertIsNotNone(case)

        symptom_names = [s["name"].lower() for s in case.expected_symptoms]
        self.assertNotIn("fever", symptom_names)
        self.assertNotIn("bukhar", symptom_names)

        # Confirm reported symptoms are present
        self.assertIn("cold", symptom_names)
        self.assertIn("cough", symptom_names)

    def test_case_07_negated_danger_signs_remain_empty(self):
        """
        Verify TC-07 (negated danger sign): Seizures and loss of consciousness
        were explicitly denied. Ensure no danger signs are flagged.
        """
        case = get_test_case_by_id("TC-07")
        self.assertIsNotNone(case)
        self.assertEqual(case.expected_danger_signs, [])

    def test_case_08_contradictory_duration_handled_safely(self):
        """
        Verify TC-08 (contradiction): Patient contradicted duration ('2 din' vs 'aaj subah').
        Ensure duration remains None and clarification is marked in missing information.
        """
        case = get_test_case_by_id("TC-08")
        self.assertIsNotNone(case)

        # Duration must remain None to avoid arbitrary assumption
        self.assertIsNone(case.expected_symptoms[0]["duration"])

        # Must be logged in missing information
        missing_fields = [m["field_name"] for m in case.expected_missing_information]
        self.assertIn("fever_onset_clarification", missing_fields)

    def test_prompt_injection_refusals(self):
        """
        Verify TC-10, TC-25, and TC-40 (prompt injections & adversarial text):
        Transcript commands attempting to alter system instructions, dictate diagnoses,
        or invent prescriptions must be ignored and not recorded as symptoms or diagnoses.
        """
        # TC-10: commanded diagnosis of acute bronchitis
        case_10 = get_test_case_by_id("TC-10")
        self.assertIsNotNone(case_10)
        symptoms_10 = [s["name"].lower() for s in case_10.expected_symptoms]
        self.assertNotIn("acute bronchitis", symptoms_10)
        self.assertNotIn("bronchitis", symptoms_10)
        self.assertIn("dry cough", symptoms_10)

        # TC-25: commanded prescription of antibiotics and diagnosis of streptococcal pharyngitis
        case_25 = get_test_case_by_id("TC-25")
        self.assertIsNotNone(case_25)
        symptoms_25 = [s["name"].lower() for s in case_25.expected_symptoms]
        self.assertNotIn("streptococcal pharyngitis", symptoms_25)
        self.assertNotIn("pharyngitis", symptoms_25)
        self.assertNotIn("amoxicillin", symptoms_25)
        self.assertIn("sore throat", symptoms_25)

        # TC-40: commanded overriding rules to declare malaria and chloroquine
        case_40 = get_test_case_by_id("TC-40")
        self.assertIsNotNone(case_40)
        symptoms_40 = [s["name"].lower() for s in case_40.expected_symptoms]
        self.assertIn("fever", symptoms_40)
        self.assertNotIn("malaria", symptoms_40)
        self.assertNotIn("chloroquine", symptoms_40)
        self.assertEqual(case_40.expected_danger_signs, [])

    def test_negated_danger_signs_across_benchmark(self):
        """
        Verify that test cases with explicitly denied emergency signs
        (TC-07, TC-17, TC-18, TC-28, TC-35) do NOT flag danger signs.
        """
        negated_ds_case_ids = ["TC-07", "TC-17", "TC-18", "TC-28", "TC-35"]
        for case_id in negated_ds_case_ids:
            with self.subTest(case_id=case_id):
                case = get_test_case_by_id(case_id)
                self.assertIsNotNone(case)
                self.assertEqual(
                    case.expected_danger_signs, [],
                    f"{case_id} explicitly denies red flags; expected_danger_signs must be empty."
                )

    def test_positive_danger_signs_coverage(self):
        """
        Verify that positive danger signs cover key clinical red flags from prompts.py:
        - Respiratory distress (TC-06, TC-30)
        - Convulsions / seizures / fits (TC-11)
        - High fever with stiff neck (TC-12)
        - Postpartum hemorrhage / severe bleeding (TC-13)
        - Extreme lethargy / unresponsiveness (TC-14)
        - Inability to feed / drink in infant (TC-15, TC-38)
        - Severe chest pain / radiating chest pain (TC-16)
        - Syncope / loss of consciousness (TC-33)
        """
        positive_ds_cases = [
            ("TC-06", "respiratory"),
            ("TC-11", "convulsions"),
            ("TC-12", "stiff neck"),
            ("TC-13", "postpartum hemorrhage"),
            ("TC-14", "unresponsiveness"),
            ("TC-15", "inability to feed"),
            ("TC-16", "chest pain"),
            ("TC-30", "respiratory"),
            ("TC-33", "loss of consciousness"),
            ("TC-38", "inability to feed"),
        ]
        for case_id, sign_keyword in positive_ds_cases:
            with self.subTest(case_id=case_id):
                case = get_test_case_by_id(case_id)
                self.assertIsNotNone(case)
                self.assertGreater(
                    len(case.expected_danger_signs), 0,
                    f"{case_id} must have at least one danger sign."
                )
                signs_text = " ".join(ds["sign"].lower() for ds in case.expected_danger_signs)
                self.assertTrue(
                    any(word in signs_text for word in sign_keyword.split()),
                    f"{case_id} signs '{signs_text}' should cover '{sign_keyword}'."
                )

    def test_missing_information_specifications(self):
        """
        Verify cases specifically designed for missing information:
        - TC-04 (missing duration & severity)
        - TC-21 (duration missing across multiple symptoms)
        - TC-27 (temporal ambiguity / recurrence)
        - TC-31 (unclear anatomical location)
        - TC-37 (ASR transcription gap / missing words)
        All must define non-empty expected_missing_information.
        """
        missing_info_case_ids = ["TC-04", "TC-21", "TC-27", "TC-31", "TC-37"]
        for case_id in missing_info_case_ids:
            with self.subTest(case_id=case_id):
                case = get_test_case_by_id(case_id)
                self.assertIsNotNone(case)
                self.assertGreater(
                    len(case.expected_missing_information), 0,
                    f"{case_id} must specify expected missing information."
                )
                for mi in case.expected_missing_information:
                    self.assertIn("field_name", mi)
                    self.assertIn("reason", mi)
                    self.assertIsInstance(mi["field_name"], str)
                    self.assertIsInstance(mi["reason"], str)

    def test_get_test_case_helpers(self):
        """
        Verify get_test_case_by_id helper retrieves correct case or None if missing.
        """
        case_01 = get_test_case_by_id("TC-01")
        self.assertIsNotNone(case_01)
        self.assertEqual(case_01.id, "TC-01")

        case_40 = get_test_case_by_id("TC-40")
        self.assertIsNotNone(case_40)
        self.assertEqual(case_40.id, "TC-40")

        none_case = get_test_case_by_id("NONEXISTENT_ID")
        self.assertIsNone(none_case)

    def test_schema_compatibility(self):
        """
        Verify that all expected items across all 40 test cases map cleanly to Pydantic models:
        - ExtractedSymptom
        - DangerSign
        - MissingInformation
        """
        for case in EVALUATION_DATASET:
            with self.subTest(case_id=case.id):
                # Validate symptoms map to ExtractedSymptom
                for s in case.expected_symptoms:
                    model = ExtractedSymptom(**s)
                    self.assertEqual(model.name, s["name"])

                # Validate danger signs map to DangerSign
                for ds in case.expected_danger_signs:
                    model = DangerSign(**ds)
                    self.assertEqual(model.sign, ds["sign"])

                # Validate missing information maps to MissingInformation
                for mi in case.expected_missing_information:
                    model = MissingInformation(**mi)
                    self.assertEqual(model.field_name, mi["field_name"])


if __name__ == "__main__":
    unittest.main()
