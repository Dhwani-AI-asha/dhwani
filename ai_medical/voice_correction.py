"""
ai_medical/voice_correction.py

Structured conversational voice report correction engine for Dhwani.

Design principles (Part 3 & Part 4 clinical safety):
1. Structured data is the single source of truth: every accepted correction
   updates the structured report dictionary first, then regenerates the
   human-readable summary and spoken narration from that structured state.
2. Unrelated fields are strictly preserved without mutation.
3. Missing details are never invented or hallucinated.
4. Ambiguous corrections (e.g. "Nahi, woh galat hai.") do not modify any field;
   they trigger a clear clarification question instead.
5. Confirmation is explicit: a report is never marked confirmed until the ASHA
   worker explicitly confirms it.
6. Audit trail: each field update records original_value, corrected_value,
   field, UTC ISO timestamp, and source ("voice" / "text").
"""

from copy import deepcopy
from datetime import datetime, timezone
import re
from typing import Any, Dict, List, Optional, Tuple

try:
    from ai_medical.correction import CorrectionError, build_corrected_transcript, normalize_correction
    from ai_medical.report_narration import (
        NarrationLanguage,
        detect_transcript_language,
        generate_narration_result,
    )
    from ai_medical.schemas import MedicalReportOutput
    from ai_medical.service import DISCLAIMER, to_speech_text
except ImportError:
    from correction import CorrectionError, build_corrected_transcript, normalize_correction
    from report_narration import (
        NarrationLanguage,
        detect_transcript_language,
        generate_narration_result,
    )
    from schemas import MedicalReportOutput
    from service import DISCLAIMER, to_speech_text


# Devanagari digits to ASCII digits translation table
_DEVANAGARI_DIGITS = str.maketrans("०१२३४५६७८९", "0123456789")

# Month normalization map (English full/short + Hindi/Devanagari + transliterated)
_MONTH_MAP: Dict[str, str] = {
    "jan": "January", "january": "January", "janvari": "January", "जनवरी": "January",
    "feb": "February", "february": "February", "farvari": "February", "फरवरी": "February", "फ़रवरी": "February",
    "mar": "March", "march": "March", "मार्च": "March",
    "apr": "April", "april": "April", "aprail": "April", "अप्रैल": "April",
    "may": "May", "mai": "May", "मई": "May",
    "jun": "June", "june": "June", "जून": "June",
    "jul": "July", "july": "July", "जुलाई": "July",
    "aug": "August", "august": "August", "agast": "August", "अगस्त": "August",
    "sep": "September", "sept": "September", "september": "September", "sitambar": "September", "सितंबर": "September", "सितम्बर": "September",
    "oct": "October", "october": "October", "aktubar": "October", "अक्टूबर": "October", "अक्तूबर": "October",
    "nov": "November", "november": "November", "navambar": "November", "नवंबर": "November", "नवम्बर": "November",
    "dec": "December", "december": "December", "disambar": "December", "दिसंबर": "December", "दिसम्बर": "December",
}

_MONTH_PATTERN = "|".join(sorted((re.escape(k) for k in _MONTH_MAP.keys()), key=len, reverse=True))

_FIELD_DISPLAY_LABELS: Dict[str, Dict[str, str]] = {
    "blood_pressure": {"en": "blood pressure", "hinglish": "blood pressure", "hi": "ब्लड प्रेशर"},
    "weight": {"en": "weight", "hinglish": "weight", "hi": "वजन"},
    "next_visit_date": {"en": "next visit date", "hinglish": "next visit date", "hi": "अगली विज़िट की तारीख"},
    "vaccination_status": {"en": "vaccination status", "hinglish": "vaccination status", "hi": "टीकाकरण की जानकारी"},
    "visit_type": {"en": "visit type", "hinglish": "visit type", "hi": "विज़िट का प्रकार"},
    "pulse_rate": {"en": "pulse rate", "hinglish": "pulse rate", "hi": "पल्स रेट"},
    "temperature": {"en": "temperature", "hinglish": "temperature", "hi": "तापमान"},
    "hemoglobin": {"en": "hemoglobin", "hinglish": "hemoglobin", "hi": "हीमोग्लोबिन"},
    "patient_name": {"en": "patient name", "hinglish": "patient name", "hi": "लाभार्थी का नाम"},
}


def _normalize_digits(text: str) -> str:
    return text.translate(_DEVANAGARI_DIGITS)


def _normalize_language(language: Optional[str], utterance: str, transcript: Optional[str] = None) -> str:
    """
    Resolve response language ('en', 'hi', or 'hinglish').
    - Uses Devanagari Hindi ('hi') when Devanagari script is present or explicitly requested.
    - Uses Romanized Hinglish ('hinglish') when Romanized Hindi/code-mixed Latin text is used.
    - Uses English ('en') for English utterances.
    """
    if language:
        low = language.strip().lower()
        if low in {"en", "en-in", "en-us", "english"}:
            return NarrationLanguage.ENGLISH.value
        if low in {"hi", "hi-in", "hi_in", "hindi"}:
            return NarrationLanguage.HINDI.value
        if low in {"hinglish", "hi-en"}:
            return NarrationLanguage.HINGLISH.value

    has_devanagari = any(0x0900 <= ord(ch) <= 0x097F for ch in utterance)
    if has_devanagari:
        return NarrationLanguage.HINDI.value

    # Detect from utterance first (so conversational reply matches what worker just spoke)
    det = detect_transcript_language(utterance)
    if not det.fallback_used:
        # Romanized Hindi (Latin script without Devanagari) should get Romanized Hinglish replies
        if det.detected_language == NarrationLanguage.HINDI.value and not has_devanagari:
            return NarrationLanguage.HINGLISH.value
        return det.detected_language

    # Check common Romanized Hindi/Hinglish keywords in short utterances like "haan", "nahi"
    low_u = utterance.lower()
    if re.search(r"\b(haan|han|nahi|nahin|hai|hain|galat|sahi|theek|thik|karo|bhi|diya|gaya|ko|wajan|vajan|agli|kaunsi|woh)\b", low_u):
        return NarrationLanguage.HINGLISH.value

    if transcript:
        if any(0x0900 <= ord(ch) <= 0x097F for ch in transcript):
            return NarrationLanguage.HINDI.value
        t_det = detect_transcript_language(transcript)
        if not t_det.fallback_used:
            if t_det.detected_language == NarrationLanguage.HINDI.value:
                return NarrationLanguage.HINGLISH.value
            return t_det.detected_language

    return NarrationLanguage.ENGLISH.value


