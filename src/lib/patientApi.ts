import type { Beneficiary, StructuredVisitData } from '../types/index.ts';

const PATIENT_API_BASE =
  (typeof import.meta !== 'undefined' &&
    (import.meta as unknown as { env?: { VITE_PATIENT_API_URL?: string } }).env?.VITE_PATIENT_API_URL) ||
  'http://localhost:8001';

export interface BackendPatientRecord {
  patient_id: string;
  name: string;
  age: number | null;
  gender?: string | null;
  contact_number?: string | null;
  address?: string | null;
  registration_date: string;
  created_at: string;
  updated_at: string;
}

export interface BackendVisitRecord {
  visit_id: string;
  patient_id: string;
  visit_date: string;
  report: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface SaveVisitPayload {
  patient_id: string;
  visit_date: string;
  report: Record<string, unknown>;
}

async function extractErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const errorJson = await response.json();
    if (typeof errorJson.detail === 'string') {
      return errorJson.detail;
    }
    if (Array.isArray(errorJson.detail)) {
      return errorJson.detail.map((d: any) => d.msg || JSON.stringify(d)).join(', ');
    }
    if (errorJson.message) {
      return String(errorJson.message);
    }
    if (errorJson.error) {
      return String(errorJson.error);
    }
    return JSON.stringify(errorJson);
  } catch {
    return (await response.text().catch(() => '')) || response.statusText || fallback;
  }
}

function getLocalIsoDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export async function listPatients(
  search?: string,
  fetchImpl: typeof fetch = fetch
): Promise<BackendPatientRecord[]> {
  const qs = search ? `?search=${encodeURIComponent(search)}` : '';
  const response = await fetchImpl(`${PATIENT_API_BASE}/api/v1/patients/${qs}`);
  if (!response.ok) {
    throw new Error(await extractErrorMessage(response, 'Failed to list patients'));
  }
  const data = await response.json();
  return Array.isArray(data?.patients) ? (data.patients as BackendPatientRecord[]) : [];
}

export async function getPatientById(
  patientId: string,
  fetchImpl: typeof fetch = fetch
): Promise<BackendPatientRecord | null> {
  const response = await fetchImpl(
    `${PATIENT_API_BASE}/api/v1/patients/${encodeURIComponent(patientId)}`
  );
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new Error(await extractErrorMessage(response, 'Failed to fetch patient'));
  }
  return (await response.json()) as BackendPatientRecord;
}

/**
 * Resolve a Beneficiary to its verified canonical backend patient_id (PAT-YYYY-XXXX).
 *
 * Safety rules:
 * - Never sends an RCH ID (like '#9842-8819') as a backend patient_id.
 * - Verifies that the resolved backend record actually matches the selected beneficiary
 *   (never silently attaches a visit to a different patient).
 * - Never creates duplicate patient records on every visit.
 * - Throws a clear error if the selected beneficiary genuinely does not exist in the backend.
 */
export async function resolveBeneficiaryPatientId(
  beneficiary: Pick<Beneficiary, 'id' | 'patientId' | 'name' | 'rchId' | 'age' | 'village' | 'gali' | 'ward' | 'contactNumber'>,
  fetchImpl: typeof fetch = fetch
): Promise<string> {
  // 1. Prefer canonical backend patientId when present and verify it exists & matches
  if (beneficiary.patientId && beneficiary.patientId.trim()) {
    const candidateId = beneficiary.patientId.trim();
    const record = await getPatientById(candidateId, fetchImpl);
    if (record) {
      if (record.name.trim().toLowerCase() !== beneficiary.name.trim().toLowerCase()) {
        throw new Error(
          `Patient ID '${candidateId}' belongs to '${record.name}', not '${beneficiary.name}'. Refusing to attach visit to a different patient.`
        );
      }
      return record.patient_id;
    }
  }

  // 2. Fall back to exact lookup by name (and RCH ID tag / contact if available) to prevent duplicates
  const matches = await listPatients(beneficiary.name, fetchImpl);
  const exact = matches.find((p) => {
    const sameName = p.name.trim().toLowerCase() === beneficiary.name.trim().toLowerCase();
    if (!sameName) return false;
    if (beneficiary.rchId && p.address && p.address.includes(beneficiary.rchId)) {
      return true;
    }
    if (beneficiary.contactNumber && p.contact_number && p.contact_number === beneficiary.contactNumber) {
      return true;
    }
    return matches.filter((m) => m.name.trim().toLowerCase() === beneficiary.name.trim().toLowerCase()).length === 1;
  });

  if (exact) {
    return exact.patient_id;
  }

  const label = beneficiary.patientId || beneficiary.rchId || beneficiary.id || beneficiary.name;
  throw new Error(
    `Selected beneficiary '${beneficiary.name}' (${label}) was not found in the patient database. Please ensure the patient is registered before saving the visit.`
  );
}

