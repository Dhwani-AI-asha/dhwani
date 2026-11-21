"""
ai_medical/report_narration.py

Standalone Medical Report Narration Module for Dhwani AI.
Provides automatic language-matched narration of structured medical reports
(MedicalReportOutput) following the primary language spoken by the ASHA worker
in the original consultation transcript (English, Hindi, or Hinglish).

Core Principles & Safety Rules:
1. Automatic Language Grounding: Narration automatically follows the consultation's
   detected language (English, Hindi, or Hinglish) without requiring manual selection.
2. Non-Hallucinatory Narration: Communicates ONLY facts present in the validated report.
   Never invents symptoms, durations, severity, or demographics.
3. No Autonomous Diagnosis or Prescriptions: Never suggests diagnoses or treatments.
4. Red Flag Grounding: Potential danger signs are presented with their verbatim transcript
   evidence and never converted into confirmed medical diagnoses.
5. Patient Safety Disclaimer: The absence of danger signs does NOT imply the patient
   is fully healthy or safe; standard healthcare professional review is advised.
6. Missing Information Integrity: Clinical gaps are framed strictly as follow-up inquiries,
   never as negative clinical findings.
7. Explicit Fallback Handling: If the transcript is unavailable or ambiguous, a documented
   fallback is applied without falsely claiming language was detected.
"""

from dataclasses import dataclass, field
from enum import Enum
import re
from typing import Any, Dict, List, Optional, Set, Union
import unicodedata

try:
    from ai_medical.schemas import MedicalReportOutput
except ImportError:
    from schemas import MedicalReportOutput


# ============================================================================
# Enums and Data Models
# ============================================================================

class NarrationMode(str, Enum):
    """Supported narration depth modes."""
    IMPORTANT_FLAGS = "IMPORTANT_FLAGS"
    FULL_REPORT = "FULL_REPORT"


class NarrationLanguage(str, Enum):
    """Supported narration languages."""
    ENGLISH = "en"
    HINDI = "hi"
    HINGLISH = "hinglish"


@dataclass
class LanguageDetectionResult:
    """Detailed result of transcript language analysis."""
    detected_language: str
    confidence: float
    fallback_used: bool
    reason: str
    details: Dict[str, Any] = field(default_factory=dict)


@dataclass
class NarrationResult:
    """Full narration output with linguistic metadata."""
    narration_text: str
    language: str
    mode: str
    language_detection: LanguageDetectionResult
    transcript_provided: bool

    def __str__(self) -> str:
        return self.narration_text


# ============================================================================
# Linguistic Markers & Lexicons (Zero External Dependencies)
# ============================================================================

# English grammatical/syntactic markers that strongly indicate English sentence grammar
ENGLISH_SYNTACTIC_MARKERS: Set[str] = {
    "the", "is", "was", "are", "were", "been", "has", "have", "had",
    "not", "for", "with", "by", "from", "at", "in", "on", "to", "of",
    "and", "or", "since", "reports", "reported", "reporting", "complains",
    "complained", "complaining", "complaint", "suffering", "experiencing",
    "patient", "yesterday", "days", "hours", "weeks", "months", "specified",
    "unspecified", "neither", "nor", "either", "because", "although", "during",
    "after", "before", "she", "he", "her", "his", "they", "their", "my",
    "this", "that", "these", "those", "there", "what", "which", "who", "whom",
    "does", "did", "doing", "would", "could", "should", "shall", "will"
}

# General English vocabulary common in medical consultations
ENGLISH_GENERAL_WORDS: Set[str] = {
    "fever", "cough", "pain", "headache", "vomiting", "weakness", "dizziness",
    "chest", "throat", "abdominal", "abdomen", "stomach", "back", "joint",
    "swelling", "severe", "mild", "moderate", "sharp", "dull", "high", "low",
    "normal", "abnormal", "history", "examination", "vitals", "temperature",
    "bleeding", "difficulty", "breathing", "shortness", "breath", "rash",
    "itching", "nausea", "loss", "appetite", "weight", "stool", "urine",
    "infection", "cold", "flu", "chills", "shivering", "consultation",
    "visit", "doctor", "nurse", "clinic", "hospital", "advice", "advised",
    "mention", "mentioned", "persisted", "stated", "states"
}