def _extract_blood_pressure(text: str) -> Optional[str]:
    """Extract an explicit blood pressure reading (e.g. '110/90')."""
    norm = _normalize_digits(text)
    bp_sep = r"(?:/|by|over|bata|बटा|बटे)"

    # 1. Explicit BP label followed by reading (avoid \b after Devanagari vowel signs)
    bp_label = r"(?:\bblood\s*pressure\b|\bbp\b|\bb\.p\.|बी\.?\s*पी\.?|रक्तचाप)"
    labeled_patterns = [
        rf"{bp_label}[^\d]{{0,24}}?(\d{{2,3}})\s*{bp_sep}\s*(\d{{2,3}})",
        rf"(\d{{2,3}})\s*{bp_sep}\s*(\d{{2,3}})\s*(?:mmhg|mm\s*hg)?[^\n]{{0,16}}?{bp_label}",
    ]
    for pat in labeled_patterns:
        match = re.search(pat, norm, flags=re.IGNORECASE)
        if match:
            sys_v, dia_v = int(match.group(1)), int(match.group(2))
            if 50 <= sys_v <= 260 and 30 <= dia_v <= 160 and sys_v > dia_v:
                return f"{sys_v}/{dia_v}"

    # 2. Unlabeled systolic/diastolic slash reading only when clearly physiological BP (avoids dates like 28/11)
    standalone = re.search(r"\b(\d{2,3})\s*/\s*(\d{2,3})\b", norm)
    if standalone:
        sys_v, dia_v = int(standalone.group(1)), int(standalone.group(2))
        if 70 <= sys_v <= 260 and 40 <= dia_v <= 160 and sys_v > dia_v:
            return f"{sys_v}/{dia_v}"

    return None


def _extract_weight(text: str) -> Optional[str]:
    """Extract an explicit weight reading (e.g. '58 kg')."""
    norm = _normalize_digits(text)
    unit = r"(?:kg|kgs|kilo|kilos|kilogram|kilograms|किलो|किलोग्राम|किग्रा)"
    label = r"(?:weight|wajan|vajan|wt|वजन|वज़न)"

    patterns = [
        rf"(?:^|[\s,.;:])(?:{label})\b[^\d]{{0,20}}?(\d{{1,3}}(?:\.\d{{1,2}})?)\s*(?:{unit})?",
        rf"(\d{{1,3}}(?:\.\d{{1,2}})?)\s*(?:{unit})(?=\s|$|[,.;:।])",
    ]
    for pat in patterns:
        match = re.search(pat, norm, flags=re.IGNORECASE)
        if match:
            raw_num = match.group(1)
            val = float(raw_num)
            if 1.0 <= val <= 250.0:
                formatted = str(int(val)) if val.is_integer() else f"{val:g}"
                return f"{formatted} kg"
    return None


def _extract_next_visit_date(text: str) -> Optional[str]:
    """Extract an explicit next visit / follow-up date without inventing missing parts."""
    norm = _normalize_digits(text)
    visit_cue = (
        r"(?:next\s*(?:visit|follow[\s-]*up|check[\s-]*up|appointment)(?:\s*date)?|"
        r"follow[\s-]*up\s*date|"
        r"agli\s*(?:visit|bhent|mulakat|tarikh|tareekh|date)|"
        r"अगली\s*(?:भेंट|विज़िट|विजिट|जांच|तारीख|दिनांक))"
    )
    if not re.search(visit_cue, norm, flags=re.IGNORECASE):
        return None

    # ISO YYYY-MM-DD
    iso_m = re.search(rf"{visit_cue}[^\d]{{0,20}}(\d{{4}}-\d{{2}}-\d{{2}})", norm, flags=re.IGNORECASE)
    if iso_m:
        return iso_m.group(1)

    # Day Month [Year], e.g. "28 November", "28 Nov 2026", "28 नवंबर"
    dm_pat = rf"(\d{{1,2}})(?:st|nd|rd|th)?\s+({_MONTH_PATTERN})(?:[\s,]+(\d{{4}}))?"
    dm_m = re.search(dm_pat, norm, flags=re.IGNORECASE)
    if dm_m:
        day = int(dm_m.group(1))
        if 1 <= day <= 31:
            month_key = dm_m.group(2).lower()
            month_norm = _MONTH_MAP.get(month_key, dm_m.group(2).capitalize())
            year = dm_m.group(3)
            return f"{day} {month_norm} {year}" if year else f"{day} {month_norm}"

    # Month Day [Year], e.g. "November 28", "Nov 28, 2026"
    md_pat = rf"({_MONTH_PATTERN})\s+(\d{{1,2}})(?:st|nd|rd|th)?(?:[\s,]+(\d{{4}}))?"
    md_m = re.search(md_pat, norm, flags=re.IGNORECASE)
    if md_m:
        day = int(md_m.group(2))
        if 1 <= day <= 31:
            month_key = md_m.group(1).lower()
            month_norm = _MONTH_MAP.get(month_key, md_m.group(1).capitalize())
            year = md_m.group(3)
            return f"{day} {month_norm} {year}" if year else f"{day} {month_norm}"

    # DD/MM/YYYY or DD-MM-YYYY
    slash_m = re.search(rf"{visit_cue}[^\d]{{0,20}}(\d{{1,2}}[-/]\d{{1,2}}[-/]\d{{2,4}})", norm, flags=re.IGNORECASE)
    if slash_m:
        return slash_m.group(1)

    return None