/**
 * Find an existing patient record by exact trimmed name (case-insensitive) or register
 * a new patient once without inventing age/demographic defaults or creating duplicates.
 */
export async function ensureTranscriptNamedPatient(
  patientName: string,
  options?: { age?: number | null; gender?: string | null },
  fetchImpl: typeof fetch = fetch
): Promise<BackendPatientRecord> {
  const cleanedName = (patientName || '').trim();
  if (!cleanedName) {
    throw new Error('Cannot register or look up a patient without a valid name.');
  }

  const matches = await listPatients(cleanedName, fetchImpl);
  const exact = matches.find(
    (p) => p.name.trim().toLowerCase() === cleanedName.toLowerCase()
  );
  if (exact) {
    return exact;
  }

  const createPayload: Record<string, unknown> = {
    name: cleanedName,
    age: typeof options?.age === 'number' && !Number.isNaN(options.age) ? options.age : null,
    gender: options?.gender ?? null,
  };

  const response = await fetchImpl(`${PATIENT_API_BASE}/api/v1/patients/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(createPayload),
  });
  if (!response.ok) {
    throw new Error(await extractErrorMessage(response, 'Failed to register patient record'));
  }
  return (await response.json()) as BackendPatientRecord;
}

/**
 * Resolve canonical patient_id for saving a visit:
 * - When a beneficiary was explicitly selected, strictly verify & use that selected beneficiary.
 * - When no beneficiary was selected, require an explicitly extracted & confirmed patient name
 *   and resolve/register by that exact name without touching unrelated beneficiaries.
 */
export async function resolveVisitPatientId(
  visit: StructuredVisitData,
  fetchImpl: typeof fetch = fetch
): Promise<string> {
  if (visit.isBeneficiarySelected) {
    return resolveBeneficiaryPatientId(visit.beneficiary, fetchImpl);
  }
  const confirmedName = visit.beneficiary?.name?.trim();
  if (!confirmedName) {
    throw new Error(
      'Patient identity is missing or unconfirmed. Please confirm or select a patient name before saving.'
    );
  }
  const parsedAge =
    typeof visit.beneficiary?.age === 'number' && !Number.isNaN(visit.beneficiary.age)
      ? visit.beneficiary.age
      : null;
  const record = await ensureTranscriptNamedPatient(
    confirmedName,
    { age: parsedAge, gender: visit.patientGender ?? null },
    fetchImpl
  );
  return record.patient_id;
}

/**
 * Build a backend-compatible StructuredReport payload from StructuredVisitData + optional AI report.
 * Strictly preserves null for unmentioned fields and never inserts mock/default values.
 */
export function buildBackendReportPayload(
  visit: StructuredVisitData,
  aiReport?: Record<string, unknown> | null
): Record<string, unknown> {
  const base: Record<string, unknown> = aiReport ? JSON.parse(JSON.stringify(aiReport)) : {};
  const existingVitals =
    base.vital_signs_mentioned && typeof base.vital_signs_mentioned === 'object'
      ? { ...(base.vital_signs_mentioned as Record<string, unknown>) }
      : {};

  if (visit.vitals.systolic != null && visit.vitals.diastolic != null) {
    existingVitals.bp = `${visit.vitals.systolic}/${visit.vitals.diastolic}`;
  } else {
    delete existingVitals.bp;
  }

  if (visit.vitals.weight != null) {
    existingVitals.weight = `${visit.vitals.weight} kg`;
  } else {
    delete existingVitals.weight;
  }

  if (visit.vitals.pulseRate != null) {
    existingVitals.pulse = `${visit.vitals.pulseRate} bpm`;
  } else {
    delete existingVitals.pulse;
  }

  if (visit.temperature) {
    existingVitals.temperature = visit.temperature;
  }

  if (visit.immunizationLab.hemoglobin.value != null) {
    existingVitals.hb = `${visit.immunizationLab.hemoglobin.value} g/dL`;
  }

  const trimmedName = visit.beneficiary?.name?.trim() || null;
  const resolvedName =
    trimmedName ??
    (typeof base.patient_name === 'string' && base.patient_name.trim()
      ? base.patient_name.trim()
      : null);

  const summaryParts: string[] = [];
  summaryParts.push(resolvedName ? `Patient: ${resolvedName}` : 'Patient: Name not provided');
  if (visit.vaccinationStatus) summaryParts.push(visit.vaccinationStatus);
  if (existingVitals.bp) summaryParts.push(`BP ${existingVitals.bp}`);
  if (existingVitals.weight) summaryParts.push(`Weight ${existingVitals.weight}`);
  if (visit.visitType) summaryParts.push(`Visit type: ${visit.visitType}`);
  if (visit.nextVisitDate) summaryParts.push(`Next visit: ${visit.nextVisitDate}`);

  const summary =
    (typeof base.summary === 'string' && base.summary.trim()) ||
    visit.originalTranscript ||
    `${summaryParts.join(', ')}.`;

  return {
    ...base,
    patient_name: resolvedName,
    patient_age: visit.patientAge ?? (base.patient_age as string | null | undefined) ?? null,
    patient_gender: visit.patientGender ?? (base.patient_gender as string | null | undefined) ?? null,
    beneficiary_rch_id: visit.beneficiary?.rchId || null,
    visit_type: visit.visitType ?? null,
    next_visit_date: visit.nextVisitDate ?? null,
    vaccination_status:
      visit.vaccinationStatus ?? (base.vaccination_status as string | null | undefined) ?? null,
    booster_status:
      visit.boosterStatus ?? (base.booster_status as string | null | undefined) ?? null,
    dose_number:
      visit.doseNumber ?? (base.dose_number as string | null | undefined) ?? null,
    identity_status: visit.identityStatus ?? (base.identity_status as string | undefined) ?? 'missing',
    patient_name_source:
      visit.patientNameSource ?? (base.patient_name_source as string | undefined) ?? 'missing',
    vital_signs_mentioned: Object.keys(existingVitals).length > 0 ? existingVitals : null,
    symptoms: Array.isArray(base.symptoms) ? base.symptoms : (visit.extractedSymptoms ?? []),
    danger_signs: Array.isArray(base.danger_signs) ? base.danger_signs : [],
    missing_information: Array.isArray(base.missing_information)
      ? base.missing_information
      : (visit.missingInformation ?? []),
    professional_review_required: Boolean(
      base.professional_review_required ?? visit.dangerAlertTriggered ?? false
    ),
    summary,
    original_transcript: visit.originalTranscript,
    confirmed: visit.status === 'CONFIRMED' || visit.status === 'ESCALATED',
    confirmed_at: visit.confirmedAt ?? null,
    correction_history: (visit.correctionHistory || []).map((entry) => ({
      field: entry.field,
      original_value: entry.originalValue,
      corrected_value: entry.correctedValue,
      timestamp: entry.timestamp,
      source: entry.source,
    })),
    emergency_escalations: (visit.emergencyEscalations || []).map((emg) => ({
      id: emg.id,
      alert_id: emg.alertId,
      rule_code: emg.ruleCode,
      detected_sign: emg.detectedSign,
      evidence: emg.evidence ?? null,
      detected_at: emg.detectedAt,
      confirmation_transcript: emg.confirmationTranscript,
      response: emg.response,
      responded_at: emg.respondedAt ?? null,
      timestamp: emg.respondedAt || emg.detectedAt,
      escalation_status: emg.escalationStatus,
      attempts: emg.attempts,
      stt_disconnected: emg.sttDisconnected ?? false,
    })),
    emergency_escalation:
      visit.emergencyEscalations && visit.emergencyEscalations.length > 0
        ? (() => {
            const latest = visit.emergencyEscalations[visit.emergencyEscalations.length - 1];
            return {
              id: latest.id,
              alert_id: latest.alertId,
              rule_code: latest.ruleCode,
              detected_sign: latest.detectedSign,
              evidence: latest.evidence ?? null,
              detected_at: latest.detectedAt,
              confirmation_transcript: latest.confirmationTranscript,
              response: latest.response,
              responded_at: latest.respondedAt ?? null,
              timestamp: latest.respondedAt || latest.detectedAt,
              escalation_status: latest.escalationStatus,
              attempts: latest.attempts,
              stt_disconnected: latest.sttDisconnected ?? false,
            };
          })()
        : null,
  };
}

/**
 * Saves a visit record to the patient API backend (POST /api/v1/visits/).
 *
 * Accepts either a canonical backend patient_id string (e.g. "PAT-2026-0002")
 * or a Beneficiary object (which is resolved and verified against the backend).
 */
export async function saveVisit(
  patientOrId: string | Beneficiary,
  transcript: string,
  structuredReport?: Record<string, unknown> | null,
  fetchImpl: typeof fetch = fetch
): Promise<BackendVisitRecord> {
  const patient_id =
    typeof patientOrId === 'string'
      ? patientOrId.trim()
      : await resolveBeneficiaryPatientId(patientOrId, fetchImpl);

  const visit_date = getLocalIsoDate();

  const reportPayload: Record<string, unknown> = structuredReport
    ? {
        ...structuredReport,
        summary:
          (typeof structuredReport.summary === 'string' && structuredReport.summary.trim()) ||
          transcript,
      }
    : {
        summary: transcript,
        professional_review_required: false,
      };

  const payload: SaveVisitPayload = {
    patient_id,
    visit_date,
    report: reportPayload,
  };

  const response = await fetchImpl(`${PATIENT_API_BASE}/api/v1/visits/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorMsg = await extractErrorMessage(response, 'Failed to save visit');
    throw new Error(errorMsg || `Server error (${response.status})`);
  }

  return (await response.json()) as BackendVisitRecord;
}

