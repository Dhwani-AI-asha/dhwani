import React, { useState, useEffect } from 'react';
import {
  Search,
  UserPlus,
  Phone,
  Pencil,
  Mic,
  FileText,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  WifiOff,
  X,
  Database,
  Users,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { mockBeneficiaries } from '../../data/mockData';
import { usePatientApi } from '../../hooks/usePatientApi';
import { patientToBeneficiary, markAsDemo, type TrackedBeneficiary } from '../../lib/patientAdapter';
import type { PatientCreate } from '../../lib/apiClient';

// ---------------------------------------------------------------------------
// Registration form sub-component
// ---------------------------------------------------------------------------

interface RegistrationFormProps {
  onSubmit: (data: PatientCreate) => void;
  onUpdate?: (data: PatientCreate) => void;
  onCancel: () => void;
  isLoading: boolean;
  initialPatient?: TrackedBeneficiary | null;
}

const RegistrationForm: React.FC<RegistrationFormProps> = ({
  onSubmit,
  onUpdate,
  onCancel,
  isLoading,
  initialPatient,
}) => {
const [name, setName] = useState(initialPatient?.name ?? '');
const [age, setAge] = useState(initialPatient ? String(initialPatient.age) : '');
const [gender, setGender] = useState(
  initialPatient?.stage?.includes('•')
    ? initialPatient.stage.split('•')[1].trim()
    : ''
);
const [contactNumber, setContactNumber] = useState(initialPatient?.contactNumber ?? '');
const [address, setAddress] = useState(
  initialPatient?.village === 'Address not specified' ? '' : initialPatient?.village ?? ''
);
  const [validationError, setValidationError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError('');

    const trimmedName = name.trim();
    const ageNum = parseInt(age, 10);

    if (!trimmedName) {
      setValidationError('Patient name is required.');
      return;
    }
    if (isNaN(ageNum) || ageNum < 0 || ageNum > 130) {
      setValidationError('Age must be between 0 and 130.');
      return;
    }

const patientData: PatientCreate = {
  name: trimmedName,
  age: ageNum,
  gender: gender.trim() || null,
  contact_number: contactNumber.trim() || null,
  address: address.trim() || null,
};

if (initialPatient && onUpdate) {
  onUpdate(patientData);
} else {
  onSubmit(patientData);
}
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-white rounded-2xl border border-teal-200 p-6 shadow-sm space-y-4 animate-in fade-in"
    >
      <div className="flex items-center justify-between">
<h3 className="text-sm font-bold text-slate-900">
  {initialPatient ? 'Edit Patient Details' : 'Register New Patient'}
</h3>
        <button
          type="button"
          onClick={onCancel}
          className="w-7 h-7 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700 flex items-center justify-center transition"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {validationError && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-xs font-medium px-3 py-2 rounded-xl flex items-center space-x-2">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          <span>{validationError}</span>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">
            Full Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Kavitha Sharma"
            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-teal-700"
            required
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">
            Age <span className="text-red-500">*</span>
          </label>
          <input
            type="number"
            value={age}
            onChange={(e) => setAge(e.target.value)}
            placeholder="e.g. 24"
            min={0}
            max={130}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-teal-700"
            required
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">Gender</label>
          <select
            value={gender}
            onChange={(e) => setGender(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-teal-700"
          >
            <option value="">Select...</option>
            <option value="Female">Female</option>
            <option value="Male">Male</option>
            <option value="Other">Other</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">Contact Number</label>
          <input
            type="text"
            value={contactNumber}
            onChange={(e) => setContactNumber(e.target.value)}
            placeholder="e.g. 9876543210"
            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-teal-700"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-xs font-semibold text-slate-700 mb-1">Address / Village</label>
          <input
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="e.g. Village Rampur, Ward 2"
            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-teal-700"
          />
        </div>
      </div>

      <div className="flex items-center justify-end space-x-3 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="text-xs font-semibold text-slate-600 hover:text-slate-900 px-4 py-2 transition"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isLoading}
          className="flex items-center space-x-2 bg-teal-700 hover:bg-teal-800 disabled:bg-teal-400 text-white px-5 py-2.5 rounded-xl text-xs font-bold transition shadow-sm active:scale-95"
        >
{isLoading ? (
  <>
    <Loader2 className="w-3.5 h-3.5 animate-spin" />
    <span>{initialPatient ? 'Saving...' : 'Registering...'}</span>
  </>
) : (
  <>
    {initialPatient ? (
      <CheckCircle2 className="w-3.5 h-3.5" />
    ) : (
      <UserPlus className="w-3.5 h-3.5" />
    )}
    <span>{initialPatient ? 'Save Changes' : 'Register Patient'}</span>
  </>
)}
        </button>
      </div>
    </form>
  );
};

// ---------------------------------------------------------------------------
// Main Beneficiaries screen
// ---------------------------------------------------------------------------

type ViewFilter = 'all' | 'backend' | 'demo';

export const Beneficiaries: React.FC = () => {
  const { setActiveBeneficiary, startRecording, setCurrentScreen } = useApp();

  // Backend patient API hook
  const {
    patients: backendPatients,
    totalPatients,
    isLoading,
    error,
    backendAvailable,
    fetchPatients,
    registerPatient,
    editPatient,
    removePatient,
    clearError,
  } = usePatientApi();

  // Local UI state
  const [searchQuery, setSearchQuery] = useState('');
  const [viewFilter, setViewFilter] = useState<ViewFilter>('all');
  const [showRegistrationForm, setShowRegistrationForm] = useState(false);
  const [editingPatient, setEditingPatient] = useState<TrackedBeneficiary | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Fetch backend patients on mount
  useEffect(() => {
    fetchPatients();
  }, [fetchPatients]);

  // Search with debounce-like behavior (triggers on enter or when query changes)
  useEffect(() => {
    const timer = setTimeout(() => {
      if (backendAvailable) {
        fetchPatients(searchQuery || undefined);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, backendAvailable, fetchPatients]);

  // Convert backend patients to tracked beneficiaries
  const backendBeneficiaries: TrackedBeneficiary[] = backendPatients.map(patientToBeneficiary);

  // Convert demo beneficiaries to tracked
  const demoBeneficiaries: TrackedBeneficiary[] = mockBeneficiaries.map(markAsDemo);

  // Filter demo data locally by search query
  const filteredDemo = demoBeneficiaries.filter((b) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      b.name.toLowerCase().includes(q) ||
      b.rchId.toLowerCase().includes(q) ||
      (b.contactNumber && b.contactNumber.includes(q))
    );
  });

  // Combined list based on active filter
  const displayList: TrackedBeneficiary[] =
    viewFilter === 'backend'
      ? backendBeneficiaries
      : viewFilter === 'demo'
        ? filteredDemo
        : [...backendBeneficiaries, ...filteredDemo];

  // Start visit for a beneficiary (works for both backend and demo)
const handleStartVisitFor = (b: TrackedBeneficiary) => {
  // Backend patients currently contain only basic registration details.
  // Do not send them into the maternal visit workflow yet.
  if (b._source === 'backend') {
    return;
  }

  // Preserve the existing demo beneficiary workflow.
  const { _source, _backendPatientId, ...beneficiary } = b;
  setActiveBeneficiary(beneficiary);
  startRecording();
};

  // Handle patient registration
  const handleRegisterPatient = async (data: PatientCreate) => {
    const result = await registerPatient(data);
    if (result) {
      setShowRegistrationForm(false);
      setSuccessMessage(`Patient "${result.name}" registered successfully (ID: ${result.patient_id}).`);
      // Refresh the patient list
      await fetchPatients(searchQuery || undefined);
      // Auto-dismiss success message
      setTimeout(() => setSuccessMessage(null), 5000);
    }
  };
    // Handle patient update
  const handleUpdatePatient = async (data: PatientCreate) => {
    if (!editingPatient?._backendPatientId) return;

    const result = await editPatient(editingPatient._backendPatientId, data);

    if (result) {
      setEditingPatient(null);
      setSuccessMessage(
        `Patient "${result.name}" updated successfully (ID: ${result.patient_id}).`
      );

      await fetchPatients(searchQuery || undefined);

      setTimeout(() => setSuccessMessage(null), 5000);
    }
  };
    // Handle patient deletion
  const handleDeletePatient = async (patient: TrackedBeneficiary) => {
    if (!patient._backendPatientId) return;

    const confirmed = window.confirm(
      `Permanently delete "${patient.name}" (ID: ${patient._backendPatientId})?\n\n` +
      'This will also permanently delete their visits, care promises, referrals, and medication reminders. This action cannot be undone.'
    );

    if (!confirmed) return;

    const success = await removePatient(patient._backendPatientId);

    if (success) {
      if (editingPatient?._backendPatientId === patient._backendPatientId) {
        setEditingPatient(null);
      }

      setSuccessMessage(`Patient "${patient.name}" deleted successfully.`);
      await fetchPatients(searchQuery || undefined);
      setTimeout(() => setSuccessMessage(null), 5000);
    }
  };

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
            PATIENT MANAGEMENT
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Patients &amp; Beneficiaries
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Registered patients from backend and synthetic demo beneficiary profiles.
          </p>
        </div>

        <button
          onClick={() => setShowRegistrationForm(true)}
          className="flex items-center space-x-2 bg-teal-700 hover:bg-teal-800 text-white px-4 py-2.5 rounded-xl text-xs font-bold transition shadow-sm self-start sm:self-auto active:scale-95"
        >
          <UserPlus className="w-4 h-4" />
          <span>+ Register New Patient</span>
        </button>
      </div>

      {/* Backend Unavailable Warning */}
      {!backendAvailable && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start space-x-3 text-xs">
          <WifiOff className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <h4 className="font-bold text-amber-900">Backend Unavailable</h4>
            <p className="text-amber-700 mt-0.5">
              Cannot connect to the patient management backend. Showing demo data only.
              Patient registration and search require a running backend at localhost:8000.
            </p>
          </div>
        </div>
      )}

      {/* Success Message */}
      {successMessage && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex items-center justify-between text-xs animate-in fade-in">
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span className="font-semibold text-emerald-800">{successMessage}</span>
          </div>
          <button
            onClick={() => setSuccessMessage(null)}
            className="text-emerald-600 hover:text-emerald-800"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* API Error */}
      {error && backendAvailable && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-center justify-between text-xs">
          <div className="flex items-center space-x-2">
            <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
            <span className="font-semibold text-red-800">{error}</span>
          </div>
          <button onClick={clearError} className="text-red-600 hover:text-red-800">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

{/* Registration / Edit Form */}
{(showRegistrationForm || editingPatient) && (
  <RegistrationForm
    onSubmit={handleRegisterPatient}
    onUpdate={handleUpdatePatient}
    initialPatient={editingPatient}
    onCancel={() => {
      setShowRegistrationForm(false);
      setEditingPatient(null);
    }}
    isLoading={isLoading}
  />
)}
      {/* Search & Filters */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by name, ID, or contact number..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-2 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-teal-700"
          />
        </div>

        <div className="flex items-center space-x-2 text-xs font-semibold">
          <button
            onClick={() => setViewFilter('all')}
            className={`px-3 py-1.5 rounded-lg transition ${
              viewFilter === 'all' ? 'bg-teal-700 text-white shadow-2xs' : 'bg-slate-100 text-slate-600'
            }`}
          >
            All ({backendBeneficiaries.length + filteredDemo.length})
          </button>
          <button
            onClick={() => setViewFilter('backend')}
            className={`px-3 py-1.5 rounded-lg transition flex items-center space-x-1 ${
              viewFilter === 'backend'
                ? 'bg-teal-700 text-white shadow-2xs'
                : 'bg-slate-100 text-slate-600'
            }`}
          >
            <Database className="w-3 h-3" />
            <span>Backend ({backendBeneficiaries.length})</span>
          </button>
          <button
            onClick={() => setViewFilter('demo')}
            className={`px-3 py-1.5 rounded-lg transition flex items-center space-x-1 ${
              viewFilter === 'demo'
                ? 'bg-teal-700 text-white shadow-2xs'
                : 'bg-slate-100 text-slate-600'
            }`}
          >
            <Users className="w-3 h-3" />
            <span>Demo ({filteredDemo.length})</span>
          </button>
        </div>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 text-teal-600 animate-spin" />
          <span className="ml-2 text-sm text-slate-500">Loading patients...</span>
        </div>
      )}

      {/* Empty State */}
      {!isLoading && displayList.length === 0 && (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-12 shadow-sm text-center">
          <Users className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <h3 className="text-sm font-bold text-slate-700">No patients found</h3>
          <p className="text-xs text-slate-500 mt-1">
            {searchQuery
              ? `No results for "${searchQuery}". Try a different search term.`
              : 'Register a new patient to get started.'}
          </p>
        </div>
      )}

      {/* Patient / Beneficiary Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {displayList.map((b) => (
          <div
            key={`${b._source}-${b.id}`}
            className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm space-y-4 hover:border-slate-300 transition"
          >
            {/* Header Row */}
            <div className="flex items-start justify-between">
              <div className="flex items-center space-x-3.5">
                <div
                  className={`w-12 h-12 rounded-full flex items-center justify-center font-bold text-sm shrink-0 ${
                    b._source === 'backend'
                      ? 'bg-blue-100 text-blue-800'
                      : 'bg-teal-100 text-teal-800'
                  }`}
                >
                  {b.avatarInitials}
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">{b.name}</h3>
                  {b.spouseName && <p className="text-xs text-slate-500">W/o {b.spouseName}</p>}
                  <div className="flex items-center space-x-2 mt-1">
                    <span
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded ${
                        b._source === 'backend'
                          ? 'text-blue-800 bg-blue-50 border border-blue-200'
                          : 'text-teal-800 bg-teal-50 border border-teal-200'
                      }`}
                    >
                      {b.stage}
                    </span>
                    <span className="text-[11px] text-slate-400">Age: {b.age}</span>
                    <span
                      className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                        b._source === 'backend'
                          ? 'bg-blue-100 text-blue-700'
                          : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      {b._source === 'backend' ? 'BACKEND' : 'DEMO'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Detail Row */}
            <div className="bg-slate-50 rounded-xl p-3 text-xs text-slate-600 space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-400">
                  {b._source === 'backend' ? 'Patient ID:' : 'RCH Identifier:'}
                </span>
                <span className="font-mono font-semibold text-slate-800">{b.rchId}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Address:</span>
                <span>{b.village}{b.gali ? `, ${b.gali}` : ''}</span>
              </div>
              {b.contactNumber && (
                <div className="flex justify-between">
                  <span className="text-slate-400">Contact:</span>
                  <span className="font-medium text-slate-700">{b.contactNumber}</span>
                </div>
              )}
              {b.edd && (
                <div className="flex justify-between text-teal-800 font-medium">
                  <span>Estimated Due Date (EDD):</span>
                  <span>{b.edd}</span>
                </div>
              )}
            </div>

            {/* Action Row */}
            <div className="flex items-center justify-between pt-2">
              <button
                onClick={() => setCurrentScreen('visit-history')}
                className="text-xs font-semibold text-slate-600 hover:text-slate-900 flex items-center space-x-1"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Visit Records</span>
              </button>

{b._source === 'backend' ? (
  <div className="flex items-center gap-2">
    <button
      onClick={() => {
        setEditingPatient(b);
        setShowRegistrationForm(false);
      }}
      className="flex items-center space-x-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 px-3.5 py-2 rounded-xl text-xs font-bold transition"
    >
      <Pencil className="w-3.5 h-3.5" />
      <span>Edit Details</span>
    </button>

    <button
      onClick={() => handleDeletePatient(b)}
      disabled={isLoading}
      className="flex items-center space-x-1.5 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 px-3.5 py-2 rounded-xl text-xs font-bold transition disabled:opacity-50"
    >
      <span>Delete</span>
    </button>
  </div>
) : (
  <button
    onClick={() => handleStartVisitFor(b)}
    className="flex items-center space-x-1.5 bg-teal-700 hover:bg-teal-800 text-white px-3.5 py-2 rounded-xl text-xs font-bold transition shadow-2xs active:scale-95"
  >
    <Mic className="w-3.5 h-3.5" />
    <span>Start Home Visit</span>
  </button>
)}

            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
