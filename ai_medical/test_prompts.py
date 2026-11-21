"""
ai_medical/test_prompts.py

Unit tests for AI system and user prompt definitions in Dhwani.
Tests template formatting, exact transcript inclusion, and metadata handling
using synthetic data only.
"""

import unittest

# Supports running either as a package (python -m unittest) or directly (python test_prompts.py)
try:
    from ai_medical.prompts import SYSTEM_PROMPT, USER_PROMPT_TEMPLATE
except ImportError:
    from prompts import SYSTEM_PROMPT, USER_PROMPT_TEMPLATE


class TestPrompts(unittest.TestCase):
    """
    Test suite verifying Dhwani's prompt definitions, template formatting,
    and prompt-injection boundary demarcations.
    """

    def setUp(self):
        """Set up synthetic test data for prompt formatting."""
        self.synthetic_transcript = (
            "Namaste didi, mujhe kal raat se pet dard aur halki ulti jaisa lag raha hai."
        )

    def test_system_prompt_imports_and_is_non_empty(self):
        """
        Test 1: Verify that SYSTEM_PROMPT imports successfully and is a non-empty string.
        """
        self.assertIsInstance(SYSTEM_PROMPT, str)
        self.assertGreater(len(SYSTEM_PROMPT.strip()), 0)

    def test_user_prompt_template_imports_successfully(self):
        """
        Test 2: Verify that USER_PROMPT_TEMPLATE imports successfully and is a non-empty string.
        """
        self.assertIsInstance(USER_PROMPT_TEMPLATE, str)
        self.assertGreater(len(USER_PROMPT_TEMPLATE.strip()), 0)

    def test_template_formats_correctly_with_metadata(self):
        """
        Test 3: Verify that USER_PROMPT_TEMPLATE formats correctly when provided
        visit_id, patient_id, language, and raw_text.
        """
        visit_id = "VISIT-2026-TEST-001"
        patient_id = "PATIENT-IND-999"
        language = "Hinglish"

        formatted = USER_PROMPT_TEMPLATE.format(
            visit_id=visit_id,
            patient_id=patient_id,
            language=language,
            raw_text=self.synthetic_transcript,
        )

        self.assertIn(visit_id, formatted)
        self.assertIn(patient_id, formatted)
        self.assertIn(language, formatted)
        self.assertIn(self.synthetic_transcript, formatted)

    def test_formatted_prompt_contains_original_transcript_exactly(self):
        """
        Test 4: Verify that the formatted prompt contains the original
        transcript text verbatim without modifications or truncation.
        """
        raw_text_sample = "Patient stated: 'Bukhar 3 din se hai aur khana nahi khaya ja raha.'"

        formatted = USER_PROMPT_TEMPLATE.format(
            visit_id="V-123",
            patient_id="P-456",
            language="hi-Latn",
            raw_text=raw_text_sample,
        )

        self.assertIn(raw_text_sample, formatted)

    def test_missing_optional_metadata_handled_gracefully(self):
        """
        Test 5: Verify that missing optional metadata represented by None
        does not cause a formatting error and formats cleanly.
        Also asserts that SYSTEM_PROMPT explicitly explains how to interpret
        unavailable metadata.
        """
        try:
            formatted = USER_PROMPT_TEMPLATE.format(
                visit_id=None,
                patient_id=None,
                language=None,
                raw_text=self.synthetic_transcript,
            )
        except Exception as e:
            self.fail(f"Formatting failed with None metadata: {e}")

        self.assertIn("Visit ID: None", formatted)
        self.assertIn("Patient ID: None", formatted)
        self.assertIn("Recorded Language: None", formatted)
        self.assertIn(self.synthetic_transcript, formatted)

        # Assert that the prompt explicitly explains how to interpret unavailable metadata
        self.assertIn(
            "unavailable metadata",
            SYSTEM_PROMPT,
            "SYSTEM_PROMPT must explicitly explain that 'None' indicates unavailable metadata."
        )

    def test_transcript_placed_under_untrusted_dialogue_section(self):
        """
        Test 6: Verify that the transcript text is located under the
        explicitly demarcated untrusted patient dialogue section.
        """
        section_header = "[Transcript Content - Untrusted Patient Dialogue]"

        formatted = USER_PROMPT_TEMPLATE.format(
            visit_id="V-100",
            patient_id="P-200",
            language="en",
            raw_text=self.synthetic_transcript,
        )

        # Header must exist
        self.assertIn(section_header, formatted)

        # The raw transcript must appear strictly after the untrusted dialogue header
        header_index = formatted.find(section_header)
        transcript_index = formatted.find(self.synthetic_transcript)

        self.assertGreater(
            transcript_index,
            header_index,
            "Transcript text should appear after the untrusted dialogue section header.",
        )


if __name__ == "__main__":
    unittest.main()