def _extract_vaccination_status(text: str) -> Optional[str]:
    """Extract explicitly stated vaccination information (only if clearly supported)."""
    norm = _normalize_digits(text)
    low = norm.lower()

    has_vacc_context = bool(
        re.search(
            r"(?:vaccin|immuni[sz]|tika|teeka|टीका|टीकाकरण|tt\s*[-]?\s*[12]?|tt\s+injection|"
            r"tt\s+booster|tetanus|टिटनेस|टीटी|td\s*[-]?\s*[12]?|dpt|bcg|opv|polio|measles|pentavalent|rotavirus)",
            low,
            flags=re.IGNORECASE,
        )
    )
    if not has_vacc_context:
        return None

    # Determine which specific vaccine(s) were explicitly named
    vaccine_label: Optional[str] = None
    if re.search(r"\btt\s*[-]?\s*2\b|टीटी\s*[-]?\s*2", low):
        vaccine_label = "TT-2 booster" if "booster" in low or "बूस्टर" in norm else "TT-2 injection"
    elif re.search(r"\btt\s*[-]?\s*1\b|टीटी\s*[-]?\s*1", low):
        vaccine_label = "TT-1 injection"
    elif re.search(r"\btt\s*booster\b|टिटनेस\s*बूस्टर|टीटी\s*बूस्टर", low):
        vaccine_label = "TT booster"
    elif re.search(r"\btt\s*injection\b|\btt\b|टीटी\s*इंजेक्शन|टीटी\s*टीका|टिटनेस|tetanus", low):
        vaccine_label = "TT injection"
    elif re.search(r"\btd\s*booster\b|\btd\s*[-]?\s*[12]?\b", low):
        vaccine_label = "Td vaccine"
    elif re.search(r"\bdpt\b", low):
        vaccine_label = "DPT booster" if "booster" in low else "DPT vaccine"
    elif re.search(r"\bbcg\b", low):
        vaccine_label = "BCG vaccine"
    elif re.search(r"\bopv\b|\bpolio\b|पोलियो", low):
        vaccine_label = "Polio (OPV) vaccine"
    elif re.search(r"\bmeasles\b|खसरा", low):
        vaccine_label = "Measles vaccine"
    elif re.search(r"\bpentavalent\b", low):
        vaccine_label = "Pentavalent vaccine"

    # Determine status strictly from explicit phrasing around the vaccine clause
    # Check negative status phrases specifically attached to administration
    is_not_given = bool(
        re.search(
            r"(?:nahi\s+(?:diya|laga|lagaya|hua)|not\s+(?:given|administered|vaccinated|done)|"
            r"pending|baaki\s+hai|नहीं\s+(?:दिया|लगा|लगाया|हुआ)|बाकी\s+है)",
            low,
            flags=re.IGNORECASE,
        )
    )
    is_given = bool(
        re.search(
            r"(?:diya\s+gaya|de\s+diya|laga\s+diya|lagaya\s+gaya|lag\s+gaya|"
            r"given|administered|vaccinated|completed|done|verified|"
            r"दिया\s+गया|दे\s+दिया|लगा\s+दिया|लगाया\s+गया|लग\s+गया|सत्यापित)",
            low,
            flags=re.IGNORECASE,
        )
    )

    if vaccine_label:
        # Negation MUST take precedence because 'nahi diya gaya' contains the substring 'diya gaya'
        if is_not_given:
            return f"{vaccine_label} not given (pending)"
        if is_given:
            return f"{vaccine_label} administered"
        # Vaccine explicitly named with "add" / "hai" (e.g. "vaccination status TT injection hai")
        if re.search(r"\b(add|hai|shamil|दर्ज|जोड़ें|जोड़ो|है)\b", low):
            return f"{vaccine_label} recorded"

    return None


def _extract_visit_type(text: str) -> Optional[str]:
    """Extract explicitly stated visit type (e.g. ANC, PNC, Immunization, NCD)."""
    norm = _normalize_digits(text)
    cue = r"(?:visit\s*type|bhent\s*(?:ka\s*)?prakar|भेंट\s*(?:का\s*)?प्रकार|check[\s-]*up\s*type|yeh\s+.*?(?:visit|checkup|भेंट))"
    has_cue = bool(re.search(cue, norm, flags=re.IGNORECASE))
    if not has_cue:
        return None

    m_anc = re.search(r"\b(anc)(?:\s*(?:visit\s*)?#?\s*(\d+))?\b|एएनसी(?:\s*#?\s*(\d+))?", norm, flags=re.IGNORECASE)
    if m_anc:
        num = m_anc.group(2) or m_anc.group(3)
        return f"ANC Visit #{num}" if num else "ANC"

    m_pnc = re.search(r"\b(pnc)(?:\s*(?:day\s*)?#?\s*(\d+))?\b|पीएनसी(?:\s*(?:दिन\s*)?(\d+))?", norm, flags=re.IGNORECASE)
    if m_pnc:
        num = m_pnc.group(2) or m_pnc.group(3)
        return f"PNC Day {num}" if num else "PNC"

    if re.search(r"\bimmunization\b|\bvaccination\s+visit\b|टीकाकरण\s+भेंट", norm, flags=re.IGNORECASE):
        return "Routine Immunization"

    if re.search(r"\bncd\b|\bhypertension\b|\bdiabetes\b", norm, flags=re.IGNORECASE):
        return "NCD Follow-up"

    return None


