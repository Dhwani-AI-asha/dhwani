/**
 * Deterministic danger-sign detection and validation for Dhwani.
 *
 * Detects ONLY current (non-negated, grounded) clinical red flags from:
 * 1. Live patient speech segments/turns (English, Hindi Devanagari, Hinglish), with strict
 *    clause-level negation and resolved/past filtering.
 * 2. Validated AI report `danger_signs` arrays (`is_present === true` and grounded `evidence`).
 *
 * Enforces repeated-alert deduplication via canonical keys so a single visit does not
 * re-trigger already handled danger signs on subsequent STT updates or report hydration.
 */
import type { DangerSignAlert } from '../types/index.ts';

export interface RawReportDangerSign {
  sign?: unknown;
  evidence?: unknown;
  is_present?: unknown;
  urgency_level?: unknown;
}

interface DangerRule {
  canonicalKey: string;
  alertId: string;
  ruleCode: string;
  title: string;
  hindiTitle: string;
  severity: 'CRITICAL' | 'HIGH';
  instruction: string;
  patterns: RegExp[];
  skipNegationCheck?: boolean; // True only for self-negated danger patterns (e.g. "hosh me nahi", "doodh nahi pee raha")
  antiFalsePositivePatterns?: RegExp[];
}

const DEFAULT_FACILITY = 'Rampur Primary Health Centre (PHC) - 2.8 km';
const DEFAULT_MO = 'Dr. Rajesh Varma (MBBS)';
const DEFAULT_AMBULANCE = 'Dial 108 / Rampur Unit Active';

// Negation cues within a single clause before or after a symptom mention
const CLAUSE_NEGATION_RE =
  /(?:(?<![a-z])(?:no|not|without|never|denied|denies|absent|none|koi|nahi|nahin|na|mat|band|theek|thik)(?![a-z])|नहीं|नही|कोई\s+नहीं|बंद\s+हो\s+गया|ठीक\s+हो\s+गया)/i;

const RESOLVED_OR_PAST_RE =
  /(?:(?<![a-z])(?:earlier\s+but\s+(?:fine|resolved)|no\s+longer|resolved|stopped|pehle\s+tha\s+ab\s+nahi|pahle\s+tha\s+ab\s+nahi)(?![a-z])|पहले\s+था\s+अब\s+नहीं)/i;

