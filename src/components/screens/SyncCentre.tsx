import React, { useState } from 'react';
import { 
  RefreshCw, 
  Clock, 
  CheckCircle2, 
  AlertCircle, 
  AlertTriangle, 
  Search, 
  Database, 
  Calendar, 
  Wifi, 
  WifiOff, 
  HeartPulse, 
  ChevronDown, 
  ChevronUp, 
  Mic,
  ShieldAlert,
  Info
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { StoredVisitRecord, SyncStatus } from '../../types';

export const SyncCentre: React.FC = () => {
  const { 
    storedVisits, 
    syncCounts, 
    isOnline, 
    startRecording,
    attemptAutoSync,
    isSyncing,
    syncError
  } = useApp();

  const [filter, setFilter] = useState<'all' | 'attention' | 'pending' | 'failed' | 'syncing' | 'synced'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Filter stored visits based on active tab and search query
  const filteredVisits = storedVisits.filter((record) => {
    // Tab filter
    if (filter === 'attention' && record.syncStatus !== 'pending' && record.syncStatus !== 'failed') {
      return false;
    }
    if (filter === 'pending' && record.syncStatus !== 'pending') return false;
    if (filter === 'failed' && record.syncStatus !== 'failed') return false;
    if (filter === 'syncing' && record.syncStatus !== 'syncing') return false;
    if (filter === 'synced' && record.syncStatus !== 'synced') return false;

    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const name = (record.visitData?.beneficiary?.name || '').toLowerCase();
      const rch = (record.visitData?.beneficiary?.rchId || '').toLowerCase();
      const village = (record.visitData?.beneficiary?.village || '').toLowerCase();
      return name.includes(q) || rch.includes(q) || village.includes(q);
    }

    return true;
  });

  const toggleExpand = (id: string) => {
    setExpandedId(prev => (prev === id ? null : id));
  };

  const formatTimestamp = (isoString?: string) => {
    if (!isoString) return 'Date not specified';
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    return d.toLocaleString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const renderStatusBadge = (status: SyncStatus) => {
    switch (status) {
      case 'pending':
        return (
          <span className="inline-flex items-center space-x-1.5 bg-amber-50 text-amber-800 border border-amber-200 px-2.5 py-1 rounded-full text-xs font-semibold">
            <Clock className="w-3.5 h-3.5 text-amber-600" />
            <span>Pending Sync (लंबित)</span>
          </span>
        );
      case 'syncing':
        return (
          <span className="inline-flex items-center space-x-1.5 bg-blue-50 text-blue-800 border border-blue-200 px-2.5 py-1 rounded-full text-xs font-semibold">
            <RefreshCw className="w-3.5 h-3.5 text-blue-600 animate-spin" />
            <span>Syncing (सिंक जारी)</span>
          </span>
        );
      case 'synced':
        return (
          <span className="inline-flex items-center space-x-1.5 bg-emerald-50 text-emerald-800 border border-emerald-200 px-2.5 py-1 rounded-full text-xs font-semibold">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            <span>Synced (सफल)</span>
          </span>
        );
      case 'failed':
        return (
          <span className="inline-flex items-center space-x-1.5 bg-red-50 text-red-800 border border-red-200 px-2.5 py-1 rounded-full text-xs font-semibold">
            <AlertCircle className="w-3.5 h-3.5 text-red-600" />
            <span>Sync Failed (विफल)</span>
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-6">
      {/* Header with Title & Network Connectivity Indicator */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="text-xs text-slate-500 font-medium">
            Dashboard / <span className="text-slate-800 font-semibold">Sync Centre</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center space-x-2.5 mt-1">
            <span>Sync Centre</span>
            <span className="text-sm font-normal text-slate-500 font-['Noto_Sans_Devanagari',sans-serif]">
              (स्थानीय डेटा सिंक केंद्र)
            </span>
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Monitor and inspect visits stored locally in device IndexedDB awaiting synchronisation.
          </p>
        </div>

        {/* Network status chip & Sync Button */}
        <div className="flex flex-wrap items-center gap-2.5 text-xs font-semibold self-start md:self-auto">
          {isOnline ? (
            <div className="flex items-center space-x-2 bg-emerald-50 text-emerald-800 border border-emerald-200 px-3 py-1.5 rounded-xl shadow-2xs">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <Wifi className="w-3.5 h-3.5 text-emerald-600" />
              <span>Device Online (Network Available)</span>
            </div>
          ) : (
            <div className="flex items-center space-x-2 bg-amber-50 text-amber-900 border border-amber-300 px-3 py-1.5 rounded-xl shadow-2xs">
              <span className="w-2 h-2 rounded-full bg-amber-500"></span>
              <WifiOff className="w-3.5 h-3.5 text-amber-700" />
              <span>Offline Mode (IndexedDB Active)</span>
            </div>
          )}

          {isOnline && (
            <button
              onClick={() => attemptAutoSync()}
              disabled={isSyncing}
              className="flex items-center space-x-1.5 bg-teal-700 hover:bg-teal-800 disabled:opacity-50 text-white px-3.5 py-1.5 rounded-xl shadow-2xs transition active:scale-95"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>{isSyncing ? 'Syncing...' : 'Sync Pending Records'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Stage 2 Informational Banner */}
      <div className="bg-sky-50 border border-sky-200 rounded-2xl p-4 flex items-start space-x-3 text-xs text-sky-900 shadow-2xs">
        <Info className="w-4 h-4 text-sky-700 shrink-0 mt-0.5" />
        <div className="space-y-0.5">
          <span className="font-bold">Offline Field Mode (Stage 2):</span>
          <p className="text-sky-800 leading-relaxed">
            All confirmed visits are safely preserved in on-device IndexedDB with transactional guarantees.
            Records awaiting synchronisation are tracked below. Automated background syncing with the PHC server will run in Stage 3.
          </p>
        </div>
      </div>

      {/* 4 Summary Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Awaiting Sync (Pending + Failed) */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-sm flex items-center space-x-3.5">
          <div className="w-11 h-11 rounded-xl bg-amber-50 text-amber-700 border border-amber-200 flex items-center justify-center shrink-0">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xl font-bold text-slate-900">{syncCounts.totalRequiringAttention}</div>
            <div className="text-[11px] font-medium text-slate-500">Awaiting Sync (लंबित/विफल)</div>
          </div>
        </div>

        {/* Syncing */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-sm flex items-center space-x-3.5">
          <div className="w-11 h-11 rounded-xl bg-blue-50 text-blue-700 border border-blue-200 flex items-center justify-center shrink-0">
            <RefreshCw className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xl font-bold text-slate-900">{syncCounts.syncing}</div>
            <div className="text-[11px] font-medium text-slate-500">Syncing (प्रक्रियाधीन)</div>
          </div>
        </div>

        {/* Synced */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-sm flex items-center space-x-3.5">
          <div className="w-11 h-11 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xl font-bold text-slate-900">{syncCounts.synced}</div>
            <div className="text-[11px] font-medium text-slate-500">Synced (सिंक पूर्ण)</div>
          </div>
        </div>

        {/* Total Locally Stored */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-sm flex items-center space-x-3.5">
          <div className="w-11 h-11 rounded-xl bg-slate-100 text-slate-700 border border-slate-200 flex items-center justify-center shrink-0">
            <Database className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xl font-bold text-slate-900">{syncCounts.total}</div>
            <div className="text-[11px] font-medium text-slate-500">Total Locally Stored</div>
          </div>
        </div>
      </div>

      {/* Filter Tabs & Search Bar */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-sm space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Filter Pills */}
          <div className="flex flex-wrap items-center gap-1.5 text-xs font-semibold">
            <button
              onClick={() => setFilter('all')}
              className={`px-3 py-1.5 rounded-xl transition ${
                filter === 'all'
                  ? 'bg-teal-700 text-white shadow-2xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              All ({syncCounts.total})
            </button>

            <button
              onClick={() => setFilter('attention')}
              className={`px-3 py-1.5 rounded-xl transition flex items-center space-x-1 ${
                filter === 'attention'
                  ? 'bg-amber-600 text-white shadow-2xs'
                  : 'bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-200'
              }`}
            >
              <span>Awaiting Sync ({syncCounts.totalRequiringAttention})</span>
            </button>

            <button
              onClick={() => setFilter('pending')}
              className={`px-3 py-1.5 rounded-xl transition ${
                filter === 'pending'
                  ? 'bg-teal-700 text-white shadow-2xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Pending ({syncCounts.pending})
            </button>

            {syncCounts.failed > 0 && (
              <button
                onClick={() => setFilter('failed')}
                className={`px-3 py-1.5 rounded-xl transition flex items-center space-x-1 ${
                  filter === 'failed'
                    ? 'bg-red-700 text-white shadow-2xs'
                    : 'bg-red-50 text-red-800 hover:bg-red-100 border border-red-200'
                }`}
              >
                <span>Failed ({syncCounts.failed})</span>
              </button>
            )}

            <button
              onClick={() => setFilter('synced')}
              className={`px-3 py-1.5 rounded-xl transition ${
                filter === 'synced'
                  ? 'bg-teal-700 text-white shadow-2xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Synced ({syncCounts.synced})
            </button>
          </div>

          {/* Search Box */}
          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search beneficiary or RCH ID..."
              className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-teal-700"
            />
          </div>
        </div>
      </div>

      {/* Main Records List / Empty States */}
      <div className="space-y-3">
        {storedVisits.length === 0 ? (
          // Empty State: No visits in IndexedDB yet
          <div className="bg-white rounded-2xl border border-slate-200/80 p-12 text-center shadow-sm space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-teal-50 text-teal-700 border border-teal-200 flex items-center justify-center mx-auto">
              <Database className="w-7 h-7" />
            </div>
            <div className="max-w-md mx-auto space-y-1">
              <h3 className="text-base font-bold text-slate-900">No Locally Stored Visits</h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                When you conduct household field visits, DHWANI saves complete structured clinical records to your device IndexedDB. They will be displayed here awaiting synchronisation.
              </p>
            </div>
            <button
              onClick={startRecording}
              className="inline-flex items-center space-x-2 bg-teal-700 hover:bg-teal-800 text-white px-5 py-2.5 rounded-xl text-xs font-bold shadow-md shadow-teal-900/10 transition"
            >
              <Mic className="w-3.5 h-3.5" />
              <span>Record a New Visit</span>
            </button>
          </div>
        ) : filteredVisits.length === 0 ? (
          // Empty State for specific filter
          <div className="bg-white rounded-2xl border border-slate-200/80 p-10 text-center shadow-sm space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-slate-900">
                {filter === 'attention' || filter === 'pending'
                  ? 'All Stored Visits Are Up-to-Date'
                  : 'No Records Match This Filter'}
              </h3>
              <p className="text-xs text-slate-500">
                {filter === 'attention' || filter === 'pending'
                  ? 'There are currently no visits awaiting synchronisation in this category.'
                  : 'Try clearing the search query or switching to another filter tab.'}
              </p>
            </div>
            {(searchQuery || filter !== 'all') && (
              <button
                onClick={() => {
                  setFilter('all');
                  setSearchQuery('');
                }}
                className="text-xs font-semibold text-teal-700 hover:underline"
              >
                Reset filters
              </button>
            )}
          </div>
        ) : (
          // Records List
          filteredVisits.map((record: StoredVisitRecord) => {
            const beneficiary = record.visitData?.beneficiary;
            const vitals = record.visitData?.vitals;
            const isEscalated = record.visitData?.status === 'ESCALATED';
            const isExpanded = expandedId === record.id;

            return (
              <div
                key={record.id}
                className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm transition hover:border-slate-300 space-y-3"
              >
                {/* Header row: Beneficiary, RCH, Timestamp, Status Badge */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-base font-bold text-slate-900">
                        {beneficiary?.name?.trim() || 'Name not provided'}
                      </h3>
                      {beneficiary?.spouseName && (
                        <span className="text-xs text-slate-500">
                          (W/o {beneficiary.spouseName})
                        </span>
                      )}
                      {beneficiary?.stage && (
                        <span className="bg-teal-50 text-teal-800 border border-teal-200 text-[11px] font-semibold px-2 py-0.5 rounded-full">
                          {beneficiary.stage}
                        </span>
                      )}
                      {isEscalated && (
                        <span className="bg-red-50 text-red-700 border border-red-200 text-[11px] font-bold px-2 py-0.5 rounded-full flex items-center space-x-1">
                          <ShieldAlert className="w-3 h-3 text-red-600" />
                          <span>PHC Referral Flagged</span>
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
                      <span>RCH ID: {beneficiary?.rchId || 'Not provided'}</span>
                      <span>•</span>
                      <span>
                        {beneficiary?.village
                          ? `${beneficiary.village}${beneficiary.gali ? `, ${beneficiary.gali}` : ''}`
                          : 'Location: Not provided'}
                      </span>
                      <span>•</span>
                      <span className="font-medium text-slate-700">
                        Visit type: {record.visitData?.visitType || 'Not provided'}
                      </span>
                    </div>
                  </div>

                  {/* Sync status badge & recorded time */}
                  <div className="flex flex-col sm:items-end space-y-1 shrink-0">
                    <div>{renderStatusBadge(record.syncStatus)}</div>
                    <div className="flex items-center space-x-1 text-[11px] text-slate-400">
                      <Calendar className="w-3 h-3" />
                      <span>Saved: {formatTimestamp(record.createdAt)}</span>
                    </div>
                  </div>
                </div>

                {/* Vitals & Summary Strip */}
                <div className="bg-slate-50/80 rounded-xl p-3 border border-slate-100 flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div className="flex flex-wrap items-center gap-4 text-slate-700 font-medium">
                    <div className="flex items-center space-x-1.5">
                      <HeartPulse className="w-3.5 h-3.5 text-teal-600" />
                      <span>
                        BP:{' '}
                        <strong>
                          {vitals?.systolic != null && vitals?.diastolic != null
                            ? `${vitals.systolic}/${vitals.diastolic} mmHg`
                            : 'Not provided'}
                        </strong>
                      </span>
                    </div>
                    <div>
                      Weight: <strong>{vitals?.weight != null ? `${vitals.weight} kg` : 'Not provided'}</strong>
                    </div>
                    <div>
                      Pulse: <strong>{vitals?.pulseRate != null ? `${vitals.pulseRate} bpm` : 'Not provided'}</strong>
                    </div>
                  </div>

                  <div className="text-[11px] text-slate-500">
                    Local ID: <span className="font-mono text-slate-700">{record.id}</span>
                  </div>
                </div>

                {/* Failed Error Message Callout (when available) */}
                {record.syncStatus === 'failed' && record.lastSyncError && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-800 flex items-start space-x-2.5">
                    <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                    <div className="space-y-0.5">
                      <span className="font-bold text-red-900">Sync Failure Reason (त्रुटि विवरण):</span>
                      <p className="text-red-700 leading-relaxed">{record.lastSyncError}</p>
                    </div>
                  </div>
                )}

                {/* Collapsible Details Toggle */}
                <div className="pt-1 flex items-center justify-between text-xs">
                  <button
                    onClick={() => toggleExpand(record.id)}
                    className="text-teal-700 hover:text-teal-800 font-semibold flex items-center space-x-1 transition"
                  >
                    <span>{isExpanded ? 'Hide Record Details' : 'View Structured Record Details'}</span>
                    {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  </button>

                  <span className="text-[11px] text-slate-400">
                    Sync Attempts: {record.syncAttempts || 0}
                  </span>
                </div>

                {/* Expanded Details Panel */}
                {isExpanded && (
                  <div className="pt-3 border-t border-slate-100 text-xs space-y-2.5 text-slate-700 animate-fadeIn">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="p-2.5 bg-slate-50 rounded-lg">
                        <span className="font-bold text-slate-800 block mb-1">Symptoms Recorded:</span>
                        {record.visitData?.extractedSymptoms && record.visitData.extractedSymptoms.length > 0 ? (
                          <ul className="list-disc list-inside space-y-0.5 text-slate-600">
                            {record.visitData.extractedSymptoms.map((sym, idx) => (
                              <li key={`${sym.name}-${idx}`}>
                                {sym.name}
                                {sym.duration ? ` (${sym.duration})` : ''}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <span className="text-slate-500">Not provided</span>
                        )}
                      </div>

                      <div className="p-2.5 bg-slate-50 rounded-lg">
                        <span className="font-bold text-slate-800 block mb-1">Vaccination & Follow-up:</span>
                        <ul className="list-disc list-inside space-y-0.5 text-slate-600">
                          <li>Vaccination: {record.visitData?.vaccinationStatus || 'Not provided'}</li>
                          <li>Booster Status: {record.visitData?.boosterStatus || 'Not provided'}</li>
                          <li>Next Visit: {record.visitData?.nextVisitDate || 'Not provided'}</li>
                        </ul>
                      </div>
                    </div>

                    {record.visitData?.originalTranscript && (
                      <div className="p-2.5 bg-slate-50 rounded-lg">
                        <span className="font-bold text-slate-800 block mb-0.5">Recorded Speech Transcript:</span>
                        <p className="text-slate-600 font-['Noto_Sans_Devanagari',sans-serif] italic">
                          "{record.visitData.originalTranscript}"
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
