/**
 * Pure, testable helpers for synchronizing structured visit data with
 * backend/AI medical reports, voice corrections, audit trails, and
 * page-refresh persistence — strictly source-grounded with zero mock/default fabrication.
 */
import type {
  Beneficiary,
  CorrectionAuditEntry,
  EmergencyEscalationRecord,
  EmergencyEscalationStatus,
  EmergencyResponseDecision,
  StructuredVisitData,
} from '../types/index.ts';
import type { VoiceCorrectionAuditItem } from './reportApi.ts';

export const ACTIVE_VISIT_REF_STORAGE_KEY = 'dhwani_active_visit_ref';

export interface ActiveVisitPersistenceRef {
  backendVisitId?: string;
  localVisitId?: string;
  patientId?: string;
  beneficiaryId?: string;
}

export function computeAvatarInitials(name: string): string {
  const cleaned = (name || '').trim();
  if (!cleaned) return 'NA';
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    return Array.from(parts[0]).slice(0, 2).join('').toUpperCase();
  }
  return `${Array.from(parts[0])[0] || ''}${Array.from(parts[parts.length - 1])[0] || ''}`.toUpperCase();
}

export function createUnselectedBeneficiary(): Beneficiary {
  return {
    id: '',
    patientId: undefined,
    name: '',
    spouseName: undefined,
    age: null,
    village: '',
    gali: undefined,
    rchId: '',
    subCenter: '',
    ward: '',
    stage: '',
    gestationalWeeks: undefined,
    edd: undefined,
    lmp: undefined,
    baselineBp: undefined,
    contactNumber: undefined,
    avatarInitials: 'NA',
  };
}

/**
 * Create a clean, strictly empty visit object with all clinical & visit fields null/empty.
 * Only sets beneficiary fields if a real Beneficiary was explicitly selected.
 */
export function createEmptyVisitData(beneficiary?: Beneficiary | null): StructuredVisitData {
  const hasExplicitSelection = Boolean(beneficiary && beneficiary.name && beneficiary.name.trim());
  const todayIso = new Date().toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

  return {
    beneficiary: hasExplicitSelection && beneficiary ? { ...beneficiary } : createUnselectedBeneficiary(),
    visitType: null,
    visitDate: todayIso,
    nextVisitDate: null,
    audioDurationText: '',
    languageDetected: '',
    confidenceScore: null,
    vitals: {
      systolic: null,
      diastolic: null,
      bpStatus: null,
      pulseRate: null,
      pulseStatus: null,
      weight: null,
      weightGain: null,
      weightStatus: null,
      gestationalAgeWeeks: null,
      lmpDate: null,
    },
    symptoms: {
      pedalEdema: { present: false, duration: '', grading: '', flagged: false },
      headache: { present: false, onset: '', statement: '', severity: '', flagged: false },
      fetalMovement: { status: '', confirmed: false },
      pallor: { observation: '', recorded: false },
      bleeding: { present: false, duration: '', severity: '', flagged: false },
    },
    medications: {
      ifaTablets: { takingRegularly: null, remainingTabs: null, source: null },
      calciumTablets: { status: null, exhaustedDaysAgo: null },
      dietAdvice: { advised: false, description: '', tags: [] },
    },
    immunizationLab: {
      ttBooster: {
        administered: null,
        date: null,
        location: null,
        verified: false,
        boosterStatus: null,
        doseNumber: null,
      },
      hemoglobin: { value: null, unit: null, status: null, lastTestedDate: null },
      preEclampsiaAlert: { flagged: false, summary: '' },
    },
    counselingChecklist: {
      dietPostureCare: false,
      familyEmergencyBriefing: false,
      emergencyFollowUp: false,
    },
    status: 'DRAFT',
    originalTranscript: '',
    dangerAlertTriggered: false,
    emergencyEscalations: [],
    vaccinationStatus: null,
    boosterStatus: null,
    doseNumber: null,
    patientAge: null,
    patientGender: null,
    temperature: null,
    extractedSymptoms: [],
    missingInformation: [],
    identityStatus: hasExplicitSelection ? 'verified' : 'missing',
    isBeneficiarySelected: hasExplicitSelection,
    patientNameSource: hasExplicitSelection ? 'selected_beneficiary' : 'missing',
    identityMismatchDetail: null,
    confirmedFields: {},
    correctionHistory: [],
    structuredReport: null,
  };
}

