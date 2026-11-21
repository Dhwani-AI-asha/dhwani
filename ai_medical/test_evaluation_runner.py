"""
ai_medical/test_evaluation_runner.py

Unit tests for Dhwani AI's corrected evaluation runner (evaluation_runner.py).
Tests benchmark execution, metric calculation, error resilience,
and safety penalization (negation, fabrication, invalid JSON).

Includes dedicated test coverage for the 6 audit findings:
1. Partial multi-symptom match with one incorrect duration.
2. Wrong danger-sign name with valid transcript evidence.
3. Irrelevant missing-information field.
4. Duplicate symptom extractions.
5. Punctuation, casing and whitespace variations in symptom matching.
6. Empty evaluation dataset handling.
"""

import json
import re
import unittest

try:
    from ai_medical.schemas import MedicalReportOutput
    from ai_medical.evaluation_dataset import (
        EVALUATION_DATASET,
        EvaluationTestCase,
        get_all_test_cases,
        get_test_case_by_id,
    )
    from ai_medical.evaluation_runner import (
        EvaluationRunner,
        EvaluationSummary,
        TestCaseResult,
        _match_danger_category,
        evaluate_test_case,
        run_evaluation,
    )
except ImportError:
    from schemas import MedicalReportOutput
    from evaluation_dataset import (
        EVALUATION_DATASET,
        EvaluationTestCase,
        get_all_test_cases,
        get_test_case_by_id,
    )
    from evaluation_runner import (
        EvaluationRunner,
        EvaluationSummary,
        TestCaseResult,
        _match_danger_category,
        evaluate_test_case,
        run_evaluation,
    )


# ============================================================================
# Synthetic Mock Response Factory
# ============================================================================

def make_perfect_response_for_case(case: EvaluationTestCase) -> str:
    """Construct an ideal JSON response matching the expected test case criteria."""
    symptoms = [
        {
            "name": s["name"],
            "duration": s.get("duration"),
            "severity": s.get("severity"),
            "body_site": s.get("body_site"),
            "notes": s.get("notes"),
        }
        for s in case.expected_symptoms
    ]

    danger_signs = [
        {
            "sign": ds["sign"],
            "evidence": ds["evidence"],
            "is_present": ds["is_present"],
            "urgency_level": ds.get("urgency_level"),
        }
        for ds in case.expected_danger_signs
    ]

    missing_info = [
        {
            "field_name": mi["field_name"],
            "reason": mi["reason"],
            "prompt_question": mi.get("prompt_question"),
            "importance": mi.get("importance"),
        }
        for mi in case.expected_missing_information
    ]

    report_dict = {
        "patient_name": None,
        "patient_age": None,
        "patient_gender": None,
        "chief_complaint": symptoms[0]["name"] if symptoms else None,
        "symptoms": symptoms,
        "danger_signs": danger_signs,
        "vital_signs_mentioned": None,
        "missing_information": missing_info,
        "professional_review_required": len(danger_signs) > 0,
        "summary": f"Factual consultation record for {case.id}.",
        "notes": None,
    }
    return json.dumps(report_dict)


def _extract_case_id_from_prompt(user_prompt: str) -> str:
    """Extract visit_id (e.g., 'TC-01') from the formatted user prompt."""
    match = re.search(r"Visit ID:\s*(TC-\d{2})", user_prompt)
    if match:
        return match.group(1)
    return "TC-01"