def _extract_pulse(text: str) -> Optional[str]:
    norm = _normalize_digits(text)
    m = re.search(r"(?:pulse(?:\s*rate)?|पल्स|नाड़ी)[^\d]{0,16}?(\d{2,3})\s*(?:bpm)?", norm, flags=re.IGNORECASE)
    if m:
        val = int(m.group(1))
        if 35 <= val <= 220:
            return f"{val} bpm"
    return None


def _extract_temperature(text: str) -> Optional[str]:
    norm = _normalize_digits(text)
    m = re.search(
        r"(?:temp(?:erature)?|तापमान|बुखार)[^\d]{0,16}?(\d{2,3}(?:\.\d{1,2})?)\s*(?:°?\s*([fFcC]))?",
        norm,
        flags=re.IGNORECASE,
    )
    if m:
        val = float(m.group(1))
        unit = (m.group(2) or "").upper()
        if not unit:
            unit = "C" if 34.0 <= val <= 43.0 else ("F" if 94.0 <= val <= 109.0 else "")
        if unit == "C" and 34.0 <= val <= 43.0:
            return f"{val:g} °C"
        if unit == "F" and 94.0 <= val <= 109.0:
            return f"{val:g} °F"
    return None


def _extract_hemoglobin(text: str) -> Optional[str]:
    norm = _normalize_digits(text)
    m = re.search(
        r"(?:hemoglobin|haemoglobin|\bhb\b|हीमोग्लोबिन)[^\d]{0,16}?(\d{1,2}(?:\.\d{1,2})?)",
        norm,
        flags=re.IGNORECASE,
    )
    if m:
        val = float(m.group(1))
        if 3.0 <= val <= 22.0:
            return f"{val:g} g/dL"
    return None


def _extract_patient_name(text: str) -> Optional[str]:
    """Extract an explicitly corrected patient name verbatim (Hindi Devanagari, Hinglish, or English)."""
    m = re.search(
        r"(?:(?:patient|beneficiary)\s*name|लाभार्थी\s*का\s*नाम|मरीज\s*का\s*नाम|naam|नाम|patient)\s*(?:is|hai|badalkar|बदलकर|को)?\s*[:\-]?\s*([A-Za-z\u0901-\u0963\u0966-\u097F'.-]+(?:\s+[A-Za-z\u0901-\u0963\u0966-\u097F'.-]+){0,2})",
        text,
        flags=re.IGNORECASE,
    )
    if m:
        candidate = re.sub(
            r"\s+(?:hai|hain|kar|karo|karna|kardo|kiya|confirm|sahi|है|हैं|करें|करो)$",
            "",
            m.group(1).strip(" ।॥.,!?"),
            flags=re.IGNORECASE,
        ).strip()
        if candidate and candidate.lower() not in {
            "galat", "wrong", "sahi", "nahi", "change", "correct", "not", "provided", "unknown", "clear"
        }:
            return candidate
    return None


def extract_field_updates(utterance: str) -> Dict[str, str]:
    """
    Parse explicit structured field updates from an ASHA worker's spoken/typed correction.
    Only returns fields that have BOTH an identifiable target field AND a concrete value.
    Never invents or defaults unmentioned fields.
    """
    updates: Dict[str, str] = {}
    if not isinstance(utterance, str) or not utterance.strip():
        return updates

    bp = _extract_blood_pressure(utterance)
    if bp is not None:
        updates["blood_pressure"] = bp

    weight = _extract_weight(utterance)
    if weight is not None:
        updates["weight"] = weight

    next_date = _extract_next_visit_date(utterance)
    if next_date is not None:
        updates["next_visit_date"] = next_date

    vacc = _extract_vaccination_status(utterance)
    if vacc is not None:
        updates["vaccination_status"] = vacc

    visit_type = _extract_visit_type(utterance)
    if visit_type is not None:
        updates["visit_type"] = visit_type

    pulse = _extract_pulse(utterance)
    if pulse is not None:
        updates["pulse_rate"] = pulse

    temp = _extract_temperature(utterance)
    if temp is not None:
        updates["temperature"] = temp

    hb = _extract_hemoglobin(utterance)
    if hb is not None:
        updates["hemoglobin"] = hb

    name = _extract_patient_name(utterance)
    if name is not None:
        updates["patient_name"] = name

    return updates


def _detect_mentioned_field_without_value(utterance: str) -> Optional[str]:
    """Identify if the worker named a specific field (e.g. 'BP galat hai') without giving the new value."""
    low = utterance.lower()
    if re.search(r"\b(bp|blood\s*pressure)\b|बी\.?पी\.?|रक्तचाप", low):
        return "blood_pressure"
    if re.search(r"\b(weight|wajan|vajan)\b|वजन|वज़न", low):
        return "weight"
    if re.search(r"(next\s*visit|agli\s*(?:visit|bhent)|अगली\s*(?:भेंट|विज़िट|तारीख))", low):
        return "next_visit_date"
    if re.search(r"(vaccin|immuni|tika|teeka|टीका)", low):
        return "vaccination_status"
    if re.search(r"(visit\s*type|भेंट\s*का\s*प्रकार)", low):
        return "visit_type"
    return None