const DANGER_RULES: DangerRule[] = [
  {
    canonicalKey: 'bleeding',
    alertId: 'DS-BLEEDING',
    ruleCode: 'ANC-APH-01',
    title: 'Heavy / Vaginal Bleeding',
    hindiTitle: 'गर्भावस्था या प्रसव में अत्यधिक रक्तस्राव',
    severity: 'CRITICAL',
    instruction:
      'Do not perform internal examination. Keep patient lying down on left lateral position. Escort immediately to Rampur PHC.',
    patterns: [
      /(?:heavy|severe|active|excessive|vaginal)\s+bleeding/i,
      /postpartum\s+hemorrhage/i,
      /(?:(?:bahut|bohot|zyada|jyada|tez)\s+){0,3}khoon\s+(?:beh|bah|aa|nikal)\s*raha/i,
      /raktasrav|रक्तस्राव|(?:(?:बहुत|ज्यादा|ज़्यादा|तेज)\s+){0,3}खून\s*(?:बह|आ|निकल)\s*रहा/i,
    ],
  },
  {
    canonicalKey: 'convulsions',
    alertId: 'DS-CONVULSIONS',
    ruleCode: 'ANC-ECL-02',
    title: 'Convulsions / Fits / Seizures',
    hindiTitle: 'दौरे या झटके आना',
    severity: 'CRITICAL',
    instruction:
      'Protect airway by turning patient to left side. Do not put anything in mouth. Arrange immediate emergency transfer to Rampur PHC.',
    patterns: [
      /(?<![a-z])(?:convulsions?|seizures?|fits|epileptic)(?![a-z])/i,
      /(?<![a-z])(?:jhatke|jhatka|daura|daure)(?![a-z])\s*(?:aa|pad|lag|ho)?/i,
      /झटके|झटका|दौरे|दौरा/i,
    ],
  },
  {
    canonicalKey: 'unconsciousness',
    alertId: 'DS-UNCONSCIOUSNESS',
    ruleCode: 'EMG-LOC-01',
    title: 'Unconsciousness / Unresponsiveness',
    hindiTitle: 'बेहोशी या होश में न होना',
    severity: 'CRITICAL',
    instruction:
      'Check breathing and keep airway clear in recovery position. Escort immediately to Rampur PHC / District Hospital.',
    skipNegationCheck: true,
    antiFalsePositivePatterns: [
      /(?<![a-z])(?:behosh|unconscious)\s+(?:nahi|nahin|not)(?![a-z])/i,
      /बेहोश\s+नहीं/i,
      /(?<![a-z])(?:fully|completely)\s+conscious(?![a-z])/i,
      /या\s+(?:दौरा|झटका)\s+नहीं|ya\s+(?:daura|jhatka)\s+nahi/i,
    ],
    patterns: [
      /(?<![a-z])(?:unconscious|unconsciousness|unresponsive|extreme\s+lethargy)(?![a-z])/i,
      /(?<![a-z])hosh\s+(?:me|mein)\s+nahi(?![a-z])/i,
      /(?<![a-z])behosh\s+(?:ho|hai|hain|gaya|gayi|gaye|pada|padi)(?![a-z])/i,
      /होश\s*में\s*नहीं|बेहोश\s*(?:हो|हैं|है|पड़ा|पड़ी)/i,
    ],
  },
  {
    canonicalKey: 'respiratory_distress',
    alertId: 'DS-RESPIRATORY',
    ruleCode: 'EMG-RESP-01',
    title: 'Severe Breathing Difficulty',
    hindiTitle: 'सांस लेने में गंभीर तकलीफ',
    severity: 'CRITICAL',
    instruction:
      'Keep patient propped upright, loosen tight clothing, and escort urgently to Rampur PHC for oxygen and medical evaluation.',
    patterns: [
      /(?:severe|acute)\s+(?:respiratory\s+distress|breathing\s+difficulty|shortness\s+of\s+breath)/i,
      /difficulty\s+breathing|shortness\s+of\s+breath|unable\s+to\s+breathe/i,
      /saans\s+lene\s+(?:me|mein)\s+(?:(?:bahut|bohot|zyada|jyada|badi|kaafi)\s+){0,3}(?:dikkat|takleef|taklif|pareshani|mushkil)/i,
      /सांस\s+लेने\s+में\s*(?:(?:बहुत|ज्यादा|ज़्यादा|काफी)\s+){0,3}(?:दिक्कत|तकलीफ|परेशानी|मुश्किल)/i,
    ],
  },
  {
    canonicalKey: 'chest_pain',
    alertId: 'DS-CHEST-PAIN',
    ruleCode: 'EMG-CP-01',
    title: 'Severe Chest Pain',
    hindiTitle: 'सीने या छाती में तेज दर्द',
    severity: 'CRITICAL',
    instruction:
      'Keep patient at complete rest and arrange immediate PHC Medical Officer evaluation / 108 ambulance transport.',
    patterns: [
      /(?:severe|crushing|acute|radiating)?\s*chest\s+pain/i,
      /(?:chhati|chhaati|seene)\s+(?:me|mein)\s+(?:(?:bahut|bohot|tez|zyada|jyada)\s+){0,3}dard/i,
      /(?:छाती|सीने)\s+में\s*(?:(?:बहुत|तेज|ज्यादा|ज़्यादा)\s+){0,3}दर्द/i,
    ],
  },
  {
    canonicalKey: 'infant_inability_to_feed',
    alertId: 'DS-NEWBORN-FEVER',
    ruleCode: 'IMNCI-NB-02',
    title: 'Newborn Danger Sign: Unable to Feed / High Fever',
    hindiTitle: 'नवजात शिशु में दूध न पीना या तेज बुखार',
    severity: 'CRITICAL',
    instruction:
      'Keep baby warm with Kangaroo Mother Care. Immediate transfer to Newborn Care Corner (NBCC) at Rampur PHC.',
    skipNegationCheck: true,
    antiFalsePositivePatterns: [
      /(?<![a-z])(?:theek|thik|ache|achhe)\s+se\s+(?:doodh\s+)?pee\s+raha/i,
      /feeding\s+well/i,
    ],
    patterns: [
      /(?:unable|not\s+able|refusing)\s+to\s+(?:feed|breastfeed|suck)/i,
      /doodh\s+(?:bilkul\s+)?nahi\s+(?:pee|pi)\s+raha/i,
      /दूध\s+(?:बिल्कुल\s+)?नहीं\s+पी\s+रहा/i,
      /newborn.*high\s+fever/i,
    ],
  },
  {
    canonicalKey: 'neck_stiffness_fever',
    alertId: 'DS-MENINGITIS',
    ruleCode: 'IMNCI-FEV-03',
    title: 'High Fever with Neck Stiffness',
    hindiTitle: 'तेज बुखार और गर्दन में अकड़न',
    severity: 'CRITICAL',
    instruction:
      'Arrange urgent transfer to Rampur PHC / District Hospital for physician evaluation.',
    patterns: [
      /stiff\s+neck|neck\s+stiffness/i,
      /gardan\s+(?:itni\s+|bahut\s+)?akad\s+(?:gayi|gaya|rahi)/i,
      /गर्दन\s+(?:में\s*)?अकड़/i,
    ],
  },
  {
    canonicalKey: 'preeclampsia',
    alertId: 'DS-PREECLAMPSIA',
    ruleCode: 'ANC-PIH-04',
    title: 'Severe Pre-Eclampsia Signs',
    hindiTitle: 'गंभीर प्री-एक्लेम्पसिया के लक्षण (उच्च बीपी / धुंधला दिखना)',
    severity: 'HIGH',
    instruction:
      'Arrange immediate escort to Rampur PHC for urine albumin screening and medical officer evaluation.',
    patterns: [
      /(?<![a-z])pre[\s-]*eclampsia(?![a-z])/i,
      /blurred\s+vision|dhundhla\s+dikh|धुंधला\s+दिख/i,
    ],
  },
];

