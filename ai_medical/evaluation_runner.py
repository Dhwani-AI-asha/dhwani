"""
ai_medical/evaluation_runner.py

Evaluation Runner for Dhwani AI's Medical Transcript Extraction Module.
Executes the extraction pipeline against benchmark evaluation datasets and
computes detailed, reproducible clinical extraction metrics.

METRIC METHODOLOGY & CLINICAL SAFETY NOTICE:
- This evaluation runner measures pipeline contract compliance and extraction fidelity
  on synthetic test cases.
- It does NOT claim clinical or statistical medical efficacy.
- Danger-sign metrics are decoupled into explicit Sensitivity (Recall) and Specificity.
  Pooled danger-sign accuracy is NOT reported as evidence of clinical safety.
- In EVALUATION_DATASET, multiple test cases contain expected danger signs;
  sensitivity is evaluated on positive cases (n=sens_denom).
- Metrics enforce strict clinical safety:
  1. Negated symptoms (e.g., 'bukhar nahi hai') must NOT be rewarded as active symptoms.
  2. Fabricated symptoms, durations, or severities are strictly penalized.
  3. Danger-sign names must match expected clinical signs, and evidence must be verbatim.
  4. Missing-information fields must match expected clinical gaps without allowing unrelated fields.
  5. Failure modes (JSON parsing, schema, evidence, invocation) are categorized separately.
"""

from dataclasses import asdict, dataclass, field
import re
from typing import Any, Callable, Dict, List, Optional, Set, Tuple

try:
    from ai_medical.schemas import (
        DangerSign,
        ExtractedSymptom,
        MedicalReportOutput,
        MissingInformation,
        TranscriptInput,
    )
    from ai_medical.prompts import SYSTEM_PROMPT
    from ai_medical.extraction_engine import (
        ModelCallable,
        ModelInvocationError,
        extract_medical_report,
    )
    from ai_medical.evaluation_dataset import (
        EVALUATION_DATASET,
        EvaluationTestCase,
        get_all_test_cases,
    )
    from ai_medical.validation import (
        EvidenceValidationError,
        JSONParseError,
        ReportValidationError,
        SchemaValidationError,
    )
except ImportError:
    from schemas import (
        DangerSign,
        ExtractedSymptom,
        MedicalReportOutput,
        MissingInformation,
        TranscriptInput,
    )
    from prompts import SYSTEM_PROMPT
    from extraction_engine import (
        ModelCallable,
        ModelInvocationError,
        extract_medical_report,
    )
    from evaluation_dataset import (
        EVALUATION_DATASET,
        EvaluationTestCase,
        get_all_test_cases,
    )
    from validation import (
        EvidenceValidationError,
        JSONParseError,
        ReportValidationError,
        SchemaValidationError,
    )


# ============================================================================
# Evaluation Result Data Structures
# ============================================================================

# Standard clinical danger categories (draft list — needs clinician review)
CLINICAL_DANGER_CATEGORIES: Dict[str, Set[str]] = {
    "RESPIRATORY_DISTRESS": {
        "respiratory distress", "difficulty breathing", "breathlessness",
        "shortness of breath", "stridor", "severe breathlessness",
    },
    "CONVULSIONS": {
        "convulsions", "fits", "seizures", "spasms",
    },
    "ALTERED_CONSCIOUSNESS": {
        "unconsciousness", "unresponsiveness", "lethargy", "loss of consciousness",
        "coma", "syncope", "fainting",
    },
    "SEVERE_HEMORRHAGE": {
        "heavy bleeding", "hemorrhage", "postpartum hemorrhage",
    },
    "CHEST_PAIN": {
        "chest pain", "severe chest pain", "radiating chest pain", "cardiac chest pain",
    },
    "INFANT_FEEDING_INABILITY": {
        "inability to feed", "inability to drink", "feeding difficulty",
        "vomiting everything",
    },
    "MENINGISM_HIGH_FEVER": {
        "high fever with neck stiffness", "fever with neck stiffness",
        "stiff neck and fever", "fever and stiff neck", "meningism",
    },
}

