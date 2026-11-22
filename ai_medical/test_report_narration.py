"""
ai_medical/test_report_narration.py

Unit tests for Dhwani AI's automatic language-matched medical report narration module.
Tests automatic language detection (English, Hindi Devanagari, Hindi Latin, Hinglish),
medical accuracy and safety constraints, mode formatting, fallback handling,
and non-mutation of input report models.
"""

import copy
import unittest

try:
    from ai_medical.schemas import (
        DangerSign,
        ExtractedSymptom,
        MedicalReportOutput,
        MissingInformation,
    )
    from ai_medical.report_narration import (
        NarrationLanguage,
        NarrationMode,
        detect_transcript_language,
        generate_narration_result,
        narrate_medical_report,
    )
except ImportError:
    from schemas import (
        DangerSign,
        ExtractedSymptom,
        MedicalReportOutput,
        MissingInformation,
    )
    from report_narration import (
        NarrationLanguage,
        NarrationMode,
        detect_transcript_language,
        generate_narration_result,
        narrate_medical_report,
    )


def make_sample_report(with_danger_signs: bool = False) -> MedicalReportOutput:
    """Helper to construct synthetic, validated MedicalReportOutput instances."""
    danger_signs = []
    if with_danger_signs:
        danger_signs.append(
            DangerSign(
                sign="Severe difficulty breathing",
                evidence="saans lene me bahut zyada dikkat ho rahi hai",
                is_present=True,
                urgency_level=None
            )
        )

    return MedicalReportOutput(
        patient_name="Sunita Devi",
        patient_age="34 years",
        patient_gender="female",
        chief_complaint="fever and cough",
        symptoms=[
            ExtractedSymptom(
                name="fever",
                duration="3 days",
                severity="moderate",
                body_site=None,
                notes=None
            ),
            ExtractedSymptom(
                name="cough",
                duration=None,
                severity=None,
                body_site="chest",
                notes="dry cough"
            )
        ],
        danger_signs=danger_signs,
        vital_signs_mentioned={"temperature": "101 F", "bp": "120/80"},
        missing_information=[
            MissingInformation(
                field_name="cough_duration",
                reason="How long the cough has persisted is unstated",
                prompt_question="Khasi kitne din se hai?",
                importance="high"
            )
        ],
        professional_review_required=len(danger_signs) > 0,
        summary="Patient reports fever for 3 days and dry cough without stated duration. Vitals noted.",
        notes=None
    )


