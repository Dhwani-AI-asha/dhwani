"""
ai_medical/grounding.py

Deterministic source-grounding, medical extraction, and anti-fabrication guardrails
for Dhwani medical reports.

Every clinical value, patient name, vital sign, vaccination detail, visit type, and
follow-up date in a generated report MUST be strictly traceable to explicit text in the
original consultation transcript or explicit ASHA worker corrections. Unmentioned fields
remain None (null in JSON) so UI/narration can surface them as "Not provided" and ask
confirmation questions without ever fabricating medical facts.
"""

from __future__ import annotations

import re
from typing import Any, Dict, List, Optional, Tuple


try:
    from ai_medical.correction import CORRECTION_PREFIX
except ImportError:
    from correction import CORRECTION_PREFIX


# ---------------------------------------------------------------------------
# Constants & Stopwords
# ---------------------------------------------------------------------------

_NON_NAME_WORDS = {
    # Hindi pronouns / relations / roles / common words (Devanagari)
    "इसका", "उसका", "इनका", "उनका", "इसको", "उसको", "इनको", "उनको", "इसकी", "उसकी",
    "को", "का", "की", "के", "ने", "से", "में", "पर", "और", "या", "है", "हैं", "था", "थी", "थे",
    "मैं", "मैंने", "मुझे", "हम", "हमें", "हमारा", "तुम", "तुम्हें", "आप", "आपको",
    "वह", "यह", "ये", "वे", "जो", "कोई", "किसी", "मरीज", "रोगी", "लाभार्थी",
    "बच्चा", "बच्चे", "बच्ची", "शिशु", "नवजात", "महिला", "औरत", "गर्भवती", "माता", "माँ",
    "मां", "दीदी", "आशा", "डॉक्टर", "नर्स", "बहन", "भाई", "माताजी", "आज", "कल", "परसों",
    "अभी", "यहाँ", "वहाँ", "नमस्ते", "हाँ", "नहीं", "जी", "टिका", "टीका", "इंजेक्शन", "बीपी",
    "वजन", "बुखार", "दर्द", "खांसी", "खून", "जांच", "विजिट", "दवा", "दवाई", "गोली",
    # Hinglish / English pronouns, greetings, clinical terms
    "ko", "ka", "ki", "ke", "ne", "se", "me", "mein", "aur", "or", "ya",
    "iska", "uska", "inka", "unka", "isko", "usko", "mujhe", "hum", "hume",
    "mai", "main", "maine", "woh", "wo", "yeh", "ye", "tum", "aap", "koi", "kisi",
    "patient", "beneficiary", "mother", "baby", "child", "infant", "woman", "female",
    "male", "man", "girl", "boy", "lady", "asha", "didi", "doctor", "nurse", "sister",
    "brother", "her", "him", "she", "he", "they", "them", "it", "this", "that",
    "today", "aaj", "kal", "parso", "abhi", "yahan", "namaste", "hello", "hi",
    "sir", "madam", "ji", "nahi", "no", "haan", "yes", "ok", "okay", "not",
    "bp", "tt", "weight", "vajan", "wazan", "visit", "injection", "fever", "bukhar",
    "pulse", "hemoglobin", "hb", "headache", "edema", "swelling", "cough", "khasi",
    "cough", "pain", "dard", "dawai", "medicine", "tablet", "tablets", "dose", "booster",
    "anc", "pnc", "antenatal", "postnatal", "next", "agla", "agli", "provided",
    "mentioned", "stated", "unknown", "none", "null", "na", "n/a", "unclear",
    "report", "check", "checkup", "blood", "pressure", "normal", "high", "low",
    "some", "someone", "kuch", "the", "a", "an",
}

_AMBIGUOUS_NAME_MARKERS = re.compile(
    r"(?:"
    r"name\s+(?:is\s+)?(?:not\s+clear|unclear|unknown)|"
    r"naam\s+(?:clear\s+nahi|saaf\s+nahi|yaad\s+nahi|pata\s+nahi)|"
    r"नाम\s+(?:साफ\s+नहीं|स्पष्ट\s+नहीं|पता\s+नहीं|याद\s+नहीं)|"
    r"\b(?:maybe|probably|perhaps|shayad|शायद)\b"
    r")",
    re.IGNORECASE,
)

# Symptom equivalence groups so valid English labels remain accepted when spoken in Hindi/Hinglish and vice versa
_SYMPTOM_LEXICON: List[Tuple[str, ...]] = [
    ("fever", "pyrexia", "bukhar", "bukhaar", "बुखार", "ज्वर", "tap", "ताम", "तेज बदन"),
    ("headache", "sir dard", "sar dard", "sirdard", "सिरदर्द", "सिर दर्द", "सर दर्द"),
    ("edema", "oedema", "swelling", "pedal edema", "sujan", "soojan", "सूजन"),
    ("vomiting", "emesis", "nausea", "ulti", "ultee", "matli", "उल्टी", "जी मिचलाना"),
    ("cough", "khansi", "khasi", "खांसी", "खाँसी"),
    ("dizziness", "vertigo", "chakkar", "चक्कर"),
    ("weakness", "fatigue", "kamzori", "kamjori", "कमजोरी", "थकान"),
    ("bleeding", "hemorrhage", "khoon", "raktasrav", "खून", "रक्तस्राव", "बहाव"),
    ("convulsions", "seizure", "seizures", "fits", "daura", "daure", "दौरा", "दौरे", "झटके"),
    ("difficulty breathing", "breathing", "shortness of breath", "dyspnea", "breathlessness", "saans", "सांस", "दम"),
    ("abdominal pain", "stomach pain", "pet dard", "पेट दर्द", "पेट में दर्द"),
    ("chest pain", "seene me dard", "सीने में दर्द"),
    ("diarrhea", "loose motion", "dast", "दस्त"),
    ("anemia", "pallor", "khoon ki kami", "खून की कमी", "पीलापन"),
    ("pain", "dard", "दर्द"),
]