# Unambiguous Romanized Hindi grammatical & syntactic markers
# Words like 'the', 'to', 'me', 'in', 'is', 'us', 'so' are intentionally excluded
# from this set to avoid false-positive clashes with ubiquitous English words.
UNAMBIGUOUS_HINDI_SYNTACTIC_MARKERS: Set[str] = {
    # Postpositions
    "ko", "se", "mein", "par", "pe", "ka", "ki", "ke", "liye", "tak", "saath", "paas", "bina",
    # Auxiliary verbs & copulas
    "hai", "hain", "tha", "thi", "ho", "hoga", "hogi", "hoge", "hua", "hui", "hue",
    "raha", "rahi", "rahe", "gaya", "gayi", "gaye", "kiya", "diya", "liya", "aaya", "aayi", "aaye",
    "aana", "jaana", "karna", "karta", "karti", "karte", "sakta", "sakti", "sakte", "chahiye", "bola", "boli", "bole",
    # Pronouns
    "mujhe", "mera", "meri", "mere", "usko", "uska", "uski", "uske", "unko", "unka", "unki", "unke",
    "yeh", "ye", "woh", "wo", "kya", "kaun", "kisko", "kiska", "apna", "apni", "apne",
    "hum", "humko", "humein", "aap", "aapko", "tum", "tumhe", "isko", "iska", "iski", "iske",
    # Negations & particles
    "nahi", "nahin", "mat", "bhi", "toh",
    # Conjunctions & Adverbs
    "aur", "ya", "lekin", "parantu", "magar", "kyunki", "isliye", "jab", "tab",
    "kaha", "kahan", "kaise", "kitna", "kitni", "kitne", "bahut", "bohot", "zyada", "jyada",
    "kam", "thoda", "thodi", "bilkul", "sirf"
}

# Cross-lingual homographs that appear in both English and Romanized Hindi
# These are disambiguated contextually rather than counted blindly.
CROSS_LINGUAL_HOMOGRAPHS: Set[str] = {
    "the", "to", "me", "in", "is", "us", "so", "or", "na"
}

# Common Romanized Hindi content words (symptoms, body parts, temporal markers)
HINDI_CONTENT_WORDS: Set[str] = {
    "bukhar", "khasi", "dard", "sar", "pet", "gala", "chhati", "seena", "saans",
    "ulti", "chakkar", "kamzori", "aaj", "kal", "subah", "shaam", "raat", "din",
    "mahina", "saal", "pehle", "baad", "mariz", "mareez", "bachha", "bachhe",
    "dawa", "dawai", "takleef", "pareshani", "jankari", "halka", "tez", "achanak",
    "behoshi", "daura", "jhatke", "khoon", "akad", "soojan", "khujli"
}

# Common medical loanwords used in everyday Hindi speech (do NOT solely turn Hindi into Hinglish)
COMMON_MEDICAL_LOANWORDS: Set[str] = {
    "bp", "sugar", "fever", "tablet", "syrup", "injection", "test", "check",
    "doctor", "hospital", "clinic", "ward", "report", "scan", "xray",
    "bandage", "drip", "drops", "dose", "normal", "glucose", "saline",
    "ecg", "temperature", "patient"
}

# Indian proper names and cultural terms that do not indicate Hindi syntax
INDIAN_NAMES_AND_CULTURAL_TERMS: Set[str] = {
    "ramesh", "suresh", "sunita", "anita", "radha", "geeta", "rahul", "amit",
    "priya", "pooja", "asha", "dhwani", "anganwadi", "pucca", "kaccha", "didi",
    "bhaiya", "amma", "babu", "ji"
}


# ============================================================================
# Modular Language Detection Engine
# ============================================================================

def is_devanagari_char(char: str) -> bool:
    """Check if a character falls in the Devanagari Unicode block."""
    code = ord(char)
    return 0x0900 <= code <= 0x097F


