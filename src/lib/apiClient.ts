
const API_BASE_URL = 'http://localhost:8000/api/v1';

// Backend patient response
export interface PatientResponse {
  patient_id: string;
  name: string;
  age: number;
  gender: string | null;
  contact_number: string | null;
  address: string | null;
  registration_date: string;
  created_at: string;
  updated_at: string;
}

// Patient registration request
export interface PatientCreate {
  name: string;
  age: number;
  gender?: string | null;
  contact_number?: string | null;
  address?: string | null;
  registration_date?: string;
}

// Patient update request
export interface PatientUpdate {
  name?: string;
  age?: number;
  gender?: string | null;
  contact_number?: string | null;
  address?: string | null;
}

// Patient list response
export interface PatientListResponse {
  total: number;
  patients: PatientResponse[];
}

// Common API request handler
async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set('Content-Type', 'application/json');

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    const detail = errorBody?.detail;

    const message =
      typeof detail === 'string'
        ? detail
        : detail
          ? JSON.stringify(detail)
          : `Request failed with status ${response.status}`;

    throw new Error(message);
  }

  return response.json() as Promise<T>;
}

// GET: List and search patients
export async function getPatients(
  search?: string,
  skip = 0,
  limit = 50
): Promise<PatientListResponse> {
  const params = new URLSearchParams({
    skip: String(skip),
    limit: String(limit),
  });

  if (search?.trim()) {
    params.set('search', search.trim());
  }

  return apiRequest<PatientListResponse>(
    `/patients/?${params.toString()}`
  );
}

// GET: Retrieve one patient
export async function getPatient(
  patientId: string
): Promise<PatientResponse> {
  return apiRequest<PatientResponse>(
    `/patients/${encodeURIComponent(patientId)}`
  );
}

// POST: Register a patient
export async function createPatient(
  patient: PatientCreate
): Promise<PatientResponse> {
  return apiRequest<PatientResponse>('/patients/', {
    method: 'POST',
    body: JSON.stringify(patient),
  });
}

// PATCH: Update patient information
export async function updatePatient(
  patientId: string,
  updates: PatientUpdate
): Promise<PatientResponse> {
  return apiRequest<PatientResponse>(
    `/patients/${encodeURIComponent(patientId)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(updates),
    }
  );
}


// DELETE: Remove a patient
export async function deletePatient(
  patientId: string
): Promise<void> {
  const response = await fetch(
    `${API_BASE_URL}/patients/${encodeURIComponent(patientId)}`,
    {
      method: 'DELETE',
    }
  );

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    const detail = errorBody?.detail;

    throw new Error(
      typeof detail === 'string'
        ? detail
        : detail
          ? JSON.stringify(detail)
          : `Request failed with status ${response.status}`
    );
  }
}