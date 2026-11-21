export interface SaveVisitPayload {
  patient_id: string;
  visit_date: string;
  report: {
    summary: string;
    professional_review_required: boolean;
  };
}

/**
 * Saves a visit record to the patient API backend.
 *
 * @param patientId ID of the patient (e.g. "PAT-2026-0001")
 * @param transcript Clinical visit speech transcript
 * @returns Parsed JSON response from server
 */
export async function saveVisit(patientId: string, transcript: string) {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const visit_date = `${year}-${month}-${day}`;

  const payload: SaveVisitPayload = {
    patient_id: patientId,
    visit_date,
    report: {
      summary: transcript,
      professional_review_required: true,
    },
  };

  const response = await fetch('http://localhost:8001/api/v1/visits/', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    let errorMsg = '';
    try {
      const errorJson = await response.json();
      if (typeof errorJson.detail === 'string') {
        errorMsg = errorJson.detail;
      } else if (Array.isArray(errorJson.detail)) {
        errorMsg = errorJson.detail.map((d: any) => d.msg || JSON.stringify(d)).join(', ');
      } else if (errorJson.message) {
        errorMsg = String(errorJson.message);
      } else if (errorJson.error) {
        errorMsg = String(errorJson.error);
      } else {
        errorMsg = JSON.stringify(errorJson);
      }
    } catch {
      errorMsg = await response.text().catch(() => response.statusText || 'Failed to save visit');
    }
    throw new Error(errorMsg || `Server error (${response.status})`);
  }

  return await response.json().catch(() => ({}));
}

export default saveVisit;