def detect_transcript_language(
    transcript: Optional[str],
    default_fallback: str = NarrationLanguage.ENGLISH.value,
    confidence_threshold: float = 0.55
) -> LanguageDetectionResult:
    """
    Detect whether the speaker used English, Hindi, or Hinglish in the consultation transcript.

    Identifies:
    - English ('en')
    - Hindi ('hi'): Devanagari script or Romanized Latin script.
    - Hinglish ('hinglish'): Natural code-mixing of Hindi and English.

    Key Robustness Rules:
    - Does not rely on a single keyword.
    - Recognizes that standard medical loanwords (e.g., 'BP', 'fever') in Hindi do not make it Hinglish.
    - Recognizes that Indian proper names in English sentences do not make them Hindi.
    - Uses a documented fallback if confidence is insufficient.

    Args:
        transcript: The raw consultation transcript string.
        default_fallback: Language to use if transcript is absent or uncertain.
        confidence_threshold: Minimum confidence score required to avoid fallback.

    Returns:
        LanguageDetectionResult with detected_language, confidence, and audit details.
    """
    if transcript is None:
        return LanguageDetectionResult(
            detected_language=default_fallback,
            confidence=0.0,
            fallback_used=True,
            reason="Transcript was not provided (None). Applied configured fallback.",
            details={"transcript_status": "none", "fallback_language": default_fallback}
        )

    text = transcript.strip()
    if not text:
        return LanguageDetectionResult(
            detected_language=default_fallback,
            confidence=0.0,
            fallback_used=True,
            reason="Transcript text is empty or blank whitespace. Applied configured fallback.",
            details={"transcript_status": "empty", "fallback_language": default_fallback}
        )

    # 1. Script Analysis (Devanagari vs Latin)
    alpha_chars = [c for c in text if c.isalpha()]
    total_alpha = len(alpha_chars)

    if total_alpha > 0:
        devanagari_chars = [c for c in alpha_chars if is_devanagari_char(c)]
        devanagari_ratio = len(devanagari_chars) / total_alpha

        if devanagari_ratio >= 0.30:
            # Significant Devanagari script presence
            # Check for substantial English / Latin code-mixing
            latin_words = [w for w in re.findall(r"[A-Za-z]+", text)]
            all_words = text.split()

            if len(all_words) > 0 and (len(latin_words) / len(all_words)) >= 0.35:
                # Substantial mixed script (Devanagari + Latin phrases)
                return LanguageDetectionResult(
                    detected_language=NarrationLanguage.HINGLISH.value,
                    confidence=0.85,
                    fallback_used=False,
                    reason="Transcript contains substantial mixed Devanagari and Latin script content.",
                    details={"devanagari_ratio": devanagari_ratio, "latin_word_count": len(latin_words)}
                )

            # Pure or predominantly Devanagari script Hindi
            confidence = min(0.99, 0.70 + (devanagari_ratio * 0.29))
            return LanguageDetectionResult(
                detected_language=NarrationLanguage.HINDI.value,
                confidence=round(confidence, 2),
                fallback_used=False,
                reason="Transcript is written predominantly in Devanagari Hindi script.",
                details={"devanagari_ratio": round(devanagari_ratio, 2)}
            )

    # 2. Latin Script Linguistic Tokenization
    raw_tokens = re.findall(r"[A-Za-z]+", text.lower())
    if not raw_tokens:
        return LanguageDetectionResult(
            detected_language=default_fallback,
            confidence=0.0,
            fallback_used=True,
            reason="No alphabetic words found in transcript. Applied configured fallback.",
            details={"fallback_language": default_fallback}
        )

    # Filter out pure numbers or single-letter noises (except 'a', 'i')
    tokens = [t for t in raw_tokens if len(t) > 1 or t in {"a", "i"}]
    total_tokens = len(tokens)

    # Handle very short transcripts with insufficient signal
    if total_tokens <= 2:
        # Check if single token is an unambiguous Hindi marker
        if all(t in UNAMBIGUOUS_HINDI_SYNTACTIC_MARKERS or t in HINDI_CONTENT_WORDS for t in tokens):
            return LanguageDetectionResult(
                detected_language=NarrationLanguage.HINDI.value,
                confidence=0.60,
                fallback_used=False,
                reason="Short transcript matched unambiguous Hindi syntactic markers.",
                details={"tokens": tokens}
            )
        elif all(t in ENGLISH_SYNTACTIC_MARKERS for t in tokens) and not any(t in CROSS_LINGUAL_HOMOGRAPHS for t in tokens):
            return LanguageDetectionResult(
                detected_language=NarrationLanguage.ENGLISH.value,
                confidence=0.60,
                fallback_used=False,
                reason="Short transcript matched unambiguous English syntactic markers.",
                details={"tokens": tokens}
            )
        else:
            return LanguageDetectionResult(
                detected_language=default_fallback,
                confidence=0.40,
                fallback_used=True,
                reason=f"Short transcript ({total_tokens} words) has insufficient linguistic confidence (< {confidence_threshold}).",
                details={"tokens": tokens, "fallback_language": default_fallback}
            )

    # 1. Count unambiguous markers
    unambiguous_hindi_sync = sum(1 for t in tokens if t in UNAMBIGUOUS_HINDI_SYNTACTIC_MARKERS)
    hindi_content_count = sum(1 for t in tokens if t in HINDI_CONTENT_WORDS)
    unambiguous_hindi_markers = unambiguous_hindi_sync + hindi_content_count

    unambiguous_english_sync = sum(1 for t in tokens if t in ENGLISH_SYNTACTIC_MARKERS and t not in CROSS_LINGUAL_HOMOGRAPHS)
    english_general_count = sum(1 for t in tokens if t in ENGLISH_GENERAL_WORDS and t not in CROSS_LINGUAL_HOMOGRAPHS)
    unambiguous_english_markers = unambiguous_english_sync + english_general_count

    # 2. Disambiguate cross-lingual homographs (e.g. 'the', 'to', 'me')
    homograph_count = sum(1 for t in tokens if t in CROSS_LINGUAL_HOMOGRAPHS)
    hindi_sync_count = unambiguous_hindi_sync
    english_sync_count = unambiguous_english_sync

    if unambiguous_english_markers > 0 and unambiguous_hindi_markers == 0:
        english_sync_count += homograph_count
    elif unambiguous_hindi_markers > 0 and unambiguous_english_markers == 0:
        hindi_sync_count += homograph_count
    elif unambiguous_english_markers > unambiguous_hindi_markers:
        english_sync_count += homograph_count
    elif unambiguous_hindi_markers > unambiguous_english_markers:
        hindi_sync_count += homograph_count

    total_hindi_markers = hindi_sync_count + hindi_content_count
    total_english_markers = english_sync_count + english_general_count

    loanwords_count = sum(1 for t in tokens if t in COMMON_MEDICAL_LOANWORDS)
    names_count = sum(1 for t in tokens if t in INDIAN_NAMES_AND_CULTURAL_TERMS)

    # Calculate ratios over non-name tokens
    effective_tokens = max(1, total_tokens - names_count)
    hindi_ratio = total_hindi_markers / effective_tokens
    english_ratio = total_english_markers / effective_tokens
    loanword_ratio = loanwords_count / effective_tokens

    details = {
        "total_tokens": total_tokens,
        "hindi_sync_count": hindi_sync_count,
        "hindi_content_count": hindi_content_count,
        "english_sync_count": english_sync_count,
        "english_general_count": english_general_count,
        "loanwords_count": loanwords_count,
        "names_count": names_count,
        "hindi_ratio": round(hindi_ratio, 2),
        "english_ratio": round(english_ratio, 2),
    }

    # ========================================================================
    # Decision Matrix
    # ========================================================================

    # A. Predominant English: Strong English syntax, negligible Hindi markers
    if english_sync_count >= 1 and unambiguous_hindi_markers == 0:
        confidence = min(0.99, max(0.70, english_ratio))
        return LanguageDetectionResult(
            detected_language=NarrationLanguage.ENGLISH.value,
            confidence=round(confidence, 2),
            fallback_used=False,
            reason="Transcript exhibits English grammatical structure with no Hindi syntax.",
            details=details
        )

    # English with occasional proper names or minimal noise
    if english_sync_count >= 2 and unambiguous_hindi_sync == 0 and hindi_ratio <= 0.15:
        confidence = min(0.95, max(0.70, english_ratio))
        return LanguageDetectionResult(
            detected_language=NarrationLanguage.ENGLISH.value,
            confidence=round(confidence, 2),
            fallback_used=False,
            reason="Transcript exhibits English grammatical structure with isolated Indian names or loanwords.",
            details=details
        )

    # B. Predominant Hindi (Romanized): Strong Hindi syntax, English words are strictly isolated loanwords
    if hindi_sync_count >= 1 and unambiguous_english_sync == 0:
        # Check if the English tokens present are merely standard medical loanwords (e.g. 'bp', 'fever')
        non_loan_english = total_english_markers - loanwords_count
        if non_loan_english <= 1:
            confidence = min(0.95, max(0.70, hindi_ratio))
            return LanguageDetectionResult(
                detected_language=NarrationLanguage.HINDI.value,
                confidence=round(confidence, 2),
                fallback_used=False,
                reason="Transcript exhibits Hindi grammatical framework in Latin script with standard loanwords.",
                details=details
            )

    # Pure Romanized Hindi (no English markers at all)
    if total_hindi_markers >= 2 and unambiguous_english_markers == 0:
        confidence = min(0.98, max(0.75, hindi_ratio))
        return LanguageDetectionResult(
            detected_language=NarrationLanguage.HINDI.value,
            confidence=round(confidence, 2),
            fallback_used=False,
            reason="Transcript exhibits exclusively Hindi vocabulary and syntax in Latin script.",
            details=details
        )

    # C. Hinglish: Natural code-mixing of Hindi grammar and substantive English vocabulary
    # Indicators: Hindi syntactic scaffolding (postpositions/verbs) co-occurring with English content words
    if (hindi_sync_count >= 1 or hindi_content_count >= 1) and (english_sync_count >= 1 or english_general_count >= 1):
        # Ensure it's not just a Hindi sentence with 1 loanword
        english_substantive = total_english_markers
        if english_substantive >= 2 or (english_ratio >= 0.20 and hindi_ratio >= 0.20):
            confidence = min(0.95, 0.65 + (min(english_ratio, hindi_ratio) * 0.5))
            return LanguageDetectionResult(
                detected_language=NarrationLanguage.HINGLISH.value,
                confidence=round(confidence, 2),
                fallback_used=False,
                reason="Transcript exhibits natural Hindi-English code-mixing (Hinglish).",
                details=details
            )

    # If Hindi dominates overall
    if hindi_ratio > english_ratio and hindi_ratio >= 0.40:
        return LanguageDetectionResult(
            detected_language=NarrationLanguage.HINDI.value,
            confidence=0.70,
            fallback_used=False,
            reason="Transcript is predominantly Hindi in Latin script.",
            details=details
        )

    # If English dominates overall
    if english_ratio > hindi_ratio and english_ratio >= 0.40:
        return LanguageDetectionResult(
            detected_language=NarrationLanguage.ENGLISH.value,
            confidence=0.70,
            fallback_used=False,
            reason="Transcript is predominantly English.",
            details=details
        )

    # D. Ambiguous / Uncertain Language Fallback
    return LanguageDetectionResult(
        detected_language=default_fallback,
        confidence=0.35,
        fallback_used=True,
        reason=f"Linguistic indicators are ambiguous. Confidence (0.35) is below threshold ({confidence_threshold}).",
        details=details
    )


