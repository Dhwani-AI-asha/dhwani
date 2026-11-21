"""
ai_medical/test_grounding_and_identity.py

Regression test suite verifying:
1. Strict source-only extraction (no fabricated BP, weight, visit_type, next_visit_date, booster, symptoms).
2. Exact regression transcript: "राधिमा को TT injection लगाया है। इसका BP 120/80 है।"
3. Strict patient identity preservation across Hindi Devanagari, Hinglish, and English names.
4. Ambiguous, missing, mismatched identity detection and confirmation gating.
5. Conflicting vitals detection and confirmed ASHA corrections surviving regeneration.
"""

import json
import unittest

try:
    from ai_medical.extraction_engine import ExtractionEngine
    from ai_medical.grounding import extract_patient_name_from_text, ground_report_dict
    from ai_medical.service import correct_report_package, generate_report_package
    from ai_medical.voice_correction import apply_structured_voice_correction
except ImportError:
    from extraction_engine import ExtractionEngine
    from grounding import extract_patient_name_from_text, ground_report_dict
    from service import correct_report_package, generate_report_package
    from voice_correction import apply_structured_voice_correction


TARGET_TRANSCRIPT = "राधिमा को TT injection लगाया है। इसका BP 120/80 है।"


def _adversarial_hallucinating_model(system_prompt: str, user_prompt: str) -> str:
    """
    Simulates a hallucinating LLM attempting to emit every bug seen previously:
    wrong BP (250/60), unmentioned weight (56 kg), wrong patient (Pooja Devi),
    unmentioned Visit #3, unmentioned 24 Nov 2024, and TT booster.
    """
    return json.dumps({
        "patient_name": "Pooja Devi",
        "patient_age": "26 years",
        "patient_gender": "female",
        "chief_complaint": "Antenatal Care Visit #3 and TT booster",
        "symptoms": [
            {"name": "headache", "duration": "yesterday", "severity": "mild", "body_site": None, "notes": None},
            {"name": "pedal edema", "duration": "2 days", "severity": "mild", "body_site": "feet", "notes": None},
        ],
        "danger_signs": [],
        "vital_signs_mentioned": {
            "bp": "250/60",
            "weight": "56 kg",
            "pulse": "78 bpm",
        },
        "missing_information": [],
        "professional_review_required": False,
        "summary": "Pooja Devi attended Antenatal Care Visit #3. BP 250/60, Weight 56 kg, TT booster given. Next visit 24 Nov 2024.",
        "notes": None,
    })