@dataclass
class TestCaseResult:
    """
    Detailed evaluation outcome for a single test case.
    """
    case_id: str
    category: str
    is_success: bool                         # Pipeline executed without fatal error
    error_type: Optional[str] = None         # Exception class name if pipeline failed
    error_message: Optional[str] = None      # Exception message if pipeline failed

    # Individual metric correctness flags
    symptoms_correct: bool = False
    duration_correct: bool = False
    severity_correct: bool = False
    missing_info_correct: bool = False
    danger_signs_correct: bool = False             # Strict exact-match score
    danger_signs_clinical_correct: bool = False    # Clinical category + containment score
    evidence_valid: bool = False
    is_overall_correct: bool = False

    details: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        """Convert result to dictionary."""
        return asdict(self)


@dataclass
class EvaluationSummary:
    """
    Aggregated benchmark evaluation summary with counts, percentages,
    failure categorization, and decoupled danger-sign sensitivity/specificity.
    """
    total_cases: int
    successful_cases: int
    failed_cases: int

    # Failure Categorization Breakdown
    json_parse_failures: int
    schema_validation_failures: int
    evidence_validation_failures: int
    model_invocation_failures: int
    other_failures: int

    # Symptom, Duration, and Severity Correctness
    symptom_correctness_count: int
    symptom_correctness_pct: float

    duration_correctness_count: int
    duration_correctness_pct: float

    severity_correctness_count: int
    severity_correctness_pct: float

    # Missing Information Correctness
    missing_info_correctness_count: int
    missing_info_correctness_pct: float

    # Danger-Sign Diagnostics (Decoupled Sensitivity & Specificity)
    danger_sign_tp: int
    danger_sign_fp: int
    danger_sign_tn: int
    danger_sign_fn: int
    danger_sign_sensitivity_numerator: int
    danger_sign_sensitivity_denominator: int
    danger_sign_sensitivity_pct: Optional[float]
    danger_sign_specificity_numerator: int
    danger_sign_specificity_denominator: int
    danger_sign_specificity_pct: Optional[float]
    danger_sign_clinical_safety_note: str

    # Maintained for interface stability (pooled agreement)
    danger_sign_correctness_count: int
    danger_sign_correctness_pct: float

    evidence_validity_count: int
    evidence_validity_pct: float

    overall_correct_cases: int
    overall_correct_pct: float

    # Clinical Danger-Sign Diagnostics (Category + One-Direction Evidence Containment)
    danger_sign_clinical_tp: int = 0
    danger_sign_clinical_fp: int = 0
    danger_sign_clinical_tn: int = 0
    danger_sign_clinical_fn: int = 0
    danger_sign_clinical_sensitivity_pct: Optional[float] = None
    danger_sign_clinical_specificity_pct: Optional[float] = None
    danger_sign_clinical_correctness_count: int = 0
    danger_sign_clinical_correctness_pct: float = 0.0

    case_results: List[TestCaseResult] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        """Convert summary to dictionary."""
        return asdict(self)


# ============================================================================
# Comparison Helpers
# ============================================================================

def _normalize_text(val: Optional[str]) -> Optional[str]:
    """Helper to strip and lowercase text for robust comparison."""
    if val is None:
        return None
    cleaned = " ".join(val.strip().lower().split())
    return cleaned if cleaned else None


def _clean_symptom_tokens(text: str) -> Set[str]:
    """Extract significant lowercase word tokens, removing punctuation and common stop-words."""
    cleaned = re.sub(r"[^\w\s]", " ", text.lower())
    stop_words = {"in", "of", "the", "a", "an", "and"}
    return {w for w in cleaned.split() if w not in stop_words}


def _match_symptom_name(expected: str, actual: str) -> bool:
    """
    Check if expected symptom name matches actual symptom name.

    Strict Matching Rules:
    - Normalizes casing, whitespace, and punctuation.
    - Matches identical normalized string.
    - Or matches identical significant token sets (handles word reordering in code-mixed phrases).
    - NEVER allows generic substrings (e.g., 'pain' will NOT match 'throat pain' or 'abdominal pain').
    """
    exp_norm = " ".join(re.sub(r"[^\w\s]", " ", expected.lower()).split())
    act_norm = " ".join(re.sub(r"[^\w\s]", " ", actual.lower()).split())
    if exp_norm == act_norm:
        return True

    exp_tokens = _clean_symptom_tokens(expected)
    act_tokens = _clean_symptom_tokens(actual)
    if exp_tokens and act_tokens and exp_tokens == act_tokens:
        return True

    return False


