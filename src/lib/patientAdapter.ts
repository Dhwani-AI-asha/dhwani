/**
 * Patient Adapter – Mapping layer between backend PatientResponse and frontend Beneficiary.
 *
 * The backend Patient model stores: name, age, gender, contact_number, address.
 * The frontend Beneficiary model contains additional maternal-health fields
 * (rchId, stage, gestationalWeeks, edd, lmp, village, gali, etc.) that do NOT
 * exist in the backend.
 *
 * This adapter:
 * - Maps backend records to the frontend type with safe defaults (never invents data).
 * - Tracks whether a beneficiary came from the backend or is synthetic demo data.
 * - Provides reverse mapping for registration payloads.
 */

import type { PatientResponse } from './apiClient';
import type { Beneficiary } from '../types';

// ---------------------------------------------------------------------------
// Source tracking
// ---------------------------------------------------------------------------

/** Discriminator to tell real backend patients from synthetic demo records. */
export type PatientSource = 'backend' | 'demo';

/** Beneficiary extended with provenance metadata. */
export interface TrackedBeneficiary extends Beneficiary {
  _source: PatientSource;
  /** The PAT-YYYY-NNNN identifier from the backend, if applicable. */
  _backendPatientId?: string;
}

// ---------------------------------------------------------------------------
// Backend → Frontend
// ---------------------------------------------------------------------------

/**
 * Convert a backend PatientResponse into a frontend Beneficiary shape.
 *
 * Fields that exist only in the frontend model are set to safe, clearly-
 * marked defaults – nothing is fabricated.
 */
export function patientToBeneficiary(patient: PatientResponse): TrackedBeneficiary {
  const initials = patient.name
    .split(' ')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase())
    .slice(0, 2)
    .join('');

  return {
    // --- mapped directly ---
    id: patient.patient_id,
    name: patient.name,
    age: patient.age,
    contactNumber: patient.contact_number || undefined,

    // --- best-effort mapping ---
    village: patient.address || 'Address not specified',
    gali: undefined,
    rchId: patient.patient_id, // display the backend ID as identifier
    subCenter: 'Not assigned',
    ward: 'Not assigned',
    stage: patient.gender ? `Registered Patient • ${patient.gender}` : 'Registered Patient',

    // --- maternal-health fields: NOT in backend, left undefined ---
    spouseName: undefined,
    gestationalWeeks: undefined,
    edd: undefined,
    lmp: undefined,
    baselineBp: undefined,

    // --- UI helpers ---
    avatarInitials: initials || '??',
    photoUrl: undefined,

    // --- provenance ---
    _source: 'backend',
    _backendPatientId: patient.patient_id,
  };
}

/**
 * Wrap an existing demo Beneficiary with source tracking.
 */
export function markAsDemo(b: Beneficiary): TrackedBeneficiary {
  return { ...b, _source: 'demo' };
}

// ---------------------------------------------------------------------------
// Frontend → Backend
// ---------------------------------------------------------------------------

/** Shape accepted by the backend POST /patients/ endpoint. */
export interface PatientCreatePayload {
  name: string;
  age: number;
  gender?: string;
  contact_number?: string;
  address?: string;
}

/**
 * Build a backend-compatible registration payload from frontend form data.
 */
export function toPatientCreatePayload(data: {
  name: string;
  age: number;
  gender?: string;
  contactNumber?: string;
  address?: string;
}): PatientCreatePayload {
  return {
    name: data.name.trim(),
    age: data.age,
    gender: data.gender?.trim() || undefined,
    contact_number: data.contactNumber?.trim() || undefined,
    address: data.address?.trim() || undefined,
  };
}