# ============================================================================
# Narration Generators by Language
# ============================================================================

def _narrate_english(report: MedicalReportOutput, mode: NarrationMode) -> str:
    """Generate professional medical report narration in English."""
    lines: List[str] = []

    if mode == NarrationMode.IMPORTANT_FLAGS:
        lines.append("=== IMPORTANT CLINICAL FLAGS ===")

        # 1. Danger signs
        lines.append("POTENTIAL DANGER SIGNS:")
        if report.danger_signs:
            for ds in report.danger_signs:
                lines.append(f"• {ds.sign} (Evidence from transcript: \"{ds.evidence}\")")
        else:
            lines.append("• No acute danger signs were reported during this consultation.")
            lines.append("  (Note: The absence of flagged danger signs does not mean the patient is completely free of illness; routine clinical evaluation is advised.)")

        # 2. Professional clinical review
        lines.append("\nPROFESSIONAL REVIEW:")
        if report.professional_review_required:
            lines.append("• Review by a qualified healthcare professional is flagged as required.")
        else:
            lines.append("• The AI did not set a professional-review flag. This does not mean review is unnecessary; that decision belongs to a qualified healthcare professional.")

        # 3. Critical gaps
        critical_missing = [m for m in report.missing_information if (m.importance or "").lower() == "high"]
        if critical_missing:
            lines.append("\nHIGH-PRIORITY MISSING INFORMATION:")
            for m in critical_missing:
                q_text = f" Suggested question: \"{m.prompt_question}\"" if m.prompt_question else ""
                lines.append(f"• {m.field_name}: {m.reason}.{q_text}")

        return "\n".join(lines)

    # FULL_REPORT
    lines.append("=== MEDICAL REPORT NARRATION ===")

    # Demographics
    lines.append("PATIENT DETAILS:")
    p_name = report.patient_name if report.patient_name else "Not specified in transcript"
    p_age = report.patient_age if report.patient_age else "Not specified in transcript"
    p_gender = report.patient_gender if report.patient_gender else "Not specified in transcript"
    lines.append(f"• Name: {p_name}")
    lines.append(f"• Age: {p_age}")
    lines.append(f"• Gender: {p_gender}")

    # Chief complaint
    cc = report.chief_complaint if report.chief_complaint else "Not explicitly stated"
    lines.append(f"\nCHIEF COMPLAINT:\n• {cc}")

    # Symptoms
    lines.append("\nREPORTED SYMPTOMS:")
    if report.symptoms:
        for s in report.symptoms:
            dur = s.duration if s.duration else "Not stated"
            sev = s.severity if s.severity else "Not stated"
            site = s.body_site if s.body_site else "Not stated"
            notes = f" (Notes: {s.notes})" if s.notes else ""
            lines.append(f"• {s.name}: Duration: {dur}, Severity: {sev}, Body site: {site}.{notes}")
    else:
        lines.append("• None explicitly reported in transcript.")

    # Vitals
    if report.vital_signs_mentioned:
        vitals_str = ", ".join(f"{k}: {v}" for k, v in report.vital_signs_mentioned.items())
        lines.append(f"\nVITAL SIGNS MENTIONED:\n• {vitals_str}")

    # Danger Signs
    lines.append("\nPOTENTIAL DANGER SIGNS:")
    if report.danger_signs:
        for ds in report.danger_signs:
            lines.append(f"• {ds.sign} (Evidence: \"{ds.evidence}\")")
    else:
        lines.append("• None reported during this consultation. (Note: Does not confirm patient safety or rule out unmentioned conditions.)")

    # Missing Information
    lines.append("\nMISSING CLINICAL INFORMATION (FOR FOLLOW-UP):")
    if report.missing_information:
        for m in report.missing_information:
            q_text = f" Suggested question: \"{m.prompt_question}\"" if m.prompt_question else ""
            lines.append(f"• {m.field_name}: {m.reason}.{q_text}")
    else:
        lines.append("• None identified.")

    # Review status
    if report.professional_review_required:
        rev_str = "Flagged by the AI for review by a qualified healthcare professional."
    else:
        rev_str = "Not flagged by the AI. This does not mean review is unnecessary."
    lines.append(f"\nPROFESSIONAL REVIEW FLAG: {rev_str}")

    # Summary
    lines.append(f"\nCONSULTATION SUMMARY:\n{report.summary}")

    return "\n".join(lines)