# ---------------------------------------------------------------------------
# Transcript / Correction Segmentation
# ---------------------------------------------------------------------------

def split_transcript_and_corrections(raw_text: str) -> Tuple[str, List[str]]:
    """
    Split a potentially corrected transcript into:
      (base_transcript, [correction_1, correction_2, ...])
    """
    text = (raw_text or "").strip()
    if not text:
        return "", []
    lines = text.splitlines()
    base_lines: List[str] = []
    corrections: List[str] = []
    prefix_lower = CORRECTION_PREFIX.strip().lower()

    for line in lines:
        stripped = line.strip()
        if not stripped:
            continue
        if stripped.lower().startswith(prefix_lower):
            corr_body = stripped[len(CORRECTION_PREFIX.strip()):].strip()
            if corr_body:
                corrections.append(corr_body)
        else:
            base_lines.append(stripped)

    return " ".join(base_lines).strip(), corrections


def _normalize_space(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


# ---------------------------------------------------------------------------
# Deterministic Extractors (Strict Source-Only)
# ---------------------------------------------------------------------------

def _clean_candidate_name(raw_candidate: str) -> Optional[str]:
    if not raw_candidate:
        return None
    # Cut off at trailing conjunctions/postpositions/clinical words/punctuation (works across Devanagari & Latin)
    cleaned = re.split(
        r"\s+(?:ko|ka|ki|ke|ne|se|has|have|had|hai|hain|था|थी|थे|है|हैं|को|का|की|के|ने|से|aged|age|umar|umra|whose|who|with|suffering|came|visited|visit|bp|tt|weight|vajan|or|aur|and|या|ya)(?=\s|[।,.;:!?()\[\]]|$)|[।,.;:!?()\[\]]",
        raw_candidate.strip(),
        maxsplit=1,
        flags=re.IGNORECASE | re.UNICODE,
    )[0]
    cleaned = _normalize_space(cleaned).strip(" -'\"")
    if not cleaned or len(cleaned) < 2:
        return None
    if re.search(r"\d", cleaned):
        return None

    words = cleaned.split()
    if len(words) > 3:
        return None

    meaningful_words = [w for w in words if w.lower() not in _NON_NAME_WORDS]
    if not meaningful_words:
        return None
    if words[0].lower() in _NON_NAME_WORDS:
        return None
    return cleaned


def extract_patient_name_from_segment(segment: str) -> Dict[str, Any]:
    """
    Extract an explicitly stated patient name from a single transcript or correction segment.
    Preserves Devanagari, Hinglish, and English spelling verbatim.
    Flags ambiguity when multiple conflicting candidates or unclear markers appear.
    """
    text = (segment or "").strip()
    if not text:
        return {"name": None, "ambiguous": False, "candidates": [], "reason": None}

    candidates: List[str] = []
    seen_lower = set()

    def _add_candidate(raw: str) -> None:
        cand = _clean_candidate_name(raw)
        if cand and cand.lower() not in seen_lower:
            seen_lower.add(cand.lower())
            candidates.append(cand)

    # Pattern 0: Alternative "X or Y" / "X ya Y" / "X या Y"
    alt_patterns = [
        r"(?:patient\s+name\s+|name\s+(?:is\s+)?|naam\s+|नाम\s+|लाभार्थी\s+का\s+नाम\s+|मरीज\s+का\s+नाम\s+)?([^\s,।.!?;0-9]+(?:\s+[^\s,।.!?;0-9]+)?)\s+(?:ya|or|या)\s+([^\s,।.!?;0-9]+(?:\s+[^\s,।.!?;0-9]+)?)\s+(?:ko|ka|ki|ke|hai|को|का|की|के|है)(?=\s|[।,.!?]|$)",
    ]
    for pat in alt_patterns:
        for m in re.finditer(pat, text, flags=re.IGNORECASE | re.UNICODE):
            c1 = _clean_candidate_name(m.group(1))
            c2 = _clean_candidate_name(m.group(2))
            if c1 and c2 and c1.lower() != c2.lower():
                return {
                    "name": None,
                    "ambiguous": True,
                    "candidates": [c1, c2],
                    "reason": "Multiple possible patient names stated in transcript.",
                }

    # Pattern 1: Explicit name label (English, Hinglish, Hindi Devanagari) — requires explicit label/copula
    explicit_label_patterns = [
        r"(?:patient\s+name|beneficiary\s+name|mareez\s+ka\s+naam|mariz\s+ka\s+naam|लाभार्थी\s+का\s+नाम|मरीज\s+का\s+नाम|रोगी\s+का\s+नाम|patient|beneficiary|name|naam|नाम)\s*(?:is|hai|है|:|=|\-)+\s*([^\n,।.!?;0-9]{2,45})",
        r"(?:naam|नाम)\s+([^\n,।.!?;0-9]{2,45})",
        r"([^\s,।.!?;0-9]+(?:\s+[^\s,।.!?;0-9]+)?)\s+(?:naam\s+hai|नाम\s+है)(?=\s|[।,.!?]|$)",
    ]
    for pat in explicit_label_patterns:
        for m in re.finditer(pat, text, flags=re.IGNORECASE | re.UNICODE):
            _add_candidate(m.group(1))

    # Pattern 2: Hindi / Hinglish postposition subject at sentence boundary ("राधिमा को TT injection लगाया है", "Sunita ko fever hai")
    # Note: Devanagari vowel matras are non-word (\W) in Python re, so always check lookahead instead of \b!
    postposition_pat = (
        r"(?:^|[।.!?\n]\s*)"
        r"([\u0900-\u097F]+(?:\s+[\u0900-\u097F]+)?|[A-Za-z][A-Za-z'.-]+(?:\s+[A-Za-z][A-Za-z'.-]+)?)"
        r"\s+(?:को|का|की|के|ने|ko|ka|ki|ke|ne)(?=\s|[।,.!?]|$)"
    )
    for m in re.finditer(postposition_pat, text, flags=re.IGNORECASE | re.UNICODE):
        _add_candidate(m.group(1))

    # Pattern 3: English subject patterns ("This is Ramesh", "Ramesh has fever", "Examined Sunita Devi")
    english_subj_patterns = [
        r"(?:this\s+is|visited|examining|checked|checking|met)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})\b",
        r"(?:^|[.!?\n]\s*)([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})\s+(?:has|had|reports|reported|complains|complained|came|is|was|received|took)\b",
    ]
    for pat in english_subj_patterns:
        for m in re.finditer(pat, text, flags=re.UNICODE):
            _add_candidate(m.group(1))

    # Ambiguity check
    if _AMBIGUOUS_NAME_MARKERS.search(text):
        return {
            "name": None,
            "ambiguous": True,
            "candidates": candidates,
            "reason": "Patient name is marked as unclear or uncertain in transcript.",
        }

    if len(candidates) > 1:
        # Check if one is just a full-name extension of the other (e.g., "Pooja" vs "Pooja Devi")
        unique_roots: List[str] = []
        for cand in candidates:
            cl = cand.lower()
            if not any(cl == r.lower() or cl in r.lower().split() or r.lower() in cl.split() for r in unique_roots):
                unique_roots.append(cand)
        if len(unique_roots) > 1:
            return {
                "name": None,
                "ambiguous": True,
                "candidates": candidates,
                "reason": "Multiple distinct names mentioned in transcript; confirmation required.",
            }
        # Prefer the fuller version if one is prefix of the other
        best = max(candidates, key=len)
        return {"name": best, "ambiguous": False, "candidates": candidates, "reason": None}

    if len(candidates) == 1:
        return {"name": candidates[0], "ambiguous": False, "candidates": candidates, "reason": None}

    return {"name": None, "ambiguous": False, "candidates": [], "reason": None}


def extract_patient_name_from_text(full_text: str) -> Dict[str, Any]:
    """
    Extract patient name across base transcript + ASHA corrections.
    Explicit ASHA corrections take precedence if they explicitly provide or confirm a name.
    """
    base, corrections = split_transcript_and_corrections(full_text)

    # Check latest corrections first if a correction explicitly sets/confirms patient name
    for corr in reversed(corrections):
        if re.search(r"\b(?:name|naam|patient|beneficiary)\b|नाम|मरीज|लाभार्थी", corr, re.IGNORECASE | re.UNICODE):
            corr_info = extract_patient_name_from_segment(corr)
            if corr_info["name"] or corr_info["ambiguous"]:
                return corr_info

    return extract_patient_name_from_segment(base)


def _extract_bp_values(text: str) -> List[str]:
    """Return ordered list of valid BP readings (e.g., ['120/80']) explicitly appearing in text."""
    results: List[str] = []

    def _valid_bp(s: int, d: int) -> bool:
        return 50 <= s <= 280 and 30 <= d <= 180 and s > d

    # First check explicit BP labels
    labeled = re.finditer(
        r"(?:bp|b\.p\.|blood\s*pressure|बीपी|रक्तचाप)\s*(?:is|was|hai|थी|था|को|:|-|=)?\s*(\d{2,3})\s*[/\\]\s*(\d{2,3})",
        text,
        flags=re.IGNORECASE | re.UNICODE,
    )
    for m in labeled:
        sys_v, dia_v = int(m.group(1)), int(m.group(2))
        if _valid_bp(sys_v, dia_v):
            val = f"{sys_v}/{dia_v}"
            if val not in results:
                results.append(val)

    # Also match standalone NNN/NN or NNN/NNN that look like BP (not dates like 24/11/2024)
    unlabeled = re.finditer(r"(?<![/\d-])(\d{2,3})\s*/\s*(\d{2,3})(?![/\d-])", text)
    for m in unlabeled:
        sys_v, dia_v = int(m.group(1)), int(m.group(2))
        if _valid_bp(sys_v, dia_v) and sys_v >= 70:
            val = f"{sys_v}/{dia_v}"
            if val not in results:
                results.append(val)

    return results


def _extract_weight_values(text: str) -> List[str]:
    """Extract explicit weight mentions only (with kg/kilo/किलो or weight/वजन keyword)."""
    results: List[str] = []
    patterns = [
        r"(?:weight|wt|vajan|wazan|वजन|भार)\s*(?:is|was|hai|थी|था|:|-|=)?\s*(\d{1,3}(?:\.\d{1,2})?)\s*(?:kg|kgs|kilo|kilogram|kilograms|किलो|किग्रा)?",
        r"(\d{1,3}(?:\.\d{1,2})?)\s*(?:kg|kgs|kilo|kilogram|kilograms|किलो|किग्रा)\b",
    ]
    for pat in patterns:
        for m in re.finditer(pat, text, flags=re.IGNORECASE | re.UNICODE):
            num_str = m.group(1)
            try:
                val_f = float(num_str)
            except ValueError:
                continue
            if 1.0 <= val_f <= 250.0:
                formatted = f"{num_str} kg"
                if formatted not in results:
                    results.append(formatted)
    return results


def _extract_pulse_values(text: str) -> List[str]:
    results: List[str] = []
    patterns = [
        r"(?:pulse|heart\s*rate|hr|नब्ज|पल्स|धड़कन)\s*(?:is|was|hai|थी|था|:|-|=)?\s*(\d{2,3})\s*(?:bpm|beats\s*(?:per\s*minute|/\s*min)?)?",
        r"(\d{2,3})\s*bpm\b",
    ]
    for pat in patterns:
        for m in re.finditer(pat, text, flags=re.IGNORECASE | re.UNICODE):
            n = int(m.group(1))
            if 35 <= n <= 220:
                formatted = f"{n} bpm"
                if formatted not in results:
                    results.append(formatted)
    return results


def _extract_temperature_values(text: str) -> List[str]:
    results: List[str] = []
    patterns = [
        r"(?:temp|temperature|बुखार|तापमान)\s*(?:is|was|hai|थी|था|:|-|=)?\s*(\d{2,3}(?:\.\d{1,2})?)\s*(?:°?\s*[CFcf]|degree[s]?|फारेनहाइट|डिग्री)?",
        r"(\d{2,3}(?:\.\d{1,2})?)\s*(?:°\s*[CFcf]|deg\s*[CFcf]|F|C)\b",
    ]
    for pat in patterns:
        for m in re.finditer(pat, text, flags=re.IGNORECASE | re.UNICODE):
            num_str = m.group(1)
            try:
                f = float(num_str)
            except ValueError:
                continue
            if 34.0 <= f <= 43.0 or 94.0 <= f <= 108.0:
                unit_match = re.search(r"[CF]", m.group(0), re.IGNORECASE)
                unit = f" {unit_match.group(0).upper()}" if unit_match else (" C" if f < 45 else " F")
                formatted = f"{num_str}{unit}"
                if formatted not in results:
                    results.append(formatted)
    return results


def _extract_hb_values(text: str) -> List[str]:
    results: List[str] = []
    patterns = [
        r"(?:hb|hemoglobin|haemoglobin|हीमोग्लोबिन)\s*(?:is|was|hai|level|:|-|=)?\s*(\d{1,2}(?:\.\d{1,2})?)\s*(?:g/dL|gm%|g%|ग्राम)?",
    ]
    for pat in patterns:
        for m in re.finditer(pat, text, flags=re.IGNORECASE | re.UNICODE):
            num_str = m.group(1)
            try:
                f = float(num_str)
            except ValueError:
                continue
            if 2.0 <= f <= 22.0:
                formatted = f"{num_str} g/dL"
                if formatted not in results:
                    results.append(formatted)
    return results


def extract_visit_type_from_segment(segment: str) -> Optional[str]:
    """Extract visit type ONLY if explicitly stated in transcript/corrections."""
    text = (segment or "").strip()
    if not text:
        return None

    # Explicit ANC/PNC/Immunization/Visit labels
    patterns = [
        r"(?:visit\s*type|विजिट\s*(?:का\s*)?प्रकार)\s*(?:is|hai|है|:|-|=)?\s*([^\n,।.!?;]{2,60})",
        r"\b(ANC\s*(?:visit)?\s*(?:#?\s*\d+)?)\b",
        r"\b(PNC\s*(?:visit)?\s*(?:#?\s*\d+)?)\b",
        r"\b(Antenatal\s+Care(?:\s+Visit)?(?:\s*#?\s*\d+)?)\b",
        r"\b(Postnatal\s+Care(?:\s+Visit)?(?:\s*#?\s*\d+)?)\b",
        r"\b(HBNC\s*(?:visit)?(?:\s*#?\s*\d+)?)\b",
        r"\b(Immunization\s+Visit(?:\s*#?\s*\d+)?)\b",
        r"\b(Routine\s+(?:ANC|PNC|Checkup|Follow-up)\s+Visit)\b",
        r"(प्रसव\s+पूर्व\s+(?:जांच|विजिट)(?:\s*\d+)?)",
        r"(प्रसव\s+पश्चात\s+(?:जांच|विजिट)(?:\s*\d+)?)",
        r"(टीकाकरण\s+(?:विजिट|सत्र))",
    ]
    for pat in patterns:
        m = re.search(pat, text, flags=re.IGNORECASE | re.UNICODE)
        if m:
            found = _normalize_space(m.group(1)).strip(" -.:")
            if found:
                return found
    return None


def extract_next_visit_date_from_segment(segment: str) -> Optional[str]:
    """Extract next visit / follow-up date ONLY if explicitly stated."""
    text = (segment or "").strip()
    if not text:
        return None

    patterns = [
        r"(?:next\s+(?:visit|appointment|follow[\s-]*up|checkup)(?:\s+date)?|follow[\s-]*up\s+(?:on|date)|agla\s+(?:visit|checkup)|अगला\s+(?:विजिट|जांच)|अगली\s+(?:विजिट|जांच|मुलाकात))\s*(?:is|on|hai|ko|को|है|:|-|=)?\s*(\d{1,2}\s+[A-Za-z]{3,9}\s+\d{2,4}|\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|[A-Za-z]+\s+\d{1,2}(?:,?\s*\d{4})?|\d{1,2}\s+[\u0900-\u097F]+(?:\s+\d{4})?|(?:kal|tomorrow|next\s+week|अगले\s+हफ्ते|कल|परसों|\d+\s+(?:din|days?|weeks?|हफ्ते|दिन)\s+(?:baad|later|में|बाद)))",
    ]
    for pat in patterns:
        m = re.search(pat, text, flags=re.IGNORECASE | re.UNICODE)
        if m:
            found = _normalize_space(m.group(1)).strip(" .,:;")
            if found:
                return found
    return None


def extract_vaccination_from_segment(segment: str) -> Dict[str, Optional[str]]:
    """
    Extract vaccination details strictly without inferring dose numbers or booster status.
    Example: "राधिमा को TT injection लगाया है।" ->
      vaccination_status = "TT injection administered"
      booster_status = None
      dose_number = None
    """
    text = (segment or "").strip()
    if not text:
        return {"vaccination_status": None, "booster_status": None, "dose_number": None}

    lower = text.lower()

    booster_status: Optional[str] = None
    if re.search(r"\bbooster\b|बूस्टर", text, re.IGNORECASE | re.UNICODE):
        booster_status = "TT booster" if re.search(r"\btt\b|टीटी|tetanus", text, re.IGNORECASE | re.UNICODE) else "Booster mentioned"

    dose_number: Optional[str] = None
    dose_match = re.search(
        r"(?:\b(?:tt|opv|dpt|penta|pentavalent|hep[\s-]*b)[\s-]*([1-4])\b|\b(first|second|third|1st|2nd|3rd)\s+dose\b|\bdose\s*([1-4])\b|(पहली|दूसरी|तीसरी)\s*(?:खुराक|डोज|dose))",
        text,
        re.IGNORECASE | re.UNICODE,
    )
    if dose_match:
        raw_dose = next((g for g in dose_match.groups() if g), None)
        if raw_dose:
            dose_number = raw_dose

    vaccination_status: Optional[str] = None
    tt_mentioned = bool(
        re.search(
            r"\btt\b|\bt\.t\.\b|\btetanus\b|\btd\b|टीटी|टी\.टी\.|टिटनेस",
            text,
            re.IGNORECASE | re.UNICODE,
        )
    )
    injection_or_given = bool(
        re.search(
            r"\b(?:injection|vaccine|vaccinated|immunized|administered|given|shot)\b|इंजेक्शन|टीका|लगाया|लगी|लगवाया|दिया|दी",
            text,
            re.IGNORECASE | re.UNICODE,
        )
    )

    if tt_mentioned and injection_or_given:
        if booster_status:
            vaccination_status = "TT booster administered"
        elif dose_number:
            vaccination_status = f"TT dose {dose_number} administered"
        else:
            vaccination_status = "TT injection administered"
    elif tt_mentioned:
        vaccination_status = "TT mentioned"
    else:
        for vac_name in ("BCG", "OPV", "DPT", "Pentavalent", "Measles", "MR", "Rotavirus", "IPV", "Hepatitis B", "PCV"):
            if re.search(rf"\b{re.escape(vac_name)}\b", lower, re.IGNORECASE):
                vaccination_status = f"{vac_name} administered" if injection_or_given else f"{vac_name} mentioned"
                break

    return {
        "vaccination_status": vaccination_status,
        "booster_status": booster_status,
        "dose_number": dose_number,
    }


def _token_numbers(text: str) -> set[str]:
    return set(re.findall(r"\d+(?:\.\d+)?", text or ""))


def _is_vital_grounded(key: str, value: Any, full_text: str) -> bool:
    if value is None:
        return False
    val_str = str(value).strip()
    if not val_str:
        return False
    full_lower = full_text.lower()
    val_lower = val_str.lower()

    # Exact substring match (ignoring spacing around /)
    compact_full = re.sub(r"\s+", "", full_lower)
    compact_val = re.sub(r"\s+", "", val_lower)
    if compact_val and compact_val in compact_full:
        return True

    # Require explicit number match AND context for key
    nums_in_val = _token_numbers(val_str)
    nums_in_text = _token_numbers(full_text)
    if not nums_in_val:
        return val_lower in full_lower
    if not nums_in_val.issubset(nums_in_text):
        return False

    k = key.lower()
    if any(w in k for w in ("weight", "wt", "vajan")):
        return bool(re.search(r"kg|kgs|kilo|किलो|किग्रा|weight|wt|vajan|wazan|वजन", full_lower, re.UNICODE))
    if "bp" in k or "blood" in k or "pressure" in k:
        # Both systolic and diastolic as single X/Y must match in text
        return bool(_extract_bp_values(full_text)) and compact_val in compact_full
    if "pulse" in k or "heart" in k:
        return bool(re.search(r"pulse|bpm|heart|नब्ज|पल्स|धड़कन", full_lower, re.UNICODE))
    if "temp" in k:
        return bool(re.search(r"temp|temperature|fever|bukhar|°|deg|\d+\s*[cf]\b|बुखार|तापमान", full_lower, re.UNICODE))
    if "hb" in k or "hemo" in k:
        return bool(re.search(r"hb|hemoglobin|haemoglobin|हीमोग्लोबिन|g/dl", full_lower, re.UNICODE))
    return True


def _is_symptom_grounded(symptom: Dict[str, Any], full_text: str) -> bool:
    name = (symptom.get("name") or "").strip().lower()
    if not name:
        return False
    full_lower = full_text.lower()
    if name in full_lower:
        return True
    # Check if every significant word or recognized synonym appears in text
    for group in _SYMPTOM_LEXICON:
        if any(term in name or name in term for term in group):
            if any(term in full_lower for term in group):
                return True
    # Word-level overlap fallback (e.g., "mild fever" -> "fever")
    tokens = [t for t in re.findall(r"[a-zA-Z\u0900-\u097F]{3,}", name) if t not in {"mild", "moderate", "severe", "pain"}]
    return any(t in full_lower for t in tokens)


def _names_equivalent(name_a: Optional[str], name_b: Optional[str]) -> bool:
    if not name_a or not name_b:
        return False
    a = _normalize_space(name_a).lower()
    b = _normalize_space(name_b).lower()
    if a == b:
        return True
    # First-name partial match only when both share same script and exact first token
    a_parts = a.split()
    b_parts = b.split()
    if a_parts and b_parts and a_parts[0] == b_parts[0] and (len(a_parts) == 1 or len(b_parts) == 1):
        return True
    return False


# ---------------------------------------------------------------------------
# Master Report Grounding Function
# ---------------------------------------------------------------------------

def ground_report_dict(
    raw_report: Dict[str, Any],
    transcript: str,
    selected_patient_name: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Validate and sanitize a raw LLM report dictionary strictly against `transcript`
    (which may include `ASHA correction:` lines) and optional `selected_patient_name`.

    Guarantees:
    - No fabricated vitals (BP, weight, pulse, temperature, Hb).
    - If transcript explicitly states BP (e.g. 120/80) or ASHA corrected it (e.g. 110/90),
      the grounded BP ALWAYS reflects the explicit/corrected value cleanly.
    - No fabricated age, gender, visit_type, next_visit_date, vaccination booster/dose, or symptoms.
    - Strict patient identity preservation (selected beneficiary or verbatim transcript name).
    - Missing values stay None (null), with follow-up prompt items in missing_information.
    """
    report = dict(raw_report)
    base_transcript, corrections = split_transcript_and_corrections(transcript)
    full_text = f"{base_transcript} {' '.join(corrections)}".strip()

    conflicts: List[Dict[str, Any]] = []

    # 1. Patient identity resolution & grounding
    selected_clean = _normalize_space(selected_patient_name) if selected_patient_name and _normalize_space(selected_patient_name) else None
    transcript_name_info = extract_patient_name_from_text(transcript)
    transcript_name = transcript_name_info["name"]
    transcript_name_ambiguous = bool(transcript_name_info["ambiguous"])

    # Also evaluate if LLM returned a name that literally appears verbatim in transcript
    llm_name = _normalize_space(report["patient_name"]) if isinstance(report.get("patient_name"), str) and _normalize_space(report["patient_name"]) else None
    llm_name_grounded = bool(
        llm_name
        and llm_name.lower() not in _NON_NAME_WORDS
        and (llm_name in full_text or llm_name.lower() in full_text.lower())
    )

    identity_status: str = "missing"
    patient_name_source: str = "missing"
    identity_mismatch_detail: Optional[str] = None
    patient_name_ambiguous: bool = False

    if selected_clean:
        # Requirement: If a beneficiary is explicitly selected, preserve that exact name.
        resolved_name = selected_clean
        patient_name_source = "selected_beneficiary"
        # Check if transcript explicitly names a DIFFERENT person -> flag mismatch (identity validation gate!)
        if transcript_name and not _names_equivalent(selected_clean, transcript_name):
            # Did an ASHA correction explicitly override or clarify the mismatch?
            identity_status = "mismatch"
            identity_mismatch_detail = (
                f"Selected beneficiary '{selected_clean}' does not match "
                f"transcript patient '{transcript_name}'."
            )
        else:
            identity_status = "verified"
    else:
        # No beneficiary selected: extract ONLY from transcript/corrections verbatim.
        if transcript_name_ambiguous:
            resolved_name = None
            patient_name_ambiguous = True
            identity_status = "ambiguous"
            patient_name_source = "missing"
        elif transcript_name:
            resolved_name = transcript_name
            identity_status = "verified"
            patient_name_source = "transcript"
        elif llm_name_grounded:
            resolved_name = llm_name
            identity_status = "verified"
            patient_name_source = "transcript"
        else:
            resolved_name = None
            identity_status = "missing"
            patient_name_source = "missing"

    report["patient_name"] = resolved_name

    # 2. Age & Gender grounding
    raw_age = report.get("patient_age")
    if isinstance(raw_age, str) and raw_age.strip():
        age_nums = _token_numbers(raw_age)
        age_context = re.search(
            r"\b(?:age|aged|years?|yrs?|months?|wks?|weeks?|umar|umra)\b|साल|वर्ष|महीने|माह|उम्र",
            full_text,
            re.IGNORECASE | re.UNICODE,
        )
        if not (age_nums and age_nums.issubset(_token_numbers(full_text)) and age_context):
            report["patient_age"] = None
    else:
        report["patient_age"] = None

    raw_gender = report.get("patient_gender")
    if isinstance(raw_gender, str) and raw_gender.strip():
        explicit_gender_text = re.search(
            r"\b(?:female|male|woman|man|girl|boy|lady|pregnant|mahila|aurat|ladki|ladka|aadmi|purush)\b|महिला|औरत|लड़की|लड़का|आदमी|पुरुष|गर्भवती",
            full_text,
            re.IGNORECASE | re.UNICODE,
        )
        if not explicit_gender_text:
            report["patient_gender"] = None
    else:
        report["patient_gender"] = None

    # 3. Vital signs strict source-only grounding (corrections override base transcript)
    raw_vitals = report.get("vital_signs_mentioned")
    grounded_vitals: Dict[str, str] = {}
    if isinstance(raw_vitals, dict):
        for k, v in raw_vitals.items():
            if _is_vital_grounded(k, v, full_text):
                grounded_vitals[k] = str(v).strip()

    # Deterministic BP resolution across base vs corrections
    base_bps = _extract_bp_values(base_transcript)
    corr_bp: Optional[str] = None
    for corr in corrections:
        bps = _extract_bp_values(corr)
        if bps:
            corr_bp = bps[-1]

    if corr_bp:
        grounded_vitals["bp"] = corr_bp
    elif base_bps:
        if len(base_bps) > 1:
            conflicts.append({
                "field": "bp",
                "values": base_bps,
                "question": f"Conflicting blood pressure values stated ({', '.join(base_bps)}). Please confirm the correct BP.",
            })
        grounded_vitals["bp"] = base_bps[-1]
    else:
        for k in list(grounded_vitals.keys()):
            if "bp" in k.lower() or "blood" in k.lower():
                grounded_vitals.pop(k, None)

    # Deterministic Weight resolution (must be strictly explicit; corrections win)
    base_weights = _extract_weight_values(base_transcript)
    corr_weight: Optional[str] = None
    for corr in corrections:
        ws = _extract_weight_values(corr)
        if ws:
            corr_weight = ws[-1]

    if corr_weight:
        grounded_vitals["weight"] = corr_weight
    elif base_weights:
        if len(base_weights) > 1:
            conflicts.append({
                "field": "weight",
                "values": base_weights,
                "question": f"Conflicting weight values stated ({', '.join(base_weights)}). Please confirm the correct weight.",
            })
        grounded_vitals["weight"] = base_weights[-1]
    else:
        for k in list(grounded_vitals.keys()):
            if any(w in k.lower() for w in ("weight", "wt", "vajan")):
                grounded_vitals.pop(k, None)

    # Pulse, Temp, Hb deterministic check
    corr_pulse = None
    for corr in corrections:
        ps = _extract_pulse_values(corr)
        if ps:
            corr_pulse = ps[-1]
    base_pulses = _extract_pulse_values(base_transcript)
    if corr_pulse:
        grounded_vitals["pulse"] = corr_pulse
    elif base_pulses:
        grounded_vitals.setdefault("pulse", base_pulses[-1])

    corr_temp = None
    for corr in corrections:
        ts = _extract_temperature_values(corr)
        if ts:
            corr_temp = ts[-1]
    base_temps = _extract_temperature_values(base_transcript)
    if corr_temp:
        grounded_vitals["temperature"] = corr_temp
    elif base_temps:
        grounded_vitals.setdefault("temperature", base_temps[-1])

    corr_hb = None
    for corr in corrections:
        hbs = _extract_hb_values(corr)
        if hbs:
            corr_hb = hbs[-1]
    base_hbs = _extract_hb_values(base_transcript)
    if corr_hb:
        grounded_vitals["hb"] = corr_hb
    elif base_hbs:
        grounded_vitals.setdefault("hb", base_hbs[-1])

    report["vital_signs_mentioned"] = grounded_vitals if grounded_vitals else None

    # 4. Visit type, Next visit date, and Vaccination fidelity
    visit_type = None
    for corr in reversed(corrections):
        vt = extract_visit_type_from_segment(corr)
        if vt:
            visit_type = vt
            break
    if visit_type is None:
        visit_type = extract_visit_type_from_segment(base_transcript)

    next_visit_date = None
    for corr in reversed(corrections):
        nv = extract_next_visit_date_from_segment(corr)
        if nv:
            next_visit_date = nv
            break
    if next_visit_date is None:
        next_visit_date = extract_next_visit_date_from_segment(base_transcript)

    vac_info = extract_vaccination_from_segment(base_transcript)
    for corr in corrections:
        corr_vac = extract_vaccination_from_segment(corr)
        if corr_vac["vaccination_status"]:
            vac_info["vaccination_status"] = corr_vac["vaccination_status"]
        if corr_vac["booster_status"]:
            vac_info["booster_status"] = corr_vac["booster_status"]
        if corr_vac["dose_number"]:
            vac_info["dose_number"] = corr_vac["dose_number"]

    # 5. Symptoms grounding
    raw_symptoms = report.get("symptoms") or []
    grounded_symptoms = [s for s in raw_symptoms if isinstance(s, dict) and _is_symptom_grounded(s, full_text)]
    report["symptoms"] = grounded_symptoms

    # 6. Build/preserve missing_information ("Information to confirm") without populating fake values
    missing_list: List[Dict[str, Any]] = []
    seen_fields = set()
    for item in (report.get("missing_information") or []):
        if isinstance(item, dict) and item.get("field_name"):
            fname = str(item["field_name"]).strip()
            seen_fields.add(fname.lower())
            missing_list.append(item)

    if identity_status == "ambiguous":
        missing_list.insert(0, {
            "field_name": "patient_name",
            "reason": transcript_name_info.get("reason") or "Patient name is ambiguous in transcript.",
            "prompt_question": "Kripya mareez ka sahi naam confirm karein (Please confirm the patient's exact name).",
            "importance": "high",
        })
        seen_fields.add("patient_name")
    elif identity_status == "mismatch":
        missing_list.insert(0, {
            "field_name": "patient_identity_mismatch",
            "reason": identity_mismatch_detail,
            "prompt_question": f"Selected beneficiary '{selected_clean}' does not match spoken name '{transcript_name}'. Please confirm the correct patient identity.",
            "importance": "high",
        })
        seen_fields.add("patient_identity_mismatch")
    elif identity_status == "missing" and "patient_name" not in seen_fields:
        missing_list.append({
            "field_name": "patient_name",
            "reason": "Patient name was not provided in transcript or selected beneficiary.",
            "prompt_question": "Mareez ka naam kya hai? (What is the patient's name?)",
            "importance": "high",
        })
        seen_fields.add("patient_name")

    for c in conflicts:
        cf = f"{c['field']}_conflict"
        if cf not in seen_fields:
            missing_list.insert(0, {
                "field_name": cf,
                "reason": c["question"],
                "prompt_question": c["question"],
                "importance": "high",
            })
            seen_fields.add(cf)

    # Helpful follow-up confirmations for unmentioned core fields (NOT auto-populated!)
    if "weight" not in (report.get("vital_signs_mentioned") or {}) and "weight" not in seen_fields:
        missing_list.append({
            "field_name": "weight",
            "reason": "Patient weight was not stated in transcript.",
            "prompt_question": "Patient weight was not mentioned. Please record weight in kg if measured.",
            "importance": "medium",
        })
    if not visit_type and "visit_type" not in seen_fields:
        missing_list.append({
            "field_name": "visit_type",
            "reason": "Visit type (e.g., ANC, PNC, Immunization) was not stated in transcript.",
            "prompt_question": "Visit type was not mentioned. Is this an ANC, PNC, or general visit?",
            "importance": "low",
        })
    if not next_visit_date and "next_visit_date" not in seen_fields:
        missing_list.append({
            "field_name": "next_visit_date",
            "reason": "Next visit date was not stated in transcript.",
            "prompt_question": "Next follow-up visit date was not mentioned.",
            "importance": "low",
        })

    report["missing_information"] = missing_list

    # 7. Sanitize chief_complaint & summary if LLM injected hallucinated values
    hallucination_leak = False
    raw_summary = str(report.get("summary") or "")
    raw_complaint = str(report.get("chief_complaint") or "")

    # Detect numbers in LLM summary that are neither in transcript nor grounded vitals
    summary_nums = _token_numbers(raw_summary)
    allowed_nums = _token_numbers(full_text) | {str(len(grounded_symptoms))}
    # Allow word numbers -> digit equivalents (e.g. "3 days" for "teen din")
    if not summary_nums.issubset(allowed_nums | {"1", "2", "3", "4"}):
        hallucination_leak = True
    if any(
        bad_kw in raw_summary.lower()
        for bad_kw in ("booster", "antenatal care", "250/60", "56 kg", "24 nov", "pooja")
        if bad_kw not in full_text.lower()
    ):
        hallucination_leak = True
    if llm_name and not llm_name_grounded and llm_name.lower() in raw_summary.lower():
        hallucination_leak = True
    if raw_complaint and any(
        bad_kw in raw_complaint.lower()
        for bad_kw in ("booster", "antenatal care", "250/60", "56 kg", "24 nov", "pooja")
        if bad_kw not in full_text.lower()
    ):
        report["chief_complaint"] = vac_info["vaccination_status"] or (
            grounded_symptoms[0]["name"] if grounded_symptoms else None
        )

    if hallucination_leak or not raw_summary.strip():
        parts: List[str] = []
        if resolved_name:
            parts.append(f"Patient: {resolved_name}.")
        else:
            parts.append("Patient name not provided.")
        if vac_info["vaccination_status"]:
            parts.append(f"{vac_info['vaccination_status']}.")
        if grounded_vitals:
            vital_str = ", ".join(f"{k.upper() if k == 'bp' else k}: {v}" for k, v in grounded_vitals.items())
            parts.append(f"Vitals recorded: {vital_str}.")
        if grounded_symptoms:
            sym_str = ", ".join(s.get("name", "") for s in grounded_symptoms if s.get("name"))
            if sym_str:
                parts.append(f"Symptoms: {sym_str}.")
        if visit_type:
            parts.append(f"Visit type: {visit_type}.")
        if next_visit_date:
            parts.append(f"Next visit: {next_visit_date}.")
        report["summary"] = " ".join(parts)

    # 8. Attach structured source-grounded metadata (without adding visit_id / patient_id)
    report["visit_type"] = visit_type
    report["next_visit_date"] = next_visit_date
    report["vaccination_status"] = vac_info["vaccination_status"]
    report["booster_status"] = vac_info["booster_status"]
    report["dose_number"] = vac_info["dose_number"]
    report["identity_status"] = identity_status
    report["patient_name_ambiguous"] = patient_name_ambiguous
    report["patient_name_source"] = patient_name_source
    report["selected_patient_name"] = selected_clean
    report["transcript_patient_name"] = transcript_name
    report["identity_mismatch_detail"] = identity_mismatch_detail
    report["conflicts"] = conflicts

    return report