def _match_danger_sign_name(expected_sign: str, actual_sign: str) -> bool:
    """
    Check whether an actual danger-sign name matches the expected danger sign.

    Strict Rules:
    - Normalizes casing and whitespace.
    - If expected contains slash-separated clinical alternatives
      (e.g., 'Severe respiratory distress / difficulty breathing'),
      the actual sign name must match at least one alternative closely.
    - Rejects completely unrelated clinical signs (e.g., 'Fractured arm' or 'Chest pain').
    """
    exp_norm = _normalize_text(expected_sign)
    act_norm = _normalize_text(actual_sign)
    if exp_norm is None or act_norm is None:
        return False
    if exp_norm == act_norm:
        return True

    parts = [p.strip().lower() for p in expected_sign.split("/") if p.strip()]
    for part in parts:
        if act_norm == part or part in act_norm or act_norm in part:
            # Confirm it's not a trivial match
            if len(act_norm) >= 6:
                return True
    return False


def _match_danger_category(expected_sign: str, actual_sign: str) -> bool:
    """
    Match danger signs against standardized clinical danger categories using whole words/phrases.
    Draft taxonomy — requires formal clinician review before production clinical use.
    """
    exp_norm = _normalize_text(expected_sign) or ""
    act_norm = _normalize_text(actual_sign) or ""

    exp_matched_cat = None
    act_matched_cat = None

    for cat_name, cat_terms in CLINICAL_DANGER_CATEGORIES.items():
        if any(bool(re.search(rf"\b{re.escape(term)}\b", exp_norm)) for term in cat_terms):
            exp_matched_cat = cat_name
        if any(bool(re.search(rf"\b{re.escape(term)}\b", act_norm)) for term in cat_terms):
            act_matched_cat = cat_name

    # If expected sign belongs to a defined clinical danger category,
    # actual sign must belong to the exact same category.
    if exp_matched_cat is not None:
        return exp_matched_cat == act_matched_cat

    # Fallback to standard sign name matching only if expected sign is not in any defined category
    return _match_danger_sign_name(expected_sign, actual_sign)


def _evaluate_symptoms(
    expected_symptoms: List[Dict[str, Optional[str]]],
    actual_symptoms: List[ExtractedSymptom],
) -> Tuple[bool, bool, bool, Dict[str, Any]]:
    """
    Compare extracted symptoms, duration, and severity against expected values.

    Returns:
        (symptoms_correct, duration_correct, severity_correct, details_dict)
    """
    details: Dict[str, Any] = {
        "expected_count": len(expected_symptoms),
        "actual_count": len(actual_symptoms),
        "matched_symptoms": [],
        "unmatched_expected": [],
        "unmatched_actual": [],
    }

    # If neither expected nor actual has symptoms, all are correct
    if not expected_symptoms and not actual_symptoms:
        return True, True, True, details

    # If counts differ or one is empty, symptoms cannot match 1-to-1
    if len(expected_symptoms) != len(actual_symptoms):
        return False, False, False, details

    matched_pairs: List[Tuple[Dict[str, Optional[str]], ExtractedSymptom]] = []
    actual_available = list(actual_symptoms)

    for exp in expected_symptoms:
        match_found = None
        for act in actual_available:
            if _match_symptom_name(exp["name"], act.name):
                match_found = act
                break

        if match_found:
            actual_available.remove(match_found)
            matched_pairs.append((exp, match_found))
            details["matched_symptoms"].append({
                "expected": exp["name"],
                "actual": match_found.name,
            })
        else:
            details["unmatched_expected"].append(exp["name"])

    for act in actual_available:
        details["unmatched_actual"].append(act.name)

    # Symptom name correctness: all expected matched 1-to-1 with no extras
    symptoms_correct = (
        len(matched_pairs) == len(expected_symptoms) and len(actual_available) == 0
    )

    if not symptoms_correct:
        return False, False, False, details

    # Duration correctness check
    duration_correct = True
    for exp, act in matched_pairs:
        exp_dur = _normalize_text(exp.get("duration"))
        act_dur = _normalize_text(act.duration)

        if exp_dur is None:
            # Expected duration is None; actual must be None (no hallucinated duration)
            if act_dur is not None:
                duration_correct = False
                break
        else:
            # Expected duration exists; actual must match
            if act_dur is None or (exp_dur not in act_dur and act_dur not in exp_dur):
                duration_correct = False
                break

    # Severity correctness check
    severity_correct = True
    for exp, act in matched_pairs:
        exp_sev = _normalize_text(exp.get("severity"))
        act_sev = _normalize_text(act.severity)

        if exp_sev is None:
            # Expected severity is None; actual must be None (no hallucinated severity)
            if act_sev is not None:
                severity_correct = False
                break
        else:
            # Expected severity exists; actual must match
            if act_sev is None or (exp_sev not in act_sev and act_sev not in exp_sev):
                severity_correct = False
                break

    return symptoms_correct, duration_correct, severity_correct, details


