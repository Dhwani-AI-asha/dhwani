import React, { useState } from 'react';
import { 
  Search, 
  Calendar, 
  FileText, 
  Download, 
  RotateCcw, 
  AlertTriangle, 
  CheckCircle2, 
  FileAudio,
  Eye,
  AlertOctagon
} from 'lucide-react';
import { useApp } from '../../context/AppContext';

export const VisitHistory: React.FC = () => {
  const { 
    visitHistory, 
    setIsReferralModalOpen,
    setCurrentScreen 
  } = useApp();

  const [activeFilter, setActiveFilter] = useState<'all' | 'alert' | 'anc' | 'immunization' | 'ncd'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredVisits = visitHistory.filter((item) => {
    // Search
    const matchesSearch = 
      item.beneficiaryName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.rchId.toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesSearch) return false;

    if (activeFilter === 'alert') return item.isAlert;
    if (activeFilter === 'anc') return item.category === 'anc';
    if (activeFilter === 'immunization') return item.category === 'immunization';
    if (activeFilter === 'ncd') return item.category === 'ncd';
    return true;
  });

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-6">
      {/* Header & Stats */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
            WARD 4 HOUSEHOLD LOG
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Household Visit History
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Searchable log of recorded household visits in Rampur Ward 4.
          </p>
        </div>

        {/* 3 Metric counters */}
        <div className="flex items-center space-x-3 text-center">
          <div className="bg-white border border-slate-200 rounded-xl px-4 py-2 shadow-2xs">
            <span className="text-xs text-slate-500 block">Visits (Oct)</span>
            <span className="text-lg font-bold text-slate-900">28</span>
          </div>
          <div className="bg-red-50/70 border border-red-200 rounded-xl px-4 py-2 shadow-2xs">
            <span className="text-xs text-red-600 block font-medium">Critical Alerts</span>
            <span className="text-lg font-bold text-red-700">4</span>
          </div>
          <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl px-4 py-2 shadow-2xs">
            <span className="text-xs text-emerald-700 block font-medium">PHC Synced</span>
            <span className="text-lg font-bold text-emerald-800">100%</span>
          </div>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-sm space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Search box */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by beneficiary name or RCH ID... (e.g. Pooja, Meena, #9842)"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-50/70 border border-slate-200 rounded-xl pl-10 pr-4 py-2 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-teal-700"
            />
          </div>

          {/* Month selector */}
          <div className="flex items-center space-x-2 text-xs font-semibold text-slate-700 bg-slate-50 border border-slate-200 px-3.5 py-2 rounded-xl shrink-0 cursor-pointer">
            <Calendar className="w-3.5 h-3.5 text-slate-500" />
            <span>This Month (October 2024)</span>
          </div>
        </div>

        {/* Filter Pills */}
        <div className="flex flex-wrap items-center gap-2 pt-1 text-xs font-semibold">
          <button
            onClick={() => setActiveFilter('all')}
            className={`px-3 py-1.5 rounded-lg transition ${
              activeFilter === 'all'
                ? 'bg-teal-700 text-white shadow-2xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            All Visits (28)
          </button>

          <button
            onClick={() => setActiveFilter('alert')}
            className={`px-3 py-1.5 rounded-lg flex items-center space-x-1.5 transition ${
              activeFilter === 'alert'
                ? 'bg-red-600 text-white shadow-2xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-red-500"></span>
            <span>High Priority / Alerts (4)</span>
          </button>

          <button
            onClick={() => setActiveFilter('anc')}
            className={`px-3 py-1.5 rounded-lg transition ${
              activeFilter === 'anc'
                ? 'bg-teal-700 text-white shadow-2xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            ANC Visits (12)
          </button>

          <button
            onClick={() => setActiveFilter('immunization')}
            className={`px-3 py-1.5 rounded-lg transition ${
              activeFilter === 'immunization'
                ? 'bg-teal-700 text-white shadow-2xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Immunization (9)
          </button>

          <button
            onClick={() => setActiveFilter('ncd')}
            className={`px-3 py-1.5 rounded-lg transition ${
              activeFilter === 'ncd'
                ? 'bg-teal-700 text-white shadow-2xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            NCD / Chronic (3)
          </button>
        </div>
      </div>

      {/* Visit Records List */}
      <div className="space-y-3.5">
        {filteredVisits.map((item) => (
          <div
            key={item.id}
            className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-sm hover:border-slate-300 transition space-y-3"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center space-x-3.5">
                <div className={`w-11 h-11 rounded-full flex items-center justify-center font-bold text-sm shrink-0 relative ${
                  item.isAlert
                    ? 'bg-red-50 text-red-700 border border-red-200'
                    : 'bg-slate-100 text-slate-700 border border-slate-200'
                }`}>
                  {item.beneficiaryName.slice(0, 2).toUpperCase()}
                  {item.isAlert && (
                    <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-600 text-white rounded-full flex items-center justify-center text-[10px] font-bold">
                      !
                    </span>
                  )}
                </div>

                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-bold text-slate-900">
                      {item.beneficiaryName || 'Name not provided'}
                    </h3>
                    {item.spouseName && (
                      <span className="text-xs text-slate-400">
                        ({item.spouseName.includes('Child') ? item.spouseName : `W/o ${item.spouseName}`})
                      </span>
                    )}
                    <span className="text-xs text-slate-400">
                      • Age: {item.age != null ? item.age : 'Not provided'}
                    </span>
                    <span className="bg-teal-50 text-teal-800 text-[11px] font-semibold px-2 py-0.2 rounded border border-teal-200">
                      {item.visitType || 'Not provided'}
                    </span>
                    {item.rchId && (
                      <span className="text-xs text-slate-400 font-medium">RCH ID: {item.rchId}</span>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 mt-1">
                    <span className="flex items-center space-x-1 text-slate-600">
                      <FileAudio className="w-3.5 h-3.5 text-slate-400" />
                      <span>{item.audioDuration}</span>
                    </span>
                    <span>•</span>
                    <span className="text-slate-600">{item.vitalsSummary}</span>
                  </div>
                </div>
              </div>

              {/* Status and Action Buttons */}
              <div className="flex flex-col items-end space-y-2 shrink-0 self-end sm:self-auto">
                <div className="flex items-center space-x-2 text-xs">
                  <span className="text-slate-400">{item.timestampText}</span>
                  <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                    item.isAlert
                      ? 'bg-red-100 text-red-800'
                      : 'bg-emerald-100 text-emerald-800'
                  }`}>
                    ● {item.statusBadge}
                  </span>
                </div>

                <div className="flex items-center space-x-2">
                  <button 
                    onClick={() => setCurrentScreen('verify-record')}
                    className="flex items-center space-x-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 px-3 py-1.5 rounded-lg hover:bg-slate-50 transition shadow-2xs"
                  >
                    <Eye className="w-3 h-3 text-slate-400" />
                    <span>View Full Record</span>
                  </button>

                  {item.hasReferralSlip && (
                    <button
                      onClick={() => setIsReferralModalOpen(true)}
                      className="flex items-center space-x-1 bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-lg text-xs font-bold shadow-2xs transition active:scale-95"
                    >
                      <FileText className="w-3 h-3" />
                      <span>* Referral Slip</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Footer pagination & download */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-4 border-t border-slate-200/80 text-xs">
        <div className="flex items-center space-x-2 text-slate-500 font-medium">
          <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
          <span>Showing {filteredVisits.length} of 28 records • All offline records synced with PHC cloud</span>
        </div>

        <div className="flex items-center space-x-3">
          <button className="flex items-center space-x-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 px-3.5 py-2 rounded-xl font-semibold transition">
            <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
            <span>Fetch More Offline Logs</span>
          </button>

          <button className="flex items-center space-x-2 bg-teal-700 hover:bg-teal-800 text-white px-4 py-2 rounded-xl font-bold shadow-sm transition active:scale-95">
            <Download className="w-3.5 h-3.5" />
            <span>Download Monthly Register</span>
          </button>
        </div>
      </div>
    </div>
  );
};