def _narrate_hindi(report: MedicalReportOutput, mode: NarrationMode) -> str:
    """Generate professional medical report narration in Hindi (Devanagari script)."""
    lines: List[str] = []

    if mode == NarrationMode.IMPORTANT_FLAGS:
        lines.append("=== महत्वपूर्ण चिकित्सीय संकेत (IMPORTANT FLAGS) ===")

        # 1. Danger signs
        lines.append("संभावित खतरे के लक्षण:")
        if report.danger_signs:
            for ds in report.danger_signs:
                lines.append(f"• {ds.sign} (बातचीत से साक्ष्य: \"{ds.evidence}\")")
        else:
            lines.append("• इस परामर्श में कोई तीव्र खतरे के लक्षण दर्ज नहीं किए गए हैं।")
            lines.append("  (सूचना: खतरे के लक्षण न होने का यह अर्थ नहीं है कि मरीज पूरी तरह सुरक्षित या रोगमुक्त है; स्वास्थ्य पेशेवर द्वारा चिकित्सीय जांच की सलाह दी जाती है।)")

        # 2. Professional review
        lines.append("\nस्वास्थ्य पेशेवर द्वारा समीक्षा:")
        if report.professional_review_required:
            lines.append("• योग्य स्वास्थ्य पेशेवर द्वारा चिकित्सीय समीक्षा आवश्यक दर्ज की गई है।")
        else:
            lines.append("• AI ने समीक्षा का कोई फ़्लैग नहीं लगाया है। इसका अर्थ यह नहीं है कि समीक्षा अनावश्यक है; यह निर्णय योग्य स्वास्थ्य पेशेवर का है।")

        # 3. Critical gaps
        critical_missing = [m for m in report.missing_information if (m.importance or "").lower() == "high"]
        if critical_missing:
            lines.append("\nउच्च प्राथमिकता वाली अधूरी जानकारी:")
            for m in critical_missing:
                q_text = f" सुझाया गया प्रश्न: \"{m.prompt_question}\"" if m.prompt_question else ""
                lines.append(f"• {m.field_name}: {m.reason}।{q_text}")

        return "\n".join(lines)

    # FULL_REPORT
    lines.append("=== मेडिकल रिपोर्ट वाचन (FULL REPORT) ===")

    # Demographics
    lines.append("मरीज का विवरण:")
    p_name = report.patient_name if report.patient_name else "परामर्श में उल्लेख नहीं"
    p_age = report.patient_age if report.patient_age else "परामर्श में उल्लेख नहीं"
    p_gender = report.patient_gender if report.patient_gender else "परामर्श में उल्लेख नहीं"
    lines.append(f"• नाम: {p_name}")
    lines.append(f"• उम्र: {p_age}")
    lines.append(f"• लिंग: {p_gender}")

    # Chief complaint
    cc = report.chief_complaint if report.chief_complaint else "स्पष्ट रूप से उल्लिखित नहीं"
    lines.append(f"\nमुख्य शिकायत:\n• {cc}")

    # Symptoms
    lines.append("\nदर्ज किए गए लक्षण:")
    if report.symptoms:
        for s in report.symptoms:
            dur = s.duration if s.duration else "उल्लेख नहीं"
            sev = s.severity if s.severity else "उल्लेख नहीं"
            site = s.body_site if s.body_site else "उल्लेख नहीं"
            notes = f" (टिप्पणी: {s.notes})" if s.notes else ""
            lines.append(f"• {s.name}: अवधि: {dur}, तीव्रता: {sev}, शरीर का अंग: {site}।{notes}")
    else:
        lines.append("• बातचीत में कोई लक्षण स्पष्ट रूप से दर्ज नहीं है।")

    # Vitals
    if report.vital_signs_mentioned:
        vitals_str = ", ".join(f"{k}: {v}" for k, v in report.vital_signs_mentioned.items())
        lines.append(f"\nदर्ज किए गए वाइटल संकेत:\n• {vitals_str}")

    # Danger Signs
    lines.append("\nसंभावित खतरे के लक्षण:")
    if report.danger_signs:
        for ds in report.danger_signs:
            lines.append(f"• {ds.sign} (बातचीत से साक्ष्य: \"{ds.evidence}\")")
    else:
        lines.append("• इस परामर्श में कोई खतरे के लक्षण दर्ज नहीं हैं। (सूचना: यह अन्य बीमारियों को खारिज नहीं करता है और मरीज के पूरी तरह सुरक्षित होने की पुष्टि नहीं करता है।)")

    # Missing Information
    lines.append("\nफॉलो-अप के लिए अधूरी जानकारी:")
    if report.missing_information:
        for m in report.missing_information:
            q_text = f" सुझाया गया प्रश्न: \"{m.prompt_question}\"" if m.prompt_question else ""
            lines.append(f"• {m.field_name}: {m.reason}।{q_text}")
    else:
        lines.append("• कोई अधूरी जानकारी दर्ज नहीं है।")

    # Review status
    if report.professional_review_required:
        rev_str = "AI ने योग्य स्वास्थ्य पेशेवर द्वारा समीक्षा के लिए फ़्लैग किया है।"
    else:
        rev_str = "AI ने फ़्लैग नहीं किया है। इसका अर्थ यह नहीं है कि समीक्षा अनावश्यक है।"
    lines.append(f"\nस्वास्थ्य पेशेवर द्वारा समीक्षा का फ़्लैग: {rev_str}")

    # Summary
    lines.append(f"\nपरामर्श सारांश:\n{report.summary}")

    return "\n".join(lines)