def classify_utterance_intent(utterance: str) -> Tuple[str, Dict[str, str]]:
    """
    Classify a worker's conversational response during report review.

    Returns (intent, extracted_updates) where intent is one of:
      - "correction": one or more concrete structured field updates were found
      - "confirm": explicit worker confirmation with no pending correction
      - "ambiguous": worker indicated an error or gave an unclear statement without a specific field/value
    """
    cleaned = utterance.strip()
    if not cleaned:
        return "ambiguous", {}

    # 1. Concrete structured updates ALWAYS win over affirmative words like "haan, BP 110/90 hai"
    updates = extract_field_updates(cleaned)
    if updates:
        return "correction", updates

    low = cleaned.lower()

    # 2. Explicit "no changes needed" confirmation phrases (must be checked before generic 'nahi')
    no_change_confirm = re.search(
        r"(?:no\s+changes?|nothing\s+to\s+change|all\s+(?:good|correct|fine)|"
        r"everything\s+is\s+(?:correct|fine|good|ok|okay)|"
        r"sab\s+(?:sahi|theek|thik)\s+hai|"
        r"koi\s+(?:badlav|change)\s+nahi|kuch\s+(?:badalna|change)\s+nahi|"
        r"कोई\s+बदलाव\s+नहीं|सब\s+सही\s+है|सब\s+ठीक\s+है)",
        low,
        flags=re.IGNORECASE,
    )
    if no_change_confirm:
        return "confirm", {}

    # 3. Check for rejection / error / change cues (if present without updates -> ambiguous!)
    has_rejection = bool(
        re.search(
            r"(?:\b(?:nahi|nahin|no|nope|wrong|incorrect|galat|change|badlo|badalna|update|edit|fix|modify)\b|"
            r"नहीं|गलत|ग़लत|सही\s+नहीं|बदलो|बदलना|सुधार|ठीक\s+नहीं)",
            low,
            flags=re.IGNORECASE,
        )
    )
    if has_rejection:
        return "ambiguous", {}

    # 4. Explicit confirmation phrases
    has_confirmation = bool(
        re.search(
            r"(?:\b(?:haan|han|ha|yes|yeah|yep|correct|right|ok|okay|confirm|confirmed|approve|approved|save|sahi|theek|thik|bilkul)\b|"
            r"हाँ|हां|जी\s*हाँ|सही\s*है|ठीक\s*है|बिल्कुल\s*सही|पुष्टि|सेव\s*कर)",
            low,
            flags=re.IGNORECASE,
        )
    )
    if has_confirmation:
        return "confirm", {}

    return "ambiguous", {}


def _get_current_field_value(report: Dict[str, Any], field: str) -> Any:
    """Read the current value of a structured field from the report dict."""
    vitals = report.get("vital_signs_mentioned")
    if not isinstance(vitals, dict):
        vitals = {}

    if field == "blood_pressure":
        return vitals.get("bp") or vitals.get("blood_pressure") or report.get("blood_pressure")
    if field == "weight":
        return vitals.get("weight") or report.get("weight")
    if field == "pulse_rate":
        return vitals.get("pulse") or vitals.get("pulse_rate")
    if field == "temperature":
        return vitals.get("temperature") or vitals.get("temp")
    if field == "hemoglobin":
        return vitals.get("hemoglobin") or vitals.get("hb")
    return report.get(field)


def _set_field_value(report: Dict[str, Any], field: str, value: str) -> None:
    """Update a single structured field in-place without disturbing unrelated fields."""
    if field in {"blood_pressure", "weight", "pulse_rate", "temperature", "hemoglobin"}:
        vitals = report.get("vital_signs_mentioned")
        if not isinstance(vitals, dict):
            vitals = {}
            report["vital_signs_mentioned"] = vitals

        if field == "blood_pressure":
            vitals["bp"] = value
            if "blood_pressure" in vitals:
                vitals["blood_pressure"] = value
            if "blood_pressure" in report:
                report["blood_pressure"] = value
        elif field == "weight":
            vitals["weight"] = value
            if "weight" in report:
                report["weight"] = value
        elif field == "pulse_rate":
            vitals["pulse"] = value
        elif field == "temperature":
            vitals["temperature"] = value
        elif field == "hemoglobin":
            vitals["hemoglobin"] = value
    elif field == "patient_name":
        report["patient_name"] = value
        report["patient_name_source"] = "confirmed"
        report["identity_status"] = "verified"
        report["patient_name_ambiguous"] = False
        report["identity_mismatch_detail"] = None
    elif field == "vaccination_status":
        report["vaccination_status"] = value
        low_v = str(value).lower()
        report["booster_status"] = value if ("booster" in low_v or "बूस्टर" in str(value)) else None
        dose_m = re.search(r"(?:dose\s*([1-4])|tt[\s-]*([1-4]))", low_v)
        report["dose_number"] = next((g for g in dose_m.groups() if g), None) if dose_m else None
    else:
        report[field] = value