export function normalizeDangerSignKey(rawSign: string): string {
  const low = rawSign.toLowerCase();
  if (/bleed|hemorrhage|haemorrhage|khoon|raktasrav|रक्तस्राव|खून/.test(low)) return 'bleeding';
  if (/convuls|fit|seizur|jhatk|daura|दौरे|झटक/.test(low)) return 'convulsions';
  if (/unconscious|unrespons|letharg|behosh|hosh|बेहोश|होश/.test(low)) return 'unconsciousness';
  if (/respirat|breath|saans|सांस/.test(low)) return 'respiratory_distress';
  if (/chest\s*pain|chhati|seene|सीने|छाती/.test(low)) return 'chest_pain';
  if (/feed|newborn|navjaat|doodh|दूध|नवजात/.test(low)) return 'infant_inability_to_feed';
  if (/neck\s*stiff|stiff\s*neck|gardan|गर्दन/.test(low)) return 'neck_stiffness_fever';
  if (/preeclampsia|pre-eclampsia|eclampsia|blurred\s*vision|hypertension|bp\s*1[4-9]/.test(low)) {
    return 'preeclampsia';
  }
  return low.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'custom_danger_sign';
}

function splitClauses(text: string): string[] {
  return text
    .split(/(?:[.!?\n;।,]+|\b(?:lekin|par|magar|but|however|whereas)\b)/i)
    .map((c) => c.trim())
    .filter(Boolean);
}

function clauseHasSevereHighBp(clause: string): boolean {
  if (CLAUSE_NEGATION_RE.test(clause)) return false;
  const m = clause.match(/(?:bp|blood\s*pressure|बीपी)?\s*(\d{3})\s*(?:\/|by|over|bata|बटा)\s*(\d{2,3})/i);
  if (!m) return false;
  const sys = Number(m[1]);
  const dia = Number(m[2]);
  return sys >= 160 || dia >= 110 || (sys >= 140 && dia >= 90 && /headache|edema|soojan|swelling|sir\s*dard|सिरदर्द|सूजन/i.test(clause));
}

function buildAlertFromRule(rule: DangerRule, evidence: string): DangerSignAlert {
  return {
    id: rule.alertId,
    ruleCode: rule.ruleCode,
    canonicalKey: rule.canonicalKey,
    title: rule.title,
    hindiTitle: rule.hindiTitle,
    severity: rule.severity,
    triggerObservation: `Observed verbatim in speech: "${evidence}"`,
    evidence,
    hindiVoiceAlert: `चेतावनी: ${rule.hindiTitle} दर्ज हुआ है।`,
    englishVoiceAlert: `Warning: ${rule.title} detected.`,
    instruction: rule.instruction,
    referralFacility: DEFAULT_FACILITY,
    onDutyMO: DEFAULT_MO,
    ambulanceHelpline: DEFAULT_AMBULANCE,
    isAcknowledged: false,
  };
}