def _evaluate_danger_signs(
    expected_danger_signs: List[Dict[str, Any]],
    actual_danger_signs: List[DangerSign],
    transcript: str,
) -> Tuple[bool, bool, bool, Dict[str, Any]]:
    """
    Compare danger signs with both strict and clinical category matching.

    Returns:
        (strict_correct, clinical_correct, evidence_valid, details_dict)
    """
    details: Dict[str, Any] = {
        "expected_count": len(expected_danger_signs),
        "actual_count": len(actual_danger_signs),
        "matched_signs_strict": [],
        "matched_signs_clinical": [],
        "unmatched_expected_strict": [],
        "unmatched_expected_clinical": [],
        "unmatched_actual_strict": [],
        "unmatched_actual_clinical": [],
    }

    evidence_valid = all(
        bool(ds.evidence and ds.evidence in transcript) for ds in actual_danger_signs
    ) if actual_danger_signs else True

    # Case 1: No danger signs expected (negated or absent)
    if not expected_danger_signs:
        if not actual_danger_signs:
            return True, True, True, details
        else:
            for ds in actual_danger_signs:
                details["unmatched_actual_strict"].append(ds.sign)
                details["unmatched_actual_clinical"].append(ds.sign)
            return False, False, evidence_valid, details

    # Case 2: Danger signs expected
    if len(actual_danger_signs) != len(expected_danger_signs):
        for exp in expected_danger_signs:
            details["unmatched_expected_strict"].append(exp["sign"])
            details["unmatched_expected_clinical"].append(exp["sign"])
        for act in actual_danger_signs:
            details["unmatched_actual_strict"].append(act.sign)
            details["unmatched_actual_clinical"].append(act.sign)
        return False, False, evidence_valid, details

    # Track A: Strict Evaluation (Literal sign name & exact == evidence)
    available_strict = list(actual_danger_signs)
    matched_strict = []
    for exp in expected_danger_signs:
        match = None
        for act in available_strict:
            if _match_danger_sign_name(exp["sign"], act.sign):
                if act.evidence and act.evidence in transcript:
                    if _normalize_text(act.evidence) == _normalize_text(exp.get("evidence")):
                        match = act
                        break
        if match:
            available_strict.remove(match)
            matched_strict.append((exp, match))
            details["matched_signs_strict"].append(match.sign)
        else:
            details["unmatched_expected_strict"].append(exp["sign"])
    for act in available_strict:
        details["unmatched_actual_strict"].append(act.sign)

    strict_correct = (
        len(matched_strict) == len(expected_danger_signs)
        and len(available_strict) == 0
        and evidence_valid
        and all(act.is_present for _, act in matched_strict)
    )

    # Track B: Clinical Evaluation (Category match + one-direction evidence containment)
    available_clinical = list(actual_danger_signs)
    matched_clinical = []
    for exp in expected_danger_signs:
        clinical_match = None
        for act in available_clinical:
            if _match_danger_category(exp["sign"], act.sign):
                if act.evidence and act.evidence in transcript:
                    exp_ev = _normalize_text(exp.get("evidence")) or ""
                    act_ev = _normalize_text(act.evidence) or ""
                    # One-direction only: expected phrase must sit inside verbatim quote
                    if len(exp_ev) >= 6 and exp_ev in act_ev:
                        clinical_match = act
                        break
        if clinical_match:
            available_clinical.remove(clinical_match)
            matched_clinical.append((exp, clinical_match))
            details["matched_signs_clinical"].append(clinical_match.sign)
        else:
            details["unmatched_expected_clinical"].append(exp["sign"])
    for act in available_clinical:
        details["unmatched_actual_clinical"].append(act.sign)

    clinical_correct = (
        len(matched_clinical) == len(expected_danger_signs)
        and len(available_clinical) == 0
        and evidence_valid
        and all(act.is_present for _, act in matched_clinical)
    )

    return strict_correct, clinical_correct, evidence_valid, details


