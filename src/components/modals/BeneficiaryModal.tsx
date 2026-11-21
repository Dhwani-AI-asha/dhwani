import React, { useState, useEffect } from 'react';
import { X, CheckCircle2, Search, Loader2, Database, Users, WifiOff } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { mockBeneficiaries } from '../../data/mockData';
import { usePatientApi } from '../../hooks/usePatientApi';
import { patientToBeneficiary, markAsDemo, type TrackedBeneficiary } from '../../lib/patientAdapter';
import type { Beneficiary } from '../../types';

export const BeneficiaryModal: React.FC = () => {
  const {
    isBeneficiaryModalOpen,
    setIsBeneficiaryModalOpen,
    activeBeneficiary,
    setActiveBeneficiary,
  } = useApp();

  const {
    patients: backendPatients,
    isLoading,
    backendAvailable,
    fetchPatients,
  } = usePatientApi();

  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'backend' | 'demo'>('all');

  // Fetch backend patients when modal opens
  useEffect(() => {
    if (isBeneficiaryModalOpen) {
      fetchPatients();
      setSearchQuery('');
    }
  }, [isBeneficiaryModalOpen, fetchPatients]);

  // Search backend when query changes
  useEffect(() => {
    if (isBeneficiaryModalOpen && backendAvailable && searchQuery.trim()) {
      const timer = setTimeout(() => fetchPatients(searchQuery), 300);
      return () => clearTimeout(timer);
    }
  }, [searchQuery, isBeneficiaryModalOpen, backendAvailable, fetchPatients]);

  if (!isBeneficiaryModalOpen) return null;

  // Build tracked lists
  const backendList: TrackedBeneficiary[] = backendPatients.map(patientToBeneficiary);
  const demoList: TrackedBeneficiary[] = mockBeneficiaries
    .filter((b) => {
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return b.name.toLowerCase().includes(q) || b.rchId.toLowerCase().includes(q);
    })
    .map(markAsDemo);

  const displayList: TrackedBeneficiary[] =
    activeTab === 'backend'
      ? backendList
      : activeTab === 'demo'
        ? demoList
        : [...backendList, ...demoList];

const handleSelect = (b: TrackedBeneficiary) => {
  // Generic backend patients are not yet ready for the maternal visit workflow.
  if (b._source === 'backend') {
    return;
  }

  // Only existing demo maternal beneficiaries can enter this workflow.
  const { _source, _backendPatientId, ...beneficiary } = b;
  setActiveBeneficiary(beneficiary as Beneficiary);
  setIsBeneficiaryModalOpen(false);
};

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-slate-900">Select Beneficiary / Patient</h3>
            <p className="text-xs text-slate-500">
              Backend patients and synthetic demo households
            </p>
          </div>
          <button
            onClick={() => setIsBeneficiaryModalOpen(false)}
            className="w-8 h-8 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700 flex items-center justify-center transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search & Tabs */}
        <div className="px-4 pt-3 pb-2 space-y-2 border-b border-slate-100">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by name or ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-teal-700"
            />
          </div>
          <div className="flex items-center space-x-1.5 text-[11px] font-semibold">
            <button
              onClick={() => setActiveTab('all')}
              className={`px-2.5 py-1 rounded-lg transition ${
                activeTab === 'all' ? 'bg-teal-700 text-white' : 'bg-slate-100 text-slate-600'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setActiveTab('backend')}
              className={`px-2.5 py-1 rounded-lg transition flex items-center space-x-1 ${
                activeTab === 'backend' ? 'bg-teal-700 text-white' : 'bg-slate-100 text-slate-600'
              }`}
            >
              <Database className="w-3 h-3" />
              <span>Backend ({backendList.length})</span>
            </button>
            <button
              onClick={() => setActiveTab('demo')}
              className={`px-2.5 py-1 rounded-lg transition flex items-center space-x-1 ${
                activeTab === 'demo' ? 'bg-teal-700 text-white' : 'bg-slate-100 text-slate-600'
              }`}
            >
              <Users className="w-3 h-3" />
              <span>Demo ({demoList.length})</span>
            </button>
          </div>
        </div>

        {/* Backend unavailable warning */}
        {!backendAvailable && (
          <div className="mx-4 mt-3 bg-amber-50 border border-amber-200 rounded-xl p-2.5 flex items-center space-x-2 text-xs text-amber-800">
            <WifiOff className="w-3.5 h-3.5 shrink-0" />
            <span>Backend unavailable — showing demo data only.</span>
          </div>
        )}

        {/* Loading */}
        {isLoading && (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="w-5 h-5 text-teal-600 animate-spin" />
            <span className="ml-2 text-xs text-slate-500">Loading patients...</span>
          </div>
        )}

        {/* Patient List */}
        <div className="p-4 space-y-2.5 max-h-[55vh] overflow-y-auto">
          {!isLoading && displayList.length === 0 && (
            <div className="text-center py-6 text-xs text-slate-500">
              {searchQuery ? `No results for "${searchQuery}"` : 'No patients available.'}
            </div>
          )}

          {displayList.map((b) => {
            const isSelected = b.id === activeBeneficiary.id;
            return (
<div
      key={`${b._source}-${b.id}`}
      onClick={() => handleSelect(b)}
      className={`p-3.5 rounded-xl border transition flex items-center justify-between ${
        b._source === 'backend'
          ? 'bg-slate-50 border-slate-200 opacity-60 cursor-not-allowed'
          : 'cursor-pointer ' + (
              isSelected
                ? 'bg-teal-50/70 border-teal-300 shadow-2xs'
                : 'bg-white border-slate-200 hover:bg-slate-50 hover:border-slate-300'
            )
      }`}
    >
      <div className="flex items-center space-x-3">
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-xs ${
                      isSelected
                        ? 'bg-teal-700 text-white'
                        : b._source === 'backend'
                          ? 'bg-blue-100 text-blue-700'
                          : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    {b.avatarInitials}
                  </div>
                  <div>
                    <div className="flex items-center space-x-2">
                      <h4 className="text-xs font-bold text-slate-900">{b.name}</h4>
                      {b.spouseName && (
                        <span className="text-[11px] text-slate-400">({b.spouseName})</span>
                      )}
                      <span
                        className={`text-[10px] font-semibold px-2 py-0.5 rounded ${
                          b._source === 'backend'
                            ? 'text-blue-800 bg-blue-100/60'
                            : 'text-teal-800 bg-teal-100/60'
                        }`}
                      >
                        {b.stage.split('•')[0]}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      {b.age} Yrs • {b.village}{b.gali ? `, ${b.gali}` : ''} •{' '}
                      {b._source === 'backend' ? 'ID' : 'RCH ID'}: {b.rchId}
                    </p>
                  </div>
                </div>

                <div className="flex items-center space-x-1.5 shrink-0 ml-2">
                  <span
                    className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                      b._source === 'backend'
                        ? 'bg-blue-100 text-blue-700'
                        : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                   {b._source === 'backend' ? 'API · VIEW ONLY' : 'DEMO'}
                  </span>
                  {isSelected && <CheckCircle2 className="w-5 h-5 text-teal-700" />}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
          <span>
            {backendAvailable
              ? `${backendList.length} backend patient(s) • ${demoList.length} demo record(s)`
              : '100% synthetic patient records (backend offline)'}
          </span>
          <button
            onClick={() => setIsBeneficiaryModalOpen(false)}
            className="text-xs font-semibold text-slate-700 hover:text-slate-900"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
