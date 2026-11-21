/**
 * Client for the voice backend's /report and /report/correct endpoints.
 * Never throws: always resolves to { ok: true, ... } or { ok: false, error }.
 */
const BASE_URL =
  (import.meta as unknown as { env?: { VITE_VOICE_HTTP_URL?: string } }).env?.VITE_VOICE_HTTP_URL ||
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
}
export interface ReportFailure {
  ok: false;
  error: string;
}
export type ReportResult = ReportSuccess | ReportFailure;
async function post(path: string, body: unknown): Promise<ReportResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${BASE_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const data = await response.json().catch(() => null);
    if (data && data.ok === true) {
      return data as ReportSuccess;
    }
    if (data && typeof data.error === 'string') {
      return { ok: false, error: data.error };
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
  language: string | null = null
): Promise<ReportResult> {
  return post('/report', { transcript, language });
}
export function correctReport(
  transcript: string,
  correction: string,
  language: string | null = null
): Promise<ReportResult> {
  return post('/report/correct', { transcript, correction, language });
}