/**
 * Persists updated structured visit report fields (corrections, audit trail, confirmation status)
 * to an existing backend visit record (PATCH /api/v1/visits/{visit_id}).
 */
export async function updateVisitReport(
  visitId: string,
  structuredReport: Record<string, unknown>,
  fetchImpl: typeof fetch = fetch
): Promise<BackendVisitRecord> {
  const response = await fetchImpl(
    `${PATIENT_API_BASE}/api/v1/visits/${encodeURIComponent(visitId)}`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ report: structuredReport }),
    }
  );

  if (!response.ok) {
    const errorMsg = await extractErrorMessage(response, 'Failed to update visit report');
    throw new Error(errorMsg || `Server error (${response.status})`);
  }

  return (await response.json()) as BackendVisitRecord;
}

/**
 * Fetches a persisted visit record by its backend visit_id (GET /api/v1/visits/{visit_id}).
 */
export async function getVisitById(
  visitId: string,
  fetchImpl: typeof fetch = fetch
): Promise<BackendVisitRecord | null> {
  const response = await fetchImpl(
    `${PATIENT_API_BASE}/api/v1/visits/${encodeURIComponent(visitId)}`
  );
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    const errorMsg = await extractErrorMessage(response, 'Failed to load visit');
    throw new Error(errorMsg || `Server error (${response.status})`);
  }
  return (await response.json()) as BackendVisitRecord;
}

export default saveVisit;
