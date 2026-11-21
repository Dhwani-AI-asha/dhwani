/**
 * Client for the voice backend's /report, /report/correct, /report/voice-correct, and /report/status endpoints.
 * Never throws: always resolves to { ok: true, ... } or { ok: false, error, ... }.
 */
const BASE_URL =
  (typeof import.meta !== 'undefined' &&
    (import.meta as unknown as { env?: { VITE_VOICE_HTTP_URL?: string } }).env?.VITE_VOICE_HTTP_URL) ||
  'http://localhost:8000';

// The model can take up to ~60 s on the server, so wait a little longer here.
const REQUEST_TIMEOUT_MS = 90_000;

export interface ReportSuccess {
  ok: true;
  report: Record<string, unknown>;
  narration: string;
  narration_speech: string;
  narration_language: string;
  transcript_used: string;
  disclaimer: string;
  confirmation_prompt?: string;
  confirmed?: boolean;
}

export interface ReportFailure {
  ok: false;
  error: string;
  reason?: string;
  message?: string;
}

export type ReportResult = ReportSuccess | ReportFailure;

export interface VoiceCorrectionAuditItem {
  field: string;
  original_value: string | number | boolean | null;
  corrected_value: string | number | boolean | null;
  timestamp: string;
  source: 'voice' | 'text' | 'manual';
}

export interface VoiceCorrectionSuccess {
  ok: true;
  action: 'updated' | 'clarify' | 'confirmed';
  confirmed: boolean;
  report: Record<string, unknown>;
  changes: VoiceCorrectionAuditItem[];
  correction_history: VoiceCorrectionAuditItem[];
  narration: string;
  narration_speech: string;
  assistant_reply: string;
  assistant_reply_speech: string;
  confirmation_prompt: string;
  narration_language: string;
  transcript_used: string;
  disclaimer: string;
}

export type VoiceCorrectionResult = VoiceCorrectionSuccess | ReportFailure;

async function postJson<T extends { ok: true }>(
  path: string,
  body: unknown,
  fetchImpl: typeof fetch = fetch
): Promise<T | ReportFailure> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetchImpl(`${BASE_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const data = await response.json().catch(() => null);
    if (data && data.ok === true) {
      return data as T;
    }
    if (data && typeof data.error === 'string') {
      return {
        ok: false,
        error: data.error,
        reason: typeof data.reason === 'string' ? data.reason : undefined,
        message: typeof data.message === 'string' ? data.message : undefined,
      };
    }
    return { ok: false, error: `http_${response.status}` };
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      return { ok: false, error: 'timeout' };
    }
    return { ok: false, error: 'network_error' };
  } finally {
    clearTimeout(timer);
  }
}

export function generateReport(
  transcript: string,
  language: string | null = null,
  fetchImpl: typeof fetch = fetch,
  selectedPatientName: string | null = null
): Promise<ReportResult> {
  return postJson<ReportSuccess>(
    '/report',
    { transcript, language, selected_patient_name: selectedPatientName },
    fetchImpl
  );
}

export function correctReport(
  transcript: string,
  correction: string,
  language: string | null = null,
  fetchImpl: typeof fetch = fetch,
  selectedPatientName: string | null = null
): Promise<ReportResult> {
  return postJson<ReportSuccess>(
    '/report/correct',
    { transcript, correction, language, selected_patient_name: selectedPatientName },
    fetchImpl
  );
}

export function voiceCorrectReport(
  currentReport: Record<string, unknown>,
  utterance: string,
  transcript: string | null = null,
  language: string | null = null,
  source: 'voice' | 'text' = 'voice',
  fetchImpl: typeof fetch = fetch,
  selectedPatientName: string | null = null
): Promise<VoiceCorrectionResult> {
  return postJson<VoiceCorrectionSuccess>(
    '/report/voice-correct',
    {
      current_report: currentReport,
      utterance,
      transcript,
      language,
      source,
      selected_patient_name: selectedPatientName,
    },
    fetchImpl
  );
}
