"""
ai_medical/test_extractor.py

Unit tests for the extractor module and schemas in Dhwani.
Tests intermediate extraction interfaces, validation, and safe defaults
using synthetic test data.
"""

import unittest
from pydantic import ValidationError

# Supports running either as a package (python -m unittest) or directly (python test_extractor.py)
try:
    from ai_medical.schemas import ExtractedSymptom, TranscriptInput
    from ai_medical.extractor import ExtractionResult, extract_from_transcript
except ImportError:
    from schemas import ExtractedSymptom, TranscriptInput
    from extractor import ExtractionResult, extract_from_transcript


class TestTranscriptExtractor(unittest.TestCase):
    """
    Test cases for transcript extraction interfaces and intermediate models.
    Focuses on input acceptance, exact evidence preservation, safety defaults,
    and placeholder behavior.
    """

    def setUp(self):
        """Set up standard synthetic sample data for tests."""
        self.synthetic_hinglish_text = (
            "Namaste didi, mujhe 2 din se halka bukhar hai aur thoda sar dard hai."
        )

    def test_valid_hinglish_transcript_accepted(self):
        """
        Test 1: Verify that a valid Hinglish transcript is accepted
        by TranscriptInput and processed into an ExtractionResult.
        """
        input_data = TranscriptInput(
            raw_text=self.synthetic_hinglish_text,
            language="hi-Latn",
            visit_id="VISIT-IND-001"
        )
        result = extract_from_transcript(input_data)

        self.assertIsInstance(result, ExtractionResult)
        self.assertIsNotNone(result.raw_text)

    def test_original_transcript_preserved_exactly(self):
        """
        Test 2: Verify that the original transcript text is preserved exactly
        in ExtractionResult for downstream evidence grounding and auditability.
        """
        raw_text_sample = "Patient ko kal se cold hai aur gala kharab hai."
        input_data = TranscriptInput(raw_text=raw_text_sample)
        result = extract_from_transcript(input_data)

        # The preserved raw_text must match the exact string passed in
        self.assertEqual(result.raw_text, raw_text_sample)

    def test_visit_id_carried_into_extraction_result(self):
        """
        Test 3: Verify that visit_id is carried accurately from
        TranscriptInput into ExtractionResult.
        """
        expected_visit_id = "VISIT-2026-ASHA-042"
        input_data = TranscriptInput(
            raw_text=self.synthetic_hinglish_text,
            visit_id=expected_visit_id
        )
        result = extract_from_transcript(input_data)

        self.assertEqual(result.visit_id, expected_visit_id)

    def test_absent_patient_id_remains_none(self):
        """
        Test 4: Verify that when patient_id is not provided, it remains None.
        Strict rule: Never invent or assume patient identifiers.
        """
        input_data = TranscriptInput(
            raw_text=self.synthetic_hinglish_text,
            patient_id=None
        )
        result = extract_from_transcript(input_data)

        self.assertIsNone(result.patient_id)

    def test_placeholder_returns_none_and_empty_list(self):
        """
        Test 5: Verify that placeholder extraction returns None for chief_complaint
        and an empty list for symptoms.
        Extraction logic is not yet implemented; no symptoms should be hallucinated.
        """
        input_data = TranscriptInput(raw_text=self.synthetic_hinglish_text)
        result = extract_from_transcript(input_data)

        self.assertIsNone(
            result.chief_complaint,
            "Chief complaint should be None while extraction is a placeholder."
        )
        self.assertEqual(
            result.symptoms,
            [],
            "Symptoms list should be empty while extraction is a placeholder."
        )

    def test_empty_and_whitespace_transcript_rejected(self):
        """
        Test 6: Verify that empty or whitespace-only transcripts are
        rejected by TranscriptInput validation.
        """
        # Empty string should raise ValidationError
        with self.assertRaises(ValidationError):
            TranscriptInput(raw_text="")

        # Whitespace-only string should raise ValidationError
        with self.assertRaises(ValidationError):
            TranscriptInput(raw_text="   \t\n  ")

    def test_independent_symptoms_list_across_instances(self):
        """
        Test 7: Verify that two separate ExtractionResult instances do not share
        the same symptoms list in memory (preventing mutable default list side effects).
        """
        res1 = ExtractionResult(raw_text="Sample text 1")
        res2 = ExtractionResult(raw_text="Sample text 2")

        # Mutate res1's list
        dummy_symptom = ExtractedSymptom(name="headache")
        res1.symptoms.append(dummy_symptom)

        # Verify res2 remains unaffected
        self.assertEqual(len(res1.symptoms), 1)
        self.assertEqual(len(res2.symptoms), 0)
        self.assertIsNot(res1.symptoms, res2.symptoms)


if __name__ == "__main__":
    unittest.main()