def _evaluate_missing_info(
    expected_missing_info: List[Dict[str, Optional[str]]],
    actual_missing_info: List[MissingInformation],
) -> Tuple[bool, Dict[str, Any]]:
    """
    Verify whether expected clinical missing information gaps were identified.

    Strict Rules:
    - Compares expected and actual field_name values.
    - Rejects unrelated fields (e.g., 'favorite_color') when clinical fields are expected.
    - Detects missing expected fields and unsupported extra fields.
    """
    details: Dict[str, Any] = {
        "expected_count": len(expected_missing_info),
        "actual_count": len(actual_missing_info),
        "matched_fields": [],
        "unmatched_expected": [],
        "unmatched_actual": [],
    }

    if not expected_missing_info and not actual_missing_info:
        return True, details

    actual_available = list(actual_missing_info)
    matched_pairs = []

    for exp in expected_missing_info:
        exp_fn = exp["field_name"].strip().lower().replace("-", "_")
        match = None
        for act in actual_available:
            act_fn = act.field_name.strip().lower().replace("-", "_")
            if exp_fn == act_fn:
                match = act
                break
        if match:
            actual_available.remove(match)
            matched_pairs.append((exp, match))
            details["matched_fields"].append(exp["field_name"])
        else:
            details["unmatched_expected"].append(exp["field_name"])

    for act in actual_available:
        details["unmatched_actual"].append(act.field_name)

    missing_info_correct = (
        len(matched_pairs) == len(expected_missing_info)
        and len(actual_available) == 0
    )
    return missing_info_correct, details


# ============================================================================
# Main Evaluation Runner
# ============================================================================

def evaluate_test_case(
    test_case: EvaluationTestCase,
    model_callable: ModelCallable,
    system_prompt: Optional[str] = None,
) -> TestCaseResult:
    """
    Run a single test case through the extraction engine and evaluate its output.

    Args:
        test_case (EvaluationTestCase): The benchmark test case.
        model_callable (ModelCallable): The model callable function.
        system_prompt (Optional[str]): System prompt override if any.

    Returns:
        TestCaseResult: Detailed result for this test case.
    """
    input_data = TranscriptInput(
        raw_text=test_case.transcript,
        language=test_case.language,
        visit_id=test_case.id,
    )

    # Step 1: Run the actual extraction pipeline
    try:
        report: MedicalReportOutput = extract_medical_report(
            input_data=input_data,
            model_callable=model_callable,
            system_prompt=system_prompt,
        )
    except Exception as err:
        # Gracefully record extraction failures without halting the evaluation
        return TestCaseResult(
            case_id=test_case.id,
            category=test_case.category,
            is_success=False,
            error_type=type(err).__name__,
            error_message=str(err),
            details={"fatal_error": str(err)},
        )

    # Step 2: Evaluate symptoms, duration, and severity
    sym_correct, dur_correct, sev_correct, sym_details = _evaluate_symptoms(
        expected_symptoms=test_case.expected_symptoms,
        actual_symptoms=report.symptoms,
    )

    # Step 3: Evaluate danger signs and verbatim evidence grounding
    ds_strict_correct, ds_clinical_correct, ev_valid, ds_details = _evaluate_danger_signs(
        expected_danger_signs=test_case.expected_danger_signs,
        actual_danger_signs=report.danger_signs,
        transcript=test_case.transcript,
    )

    # Step 4: Evaluate missing information
    mi_correct, mi_details = _evaluate_missing_info(
        expected_missing_info=test_case.expected_missing_information,
        actual_missing_info=report.missing_information,
    )

    # Overall correctness: all dimensions must be correct (strict danger sign preserved)
    is_overall = (
        sym_correct
        and dur_correct
        and sev_correct
        and ds_strict_correct
        and ev_valid
        and mi_correct
    )

    return TestCaseResult(
        case_id=test_case.id,
        category=test_case.category,
        is_success=True,
        symptoms_correct=sym_correct,
        duration_correct=dur_correct,
        severity_correct=sev_correct,
        missing_info_correct=mi_correct,
        danger_signs_correct=ds_strict_correct,
        danger_signs_clinical_correct=ds_clinical_correct,
        evidence_valid=ev_valid,
        is_overall_correct=is_overall,
        details={
            "symptoms": sym_details,
            "danger_signs": ds_details,
            "missing_info": mi_details,
        },
    )