class TestSourceGroundingAndIdentity(unittest.TestCase):

    def test_exact_regression_transcript_eliminates_all_fabricated_fields(self):
        """
        Regression test for:
        "राधिमा को TT injection लगाया है। इसका BP 120/80 है।"
        Must never contain BP 250/60, Weight 56 kg, Visit #3, 24 Nov 2024, TT booster, or Pooja Devi.
        """
        engine = ExtractionEngine(_adversarial_hallucinating_model)
        pkg = generate_report_package(TARGET_TRANSCRIPT, engine)

        self.assertTrue(pkg["ok"])
        report = pkg["report"]

        # Exact patient name preserved in Devanagari verbatim
        self.assertEqual(report["patient_name"], "राधिमा")
        self.assertEqual(report["identity_status"], "verified")
        self.assertEqual(report["patient_name_source"], "transcript")

        # Exact spoken BP preserved; unmentioned vitals removed
        self.assertEqual(report["vital_signs_mentioned"], {"bp": "120/80"})
        self.assertNotIn("weight", report["vital_signs_mentioned"])
        self.assertNotIn("pulse", report["vital_signs_mentioned"])

        # Unmentioned fields strictly None
        self.assertIsNone(report["patient_age"])
        self.assertIsNone(report["patient_gender"])
        self.assertIsNone(report["visit_type"])
        self.assertIsNone(report["next_visit_date"])
        self.assertEqual(report["symptoms"], [])

        # Exact vaccination fidelity (no booster/dose inference)
        self.assertEqual(report["vaccination_status"], "TT injection administered")
        self.assertIsNone(report["booster_status"])
        self.assertIsNone(report["dose_number"])

        # Summary & narration consistency (zero fabricated facts)
        for text in (report["summary"], pkg["narration"], pkg["narration_speech"]):
            self.assertIn("राधिमा", text)
            self.assertIn("120", text)
            self.assertIn("80", text)
            self.assertNotIn("250/60", text)
            self.assertNotIn("56 kg", text)
            self.assertNotIn("Visit #3", text)
            self.assertNotIn("24 Nov 2024", text)
            self.assertNotIn("Pooja", text)
            self.assertNotIn("TT booster", text)

        # Unmentioned fields flagged as follow-up confirmation questions without auto-populating values
        missing_fields = {m["field_name"] for m in report["missing_information"]}
        self.assertIn("weight", missing_fields)
        self.assertIn("visit_type", missing_fields)
        self.assertIn("next_visit_date", missing_fields)

    def test_distinct_hindi_english_hinglish_names_preserved_verbatim(self):
        cases = [
            ("राधिमा को TT injection लगाया है।", "राधिमा"),
            ("Meena Devi has fever and BP 118/76.", "Meena Devi"),
            ("Ramesh ko kal se bukhar hai.", "Ramesh"),
            ("Patient name is Sunita Kumari. Weight is 52 kg.", "Sunita Kumari"),
            ("लाभार्थी का नाम कविता शर्मा है।", "कविता शर्मा"),
        ]
        for transcript, expected_name in cases:
            with self.subTest(transcript=transcript):
                info = extract_patient_name_from_text(transcript)
                self.assertFalse(info["ambiguous"])
                self.assertEqual(info["name"], expected_name)

    def test_missing_patient_name_never_guessed_or_substituted(self):
        engine = ExtractionEngine(_adversarial_hallucinating_model)
        pkg = generate_report_package("Patient ko bukhar hai aur BP 110/70 hai.", engine)
        report = pkg["report"]

        self.assertIsNone(report["patient_name"])
        self.assertEqual(report["identity_status"], "missing")
        self.assertIn("Name not provided", pkg["narration"])
        self.assertNotIn("Pooja", pkg["narration"])

    def test_ambiguous_name_asks_confirmation_and_blocks_confirm(self):
        engine = ExtractionEngine(_adversarial_hallucinating_model)
        pkg = generate_report_package("Pooja ya Sunita ko TT injection laga hai.", engine)
        report = pkg["report"]

        self.assertIsNone(report["patient_name"])
        self.assertTrue(report["patient_name_ambiguous"])
        self.assertEqual(report["identity_status"], "ambiguous")

        # Voice confirmation must block until resolved
        res = apply_structured_voice_correction(report, "Haan, confirm karo")
        self.assertEqual(res["action"], "clarify")
        self.assertFalse(res["confirmed"])

    def test_selected_beneficiary_preserved_and_mismatch_detected(self):
        engine = ExtractionEngine(_adversarial_hallucinating_model)

        # Case A: Selected beneficiary with transcript omitting name
        pkg_match = generate_report_package(
            "TT injection लगाया है। BP 120/80 है।",
            engine,
            selected_patient_name="Meena Devi",
        )
        self.assertEqual(pkg_match["report"]["patient_name"], "Meena Devi")
        self.assertEqual(pkg_match["report"]["identity_status"], "verified")
        self.assertEqual(pkg_match["report"]["patient_name_source"], "selected_beneficiary")

        # Case B: Selected beneficiary differs from explicit transcript patient name -> flag mismatch
        pkg_mismatch = generate_report_package(
            TARGET_TRANSCRIPT,
            engine,
            selected_patient_name="Pooja Devi",
        )
        self.assertEqual(pkg_mismatch["report"]["identity_status"], "mismatch")
        self.assertEqual(pkg_mismatch["report"]["transcript_patient_name"], "राधिमा")

        # Voice confirmation must refuse silent save on identity mismatch
        res = apply_structured_voice_correction(
            pkg_mismatch["report"],
            "Haan sahi hai",
            selected_patient_name="Pooja Devi",
        )
        self.assertEqual(res["action"], "clarify")
        self.assertFalse(res["confirmed"])

    def test_conflicting_vitals_surfaced_without_fabrication(self):
        engine = ExtractionEngine(_adversarial_hallucinating_model)
        pkg = generate_report_package(
            "राधिमा का BP 120/80 है, नहीं फिर से नापने पर BP 140/90 आया।",
            engine,
        )
        report = pkg["report"]
        self.assertTrue(any(c["field"] == "bp" for c in report["conflicts"]))
        self.assertTrue(any(m["field_name"] == "bp_conflict" for m in report["missing_information"]))

    def test_explicit_correction_overrides_bp_and_survives_regeneration(self):
        engine = ExtractionEngine(_adversarial_hallucinating_model)
        initial = generate_report_package(TARGET_TRANSCRIPT, engine)
        self.assertEqual(initial["report"]["vital_signs_mentioned"]["bp"], "120/80")

        # Voice correction changes BP 120/80 -> 110/90
        vc = apply_structured_voice_correction(
            initial["report"],
            "Nahi, BP 110/90 hai.",
            transcript=initial["transcript_used"],
        )
        self.assertEqual(vc["action"], "updated")
        self.assertEqual(vc["report"]["vital_signs_mentioned"]["bp"], "110/90")
        self.assertEqual(vc["report"]["patient_name"], "राधिमा")
        self.assertIsNone(vc["report"].get("visit_type"))
        self.assertIsNone(vc["report"].get("booster_status"))

        # Subsequent full report regeneration via correct_report_package still enforces 110/90
        # even when adversarial LLM returns 250/60!
        regen = correct_report_package(TARGET_TRANSCRIPT, "BP 110/90 hai", engine)
        self.assertEqual(regen["report"]["vital_signs_mentioned"]["bp"], "110/90")
        self.assertEqual(regen["report"]["patient_name"], "राधिमा")
        self.assertNotIn("weight", regen["report"]["vital_signs_mentioned"])
        self.assertIsNone(regen["report"]["visit_type"])


if __name__ == "__main__":
    unittest.main()