class TestReportNarration(unittest.TestCase):
    """Test suite for automatic language-matched report narration and safety constraints."""

    # ========================================================================
    # 1. Automatic Language Detection Tests
    # ========================================================================

    def test_english_transcript_detected_and_narrated(self):
        """
        Verify that a consultation spoken primarily in English generates English narration.
        """
        transcript = "The patient reports fever for three days. The severity has not been specified."
        report = make_sample_report(with_danger_signs=False)

        result = generate_narration_result(report, transcript=transcript)
        self.assertEqual(result.language, NarrationLanguage.ENGLISH.value)
        self.assertFalse(result.language_detection.fallback_used)
        self.assertIn("REPORTED SYMPTOMS", result.narration_text)
        self.assertIn("CHIEF COMPLAINT", result.narration_text)
        self.assertIn("fever", result.narration_text)

    def test_hindi_devanagari_transcript_detected_and_narrated(self):
        """
        Verify that a consultation spoken in Hindi (Devanagari script) generates Hindi narration.
        """
        transcript = "मरीज को तीन दिनों से बुखार है। बुखार कितना तेज है, इसकी जानकारी नहीं दी गई है।"
        report = make_sample_report(with_danger_signs=False)

        result = generate_narration_result(report, transcript=transcript)
        self.assertEqual(result.language, NarrationLanguage.HINDI.value)
        self.assertFalse(result.language_detection.fallback_used)
        self.assertIn("दर्ज किए गए लक्षण", result.narration_text)
        self.assertIn("मुख्य शिकायत", result.narration_text)
        self.assertIn("मरीज का विवरण", result.narration_text)

    def test_hindi_latin_script_transcript_detected_and_narrated(self):
        """
        Verify that Hindi written in Latin script is correctly recognized as Hindi.
        """
        transcript = "mariz ko teen din se bukhar hai. bukhar kitna tej hai iski jankari nahi di gayi hai."
        report = make_sample_report(with_danger_signs=False)

        result = generate_narration_result(report, transcript=transcript)
        self.assertEqual(result.language, NarrationLanguage.HINDI.value)
        self.assertFalse(result.language_detection.fallback_used)
        self.assertIn("दर्ज किए गए लक्षण", result.narration_text)

    def test_hinglish_transcript_detected_and_narrated(self):
        """
        Verify that a naturally code-mixed Hindi-English transcript generates Hinglish narration.
        """
        transcript = "Patient ko teen din se fever hai. Fever kitna severe hai, yeh mention nahi kiya gaya."
        report = make_sample_report(with_danger_signs=False)

        result = generate_narration_result(report, transcript=transcript)
        self.assertEqual(result.language, NarrationLanguage.HINGLISH.value)
        self.assertFalse(result.language_detection.fallback_used)
        self.assertIn("MEDICAL REPORT NARRATION (HINGLISH)", result.narration_text)
        self.assertIn("REPORTED SYMPTOMS", result.narration_text)
        self.assertIn("Duration: 3 days", result.narration_text)

    def test_english_sentence_with_hindi_names_or_borrowed_words(self):
        """
        Verify that an English sentence mentioning Indian names or cultural terms
        (e.g., 'Ramesh', 'Sunita', 'ASHA') is still detected as English, not Hindi or Hinglish.
        """
        transcript = "Ramesh has been suffering from a mild cough for three days. ASHA worker Sunita visited him at home."
        detection = detect_transcript_language(transcript)

        self.assertEqual(detection.detected_language, NarrationLanguage.ENGLISH.value)
        self.assertFalse(detection.fallback_used)

        report = make_sample_report()
        text = narrate_medical_report(report, transcript=transcript)
        self.assertIn("=== MEDICAL REPORT NARRATION ===", text)

    def test_hindi_sentence_with_english_medical_terminology(self):
        """
        Verify that Hindi sentences containing isolated English medical terms
        (e.g., 'BP', 'check', 'dawai') are recognized as Hindi, not mistaken for full Hinglish.
        """
        transcript = "mariz ko bukhar aur khasi hai, dawai di gayi hai aur bp check kiya hai."
        detection = detect_transcript_language(transcript)

        self.assertEqual(detection.detected_language, NarrationLanguage.HINDI.value)
        self.assertFalse(detection.fallback_used)

    def test_mixed_language_code_mixing(self):
        """
        Verify that natural code-mixing with balanced English content and Hindi syntax is detected as Hinglish.
        """
        transcript = "Severe chest pain ho raha hai past 2 days se, par fever nahi hai."
        detection = detect_transcript_language(transcript)

        self.assertEqual(detection.detected_language, NarrationLanguage.HINGLISH.value)
        self.assertFalse(detection.fallback_used)

    # ========================================================================
    # 2. Edge Cases: Short, Ambiguous, Empty, and None Transcripts
    # ========================================================================

    def test_short_transcript_uses_fallback_gracefully(self):
        """
        Verify that short ambiguous transcripts ('ok', 'yes') with insufficient linguistic signal
        trigger the documented fallback without raising an error.
        """
        transcript = "ok"
        detection = detect_transcript_language(transcript, default_fallback="en")

        self.assertEqual(detection.detected_language, "en")
        self.assertTrue(detection.fallback_used)
        self.assertIn("insufficient linguistic confidence", detection.reason)

    def test_ambiguous_transcript_uses_fallback(self):
        """
        Verify that ambiguous numeric or non-syntactic strings trigger fallback with explicit reason.
        """
        transcript = "120/80 normal report 123"
        detection = detect_transcript_language(transcript, default_fallback="en")

        self.assertEqual(detection.detected_language, "en")
        self.assertTrue(detection.fallback_used)

    def test_empty_and_whitespace_transcript(self):
        """
        Verify that empty or whitespace-only transcripts trigger the fallback explicitly.
        """
        for empty_text in ["", "   ", "\n\t  \n"]:
            with self.subTest(empty_text=repr(empty_text)):
                detection = detect_transcript_language(empty_text, default_fallback="en")
                self.assertEqual(detection.detected_language, "en")
                self.assertTrue(detection.fallback_used)
                self.assertEqual(detection.confidence, 0.0)

    def test_transcript_none_handled_explicitly(self):
        """
        Verify requirement: If the original transcript is None, do NOT pretend
        language was detected. Handle explicitly with documented fallback.
        """
        detection = detect_transcript_language(None, default_fallback="hi")
        self.assertEqual(detection.detected_language, "hi")
        self.assertTrue(detection.fallback_used)
        self.assertEqual(detection.confidence, 0.0)
        self.assertIn("Transcript was not provided (None)", detection.reason)

        report = make_sample_report()
        result = generate_narration_result(report, transcript=None, fallback_language="en")
        self.assertFalse(result.transcript_provided)
        self.assertTrue(result.language_detection.fallback_used)
        self.assertEqual(result.language, "en")

    # ========================================================================
    # 3. Narration Modes (FULL_REPORT vs IMPORTANT_FLAGS)
    # ========================================================================

    def test_important_flags_mode_english(self):
        """
        Verify IMPORTANT_FLAGS mode in English focuses on danger signs, review requirement, and gaps.
        """
        report = make_sample_report(with_danger_signs=True)
        text = narrate_medical_report(report, transcript="Patient has fever and dyspnea.", mode=NarrationMode.IMPORTANT_FLAGS)

        self.assertIn("=== IMPORTANT CLINICAL FLAGS ===", text)
        self.assertIn("POTENTIAL DANGER SIGNS", text)
        self.assertIn("Severe difficulty breathing", text)
        self.assertIn("saans lene me bahut zyada dikkat ho rahi hai", text)
        self.assertIn("PROFESSIONAL REVIEW:", text)
        self.assertIn("HIGH-PRIORITY MISSING INFORMATION:", text)
        # Full report sections should NOT be present in IMPORTANT_FLAGS mode
        self.assertNotIn("PATIENT DETAILS:", text)

    def test_important_flags_mode_hindi(self):
        """
        Verify IMPORTANT_FLAGS mode in Hindi focuses on danger signs and clinical review.
        """
        report = make_sample_report(with_danger_signs=True)
        text = narrate_medical_report(
            report,
            transcript="मरीज को सांस लेने में बहुत दिक्कत हो रही है।",
            mode="IMPORTANT_FLAGS"
        )

        self.assertIn("=== महत्वपूर्ण चिकित्सीय संकेत (IMPORTANT FLAGS) ===", text)
        self.assertIn("संभावित खतरे के लक्षण:", text)
        self.assertIn("बातचीत से साक्ष्य", text)
        self.assertIn("स्वास्थ्य पेशेवर द्वारा समीक्षा", text)

    def test_important_flags_mode_hinglish(self):
        """
        Verify IMPORTANT_FLAGS mode in Hinglish.
        """
        report = make_sample_report(with_danger_signs=True)
        text = narrate_medical_report(
            report,
            transcript="Patient ko severe breathing problem ho rahi hai.",
            mode="IMPORTANT_FLAGS"
        )

        self.assertIn("=== IMPORTANT CLINICAL FLAGS ===", text)
        self.assertIn("POTENTIAL DANGER SIGNS:", text)
        self.assertIn("Transcript se exact evidence", text)
        self.assertIn("PROFESSIONAL CLINICAL REVIEW:", text)

    # ========================================================================
    # 4. Medical Accuracy and Safety Constraints
    # ========================================================================

    def test_danger_sign_absence_does_not_declare_patient_safe(self):
        """
        Critical Safety Rule:
        Do NOT say the patient is safe or illness-free merely because no danger signs were flagged.
        Verify that a routine evaluation disclaimer is always included.
        """
        report = make_sample_report(with_danger_signs=False)

        # Check English
        en_text = narrate_medical_report(report, transcript="The patient has mild headache.", mode=NarrationMode.FULL_REPORT)
        self.assertIn("Does not confirm patient safety or rule out unmentioned conditions", en_text)
        self.assertNotIn("patient is safe", en_text.lower())
        self.assertNotIn("patient is healthy", en_text.lower())

        # Check Hindi
        hi_text = narrate_medical_report(report, transcript="मरीज को सिरदर्द है।", mode=NarrationMode.FULL_REPORT)
        self.assertIn("पूरी तरह सुरक्षित होने की पुष्टि नहीं करता", hi_text)

        # Check Hinglish
        hinglish_text = narrate_medical_report(report, transcript="Patient ko headache hai.", mode=NarrationMode.FULL_REPORT)
        self.assertIn("patient fully safe hai aisa assume nahi karna hai", hinglish_text)

    def test_danger_signs_never_converted_to_diagnoses(self):
        """
        Safety Rule: Potential danger signs must be labeled as warning signs with transcript evidence,
        never as confirmed diagnoses.
        """
        report = make_sample_report(with_danger_signs=True)
        text = narrate_medical_report(report, transcript="Patient has difficulty breathing.", mode=NarrationMode.FULL_REPORT)

        self.assertIn("POTENTIAL DANGER SIGNS:", text)
        self.assertNotIn("CONFIRMED DIAGNOSES:", text)
        self.assertNotIn("DIAGNOSIS:", text)
        # Evidence quote must be preserved verbatim
        self.assertIn("saans lene me bahut zyada dikkat ho rahi hai", text)

    def test_missing_information_not_interpreted_as_negative_finding(self):
        """
        Safety Rule: Missing information must be presented as clinical follow-up gaps,
        never as negative clinical assertions (e.g. 'patient does not have cough duration').
        """
        report = make_sample_report()
        text = narrate_medical_report(report, transcript="The patient reports fever.", mode=NarrationMode.FULL_REPORT)

        self.assertIn("MISSING CLINICAL INFORMATION (FOR FOLLOW-UP):", text)
        self.assertIn("cough_duration: How long the cough has persisted is unstated", text)

    def test_original_report_is_never_mutated(self):
        """
        Integrity Rule: Narration generation must be strictly read-only and never mutate
        the input MedicalReportOutput instance.
        """
        report = make_sample_report(with_danger_signs=True)
        snapshot_before = copy.deepcopy(report.model_dump())

        # Run narrations across all modes and languages
        narrate_medical_report(report, transcript="English consultation text.", mode="FULL_REPORT")
        narrate_medical_report(report, transcript="मरीज को बुखार है।", mode="IMPORTANT_FLAGS")
        narrate_medical_report(report, transcript="Patient ko bukhar hai.", mode="FULL_REPORT")

        snapshot_after = report.model_dump()
        self.assertEqual(snapshot_before, snapshot_after, "MedicalReportOutput must NOT be mutated by narration.")

    # ========================================================================
    # 5. Manual Override and Configurable Fallback
    # ========================================================================

    def test_manual_language_override_respected(self):
        """
        Verify that if caller passes an explicit language, it is honored
        and metadata records manual override.
        """
        report = make_sample_report()
        # English transcript, but manual override to Hindi requested
        result = generate_narration_result(
            report,
            transcript="The patient reports fever.",
            language=NarrationLanguage.HINDI
        )
        self.assertEqual(result.language, NarrationLanguage.HINDI.value)
        self.assertTrue(result.language_detection.details.get("manual_override"))
        self.assertIn("दर्ज किए गए लक्षण", result.narration_text)

    def test_invalid_mode_raises_value_error(self):
        """Verify that an invalid narration mode raises ValueError."""
        report = make_sample_report()
        with self.assertRaises(ValueError):
            narrate_medical_report(report, transcript="hello", mode="INVALID_MODE")


if __name__ == "__main__":
    unittest.main()