class TestEvaluationRunner(unittest.TestCase):
    """
    Test suite for evaluation runner metric calculation, safety rules, and error handling.
    """

    def test_all_evaluation_cases_processed(self):
        """
        Test 1: Verify all benchmark test cases are executed and summarized.
        """
        def perfect_model(system_prompt: str, user_prompt: str) -> str:
            case_id = _extract_case_id_from_prompt(user_prompt)
            case = get_test_case_by_id(case_id)
            assert case is not None
            return make_perfect_response_for_case(case)

        summary = run_evaluation(model_callable=perfect_model)

        total_cases = len(EVALUATION_DATASET)
        self.assertEqual(summary.total_cases, total_cases)
        self.assertEqual(summary.successful_cases, total_cases)
        self.assertEqual(summary.failed_cases, 0)
        self.assertEqual(len(summary.case_results), total_cases)

    def test_correct_extraction_receives_100_percent_scores(self):
        """
        Test 2: Verify that an accurate model achieves 100% correctness across metrics,
        with properly decoupled sensitivity and specificity across all benchmark cases.
        """
        def perfect_model(system_prompt: str, user_prompt: str) -> str:
            case_id = _extract_case_id_from_prompt(user_prompt)
            case = get_test_case_by_id(case_id)
            assert case is not None
            return make_perfect_response_for_case(case)

        runner = EvaluationRunner(model_callable=perfect_model)
        summary = runner.run()

        total_cases = len(EVALUATION_DATASET)
        expected_pos_ds = sum(1 for c in EVALUATION_DATASET if len(c.expected_danger_signs) > 0)
        expected_neg_ds = total_cases - expected_pos_ds

        self.assertEqual(summary.symptom_correctness_count, total_cases)
        self.assertEqual(summary.symptom_correctness_pct, 100.0)

        self.assertEqual(summary.duration_correctness_count, total_cases)
        self.assertEqual(summary.duration_correctness_pct, 100.0)

        self.assertEqual(summary.severity_correctness_count, total_cases)
        self.assertEqual(summary.severity_correctness_pct, 100.0)

        self.assertEqual(summary.missing_info_correctness_count, total_cases)
        self.assertEqual(summary.missing_info_correctness_pct, 100.0)

        # Danger-sign diagnostics decoupled
        self.assertEqual(summary.danger_sign_tp, expected_pos_ds)
        self.assertEqual(summary.danger_sign_fn, 0)
        self.assertEqual(summary.danger_sign_tn, expected_neg_ds)
        self.assertEqual(summary.danger_sign_fp, 0)

        self.assertEqual(summary.danger_sign_sensitivity_numerator, expected_pos_ds)
        self.assertEqual(summary.danger_sign_sensitivity_denominator, expected_pos_ds)
        self.assertEqual(summary.danger_sign_sensitivity_pct, 100.0)

        self.assertEqual(summary.danger_sign_specificity_numerator, expected_neg_ds)
        self.assertEqual(summary.danger_sign_specificity_denominator, expected_neg_ds)
        self.assertEqual(summary.danger_sign_specificity_pct, 100.0)

        self.assertEqual(summary.evidence_validity_count, total_cases)
        self.assertEqual(summary.evidence_validity_pct, 100.0)

        self.assertEqual(summary.overall_correct_cases, total_cases)
        self.assertEqual(summary.overall_correct_pct, 100.0)

        # Failure mode counts should all be 0
        self.assertEqual(summary.json_parse_failures, 0)
        self.assertEqual(summary.schema_validation_failures, 0)
        self.assertEqual(summary.evidence_validation_failures, 0)
        self.assertEqual(summary.model_invocation_failures, 0)

    def test_incorrect_symptoms_detected_and_penalized(self):
        """
        Test 3: Verify that missing or wrongly extracted symptoms are detected.
        """
        case = get_test_case_by_id("TC-01")  # Expected: fever
        self.assertIsNotNone(case)

        bad_response = {
            "patient_name": None,
            "patient_age": None,
            "patient_gender": None,
            "chief_complaint": "sar dard",
            "symptoms": [{"name": "headache", "duration": "3 din", "severity": None, "body_site": None, "notes": None}],
            "danger_signs": [],
            "vital_signs_mentioned": None,
            "missing_information": [
                {"field_name": "symptom_severity", "reason": "Not stated", "prompt_question": None, "importance": "medium"},
                {"field_name": "associated_symptoms", "reason": "Not stated", "prompt_question": None, "importance": "medium"}
            ],
            "professional_review_required": False,
            "summary": "Incorrect symptom extraction.",
            "notes": None,
        }

        result = evaluate_test_case(case, lambda s, u: json.dumps(bad_response))
        self.assertTrue(result.is_success)
        self.assertFalse(result.symptoms_correct)
        self.assertFalse(result.is_overall_correct)

    def test_incorrect_duration_and_severity_detected(self):
        """
        Test 4: Verify that fabricated durations or severities (when expected is None)
        are strictly flagged as incorrect.
        """
        case = get_test_case_by_id("TC-04")  # Expected: abdominal pain, duration=None, severity=None
        self.assertIsNotNone(case)

        hallucinated_response = {
            "patient_name": None,
            "patient_age": None,
            "patient_gender": None,
            "chief_complaint": "pet dard",
            "symptoms": [
                {"name": "abdominal pain", "duration": "5 days", "severity": "severe", "body_site": "abdomen", "notes": None}
            ],
            "danger_signs": [],
            "vital_signs_mentioned": None,
            "missing_information": [
                {"field_name": "pain_duration", "reason": "Not stated", "prompt_question": None, "importance": "high"},
                {"field_name": "pain_severity", "reason": "Not stated", "prompt_question": None, "importance": "medium"}
            ],
            "professional_review_required": False,
            "summary": "Hallucinated details.",
            "notes": None,
        }

        result = evaluate_test_case(case, lambda s, u: json.dumps(hallucinated_response))
        self.assertTrue(result.is_success)
        self.assertTrue(result.symptoms_correct)  # Symptom name matched
        self.assertFalse(result.duration_correct)  # Fabricated duration penalized
        self.assertFalse(result.severity_correct)  # Fabricated severity penalized
        self.assertFalse(result.is_overall_correct)

    def test_negated_symptoms_not_rewarded(self):
        """
        Test 5: Verify TC-05: Fever was negated ('bukhar bilkul nahi hai').
        If the model lists 'fever' as active, symptom correctness must be False.
        """
        case = get_test_case_by_id("TC-05")  # Expected: cold, cough (fever denied)
        self.assertIsNotNone(case)

        bad_response = {
            "patient_name": None,
            "patient_age": None,
            "patient_gender": None,
            "chief_complaint": "cold and fever",
            "symptoms": [
                {"name": "cold", "duration": None, "severity": None, "body_site": None, "notes": None},
                {"name": "cough", "duration": None, "severity": None, "body_site": None, "notes": None},
                {"name": "fever", "duration": None, "severity": None, "body_site": None, "notes": None},
            ],
            "danger_signs": [],
            "vital_signs_mentioned": None,
            "missing_information": [
                {"field_name": "symptom_duration", "reason": "Not stated", "prompt_question": None, "importance": "medium"}
            ],
            "professional_review_required": False,
            "summary": "Incorrectly extracted negated symptom.",
            "notes": None,
        }

        result = evaluate_test_case(case, lambda s, u: json.dumps(bad_response))
        self.assertTrue(result.is_success)
        self.assertFalse(result.symptoms_correct, "Negated symptom must NOT be rewarded as active.")
        self.assertFalse(result.is_overall_correct)

    def test_fabricated_danger_signs_penalized(self):
        """
        Test 6: Verify TC-07: Negated danger sign ('behoshi ya daura nahi pada hai').
        If the model flags seizures as an active danger sign, it must be penalized.
        """
        case = get_test_case_by_id("TC-07")  # Expected: no danger signs
        self.assertIsNotNone(case)

        bad_response = {
            "patient_name": None,
            "patient_age": None,
            "patient_gender": None,
            "chief_complaint": "chakkar",
            "symptoms": [{"name": "dizziness", "duration": None, "severity": "halka", "body_site": None, "notes": None}],
            "danger_signs": [
                {
                    "sign": "Seizures / Convulsions",
                    "evidence": "daura nahi pada hai",  # Quote in transcript, but sign was negated
                    "is_present": True,
                    "urgency_level": "high",
                }
            ],
            "vital_signs_mentioned": None,
            "missing_information": [
                {"field_name": "blood_pressure_check", "reason": "Not stated", "prompt_question": None, "importance": "medium"}
            ],
            "professional_review_required": True,
            "summary": "Improper danger sign detection.",
            "notes": None,
        }

        result = evaluate_test_case(case, lambda s, u: json.dumps(bad_response))
        self.assertTrue(result.is_success)
        self.assertFalse(result.danger_signs_correct, "Negated danger signs must not be recorded as active.")
        self.assertFalse(result.is_overall_correct)

    def test_invalid_json_does_not_halt_evaluation(self):
        """
        Test 7: Verify that an invalid JSON response on one case (e.g., TC-02)
        is recorded as a failed case with json_parse_failures=1 while all other cases continue.
        """
        def faulty_model(system_prompt: str, user_prompt: str) -> str:
            case_id = _extract_case_id_from_prompt(user_prompt)
            if case_id == "TC-02":
                return "Broken response with no JSON"
            case = get_test_case_by_id(case_id)
            assert case is not None
            return make_perfect_response_for_case(case)

        summary = run_evaluation(model_callable=faulty_model)

        total_cases = len(EVALUATION_DATASET)
        self.assertEqual(summary.total_cases, total_cases)
        self.assertEqual(summary.successful_cases, total_cases - 1)
        self.assertEqual(summary.failed_cases, 1)
        self.assertEqual(summary.json_parse_failures, 1)

        tc02_res = next(r for r in summary.case_results if r.case_id == "TC-02")
        self.assertFalse(tc02_res.is_success)
        self.assertEqual(tc02_res.error_type, "JSONParseError")

        # Verify all remaining cases processed successfully despite TC-02 failure
        successful_results = [r for r in summary.case_results if r.case_id != "TC-02"]
        self.assertEqual(len(successful_results), total_cases - 1)
        self.assertTrue(all(r.is_success for r in successful_results))

    def test_summary_counts_and_percentages_calculated_correctly(self):
        """
        Test 8: Verify summary percentages match exact ratios (e.g., (N-1)/N).
        """
        def single_failure_model(system_prompt: str, user_prompt: str) -> str:
            case_id = _extract_case_id_from_prompt(user_prompt)
            if case_id == "TC-01":
                return "Invalid JSON"
            case = get_test_case_by_id(case_id)
            assert case is not None
            return make_perfect_response_for_case(case)

        summary = run_evaluation(model_callable=single_failure_model)

        total_cases = len(EVALUATION_DATASET)
        expected_success = total_cases - 1
        expected_correct = total_cases - 1
        expected_pct = round((expected_correct / total_cases) * 100, 2)

        self.assertEqual(summary.total_cases, total_cases)
        self.assertEqual(summary.successful_cases, expected_success)
        self.assertEqual(summary.failed_cases, 1)
        self.assertEqual(summary.overall_correct_cases, expected_correct)
        self.assertEqual(summary.overall_correct_pct, expected_pct)

        summary_dict = summary.to_dict()
        self.assertIn("symptom_correctness_pct", summary_dict)
        self.assertEqual(summary_dict["overall_correct_pct"], expected_pct)
        self.assertIn("danger_sign_sensitivity_pct", summary_dict)
        self.assertIn("danger_sign_specificity_pct", summary_dict)

    def test_original_dataset_remains_unchanged(self):
        """
        Test 9: Verify that running evaluations does not alter EVALUATION_DATASET.
        Compares complete dataset objects across all fields (not merely length).
        """
        cases_before = [
            {
                "id": c.id,
                "category": c.category,
                "transcript": c.transcript,
                "language": c.language,
                "expected_symptoms": [dict(s) for s in c.expected_symptoms],
                "expected_danger_signs": [dict(ds) for ds in c.expected_danger_signs],
                "expected_missing_information": [dict(mi) for mi in c.expected_missing_information],
                "explanation": c.explanation,
            }
            for c in EVALUATION_DATASET
        ]

        def dummy_model(s: str, u: str) -> str:
            case_id = _extract_case_id_from_prompt(u)
            case = get_test_case_by_id(case_id)
            assert case is not None
            return make_perfect_response_for_case(case)

        run_evaluation(model_callable=dummy_model)

        cases_after = [
            {
                "id": c.id,
                "category": c.category,
                "transcript": c.transcript,
                "language": c.language,
                "expected_symptoms": [dict(s) for s in c.expected_symptoms],
                "expected_danger_signs": [dict(ds) for ds in c.expected_danger_signs],
                "expected_missing_information": [dict(mi) for mi in c.expected_missing_information],
                "explanation": c.explanation,
            }
            for c in EVALUATION_DATASET
        ]

        self.assertEqual(len(EVALUATION_DATASET), 40)
        self.assertEqual(len(EVALUATION_DATASET), len(cases_before))
        self.assertEqual(cases_before, cases_after)

    def test_medical_report_output_schema_structure_unchanged(self):
        """
        Test 10: Verify that the contract shared with Member 3 is preserved
        and contains all 11 agreed fields without extras.
        """
        case = get_test_case_by_id("TC-01")
        self.assertIsNotNone(case)

        perfect_json = make_perfect_response_for_case(case)
        report = MedicalReportOutput.model_validate_json(perfect_json)
        dumped = report.model_dump()

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
            "notes",
        }
        self.assertEqual(set(dumped.keys()), expected_keys)
        self.assertNotIn("visit_id", dumped)
        self.assertNotIn("patient_id", dumped)

    # ========================================================================
    # 6 New Tests for Audit Findings
    # ========================================================================

    def test_partial_multi_symptom_match_one_incorrect_duration(self):
        """
        Audit Test 1: Verify multi-symptom case TC-02 where cough duration is correct
        ('4 din'), but headache duration is wrong ('10 din' instead of 'kal se').
        Symptoms match, but duration_correct must be False.
        """
        case = get_test_case_by_id("TC-02")
        self.assertIsNotNone(case)

        partial_response = {
            "patient_name": None,
            "patient_age": None,
            "patient_gender": None,
            "chief_complaint": "cough and headache",
            "symptoms": [
                {"name": "cough", "duration": "4 din", "severity": None, "body_site": None, "notes": None},
                {"name": "headache", "duration": "10 din", "severity": None, "body_site": "head", "notes": None},  # Incorrect duration
            ],
            "danger_signs": [],
            "vital_signs_mentioned": None,
            "missing_information": [
                {"field_name": "cough_nature", "reason": "Not stated", "prompt_question": None, "importance": "medium"}
            ],
            "professional_review_required": False,
            "summary": "Partial duration mismatch.",
            "notes": None,
        }

        result = evaluate_test_case(case, lambda s, u: json.dumps(partial_response))
        self.assertTrue(result.is_success)
        self.assertTrue(result.symptoms_correct, "Both symptom names matched.")
        self.assertFalse(result.duration_correct, "Headache duration was incorrect.")
        self.assertFalse(result.is_overall_correct)

    def test_wrong_danger_sign_name_with_valid_transcript_evidence(self):
        """
        Audit Test 2: Verify that in TC-06, if the model provides a valid verbatim
        evidence quote from the transcript ('saans lene me bahut zyada dikkat ho rahi hai'),
        but outputs an incorrect danger sign name ('Fractured arm'), danger_signs_correct must fail.
        """
        case = get_test_case_by_id("TC-06")
        self.assertIsNotNone(case)

        wrong_sign_response = {
            "patient_name": None,
            "patient_age": None,
            "patient_gender": None,
            "chief_complaint": "shortness of breath",
            "symptoms": [
                {"name": "shortness of breath", "duration": "kal raat se", "severity": "bahut zyada", "body_site": "respiratory", "notes": None}
            ],
            "danger_signs": [
                {
                    "sign": "Fractured arm",  # Incorrect danger sign name
                    "evidence": "saans lene me bahut zyada dikkat ho rahi hai",  # Verbatim quote
                    "is_present": True,
                    "urgency_level": "high",
                }
            ],
            "vital_signs_mentioned": None,
            "missing_information": [
                {"field_name": "chest_pain_or_wheezing", "reason": "Not stated", "prompt_question": None, "importance": "high"}
            ],
            "professional_review_required": True,
            "summary": "Incorrect danger sign name.",
            "notes": None,
        }

        result = evaluate_test_case(case, lambda s, u: json.dumps(wrong_sign_response))
        self.assertTrue(result.is_success)
        self.assertTrue(result.evidence_valid, "Evidence quote was verbatim in transcript.")
        self.assertFalse(result.danger_signs_correct, "Danger sign name 'Fractured arm' is incorrect.")
        self.assertFalse(result.is_overall_correct)

    def test_irrelevant_missing_information_field_penalized(self):
        """
        Audit Test 3: Verify that in TC-01, if the model outputs irrelevant fields
        like 'favorite_color' and 'patient_hobby' instead of expected clinical gaps,
        missing_info_correct must evaluate to False.
        """
        case = get_test_case_by_id("TC-01")
        self.assertIsNotNone(case)

        irrelevant_mi_response = {
            "patient_name": None,
            "patient_age": None,
            "patient_gender": None,
            "chief_complaint": "fever",
            "symptoms": [
                {"name": "fever", "duration": "3 din", "severity": None, "body_site": None, "notes": None}
            ],
            "danger_signs": [],
            "vital_signs_mentioned": None,
            "missing_information": [
                {"field_name": "favorite_color", "reason": "Irrelevant", "prompt_question": None, "importance": "low"},
                {"field_name": "patient_hobby", "reason": "Irrelevant", "prompt_question": None, "importance": "low"},
            ],
            "professional_review_required": False,
            "summary": "Irrelevant missing info.",
            "notes": None,
        }

        result = evaluate_test_case(case, lambda s, u: json.dumps(irrelevant_mi_response))
        self.assertTrue(result.is_success)
        self.assertFalse(result.missing_info_correct, "Irrelevant missing info fields must be rejected.")
        self.assertFalse(result.is_overall_correct)

    def test_duplicate_symptom_extractions_penalized(self):
        """
        Audit Test 4: Verify that if the model outputs duplicate symptoms
        (e.g., extracting 'fever' twice when only 1 is expected in TC-01),
        symptoms_correct must evaluate to False.
        """
        case = get_test_case_by_id("TC-01")
        self.assertIsNotNone(case)

        duplicate_response = {
            "patient_name": None,
            "patient_age": None,
            "patient_gender": None,
            "chief_complaint": "fever",
            "symptoms": [
                {"name": "fever", "duration": "3 din", "severity": None, "body_site": None, "notes": None},
                {"name": "fever", "duration": "3 din", "severity": None, "body_site": None, "notes": None},
            ],
            "danger_signs": [],
            "vital_signs_mentioned": None,
            "missing_information": [
                {"field_name": "symptom_severity", "reason": "Not stated", "prompt_question": None, "importance": "medium"},
                {"field_name": "associated_symptoms", "reason": "Not stated", "prompt_question": None, "importance": "medium"}
            ],
            "professional_review_required": False,
            "summary": "Duplicate symptom extraction.",
            "notes": None,
        }

        result = evaluate_test_case(case, lambda s, u: json.dumps(duplicate_response))
        self.assertTrue(result.is_success)
        self.assertFalse(result.symptoms_correct, "Duplicate symptom extraction must be penalized.")
        self.assertFalse(result.is_overall_correct)

    def test_punctuation_casing_whitespace_and_generic_symptom_matching(self):
        """
        Audit Test 5:
        a) Verify conservative normalization handles casing, trailing punctuation,
           and multiple spaces ('  Fever.  ' matches 'fever').
        b) Verify that generic symptom 'pain' does NOT match specific 'throat pain'.
        """
        case_01 = get_test_case_by_id("TC-01")  # Expected: fever
        self.assertIsNotNone(case_01)

        # a) Normalization test
        norm_response = {
            "patient_name": None,
            "patient_age": None,
            "patient_gender": None,
            "chief_complaint": "fever",
            "symptoms": [
                {"name": "  Fever.  ", "duration": "3 din", "severity": None, "body_site": None, "notes": None}
            ],
            "danger_signs": [],
            "vital_signs_mentioned": None,
            "missing_information": [
                {"field_name": "symptom_severity", "reason": "Not stated", "prompt_question": None, "importance": "medium"},
                {"field_name": "associated_symptoms", "reason": "Not stated", "prompt_question": None, "importance": "medium"}
            ],
            "professional_review_required": False,
            "summary": "Punctuation test.",
            "notes": None,
        }
        res_a = evaluate_test_case(case_01, lambda s, u: json.dumps(norm_response))
        self.assertTrue(res_a.symptoms_correct, "'  Fever.  ' must match 'fever'.")

        # b) Generic vs Specific test in TC-03 (expected: throat pain)
        case_03 = get_test_case_by_id("TC-03")
        self.assertIsNotNone(case_03)

        generic_response = {
            "patient_name": None,
            "patient_age": None,
            "patient_gender": None,
            "chief_complaint": "pain",
            "symptoms": [
                {"name": "pain", "duration": "subah se", "severity": "mild", "body_site": "throat", "notes": "zyada nahi hai"}
            ],
            "danger_signs": [],
            "vital_signs_mentioned": None,
            "missing_information": [
                {"field_name": "swallowing_difficulty", "reason": "Not stated", "prompt_question": None, "importance": "medium"}
            ],
            "professional_review_required": False,
            "summary": "Generic pain response.",
            "notes": None,
        }
        res_b = evaluate_test_case(case_03, lambda s, u: json.dumps(generic_response))
        self.assertFalse(res_b.symptoms_correct, "Generic 'pain' must NOT match specific 'throat pain'.")

    def test_empty_evaluation_dataset(self):
        """
        Audit Test 6: Verify empty dataset is handled gracefully without ZeroDivisionError,
        reporting zero totals and None for undefined sensitivity/specificity.
        """
        def dummy_model(s: str, u: str) -> str:
            return "{}"

        summary = run_evaluation(model_callable=dummy_model, dataset=[])

        self.assertEqual(summary.total_cases, 0)
        self.assertEqual(summary.successful_cases, 0)
        self.assertEqual(summary.failed_cases, 0)
        self.assertEqual(summary.symptom_correctness_pct, 0.0)
        self.assertIsNone(summary.danger_sign_sensitivity_pct)
        self.assertIsNone(summary.danger_sign_specificity_pct)
        self.assertEqual(summary.overall_correct_cases, 0)
        self.assertEqual(summary.case_results, [])

    def test_danger_sign_category_whole_word_matching_direct_benefits_rejected(self):
        """Directly verify word boundaries prevent 'fits' from matching 'benefits'."""
        self.assertFalse(_match_danger_category("Convulsions / fits", "benefits"))
        self.assertFalse(_match_danger_category("Convulsions / fits", "Health benefits"))

    def test_danger_sign_evidence_one_direction_containment_only(self):
        """Verify one-word fragment evidence does not match full expected phrase."""
        case = get_test_case_by_id("TC-15")  # Expected ev: 'doodh bilkul nahi pee raha hai'
        self.assertIsNotNone(case)
        response = {
            "patient_name": None, "patient_age": None, "patient_gender": None,
            "chief_complaint": None, "symptoms": [],
            "danger_signs": [{
                "sign": "inability to feed",
                "evidence": "doodh",  # Single word fragment
                "is_present": True, "urgency_level": None
            }],
            "vital_signs_mentioned": None, "missing_information": [],
            "professional_review_required": True, "summary": "Test.", "notes": None
        }
        res = evaluate_test_case(case, lambda s, u: json.dumps(response))
        self.assertFalse(res.danger_signs_clinical_correct)

    def test_danger_sign_standalone_neck_stiffness_rejected(self):
        """Verify neck stiffness without fever is rejected from MENINGISM_HIGH_FEVER."""
        case = get_test_case_by_id("TC-12")  # Expected: 'High fever with neck stiffness'
        self.assertIsNotNone(case)
        response = {
            "patient_name": None, "patient_age": None, "patient_gender": None,
            "chief_complaint": None, "symptoms": [],
            "danger_signs": [{
                "sign": "neck stiffness",  # Standalone neck stiffness without fever
                "evidence": "gardan itni akad gayi hai ki jhuk nahi rahi",
                "is_present": True, "urgency_level": None
            }],
            "vital_signs_mentioned": None, "missing_information": [],
            "professional_review_required": True, "summary": "Test.", "notes": None
        }
        res = evaluate_test_case(case, lambda s, u: json.dumps(response))
        self.assertFalse(res.danger_signs_clinical_correct)

    def test_danger_sign_unrelated_or_fabricated_evidence_rejected(self):
        """Verify fabricated evidence not in transcript is penalized."""
        case = get_test_case_by_id("TC-06")
        self.assertIsNotNone(case)
        response = {
            "patient_name": None, "patient_age": None, "patient_gender": None,
            "chief_complaint": None, "symptoms": [],
            "danger_signs": [{
                "sign": "severe breathlessness",
                "evidence": "completely fabricated evidence not in transcript",
                "is_present": True, "urgency_level": None
            }],
            "vital_signs_mentioned": None, "missing_information": [],
            "professional_review_required": True, "summary": "Test.", "notes": None
        }
        res = evaluate_test_case(case, lambda s, u: json.dumps(response))
        self.assertFalse(res.danger_signs_clinical_correct)
        self.assertFalse(res.evidence_valid)


if __name__ == "__main__":
    unittest.main()