export function parseBpString(raw: unknown): { systolic: number; diastolic: number } | null {
  if (typeof raw !== 'string') return null;
  const match = raw.match(/(\d{2,3})\s*\/\s*(\d{2,3})/);
  if (!match) return null;
  const systolic = Number(match[1]);
  const diastolic = Number(match[2]);
  if (Number.isNaN(systolic) || Number.isNaN(diastolic)) return null;
  return { systolic, diastolic };
}

export function parseNumericValue(raw: unknown): number | null {
  if (typeof raw === 'number' && !Number.isNaN(raw)) return raw;
  if (typeof raw !== 'string') return null;
  const match = raw.match(/(\d+(?:\.\d+)?)/);
  if (!match) return null;
  const num = Number(match[1]);
  return Number.isNaN(num) ? null : num;
}

export function mapAuditItems(items: VoiceCorrectionAuditItem[] | unknown): CorrectionAuditEntry[] {
  if (!Array.isArray(items)) return [];
  return items
    .filter((x): x is Record<string, unknown> => Boolean(x && typeof x === 'object'))
    .map((item) => ({
      field: String(item.field ?? ''),
      originalValue: (item.original_value ?? item.originalValue ?? null) as string | number | boolean | null,
      correctedValue: (item.corrected_value ?? item.correctedValue ?? null) as string | number | boolean | null,
      timestamp: String(item.timestamp ?? new Date().toISOString()),
      source: (item.source === 'text' || item.source === 'manual' ? item.source : 'voice') as
        | 'voice'
        | 'text'
        | 'manual',
    }));
}

/**
 * Build the structured report object sent to /report/voice-correct as the single source of truth.
 * Never fabricates missing fields; preserves explicit null values.
 */
export function buildCurrentStructuredReport(
  visit: StructuredVisitData,
  aiReport?: Record<string, unknown> | null
): Record<string, unknown> {
  const base: Record<string, unknown> = aiReport ? JSON.parse(JSON.stringify(aiReport)) : {};
  const existingVitals =
    base.vital_signs_mentioned && typeof base.vital_signs_mentioned === 'object'
      ? { ...(base.vital_signs_mentioned as Record<string, unknown>) }
      : {};

  if (visit.vitals?.systolic != null && visit.vitals?.diastolic != null) {
    existingVitals.bp = `${visit.vitals.systolic}/${visit.vitals.diastolic}`;
  } else if (!aiReport) {
    delete existingVitals.bp;
  }

  if (visit.vitals?.weight != null) {
    existingVitals.weight = `${visit.vitals.weight} kg`;
  } else if (!aiReport) {
    delete existingVitals.weight;
  }

  if (visit.vitals?.pulseRate != null) {
    existingVitals.pulse = `${visit.vitals.pulseRate} bpm`;
  } else if (!aiReport) {
    delete existingVitals.pulse;
  }

  if (visit.temperature) {
    existingVitals.temperature = visit.temperature;
  }

  if (visit.immunizationLab?.hemoglobin?.value != null) {
    existingVitals.hb = `${visit.immunizationLab.hemoglobin.value} g/dL`;
  }

  const trimmedBeneficiaryName = visit.beneficiary?.name?.trim() || null;
  const baseName = typeof base.patient_name === 'string' && base.patient_name.trim() ? base.patient_name.trim() : null;

  return {
    ...base,
    patient_name: trimmedBeneficiaryName ?? baseName ?? null,
    patient_age: visit.patientAge ?? (base.patient_age as string | null | undefined) ?? null,
    patient_gender: visit.patientGender ?? (base.patient_gender as string | null | undefined) ?? null,
    visit_type: visit.visitType ?? (base.visit_type as string | null | undefined) ?? null,
    next_visit_date: visit.nextVisitDate ?? (base.next_visit_date as string | null | undefined) ?? null,
    vaccination_status:
      visit.vaccinationStatus ?? (base.vaccination_status as string | null | undefined) ?? null,
    booster_status:
      visit.boosterStatus ?? (base.booster_status as string | null | undefined) ?? null,
    dose_number:
      visit.doseNumber ?? (base.dose_number as string | null | undefined) ?? null,
    identity_status: visit.identityStatus ?? (base.identity_status as string | undefined) ?? 'missing',
    vital_signs_mentioned: Object.keys(existingVitals).length > 0 ? existingVitals : null,
    symptoms: Array.isArray(base.symptoms) ? base.symptoms : (visit.extractedSymptoms ?? []),
    danger_signs: Array.isArray(base.danger_signs) ? base.danger_signs : [],
    missing_information: Array.isArray(base.missing_information)
      ? base.missing_information
      : (visit.missingInformation ?? []),
    confirmed: visit.status === 'CONFIRMED' || visit.status === 'ESCALATED',
    correction_history: (visit.correctionHistory || []).map((c) => ({
      field: c.field,
      original_value: c.originalValue,
      corrected_value: c.correctedValue,
      timestamp: c.timestamp,
      source: c.source,
    })),
  };
}

