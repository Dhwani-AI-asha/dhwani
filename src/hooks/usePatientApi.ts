/**
 * usePatientApi – React hook wrapping the backend patient API client
 * with loading states, error handling, and graceful degradation.
 */

import { useState, useCallback } from 'react';
import {
  getPatients,
  getPatient,
  createPatient,
  updatePatient,
  deletePatient,
  type PatientResponse,
  type PatientCreate,
  type PatientUpdate,
} from '../lib/apiClient';

export interface UsePatientApiReturn {
  // State
  patients: PatientResponse[];
  totalPatients: number;
  selectedPatient: PatientResponse | null;
  isLoading: boolean;
  error: string | null;
  /** True after the first successful fetch; false if the backend was never reachable. */
  backendAvailable: boolean;

  // Actions
  fetchPatients: (search?: string) => Promise<void>;
  fetchPatient: (patientId: string) => Promise<PatientResponse | null>;
  registerPatient: (data: PatientCreate) => Promise<PatientResponse | null>;
  editPatient: (patientId: string, updates: PatientUpdate) => Promise<PatientResponse | null>;
    removePatient: (patientId: string) => Promise<boolean>;
  clearError: () => void;
}

export function usePatientApi(): UsePatientApiReturn {
  const [patients, setPatients] = useState<PatientResponse[]>([]);
  const [totalPatients, setTotalPatients] = useState(0);
  const [selectedPatient, setSelectedPatient] = useState<PatientResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [backendAvailable, setBackendAvailable] = useState(true);

  const fetchPatients = useCallback(async (search?: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await getPatients(search);
      setPatients(result.patients);
      setTotalPatients(result.total);
      setBackendAvailable(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load patients';
      // Detect network-level failures (backend unreachable)
      if (message.includes('Failed to fetch') || message.includes('NetworkError') || message.includes('fetch')) {
        setBackendAvailable(false);
        setError('Backend unavailable – showing demo data only.');
      } else {
        setError(message);
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  const fetchPatient = useCallback(async (patientId: string): Promise<PatientResponse | null> => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await getPatient(patientId);
      setSelectedPatient(result);
      setBackendAvailable(true);
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load patient';
      setError(message);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const registerPatient = useCallback(async (data: PatientCreate): Promise<PatientResponse | null> => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await createPatient(data);
      setBackendAvailable(true);
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to register patient';
      setError(message);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const editPatient = useCallback(
    async (patientId: string, updates: PatientUpdate): Promise<PatientResponse | null> => {
      setIsLoading(true);
      setError(null);
      try {
        const result = await updatePatient(patientId, updates);
        setBackendAvailable(true);
        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to update patient';
        setError(message);
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    []
  );
const removePatient = useCallback(
  async (patientId: string): Promise<boolean> => {
    setIsLoading(true);
    setError(null);

    try {
      await deletePatient(patientId);
      setBackendAvailable(true);
      return true;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to delete patient';
      setError(message);
      return false;
    } finally {
      setIsLoading(false);
    }
  },
  []
);
  const clearError = useCallback(() => setError(null), []);

return {
  patients,
  totalPatients,
  selectedPatient,
  isLoading,
  error,
  backendAvailable,
  fetchPatients,
  fetchPatient,
  registerPatient,
  editPatient,
  removePatient,
  clearError,
};
}