def _build_structured_summary(report: Dict[str, Any], lang: str) -> str:
    """Regenerate a concise factual summary directly from the structured report fields."""
    parts: List[str] = []

    if report.get("patient_name"):
        parts.append(f"Patient: {report['patient_name']}")
    if report.get("visit_type"):
        parts.append(f"Visit type: {report['visit_type']}")

    vitals = report.get("vital_signs_mentioned")
    if isinstance(vitals, dict):
        bp = vitals.get("bp") or vitals.get("blood_pressure")
        if bp:
            parts.append(f"Blood pressure: {bp}")
        wt = vitals.get("weight")
        if wt:
            parts.append(f"Weight: {wt}")
        pulse = vitals.get("pulse") or vitals.get("pulse_rate")
        if pulse:
            parts.append(f"Pulse: {pulse}")
        temp = vitals.get("temperature") or vitals.get("temp")
        if temp:
            parts.append(f"Temperature: {temp}")
        hb = vitals.get("hemoglobin") or vitals.get("hb")
        if hb:
            parts.append(f"Hemoglobin: {hb}")

    if report.get("chief_complaint"):
        parts.append(f"Chief complaint: {report['chief_complaint']}")

    symptoms = report.get("symptoms")
    if isinstance(symptoms, list) and symptoms:
        sym_names = [
            s.get("name", str(s)) if isinstance(s, dict) else str(s)
            for s in symptoms
        ]
        parts.append(f"Symptoms: {', '.join(sym_names)}")

    if report.get("vaccination_status"):
        parts.append(f"Vaccination status: {report['vaccination_status']}")

    if report.get("next_visit_date"):
        parts.append(f"Next visit: {report['next_visit_date']}")

    if not parts:
        existing = report.get("summary")
        if isinstance(existing, str) and existing.strip():
            return existing.strip()
        return "Visit details recorded."

    return ". ".join(parts) + "."


def _build_spoken_report(report: Dict[str, Any], lang: str) -> Tuple[str, str]:
    """
    Build structured on-screen narration and natural spoken read-back directly from
    the structured report dictionary (single source of truth).
    """
    vitals = report.get("vital_signs_mentioned") if isinstance(report.get("vital_signs_mentioned"), dict) else {}
    bp = vitals.get("bp") or vitals.get("blood_pressure") or report.get("blood_pressure")
    weight = vitals.get("weight") or report.get("weight")
    pulse = vitals.get("pulse") or vitals.get("pulse_rate")
    temp = vitals.get("temperature") or vitals.get("temp")
    hb = vitals.get("hemoglobin") or vitals.get("hb")
    visit_type = report.get("visit_type")
    next_visit = report.get("next_visit_date")
    vaccination = report.get("vaccination_status")
    patient_name = report.get("patient_name")
    symptoms = report.get("symptoms") if isinstance(report.get("symptoms"), list) else []
    danger_signs = report.get("danger_signs") if isinstance(report.get("danger_signs"), list) else []

    if lang == NarrationLanguage.HINDI.value:
        lines: List[str] = ["विज़िट रिपोर्ट का विवरण:"]
        lines.append(f"लाभार्थी का नाम: {patient_name if patient_name else 'Name not provided'}।")
        if visit_type:
            lines.append(f"विज़िट का प्रकार: {visit_type}।")
        if bp:
            bp_speech = str(bp).replace("/", " बटा ")
            lines.append(f"ब्लड प्रेशर: {bp_speech}।")
        if weight:
            lines.append(f"वजन: {weight}।")
        if pulse:
            lines.append(f"पल्स: {pulse}।")
        if temp:
            lines.append(f"तापमान: {temp}।")
        if hb:
            lines.append(f"हीमोग्लोबिन: {hb}।")
        if symptoms:
            names = ", ".join(s.get("name", str(s)) if isinstance(s, dict) else str(s) for s in symptoms)
            lines.append(f"दर्ज लक्षण: {names}।")
        if vaccination:
            lines.append(f"टीकाकरण: {vaccination}।")
        if next_visit:
            lines.append(f"अगली विज़िट: {next_visit}।")
        if danger_signs:
            ds_names = ", ".join(d.get("sign", str(d)) if isinstance(d, dict) else str(d) for d in danger_signs)
            lines.append(f"संभावित खतरे के संकेत: {ds_names}।")
        narration = "\n".join(lines)
        return narration, to_speech_text(narration)

    if lang == NarrationLanguage.HINGLISH.value:
        lines = ["Visit report summary:"]
        lines.append(f"Patient: {patient_name if patient_name else 'Name not provided'}.")
        if visit_type:
            lines.append(f"Visit type: {visit_type}.")
        if bp:
            lines.append(f"Blood pressure: {bp}.")
        if weight:
            lines.append(f"Weight: {weight}.")
        if pulse:
            lines.append(f"Pulse: {pulse}.")
        if temp:
            lines.append(f"Temperature: {temp}.")
        if hb:
            lines.append(f"Hemoglobin: {hb}.")
        if symptoms:
            names = ", ".join(s.get("name", str(s)) if isinstance(s, dict) else str(s) for s in symptoms)
            lines.append(f"Symptoms: {names}.")
        if vaccination:
            lines.append(f"Vaccination status: {vaccination}.")
        if next_visit:
            lines.append(f"Next visit: {next_visit}.")
        if danger_signs:
            ds_names = ", ".join(d.get("sign", str(d)) if isinstance(d, dict) else str(d) for d in danger_signs)
            lines.append(f"Potential danger signs: {ds_names}.")
        narration = "\n".join(lines)
        return narration, to_speech_text(narration)

    # English
    lines = ["Visit report summary:"]
    lines.append(f"Patient: {patient_name if patient_name else 'Name not provided'}.")
    if visit_type:
        lines.append(f"Visit type: {visit_type}.")
    if bp:
        lines.append(f"Blood pressure: {bp}.")
    if weight:
        lines.append(f"Weight: {weight}.")
    if pulse:
        lines.append(f"Pulse: {pulse}.")
    if temp:
        lines.append(f"Temperature: {temp}.")
    if hb:
        lines.append(f"Hemoglobin: {hb}.")
    if symptoms:
        names = ", ".join(s.get("name", str(s)) if isinstance(s, dict) else str(s) for s in symptoms)
        lines.append(f"Symptoms: {names}.")
    if vaccination:
        lines.append(f"Vaccination status: {vaccination}.")
    if next_visit:
        lines.append(f"Next visit: {next_visit}.")
    if danger_signs:
        ds_names = ", ".join(d.get("sign", str(d)) if isinstance(d, dict) else str(d) for d in danger_signs)
        lines.append(f"Potential danger signs: {ds_names}.")
    narration = "\n".join(lines)
    return narration, to_speech_text(narration)