/**
 * Apply an updated structured report (returned from /report, /report/correct, /report/voice-correct,
 * or restored from backend GET /api/v1/visits/{visit_id}) onto StructuredVisitData.
 * Clears unmentioned fields cleanly when performing source-only extraction (never falls back to mock values).
 */
export function mergeStructuredReportIntoVisit(
  current: StructuredVisitData,
  report: Record<string, unknown>,
  options?: {
    confirmed?: boolean;
    lastChangedField?: string;
    backendVisitId?: string;
    isFreshExtraction?: boolean;
  }
): StructuredVisitData {
  const hasFullSchemaKeys =
    Boolean(options?.isFreshExtraction) ||
    Object.prototype.hasOwnProperty.call(report, 'visit_type') ||
    Object.prototype.hasOwnProperty.call(report, 'vaccination_status');

  const confirmedFields = { ...(current.confirmedFields || {}) };
  if (options?.lastChangedField) {
    confirmedFields[options.lastChangedField] = true;
  }

  const next: StructuredVisitData = {
    ...current,
    beneficiary: { ...current.beneficiary },
    vitals: { ...current.vitals },
    medications: {
      ifaTablets: { ...current.medications.ifaTablets },
      calciumTablets: { ...current.medications.calciumTablets },
      dietAdvice: { ...current.medications.dietAdvice },
    },
    immunizationLab: {
      ...current.immunizationLab,
      ttBooster: { ...current.immunizationLab.ttBooster },
      hemoglobin: { ...current.immunizationLab.hemoglobin },
      preEclampsiaAlert: { ...current.immunizationLab.preEclampsiaAlert },
    },
    confirmedFields,
    structuredReport: JSON.parse(JSON.stringify(report)),
  };

  if (options?.backendVisitId) {
    next.backendVisitId = options.backendVisitId;
  }

  const vitalsObj =
    report.vital_signs_mentioned && typeof report.vital_signs_mentioned === 'object'
      ? (report.vital_signs_mentioned as Record<string, unknown>)
      : null;

  // Vitals — strictly grounded to report (or preserved ONLY if worker explicitly confirmed a manual correction and fresh extraction omitted it)
  if (vitalsObj) {
    const bp = parseBpString(vitalsObj.bp ?? vitalsObj.blood_pressure);
    if (bp) {
      next.vitals.systolic = bp.systolic;
      next.vitals.diastolic = bp.diastolic;
      next.vitals.bpStatus = 'Confirmed';
    } else if (hasFullSchemaKeys && !confirmedFields.blood_pressure) {
      next.vitals.systolic = null;
      next.vitals.diastolic = null;
      next.vitals.bpStatus = null;
    }

    const wt = parseNumericValue(vitalsObj.weight);
    if (wt !== null) {
      next.vitals.weight = wt;
      next.vitals.weightStatus = 'Speech';
    } else if (hasFullSchemaKeys && !confirmedFields.weight) {
      next.vitals.weight = null;
      next.vitals.weightStatus = null;
    }

    const pulse = parseNumericValue(vitalsObj.pulse ?? vitalsObj.pulse_rate);
    if (pulse !== null) {
      next.vitals.pulseRate = Math.round(pulse);
      next.vitals.pulseStatus = 'Speech';
    } else if (hasFullSchemaKeys && !confirmedFields.pulse_rate) {
      next.vitals.pulseRate = null;
      next.vitals.pulseStatus = null;
    }

    const hb = parseNumericValue(vitalsObj.hemoglobin ?? vitalsObj.hb);
    if (hb !== null) {
      next.immunizationLab.hemoglobin.value = hb;
      next.immunizationLab.hemoglobin.unit = 'g/dL';
    } else if (hasFullSchemaKeys && !confirmedFields.hemoglobin) {
      next.immunizationLab.hemoglobin.value = null;
      next.immunizationLab.hemoglobin.unit = null;
      next.immunizationLab.hemoglobin.status = null;
    }

    const tempVal = vitalsObj.temperature ?? vitalsObj.temp;
    next.temperature = typeof tempVal === 'string' && tempVal.trim() ? tempVal.trim() : null;
  } else if (hasFullSchemaKeys) {
    if (!confirmedFields.blood_pressure) {
      next.vitals.systolic = null;
      next.vitals.diastolic = null;
      next.vitals.bpStatus = null;
    }
    if (!confirmedFields.weight) {
      next.vitals.weight = null;
      next.vitals.weightStatus = null;
    }
    if (!confirmedFields.pulse_rate) {
      next.vitals.pulseRate = null;
      next.vitals.pulseStatus = null;
    }
    if (!confirmedFields.hemoglobin) {
      next.immunizationLab.hemoglobin.value = null;
      next.immunizationLab.hemoglobin.unit = null;
      next.immunizationLab.hemoglobin.status = null;
    }
    next.temperature = null;
  }

  // Visit Type
  if (typeof report.visit_type === 'string' && report.visit_type.trim()) {
    next.visitType = report.visit_type.trim();
  } else if (hasFullSchemaKeys && !confirmedFields.visit_type) {
    next.visitType = null;
  }

  // Next Visit Date
  if (typeof report.next_visit_date === 'string' && report.next_visit_date.trim()) {
    next.nextVisitDate = report.next_visit_date.trim();
  } else if (hasFullSchemaKeys && !confirmedFields.next_visit_date) {
    next.nextVisitDate = null;
  }

  // Vaccination Status & Booster / Dose strictly grounded (NEVER upgrade "TT injection" to "TT booster")
  if (typeof report.vaccination_status === 'string' && report.vaccination_status.trim()) {
    next.vaccinationStatus = report.vaccination_status.trim();
    const low = report.vaccination_status.toLowerCase();
    const explicitBooster =
      typeof report.booster_status === 'string' && report.booster_status.trim()
        ? report.booster_status.trim()
        : (low.includes('booster') ? report.vaccination_status.trim() : null);
    const explicitDose =
      typeof report.dose_number === 'string' && report.dose_number.trim()
        ? report.dose_number.trim()
        : null;
    next.boosterStatus = explicitBooster;
    next.doseNumber = explicitDose;
    next.immunizationLab.ttBooster.boosterStatus = explicitBooster;
    next.immunizationLab.ttBooster.doseNumber = explicitDose;
    if (low.includes('tt') || low.includes('tetanus')) {
      const notGiven = low.includes('not given') || low.includes('pending');
      next.immunizationLab.ttBooster.administered = !notGiven;
      next.immunizationLab.ttBooster.verified = !notGiven;
    } else {
      next.immunizationLab.ttBooster.administered = null;
      next.immunizationLab.ttBooster.verified = false;
    }
  } else if (hasFullSchemaKeys && !confirmedFields.vaccination_status) {
    next.vaccinationStatus = null;
    next.boosterStatus = null;
    next.doseNumber = null;
    next.immunizationLab.ttBooster.administered = null;
    next.immunizationLab.ttBooster.verified = false;
    next.immunizationLab.ttBooster.boosterStatus = null;
    next.immunizationLab.ttBooster.doseNumber = null;
  }

  // Age & Gender
  if (typeof report.patient_age === 'string' && report.patient_age.trim()) {
    next.patientAge = report.patient_age.trim();
    const parsedAge = parseNumericValue(report.patient_age);
    if (parsedAge !== null) {
      next.beneficiary.age = Math.round(parsedAge);
    }
  } else if (hasFullSchemaKeys && !current.isBeneficiarySelected) {
    next.patientAge = null;
  }

  if (typeof report.patient_gender === 'string' && report.patient_gender.trim()) {
    next.patientGender = report.patient_gender.trim();
  } else if (hasFullSchemaKeys) {
    next.patientGender = null;
  }

  // Symptoms & Missing Info ("Information to confirm")
  if (Array.isArray(report.symptoms)) {
    next.extractedSymptoms = report.symptoms
      .filter((s): s is Record<string, unknown> => Boolean(s && typeof s === 'object'))
      .map((s) => ({
        name: String(s.name ?? ''),
        duration: typeof s.duration === 'string' ? s.duration : null,
        severity: typeof s.severity === 'string' ? s.severity : null,
        body_site: typeof s.body_site === 'string' ? s.body_site : null,
        notes: typeof s.notes === 'string' ? s.notes : null,
      }))
      .filter((s) => s.name.length > 0);
  } else if (hasFullSchemaKeys) {
    next.extractedSymptoms = [];
  }

  if (Array.isArray(report.missing_information)) {
    next.missingInformation = report.missing_information
      .filter((m): m is Record<string, unknown> => Boolean(m && typeof m === 'object'))
      .map((m) => ({
        field_name: String(m.field_name ?? ''),
        reason: typeof m.reason === 'string' ? m.reason : undefined,
        prompt_question: typeof m.prompt_question === 'string' ? m.prompt_question : null,
        importance: typeof m.importance === 'string' ? m.importance : null,
      }))
      .filter((m) => m.field_name.length > 0);
  } else if (hasFullSchemaKeys) {
    next.missingInformation = [];
  }

  // Strict Patient Identity Preservation
  const rawReportName = typeof report.patient_name === 'string' && report.patient_name.trim()
    ? report.patient_name.trim()
    : null;
  const idStatusRaw = typeof report.identity_status === 'string' ? report.identity_status : undefined;
  const mismatchDetail =
    typeof report.identity_mismatch_detail === 'string' ? report.identity_mismatch_detail : null;
  next.identityMismatchDetail = mismatchDetail;

  if (options?.lastChangedField === 'patient_name' && rawReportName) {
    next.beneficiary.name = rawReportName;
    next.beneficiary.avatarInitials = computeAvatarInitials(rawReportName);
    next.identityStatus = 'verified';
    next.patientNameSource = 'confirmed';
    next.identityMismatchDetail = null;
  } else if (current.isBeneficiarySelected && current.beneficiary.name.trim()) {
    // Preserve exact explicitly selected beneficiary name
    if (idStatusRaw === 'mismatch') {
      next.identityStatus = 'mismatch';
    } else {
      next.identityStatus = 'verified';
    }
    next.patientNameSource = 'selected_beneficiary';
  } else if (hasFullSchemaKeys || Object.prototype.hasOwnProperty.call(report, 'patient_name')) {
    if (rawReportName) {
      next.beneficiary.name = rawReportName;
      next.beneficiary.avatarInitials = computeAvatarInitials(rawReportName);
      next.identityStatus =
        idStatusRaw === 'mismatch' || idStatusRaw === 'ambiguous' || idStatusRaw === 'unverified'
          ? idStatusRaw
          : 'verified';
      next.patientNameSource =
        report.patient_name_source === 'confirmed' ? 'confirmed' : 'transcript';
    } else if (report.patient_name === null && !current.isBeneficiarySelected) {
      next.beneficiary.name = '';
      next.beneficiary.avatarInitials = 'NA';
      next.identityStatus = report.patient_name_ambiguous ? 'ambiguous' : 'missing';
      next.patientNameSource = 'missing';
    }
  }

  if (Array.isArray(report.correction_history)) {
    next.correctionHistory = mapAuditItems(report.correction_history);
  }

  if (Array.isArray(report.emergency_escalations)) {
    next.emergencyEscalations = report.emergency_escalations
      .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
      .map((item, idx): EmergencyEscalationRecord => ({
        id: String(item.id ?? `emg-restored-${idx}`),
        alertId: String(item.alert_id ?? item.alertId ?? 'AI-RED-FLAG'),
        ruleCode: String(item.rule_code ?? item.ruleCode ?? 'AI-RED-FLAG'),
        detectedSign: String(item.detected_sign ?? item.detectedSign ?? 'Danger sign'),
        evidence: typeof item.evidence === 'string' ? item.evidence : undefined,
        detectedAt: String(item.detected_at ?? item.timestamp ?? new Date().toISOString()),
        confirmationTranscript: String(
          item.confirmation_transcript ?? item.confirmationTranscript ?? ''
        ),
        response: (item.response === 'yes' ||
        item.response === 'no' ||
        item.response === 'no_response' ||
        item.response === 'pending'
          ? item.response
          : 'no_response') as EmergencyResponseDecision,
        respondedAt: typeof item.responded_at === 'string' ? item.responded_at : undefined,
        escalationStatus: (item.escalation_status === 'confirmed' ||
        item.escalation_status === 'declined' ||
        item.escalation_status === 'no_response' ||
        item.escalation_status === 'pending_confirmation'
          ? item.escalation_status
          : 'no_response') as EmergencyEscalationStatus,
        attempts: typeof item.attempts === 'number' ? item.attempts : 1,
        sttDisconnected: Boolean(item.stt_disconnected),
      }));
    if (next.emergencyEscalations.some((e) => e.escalationStatus === 'confirmed')) {
      next.dangerAlertTriggered = true;
    }
  }

  if (options?.lastChangedField) {
    const labelMap: Record<string, string> = {
      blood_pressure: 'Blood Pressure',
      weight: 'Maternal Weight',
      next_visit_date: 'Next Visit Date',
      vaccination_status: 'Vaccination Status',
      visit_type: 'Visit Type',
      patient_name: 'Beneficiary Name',
      pulse_rate: 'Pulse Rate',
      hemoglobin: 'Hemoglobin',
    };
    next.lastCorrectedField = labelMap[options.lastChangedField] || options.lastChangedField;
  }

  if (typeof options?.confirmed === 'boolean') {
    if (options.confirmed) {
      next.status = current.dangerAlertTriggered ? 'ESCALATED' : 'CONFIRMED';
      next.confirmedAt =
        (typeof report.confirmed_at === 'string' && report.confirmed_at) ||
        new Date().toISOString();
    } else if (current.status === 'CONFIRMED') {
      next.status = 'PENDING_VERIFICATION';
      next.confirmedAt = undefined;
    } else {
      next.status = 'PENDING_VERIFICATION';
    }
  } else if (report.confirmed === true) {
    next.status = current.dangerAlertTriggered ? 'ESCALATED' : 'CONFIRMED';
    if (typeof report.confirmed_at === 'string') {
      next.confirmedAt = report.confirmed_at;
    }
  }

  if (typeof report.original_transcript === 'string' && report.original_transcript.trim()) {
    next.originalTranscript = report.original_transcript;
  }

  return next;
}