/**
 * Inspects a consultation transcript segment/text for a validated CURRENT danger sign.
 * Rejects negated, denied, or resolved statements and skips already-handled canonical keys.
 */
export function detectValidatedDangerSignFromText(
  text: string,
  alreadyHandledKeys: ReadonlySet<string> = new Set()
): DangerSignAlert | null {
  if (!text || !text.trim()) return null;

  const clauses = splitClauses(text);
  for (const clause of clauses) {
    if (RESOLVED_OR_PAST_RE.test(clause)) continue;

    // Check severe BP threshold inside the clause
    if (!alreadyHandledKeys.has('preeclampsia') && clauseHasSevereHighBp(clause)) {
      const rule = DANGER_RULES.find((r) => r.canonicalKey === 'preeclampsia')!;
      return buildAlertFromRule(rule, clause);
    }

    for (const rule of DANGER_RULES) {
      if (alreadyHandledKeys.has(rule.canonicalKey)) continue;
      if (rule.antiFalsePositivePatterns?.some((re) => re.test(clause))) continue;

      const matched = rule.patterns.find((re) => re.test(clause));
      if (!matched) continue;

      // Negated danger sign phrases (e.g. "no bleeding", "koi khoon nahi beh raha hai") must NOT trigger
      if (!rule.skipNegationCheck && CLAUSE_NEGATION_RE.test(clause)) {
        continue;
      }

      return buildAlertFromRule(rule, clause);
    }
  }

  return null;
}

/**
 * Converts validated AI MedicalReportOutput.danger_signs (`is_present === true` and grounded
 * in transcript) into a DangerSignAlert, respecting deduplication against already-handled keys.
 */
export function selectValidatedReportDangerSign(
  dangerSigns: unknown,
  transcript: string,
  alreadyHandledKeys: ReadonlySet<string> = new Set()
): DangerSignAlert | null {
  if (!Array.isArray(dangerSigns) || dangerSigns.length === 0) return null;

  for (const item of dangerSigns) {
    if (!item || typeof item !== 'object') continue;
    const raw = item as RawReportDangerSign;

    // Strictly require is_present === true (negated/historical entries must not trigger)
    if (raw.is_present !== true) continue;

    const sign = typeof raw.sign === 'string' ? raw.sign.trim() : '';
    const evidence = typeof raw.evidence === 'string' ? raw.evidence.trim() : '';
    if (!sign || !evidence) continue;

    // Verbatim grounding verification against transcript (mirroring ai_medical/validation.py)
    if (transcript && !transcript.includes(evidence)) continue;

    // Secondary guard: ensure evidence clause itself isn't negated
    if (RESOLVED_OR_PAST_RE.test(evidence)) continue;

    const canonicalKey = normalizeDangerSignKey(sign);
    if (alreadyHandledKeys.has(canonicalKey)) continue;

    const matchedRule = DANGER_RULES.find((r) => r.canonicalKey === canonicalKey);
    if (matchedRule) {
      if (!matchedRule.skipNegationCheck && CLAUSE_NEGATION_RE.test(evidence)) {
        continue;
      }
      return {
        ...buildAlertFromRule(matchedRule, evidence),
        title: sign,
        triggerObservation: `Validated finding: ${sign} — "${evidence}"`,
      };
    }

    return {
      id: `DS-${canonicalKey.toUpperCase()}`,
      ruleCode: 'AI-RED-FLAG',
      canonicalKey,
      title: sign,
      hindiTitle: sign,
      severity: raw.urgency_level === 'critical' ? 'CRITICAL' : 'HIGH',
      triggerObservation: `Validated finding: ${sign} — "${evidence}"`,
      evidence,
      hindiVoiceAlert: `चेतावनी: ${sign} पाया गया है।`,
      englishVoiceAlert: `Warning: ${sign} detected.`,
      instruction:
        'Arrange immediate evaluation at Rampur Primary Health Centre (PHC) and brief the beneficiary and family on danger signs.',
      referralFacility: DEFAULT_FACILITY,
      onDutyMO: DEFAULT_MO,
      ambulanceHelpline: DEFAULT_AMBULANCE,
      isAcknowledged: false,
    };
  }

  return null;
}