def run_evaluation(
    model_callable: ModelCallable,
    dataset: Optional[List[EvaluationTestCase]] = None,
    system_prompt: Optional[str] = None,
) -> EvaluationSummary:
    """
    Run evaluation across all test cases in the dataset and generate summary metrics.

    Args:
        model_callable (ModelCallable): The AI model callable to evaluate.
        dataset (Optional[List[EvaluationTestCase]]): Dataset to evaluate; defaults to EVALUATION_DATASET.
        system_prompt (Optional[str]): Optional custom system prompt.

    Returns:
        EvaluationSummary: Aggregated scores, counts, percentages, and case results.
    """
    cases = dataset if dataset is not None else get_all_test_cases()
    total_cases = len(cases)

    case_results: List[TestCaseResult] = []
    successful_cases = 0
    failed_cases = 0

    json_parse_failures = 0
    schema_validation_failures = 0
    evidence_validation_failures = 0
    model_invocation_failures = 0
    other_failures = 0

    sym_count = 0
    dur_count = 0
    sev_count = 0
    mi_count = 0
    ds_count = 0
    ds_clinical_count = 0
    ev_count = 0
    overall_count = 0

    danger_sign_tp = 0
    danger_sign_fp = 0
    danger_sign_tn = 0
    danger_sign_fn = 0

    danger_sign_clinical_tp = 0
    danger_sign_clinical_fp = 0
    danger_sign_clinical_tn = 0
    danger_sign_clinical_fn = 0

    for case in cases:
        res = evaluate_test_case(
            test_case=case,
            model_callable=model_callable,
            system_prompt=system_prompt,
        )
        case_results.append(res)

        # Danger sign contingency calculation per test case
        has_expected_ds = len(case.expected_danger_signs) > 0
        if has_expected_ds:
            if res.is_success and res.danger_signs_correct:
                danger_sign_tp += 1
            else:
                danger_sign_fn += 1
            if res.is_success and res.danger_signs_clinical_correct:
                danger_sign_clinical_tp += 1
            else:
                danger_sign_clinical_fn += 1
        else:
            if res.is_success and res.danger_signs_correct:
                danger_sign_tn += 1
            else:
                danger_sign_fp += 1
            if res.is_success and res.danger_signs_clinical_correct:
                danger_sign_clinical_tn += 1
            else:
                danger_sign_clinical_fp += 1

        if res.is_success:
            successful_cases += 1
            if res.symptoms_correct:
                sym_count += 1
            if res.duration_correct:
                dur_count += 1
            if res.severity_correct:
                sev_count += 1
            if res.missing_info_correct:
                mi_count += 1
            if res.danger_signs_correct:
                ds_count += 1
            if res.danger_signs_clinical_correct:
                ds_clinical_count += 1
            if res.evidence_valid:
                ev_count += 1
            if res.is_overall_correct:
                overall_count += 1
        else:
            failed_cases += 1
            if res.error_type == "JSONParseError":
                json_parse_failures += 1
            elif res.error_type == "SchemaValidationError":
                schema_validation_failures += 1
            elif res.error_type == "EvidenceValidationError":
                evidence_validation_failures += 1
            elif res.error_type == "ModelInvocationError":
                model_invocation_failures += 1
            else:
                other_failures += 1

    def _calc_pct(count: int) -> float:
        return round((count / total_cases) * 100, 1) if total_cases > 0 else 0.0

    # Decoupled Sensitivity & Specificity calculations
    sens_denom = danger_sign_tp + danger_sign_fn
    sens_pct = round((danger_sign_tp / sens_denom) * 100, 1) if sens_denom > 0 else None

    spec_denom = danger_sign_tn + danger_sign_fp
    spec_pct = round((danger_sign_tn / spec_denom) * 100, 1) if spec_denom > 0 else None

    clin_sens_denom = danger_sign_clinical_tp + danger_sign_clinical_fn
    clin_sens_pct = round((danger_sign_clinical_tp / clin_sens_denom) * 100, 1) if clin_sens_denom > 0 else None

    clin_spec_denom = danger_sign_clinical_tn + danger_sign_clinical_fp
    clin_spec_pct = round((danger_sign_clinical_tn / clin_spec_denom) * 100, 1) if clin_spec_denom > 0 else None

    safety_note = (
        f"Dataset contains {sens_denom} positive danger-sign case(s). "
        f"Sensitivity is evaluated on n={sens_denom}. "
        "Pooled danger-sign accuracy must not be claimed as clinical safety."
    )

    return EvaluationSummary(
        total_cases=total_cases,
        successful_cases=successful_cases,
        failed_cases=failed_cases,
        json_parse_failures=json_parse_failures,
        schema_validation_failures=schema_validation_failures,
        evidence_validation_failures=evidence_validation_failures,
        model_invocation_failures=model_invocation_failures,
        other_failures=other_failures,
        symptom_correctness_count=sym_count,
        symptom_correctness_pct=_calc_pct(sym_count),
        duration_correctness_count=dur_count,
        duration_correctness_pct=_calc_pct(dur_count),
        severity_correctness_count=sev_count,
        severity_correctness_pct=_calc_pct(sev_count),
        missing_info_correctness_count=mi_count,
        missing_info_correctness_pct=_calc_pct(mi_count),
        danger_sign_tp=danger_sign_tp,
        danger_sign_fp=danger_sign_fp,
        danger_sign_tn=danger_sign_tn,
        danger_sign_fn=danger_sign_fn,
        danger_sign_sensitivity_numerator=danger_sign_tp,
        danger_sign_sensitivity_denominator=sens_denom,
        danger_sign_sensitivity_pct=sens_pct,
        danger_sign_specificity_numerator=danger_sign_tn,
        danger_sign_specificity_denominator=spec_denom,
        danger_sign_specificity_pct=spec_pct,
        danger_sign_clinical_safety_note=safety_note,
        danger_sign_correctness_count=ds_count,
        danger_sign_correctness_pct=_calc_pct(ds_count),
        evidence_validity_count=ev_count,
        evidence_validity_pct=_calc_pct(ev_count),
        overall_correct_cases=overall_count,
        overall_correct_pct=_calc_pct(overall_count),
        danger_sign_clinical_tp=danger_sign_clinical_tp,
        danger_sign_clinical_fp=danger_sign_clinical_fp,
        danger_sign_clinical_tn=danger_sign_clinical_tn,
        danger_sign_clinical_fn=danger_sign_clinical_fn,
        danger_sign_clinical_sensitivity_pct=clin_sens_pct,
        danger_sign_clinical_specificity_pct=clin_spec_pct,
        danger_sign_clinical_correctness_count=ds_clinical_count,
        danger_sign_clinical_correctness_pct=_calc_pct(ds_clinical_count),
        case_results=case_results,
    )


class EvaluationRunner:
    """
    Class wrapper for running benchmark evaluations against Dhwani extraction engine.
    """

    def __init__(
        self,
        model_callable: ModelCallable,
        dataset: Optional[List[EvaluationTestCase]] = None,
        system_prompt: Optional[str] = None,
    ):
        self.model_callable = model_callable
        self.dataset = dataset if dataset is not None else get_all_test_cases()
        self.system_prompt = system_prompt

    def run(self) -> EvaluationSummary:
        """Execute evaluation across the configured dataset."""
        return run_evaluation(
            model_callable=self.model_callable,
            dataset=self.dataset,
            system_prompt=self.system_prompt,
        )