def _narrate_hinglish(report: MedicalReportOutput, mode: NarrationMode) -> str:
    """Generate professional medical report narration in natural Hinglish."""
    lines: List[str] = []

    if mode == NarrationMode.IMPORTANT_FLAGS:
        lines.append("=== IMPORTANT CLINICAL FLAGS ===")

        # 1. Danger signs
        lines.append("POTENTIAL DANGER SIGNS:")
        if report.danger_signs:
            for ds in report.danger_signs:
                lines.append(f"• {ds.sign} (Transcript se exact evidence: \"{ds.evidence}\")")
        else:
            lines.append("• Is consultation me koi acute danger signs report nahi huye hain.")
            lines.append("  (Note: Danger signs na milne ka matlab yeh nahi hai ki patient completely safe ya illness-free hai; routine healthcare professional review zaroori hai.)")

        # 2. Professional review
        lines.append("\nPROFESSIONAL CLINICAL REVIEW:")
        if report.professional_review_required:
            lines.append("• Qualified healthcare professional dwara clinical review zaroori hai.")
        else:
            lines.append("• AI ne professional review ka flag nahi lagaya hai. Iska matlab yeh nahi ki review zaroori nahi hai; yeh faisla qualified healthcare professional ka hai.")

        # 3. Critical gaps
        critical_missing = [m for m in report.missing_information if (m.importance or "").lower() == "high"]
        if critical_missing:
            lines.append("\nFOLLOW-UP KE LIYE HIGH-PRIORITY MISSING INFO:")
            for m in critical_missing:
                q_text = f" Suggested question: \"{m.prompt_question}\"" if m.prompt_question else ""
                lines.append(f"• {m.field_name}: {m.reason}.{q_text}")

        return "\n".join(lines)

    # FULL_REPORT
    lines.append("=== MEDICAL REPORT NARRATION (HINGLISH) ===")

    # Demographics
    lines.append("PATIENT DETAILS:")
    p_name = report.patient_name if report.patient_name else "Transcript me mention nahi hai"
    p_age = report.patient_age if report.patient_age else "Transcript me mention nahi hai"
    p_gender = report.patient_gender if report.patient_gender else "Transcript me mention nahi hai"
    lines.append(f"• Name: {p_name}")
    lines.append(f"• Age: {p_age}")
    lines.append(f"• Gender: {p_gender}")

    # Chief complaint
    cc = report.chief_complaint if report.chief_complaint else "Explicitly mention nahi kiya gaya"
    lines.append(f"\nCHIEF COMPLAINT:\n• {cc}")

    # Symptoms
    lines.append("\nREPORTED SYMPTOMS:")
    if report.symptoms:
        for s in report.symptoms:
            dur = s.duration if s.duration else "Mention nahi kiya"
            sev = s.severity if s.severity else "Mention nahi kiya"
            site = s.body_site if s.body_site else "Mention nahi kiya"
            notes = f" (Notes: {s.notes})" if s.notes else ""
            lines.append(f"• {s.name}: Duration: {dur}, Severity: {sev}, Body site: {site}.{notes}")
    else:
        lines.append("• Transcript me koi symptoms explicitly report nahi huye.")

    # Vitals
    if report.vital_signs_mentioned:
        vitals_str = ", ".join(f"{k}: {v}" for k, v in report.vital_signs_mentioned.items())
        lines.append(f"\nMENTIONED VITALS:\n• {vitals_str}")

    # Danger Signs
    lines.append("\nPOTENTIAL DANGER SIGNS:")
    if report.danger_signs:
        for ds in report.danger_signs:
            lines.append(f"• {ds.sign} (Transcript evidence: \"{ds.evidence}\")")
    else:
        lines.append("• Is consultation me koi danger signs report nahi huye. (Note: Iska matlab patient fully safe hai aisa assume nahi karna hai; routine review recommended hai.)")

    # Missing Information
    lines.append("\nFOLLOW-UP KE LIYE MISSING INFORMATION:")
    if report.missing_information:
        for m in report.missing_information:
            q_text = f" Suggested follow-up question: \"{m.prompt_question}\"" if m.prompt_question else ""
            lines.append(f"• {m.field_name}: {m.reason}.{q_text}")
    else:
        lines.append("• Koi missing information identify nahi hui.")

    # Review status
    if report.professional_review_required:
        rev_str = "AI ne qualified healthcare professional review ke liye flag kiya hai."
    else:
        rev_str = "AI ne flag nahi kiya hai. Iska matlab yeh nahi ki review zaroori nahi hai."
    lines.append(f"\nPROFESSIONAL REVIEW FLAG: {rev_str}")

    # Summary
    lines.append(f"\nCONSULTATION SUMMARY:\n{report.summary}")

    return "\n".join(lines)