def build_confirmation_question(lang: str, updated: bool = False) -> str:
    """Return a natural confirmation prompt in the worker's language."""
    if lang == NarrationLanguage.HINDI.value:
        if updated:
            return "क्या अपडेटेड रिपोर्ट सही है? क्या आप कोई और बदलाव करना चाहती हैं?"
        return "क्या यह रिपोर्ट सही है? क्या आप कोई बदलाव करना चाहती हैं?"
    if lang == NarrationLanguage.HINGLISH.value:
        if updated:
            return "Kya updated report sahi hai? Kya aap koi aur badlav karna chahti hain?"
        return "Kya yeh report sahi hai? Kya aap koi badlav karna chahti hain?"
    if updated:
        return "Is the updated report correct? Would you like to make any more changes?"
    return "Is this report correct? Would you like to make any changes?"


def _build_clarification_question(lang: str, mentioned_field: Optional[str]) -> str:
    """Ask a focused clarification question when the correction is ambiguous."""
    if mentioned_field:
        label = _FIELD_DISPLAY_LABELS.get(mentioned_field, {}).get(lang, mentioned_field.replace("_", " "))
        if lang == NarrationLanguage.HINDI.value:
            return f"सही {label} क्या दर्ज करना है? कृपया नया मान बताएं।"
        if lang == NarrationLanguage.HINGLISH.value:
            return f"Sahi {label} kya darj karna hai? Kripya naya value batayein."
        return f"What should the corrected {label} be? Please specify the exact value."

    if lang == NarrationLanguage.HINDI.value:
        return "कौनसी जानकारी सही करनी है? जैसे ब्लड प्रेशर, वजन, अगली विज़िट की तारीख, या टीकाकरण?"
    if lang == NarrationLanguage.HINGLISH.value:
        return "Kaunsi information correct karni hai? Jaise BP, weight, next visit date, ya vaccination?"
    return "Which information would you like to correct? For example, blood pressure, weight, next visit date, or vaccination?"


def _build_update_ack(changes: List[Dict[str, Any]], lang: str) -> str:
    """Build a natural acknowledgement naming every updated field and its new value."""
    if lang == NarrationLanguage.HINDI.value:
        pieces = []
        for ch in changes:
            lbl = _FIELD_DISPLAY_LABELS.get(ch["field"], {}).get("hi", ch["field"])
            val = str(ch["corrected_value"]).replace("/", " बटा ") if ch["field"] == "blood_pressure" else str(ch["corrected_value"])
            pieces.append(f"{lbl} को {val}")
        joined = " और ".join(pieces)
        return f"ठीक है, मैंने {joined} अपडेट कर दिया है। मैं अपडेटेड रिपोर्ट पढ़ती हूँ।"

    if lang == NarrationLanguage.HINGLISH.value:
        pieces = []
        for ch in changes:
            lbl = _FIELD_DISPLAY_LABELS.get(ch["field"], {}).get("hinglish", ch["field"])
            pieces.append(f"{lbl} ko {ch['corrected_value']}")
        joined = " aur ".join(pieces)
        return f"Theek hai, maine {joined} update kar diya hai. Main updated report padhti hoon."

    pieces = []
    for ch in changes:
        lbl = _FIELD_DISPLAY_LABELS.get(ch["field"], {}).get("en", ch["field"])
        pieces.append(f"{lbl} to {ch['corrected_value']}")
    joined = " and ".join(pieces)
    return f"Okay, I have updated {joined}. Let me read the updated report."