/**
 * Build a concise spoken summary directly from StructuredVisitData.
 * Only cites fields that are actually recorded; speaks "Name not provided" or omits null fields rather than fabricating.
 */
export function buildStructuredReadBackText(
  visit: StructuredVisitData,
  lang: 'en' | 'hi' | 'hinglish' = 'hinglish'
): { summary: string; speech: string; confirmationPrompt: string } {
  const patientName = visit.beneficiary?.name?.trim() || 'Name not provided';
  const bp =
    visit.vitals?.systolic != null && visit.vitals?.diastolic != null
      ? `${visit.vitals.systolic}/${visit.vitals.diastolic}`
      : null;
  const wt = visit.vitals?.weight != null ? `${visit.vitals.weight} kg` : null;
  const visitType = visit.visitType?.trim() || null;
  const vacc = visit.vaccinationStatus?.trim() || null;
  const nextDate = visit.nextVisitDate?.trim() || null;

  if (lang === 'hi') {
    const parts: string[] = [`लाभार्थी: ${patientName}`];
    const speechParts: string[] = [`आपकी विज़िट रिपोर्ट तैयार है। लाभार्थी ${patientName}`];
    if (visitType) {
      parts.push(`विज़िट प्रकार: ${visitType}`);
      speechParts.push(`विज़िट का प्रकार ${visitType}`);
    }
    if (bp && visit.vitals.systolic != null && visit.vitals.diastolic != null) {
      parts.push(`ब्लड प्रेशर: ${bp}`);
      speechParts.push(`ब्लड प्रेशर ${visit.vitals.systolic} बटा ${visit.vitals.diastolic}`);
    }
    if (wt && visit.vitals.weight != null) {
      parts.push(`वजन: ${wt}`);
      speechParts.push(`वजन ${visit.vitals.weight} किलोग्राम`);
    }
    if (vacc) {
      parts.push(`टीकाकरण: ${vacc}`);
      speechParts.push(`टीकाकरण ${vacc}`);
    }
    if (nextDate) {
      parts.push(`अगली विज़िट: ${nextDate}`);
      speechParts.push(`अगली विज़िट ${nextDate}`);
    }
    const confirmationPrompt = 'क्या यह रिपोर्ट सही है? क्या आप कोई बदलाव करना चाहती हैं?';
    const summary = parts.join(', ') + '.';
    const speech = speechParts.join(', ') + `। ${confirmationPrompt}`;
    return { summary, speech, confirmationPrompt };
  }

  const parts: string[] = [`Patient: ${patientName}`];
  const speechParts: string[] = [`Your visit report is ready. Patient ${patientName}`];
  if (bp) {
    parts.push(`Blood pressure: ${bp}`);
    speechParts.push(`blood pressure is ${bp}`);
  }
  if (wt) {
    parts.push(`Weight: ${wt}`);
    speechParts.push(`weight is ${wt}`);
  }
  if (visitType) {
    parts.push(`Visit type: ${visitType}`);
    speechParts.push(`visit type is ${visitType}`);
  }
  if (vacc) {
    parts.push(`Vaccination status: ${vacc}`);
    speechParts.push(`vaccination status is ${vacc}`);
  }
  if (nextDate) {
    parts.push(`Next visit: ${nextDate}`);
    speechParts.push(`next visit is ${nextDate}`);
  }

  const summary = parts.join(', ') + '.';
  const confirmationPrompt =
    lang === 'en'
      ? 'Is this report correct? Would you like to make any changes?'
      : 'Kya yeh report sahi hai? Kya aap koi badlav karna chahti hain?';
  const speech = `${speechParts.join(', ')}. ${confirmationPrompt}`;
  return { summary, speech, confirmationPrompt };
}