# ============================================================================
# Main Narration Interface
# ============================================================================

def generate_narration_result(
    report: MedicalReportOutput,
    transcript: Optional[str] = None,
    mode: Union[NarrationMode, str] = NarrationMode.FULL_REPORT,
    language: Optional[Union[NarrationLanguage, str]] = None,
    fallback_language: Union[NarrationLanguage, str] = NarrationLanguage.ENGLISH
) -> NarrationResult:
    """
    Generate language-matched medical narration with rich metadata.

    Args:
        report: Validated MedicalReportOutput instance (never mutated).
        transcript: Original consultation transcript. If None, fallback is used explicitly.
        mode: NarrationMode.IMPORTANT_FLAGS or NarrationMode.FULL_REPORT.
        language: Optional manual override. If None (default), language is automatically detected from transcript.
        fallback_language: Language to use if transcript is unavailable or ambiguous (default: 'en').

    Returns:
        NarrationResult object containing narration text, detected language, and detection metadata.
    """
    if not isinstance(report, MedicalReportOutput):
        raise TypeError(f"report must be a MedicalReportOutput instance, got {type(report).__name__}.")

    # Normalize mode
    if isinstance(mode, NarrationMode):
        norm_mode = mode
    elif isinstance(mode, str):
        try:
            norm_mode = NarrationMode(mode.upper())
        except ValueError:
            raise ValueError(f"Invalid narration mode: '{mode}'. Allowed: {[m.value for m in NarrationMode]}")
    else:
        raise TypeError(f"mode must be a NarrationMode or str, got {type(mode).__name__}.")

    # Normalize fallback_language
    fallback_val = fallback_language.value if isinstance(fallback_language, NarrationLanguage) else str(fallback_language).lower()
    if fallback_val in {"english", "en"}:
        fallback_val = NarrationLanguage.ENGLISH.value
    elif fallback_val in {"hindi", "hi"}:
        fallback_val = NarrationLanguage.HINDI.value
    elif fallback_val in {"hinglish", "hi-en"}:
        fallback_val = NarrationLanguage.HINGLISH.value

    # Determine narration language
    if language is not None:
        # Manual override provided
        lang_str = language.value if isinstance(language, NarrationLanguage) else str(language).lower()
        if lang_str in {"english", "en"}:
            chosen_language = NarrationLanguage.ENGLISH.value
        elif lang_str in {"hindi", "hi"}:
            chosen_language = NarrationLanguage.HINDI.value
        elif lang_str in {"hinglish", "hi-en"}:
            chosen_language = NarrationLanguage.HINGLISH.value
        else:
            chosen_language = fallback_val

        detection_res = LanguageDetectionResult(
            detected_language=chosen_language,
            confidence=1.0,
            fallback_used=False,
            reason="Language manually specified by caller (override mode).",
            details={"manual_override": True, "specified_language": str(language)}
        )
    else:
        # Automatic language detection from the transcript
        detection_res = detect_transcript_language(
            transcript=transcript,
            default_fallback=fallback_val
        )
        chosen_language = detection_res.detected_language

    # Generate narration based on chosen language
    if chosen_language == NarrationLanguage.HINDI.value:
        narration_text = _narrate_hindi(report, norm_mode)
    elif chosen_language == NarrationLanguage.HINGLISH.value:
        narration_text = _narrate_hinglish(report, norm_mode)
    else:
        narration_text = _narrate_english(report, norm_mode)

    return NarrationResult(
        narration_text=narration_text,
        language=chosen_language,
        mode=norm_mode.value,
        language_detection=detection_res,
        transcript_provided=transcript is not None
    )


def narrate_medical_report(
    report: MedicalReportOutput,
    transcript: Optional[str] = None,
    mode: Union[NarrationMode, str] = NarrationMode.FULL_REPORT,
    language: Optional[Union[NarrationLanguage, str]] = None,
    fallback_language: Union[NarrationLanguage, str] = NarrationLanguage.ENGLISH
) -> str:
    """
    Convenience function for frontend and Member 3 integration.
    Returns narration text directly as a string.

    Usage:
        # Automatically detects English, Hindi, or Hinglish from the transcript:
        narration_text = narrate_medical_report(report, transcript=raw_text)

        # High-priority flags only:
        flags_text = narrate_medical_report(report, transcript=raw_text, mode="IMPORTANT_FLAGS")
    """
    result = generate_narration_result(
        report=report,
        transcript=transcript,
        mode=mode,
        language=language,
        fallback_language=fallback_language
    )
    return result.narration_text
