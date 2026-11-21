import React, { useState } from 'react';
import { Search, UserPlus, Mic, FileText } from 'lucide-react';
import { useApp } from '../../context/AppContext';

export const Beneficiaries: React.FC = () => {
  const { beneficiaries, setActiveBeneficiary, startRecording, setCurrentScreen } = useApp();
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'anc' | 'pnc' | 'immunization'>('all');

  const filtered = beneficiaries.filter(b => {
    const matches = b.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    b.rchId.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    (b.patientId || '').toLowerCase().includes(searchQuery.toLowerCase());
    if (!matches) return false;
    if (filter === 'anc') return b.stage.includes('ANC');
    if (filter === 'pnc') return b.stage.includes('PNC');
    if (filter === 'immunization') return b.stage.includes('Immunization');
    return true;
  });

  const handleStartVisitFor = (b: any) => {
    setActiveBeneficiary(b);
    startRecording();
  };

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
            WARD 4 RAMPUR POPULATION REGISTER
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Assigned Beneficiaries
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Active synthetic beneficiary profiles under ASHA Sunita Devi's jurisdiction.
          </p>
        </div>

        <button 
          onClick={() => alert("Synthetic Demo: New synthetic beneficiary enrollment form.")}
          className="flex items-center space-x-2 bg-teal-700 hover:bg-teal-800 text-white px-4 py-2.5 rounded-xl text-xs font-bold transition shadow-sm self-start sm:self-auto"
        >
          <UserPlus className="w-4 h-4" />
          <span>+ Enroll New Beneficiary</span>
        </button>
      </div>

      {/* Search & Filters */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by name, husband's name, or RCH ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-2 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-teal-700"
          />
        </div>

        <div className="flex items-center space-x-2 text-xs font-semibold">
          <button
            onClick={() => setFilter('all')}
            className={`px-3 py-1.5 rounded-lg transition ${
              filter === 'all' ? 'bg-teal-700 text-white shadow-2xs' : 'bg-slate-100 text-slate-600'
            }`}
          >
            All ({beneficiaries.length})
          </button>
          <button
            onClick={() => setFilter('anc')}
            className={`px-3 py-1.5 rounded-lg transition ${
              filter === 'anc' ? 'bg-teal-700 text-white shadow-2xs' : 'bg-slate-100 text-slate-600'
            }`}
          >
            ANC Pregnant (2)
          </button>
          <button
            onClick={() => setFilter('pnc')}
            className={`px-3 py-1.5 rounded-lg transition ${
              filter === 'pnc' ? 'bg-teal-700 text-white shadow-2xs' : 'bg-slate-100 text-slate-600'
            }`}
          >
            PNC Postnatal (1)
          </button>
        </div>
      </div>

      {/* Grid of Beneficiaries */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filtered.map(b => (
          <div
            key={b.id}
            className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm space-y-4 hover:border-slate-300 transition"
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center space-x-3.5">
                <div className="w-12 h-12 rounded-full bg-teal-100 text-teal-800 flex items-center justify-center font-bold text-sm shrink-0">
                  {b.avatarInitials}
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">{b.name}</h3>
                  {b.spouseName && (
                    <p className="text-xs text-slate-500">W/o {b.spouseName}</p>
                  )}
                  <div className="flex items-center space-x-2 mt-1">
                    <span className="text-[10px] font-semibold text-teal-800 bg-teal-50 border border-teal-200 px-2 py-0.2 rounded">
                      {b.stage}
                    </span>
                    <span className="text-[11px] text-slate-400">Age: {b.age}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-slate-50 rounded-xl p-3 text-xs text-slate-600 space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-400">RCH Identifier:</span>
                <span className="font-mono font-semibold text-slate-800">{b.rchId}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Address:</span>
                <span>{b.village}, {b.gali || ''}</span>
              </div>
              {b.edd && (
                <div className="flex justify-between text-teal-800 font-medium">
                  <span>Estimated Due Date (EDD):</span>
                  <span>{b.edd}</span>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between pt-2">
              <button
                onClick={() => setCurrentScreen('visit-history')}
                className="text-xs font-semibold text-slate-600 hover:text-slate-900 flex items-center space-x-1"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Visit Records</span>
              </button>

              <button
                onClick={() => handleStartVisitFor(b)}
                className="flex items-center space-x-1.5 bg-teal-700 hover:bg-teal-800 text-white px-3.5 py-2 rounded-xl text-xs font-bold transition shadow-2xs active:scale-95"
              >
                <Mic className="w-3.5 h-3.5" />
                <span>Start Home Visit</span>
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