def apply_structured_voice_correction(
    current_report: Dict[str, Any],
    utterance: str,
    transcript: Optional[str] = None,
    language: Optional[str] = None,
    source: str = "voice",
    selected_patient_name: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Process one conversational turn of ASHA voice report correction.

    Args:
        current_report: The current structured visit report dictionary (source of truth).
        utterance: Transcribed speech (or typed text) from the ASHA worker.
        transcript: Optional running consultation transcript to append correction lines to.
        language: Optional language override ('en', 'hi', 'hinglish').
        source: Origin of correction ('voice' or 'text').

    Returns:
        Dict with keys:
          ok, action ('updated' | 'clarify' | 'confirmed'), confirmed, report,
          changes, correction_history, narration, narration_speech,
          assistant_reply, assistant_reply_speech, confirmation_prompt,
          narration_language, transcript_used, disclaimer.
    """
    if not isinstance(current_report, dict):
        raise CorrectionError("invalid_report", "Current structured report must be an object.")

    cleaned_utterance = normalize_correction(utterance)
    lang = _normalize_language(language, cleaned_utterance, transcript)
    safe_source = source if source in {"voice", "text", "manual"} else "voice"

    # Deep copy to guarantee we never partially mutate caller's object
    updated_report: Dict[str, Any] = deepcopy(current_report)
    existing_history: List[Dict[str, Any]] = list(updated_report.get("correction_history") or [])

    intent, field_updates = classify_utterance_intent(cleaned_utterance)

    # Case 1: Explicit confirmation — enforce patient identity validation gate when identity is missing/ambiguous/mismatched
    if intent == "confirm":
        id_status = updated_report.get("identity_status")
        mismatch_selected = bool(
            selected_patient_name
            and updated_report.get("patient_name")
            and selected_patient_name.strip().lower() != str(updated_report.get("patient_name")).strip().lower()
        )
        if id_status in {"missing", "ambiguous", "mismatch"} or mismatch_selected:
            updated_report["confirmed"] = False
            updated_report["correction_history"] = existing_history
            narration, narration_speech = _build_spoken_report(updated_report, lang)
            if lang == NarrationLanguage.HINDI.value:
                id_prompt = "कन्फर्म करने से पहले कृपया मरीज का सही नाम बताएं या चुनें।"
            elif lang == NarrationLanguage.HINGLISH.value:
                id_prompt = "Confirm karne se pehle kripya patient ka sahi naam batayein ya select karein."
            else:
                id_prompt = "Please confirm or select the exact patient name before confirming this report."
            return {
                "ok": True,
                "action": "clarify",
                "confirmed": False,
                "report": updated_report,
                "changes": [],
                "correction_history": existing_history,
                "narration": narration,
                "narration_speech": narration_speech,
                "assistant_reply": id_prompt,
                "assistant_reply_speech": to_speech_text(id_prompt),
                "confirmation_prompt": id_prompt,
                "narration_language": lang,
                "transcript_used": transcript or "",
                "disclaimer": DISCLAIMER,
            }

        updated_report["confirmed"] = True
        updated_report["confirmed_at"] = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
        updated_report["correction_history"] = existing_history
        narration, narration_speech = _build_spoken_report(updated_report, lang)

        if lang == NarrationLanguage.HINDI.value:
            reply = "आपकी रिपोर्ट की पुष्टि हो गई है और इसे सेव कर दिया गया है।"
        elif lang == NarrationLanguage.HINGLISH.value:
            reply = "Aapki report confirm ho gayi hai aur save kar di gayi hai."
        else:
            reply = "Your report has been confirmed and saved."

        return {
            "ok": True,
            "action": "confirmed",
            "confirmed": True,
            "report": updated_report,
            "changes": [],
            "correction_history": existing_history,
            "narration": narration,
            "narration_speech": narration_speech,
            "assistant_reply": reply,
            "assistant_reply_speech": to_speech_text(reply),
            "confirmation_prompt": "",
            "narration_language": lang,
            "transcript_used": transcript or "",
            "disclaimer": DISCLAIMER,
        }

    # Case 2: Ambiguous correction — do NOT mutate structured data; ask clarification question
    if intent == "ambiguous" or not field_updates:
        updated_report["confirmed"] = False
        updated_report["correction_history"] = existing_history
        mentioned = _detect_mentioned_field_without_value(cleaned_utterance)
        clarification = _build_clarification_question(lang, mentioned)
        narration, narration_speech = _build_spoken_report(updated_report, lang)

        return {
            "ok": True,
            "action": "clarify",
            "confirmed": False,
            "report": updated_report,
            "changes": [],
            "correction_history": existing_history,
            "narration": narration,
            "narration_speech": narration_speech,
            "assistant_reply": clarification,
            "assistant_reply_speech": to_speech_text(clarification),
            "confirmation_prompt": clarification,
            "narration_language": lang,
            "transcript_used": transcript or "",
            "disclaimer": DISCLAIMER,
        }

    # Case 3: Concrete structured correction(s) — update ONLY matched fields & preserve everything else
    now_iso = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    new_changes: List[Dict[str, Any]] = []

    for field, new_val in field_updates.items():
        old_val = _get_current_field_value(updated_report, field)
        _set_field_value(updated_report, field, new_val)
        entry = {
            "field": field,
            "original_value": old_val,
            "corrected_value": new_val,
            "timestamp": now_iso,
            "source": safe_source,
        }
        new_changes.append(entry)
        existing_history.append(entry)

    # Mark explicitly unconfirmed until worker confirms the updated report
    updated_report["confirmed"] = False
    updated_report["correction_history"] = existing_history

    # Regenerate summary directly from updated structured data
    updated_report["summary"] = _build_structured_summary(updated_report, lang)

    # Regenerate narration directly from updated structured data
    narration, narration_speech = _build_spoken_report(updated_report, lang)

    ack = _build_update_ack(new_changes, lang)
    confirm_q = build_confirmation_question(lang, updated=True)
    full_reply_speech = to_speech_text(f"{ack}\n{narration_speech}\n{confirm_q}")

    transcript_used = transcript or ""
    if transcript and transcript.strip():
        transcript_used = build_corrected_transcript(transcript, cleaned_utterance)

    return {
        "ok": True,
        "action": "updated",
        "confirmed": False,
        "report": updated_report,
        "changes": new_changes,
        "correction_history": existing_history,
        "narration": narration,
        "narration_speech": narration_speech,
        "assistant_reply": ack,
        "assistant_reply_speech": full_reply_speech,
        "confirmation_prompt": confirm_q,
        "narration_language": lang,
        "transcript_used": transcript_used,
        "disclaimer": DISCLAIMER,
    }
