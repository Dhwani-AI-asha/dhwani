import React, { useState, useEffect } from 'react';
import { 
  ArrowLeft, 
  ArrowRight, 
  Check, 
  AlertTriangle, 
  Pencil, 
  Calendar, 
  ShieldAlert, 
  HeartPulse, 
  Pill, 
  Activity, 
  Plus, 
  Volume2,
  Mic,
  RotateCcw,
  Sparkles,
  CheckCircle2
} from 'lucide-react';
import { useApp } from '../../context/AppContext';

export const VerifyStructuredRecord: React.FC = () => {
  const { 
    activeBeneficiary, 
    activeVisit, 
    setActiveVisit, 
    setCurrentScreen,
    startReadBack,
    isReadBackActive,
    stopReadBack,
    triggerDangerSign
  } = useApp();

  // Local state for inline edits (kept in sync with voice corrections in activeVisit)
  const [editingSys, setEditingSys] = useState<string>(
    activeVisit.vitals.systolic != null ? String(activeVisit.vitals.systolic) : ''
  );
  const [editingDia, setEditingDia] = useState<string>(
    activeVisit.vitals.diastolic != null ? String(activeVisit.vitals.diastolic) : ''
  );
  const [editingWeight, setEditingWeight] = useState<string>(
    activeVisit.vitals.weight != null ? String(activeVisit.vitals.weight) : ''
  );

  useEffect(() => {
    setEditingSys(activeVisit.vitals.systolic != null ? String(activeVisit.vitals.systolic) : '');
    setEditingDia(activeVisit.vitals.diastolic != null ? String(activeVisit.vitals.diastolic) : '');
    setEditingWeight(activeVisit.vitals.weight != null ? String(activeVisit.vitals.weight) : '');
  }, [activeVisit.vitals.systolic, activeVisit.vitals.diastolic, activeVisit.vitals.weight]);

  const handleBpUpdate = (sysStr: string, diaStr: string) => {
    setEditingSys(sysStr);
    setEditingDia(diaStr);
    const sysVal = sysStr.trim() === '' ? null : Number(sysStr);
    const diaVal = diaStr.trim() === '' ? null : Number(diaStr);
    setActiveVisit(prev => ({
      ...prev,
      vitals: {
        ...prev.vitals,
        systolic: sysVal != null && !Number.isNaN(sysVal) ? sysVal : null,
        diastolic: diaVal != null && !Number.isNaN(diaVal) ? diaVal : null,
      },
      confirmedFields: { ...(prev.confirmedFields || {}), blood_pressure: true },
    }));
  };

  const handleWeightUpdate = (wStr: string) => {
    setEditingWeight(wStr);
    const wVal = wStr.trim() === '' ? null : Number(wStr);
    setActiveVisit(prev => ({
      ...prev,
      vitals: { ...prev.vitals, weight: wVal != null && !Number.isNaN(wVal) ? wVal : null },
      confirmedFields: { ...(prev.confirmedFields || {}), weight: true },
    }));
  };

  const displayName = activeVisit.beneficiary?.name?.trim() || activeBeneficiary.name?.trim() || 'Name not provided';
  const displayAge = activeVisit.patientAge || (activeBeneficiary.age != null ? `${activeBeneficiary.age}` : 'Not provided');
  const extractedSymptoms = activeVisit.extractedSymptoms || [];
  const dangerSigns = Array.isArray((activeVisit.structuredReport as any)?.danger_signs)
    ? ((activeVisit.structuredReport as any).danger_signs as Array<{ sign?: string; evidence?: string }>)
    : [];

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-6">
      {/* Step Header */}
      <div className="space-y-1">
        <div className="flex items-center space-x-2 text-xs text-slate-500">
          <button 
            onClick={() => setCurrentScreen('review-transcript')}
            className="hover:text-slate-800 flex items-center space-x-1"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Review Transcript</span>
          </button>
          <span>/</span>
          <span className="font-semibold text-teal-800 uppercase tracking-wider text-[11px]">
            STEP 2 OF 3 • REVIEW
          </span>
          {activeVisit.languageDetected && (
            <>
              <span>•</span>
              <span className="text-slate-500">{activeVisit.languageDetected}</span>
            </>
          )}
          {activeVisit.audioDurationText && (
            <>
              <span>•</span>
              <span className="text-slate-500">{activeVisit.audioDurationText}</span>
            </>
          )}
        </div>

        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
          Verify Structured Visit Record
        </h1>
        <p className="text-xs text-slate-500">
          DHWANI has parsed and extracted clinical parameters from your spoken conversation. Review and adjust any field below before committing to the Rampur Block Primary Health Centre registry.
        </p>
      </div>

      {/* Beneficiary Header Strip */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center space-x-3.5">
          <img
            src={activeBeneficiary.photoUrl || "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150&auto=format&fit=crop&q=80"}
            alt={activeBeneficiary.name}
            className="w-12 h-12 rounded-full object-cover border border-slate-200"
          />
          <div>
            <div className="flex items-center space-x-2">
              <h3 className="text-base font-bold text-slate-900">{displayName}</h3>
              {activeVisit.lastCorrectedField === 'Beneficiary Name' && (
                <span className="bg-emerald-100 text-emerald-800 border border-emerald-300 text-[10px] font-bold px-2 py-0.2 rounded-full">
                  Voice Updated ✓
                </span>
              )}
              <span className="text-xs text-slate-400 font-medium">RCH ID: {activeBeneficiary.rchId || 'Not provided'}</span>
              <span className="text-xs text-slate-500">Age: {displayAge}</span>
            </div>
            <div className="flex items-center space-x-2 text-xs text-slate-500 mt-0.5">
              <span className="text-slate-700 font-medium">{activeVisit.visitType || 'Visit type: Not provided'}</span>
              {activeVisit.lastCorrectedField === 'Visit Type' && (
                <span className="bg-emerald-100 text-emerald-800 border border-emerald-300 text-[10px] font-bold px-2 py-0.2 rounded-full">
                  Voice Updated ✓
                </span>
              )}
              <span>•</span>
              <span>EDD: {activeBeneficiary.edd || 'Not provided'}</span>
              <span>•</span>
              <span>{activeVisit.visitDate || 'Not provided'}</span>
            </div>
          </div>
        </div>

        {/* Extraction Key Legend */}
        <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
          <span className="text-[11px] text-slate-400 font-bold uppercase tracking-wider mr-1">
            EXTRACTION KEY:
          </span>
          <span className="bg-emerald-50 text-emerald-800 border border-emerald-200 px-2.5 py-0.5 rounded-full flex items-center space-x-1">
            <Check className="w-3 h-3 text-emerald-600" />
            <span>Confirmed from speech</span>
          </span>
          <span className="bg-red-50 text-red-700 border border-red-200 px-2.5 py-0.5 rounded-full flex items-center space-x-1">
            <AlertTriangle className="w-3 h-3 text-red-500" />
            <span>Needs verification</span>
          </span>
          <span className="bg-slate-100 text-slate-600 px-2.5 py-0.5 rounded-full">
            Optional / Missing
          </span>
        </div>
      </div>

      {/* Voice Read-back & Verification Banner */}
      <div className="bg-gradient-to-r from-teal-50 via-emerald-50 to-teal-50 border border-teal-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
        <div className="flex items-center space-x-3">
          <div className="w-9 h-9 rounded-xl bg-teal-700 text-white flex items-center justify-center shrink-0 shadow-sm">
            <Volume2 className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-teal-950 flex items-center space-x-2">
              <span>Feature 2: Spoken Report Read-Back & Voice Correction</span>
              <span className="bg-teal-200/70 text-teal-800 text-[10px] px-2 py-0.2 rounded-full font-semibold">
                Hands-Free Audio
              </span>
            </h4>
            <p className="text-[11px] text-teal-800 mt-0.5">
              Read structured visit summary aloud. Supports verbal corrections to weight, name, visit type, vaccines, and next date.
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2 shrink-0">
          <button
            onClick={() => startReadBack()}
            className="flex items-center space-x-1.5 bg-teal-700 hover:bg-teal-800 text-white px-4 py-2 rounded-xl text-xs font-bold shadow-sm transition active:scale-95"
          >
            <Volume2 className="w-3.5 h-3.5" />
            <span>Read Report Aloud (सुनें)</span>
          </button>

          <div className="hidden lg:flex items-center space-x-1 text-[11px] font-semibold text-slate-500 bg-white px-2.5 py-1.5 rounded-lg border border-slate-200">
            <Mic className="w-3 h-3 text-teal-600" />
            <span>Barge-in ready</span>
          </div>
        </div>
      </div>

      {/* Feature 3 Quick Test Bar */}
      <div className="bg-red-50/70 border border-red-200 rounded-2xl p-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
        <div className="flex items-center space-x-2.5">
          <ShieldAlert className="w-4 h-4 text-red-600 shrink-0" />
          <div>
            <span className="font-bold text-red-950">Feature 3 Demo: Immediate Danger-Sign Voice Alert</span>
            <span className="text-[11px] text-red-800 block">
              Interrupts any read-back, speaks urgent warning, and requires mandatory ASHA acknowledgement.
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            onClick={() => triggerDangerSign('DS-BLEEDING')}
            className="bg-red-600 hover:bg-red-700 text-white font-bold px-3 py-1.5 rounded-lg transition text-xs shadow-2xs"
          >
            🚨 Bleeding Alert
          </button>
          <button
            onClick={() => triggerDangerSign('DS-PREECLAMPSIA')}
            className="bg-red-100 hover:bg-red-200 text-red-800 font-bold px-3 py-1.5 rounded-lg border border-red-300 transition text-xs"
          >
            ⚠️ Pre-Eclampsia
          </button>
          <button
            onClick={() => triggerDangerSign('DS-NEWBORN-FEVER')}
            className="bg-red-100 hover:bg-red-200 text-red-800 font-bold px-3 py-1.5 rounded-lg border border-red-300 transition text-xs"
          >
            👶 Newborn Fever
          </button>
        </div>
      </div>

      {/* 4 Quadrants Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Quadrant 1: Maternal Vitals & Clinical Measurements */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center space-x-2">
              <div className="w-7 h-7 rounded-lg bg-teal-50 text-teal-700 flex items-center justify-center">
                <HeartPulse className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-xs font-bold text-slate-900">
                  1. Maternal Vitals & Clinical Measurements
                </h3>
                <p className="text-[10px] text-slate-400">Measured during visit • Speech verified</p>
              </div>
            </div>
            <span className="text-[11px] font-semibold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-full">
              4 of 4 Captured
            </span>
          </div>

          <div className="space-y-3.5">
            {/* Blood Pressure */}
            <div className="p-3 bg-slate-50/70 rounded-xl border border-slate-200/70 space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-700">
                  Blood Pressure (Systolic / Diastolic) <span className="font-normal text-slate-400">mmHg</span>
                </span>
                {activeVisit.lastCorrectedField === 'Blood Pressure' ? (
                  <span className="bg-emerald-100 text-emerald-800 border border-emerald-300 text-[10px] font-bold px-2 py-0.5 rounded-full">
                    Voice Updated ✓
                  </span>
                ) : (
                  <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-full">
                    Confirmed
                  </span>
                )}
              </div>
              <div className="flex items-center space-x-2">
                <div className="flex items-center space-x-1">
                  <span className="text-[10px] font-bold text-slate-400">SYS</span>
                  <input
                    type="number"
                    placeholder="—"
                    value={editingSys}
                    onChange={(e) => handleBpUpdate(e.target.value, editingDia)}
                    className="w-16 bg-white border border-slate-300 rounded-lg px-2 py-1 text-sm font-bold text-slate-900 text-center focus:ring-1 focus:ring-teal-600 focus:outline-none"
                  />
                </div>
                <span className="text-slate-400 text-base">/</span>
                <div className="flex items-center space-x-1">
                  <span className="text-[10px] font-bold text-slate-400">DIA</span>
                  <input
                    type="number"
                    placeholder="—"
                    value={editingDia}
                    onChange={(e) => handleBpUpdate(editingSys, e.target.value)}
                    className="w-16 bg-white border border-slate-300 rounded-lg px-2 py-1 text-sm font-bold text-slate-900 text-center focus:ring-1 focus:ring-teal-600 focus:outline-none"
                  />
                </div>
                <Pencil className="w-3.5 h-3.5 text-slate-400 ml-auto cursor-pointer hover:text-slate-600" />
              </div>
              <p className="text-[10px] text-slate-500 font-medium">
                {activeVisit.vitals.systolic != null && activeVisit.vitals.diastolic != null
                  ? `Recorded: ${activeVisit.vitals.systolic}/${activeVisit.vitals.diastolic} mmHg`
                  : 'BP: Not provided in transcript'}
              </p>
            </div>

            {/* Pulse Rate & Maternal Weight Row */}
            <div className="grid grid-cols-2 gap-3">
              {/* Pulse Rate */}
              <div className="p-3 bg-slate-50/70 rounded-xl border border-slate-200/70 space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-700">Pulse Rate</span>
                  <span className="text-[10px] font-bold text-slate-600 bg-slate-100 px-1.5 py-0.2 rounded">
                    {activeVisit.vitals.pulseStatus || 'Not provided'}
                  </span>
                </div>
                <div className="flex items-baseline space-x-1">
                  <span className="text-lg font-bold text-slate-900">
                    {activeVisit.vitals.pulseRate != null ? activeVisit.vitals.pulseRate : 'Not provided'}
                  </span>
                  {activeVisit.vitals.pulseRate != null && (
                    <span className="text-xs text-slate-500">bpm</span>
                  )}
                </div>
              </div>

              {/* Maternal Weight */}
              <div className="p-3 bg-slate-50/70 rounded-xl border border-slate-200/70 space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-700">Maternal Weight</span>
                  {activeVisit.lastCorrectedField === 'Maternal Weight' ? (
                    <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100 border border-emerald-300 px-1.5 py-0.2 rounded">
                      Voice Updated ✓
                    </span>
                  ) : (
                    <span className="text-[10px] font-bold text-slate-600 bg-slate-100 px-1.5 py-0.2 rounded">
                      {activeVisit.vitals.weight != null ? 'Speech' : 'Not provided'}
                    </span>
                  )}
                </div>
                <div className="flex items-baseline space-x-1">
                  <input
                    type="number"
                    placeholder="Not provided"
                    value={editingWeight}
                    onChange={(e) => handleWeightUpdate(e.target.value)}
                    className="w-24 bg-white border border-slate-300 rounded px-1.5 py-0.5 text-xs font-bold text-slate-900 text-center"
                  />
                  {activeVisit.vitals.weight != null && (
                    <span className="text-xs text-slate-500">kg</span>
                  )}
                </div>
                <p className="text-[10px] text-slate-500 font-medium">
                  {activeVisit.vitals.weight != null ? `${activeVisit.vitals.weight} kg recorded` : 'Weight not provided'}
                </p>
              </div>
            </div>

            {/* Gestational Age & Next Visit Date */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="p-3 bg-slate-50/70 rounded-xl border border-slate-200/70 flex items-center justify-between">
                <div>
                  <span className="text-xs font-semibold text-slate-700 block">Gestational Age</span>
                  <span className="text-[10px] text-slate-400">
                    LMP: {activeVisit.vitals.lmpDate || 'Not provided'}
                  </span>
                </div>
                <span className="text-xs font-bold text-slate-800 bg-slate-100 px-2 py-1 rounded-lg">
                  {activeVisit.vitals.gestationalAgeWeeks != null
                    ? `${activeVisit.vitals.gestationalAgeWeeks} Weeks`
                    : 'Not provided'}
                </span>
              </div>

              <div className="p-3 bg-slate-50/70 rounded-xl border border-slate-200/70 flex items-center justify-between">
                <div>
                  <div className="flex items-center space-x-1.5">
                    <span className="text-xs font-semibold text-slate-700 block">Next Visit Date</span>
                    {activeVisit.lastCorrectedField === 'Next Visit Date' && (
                      <span className="text-[9px] font-bold text-emerald-800 bg-emerald-100 px-1 rounded">
                        Updated ✓
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] text-slate-400">Scheduled Follow-up</span>
                </div>
                <div className="flex items-center space-x-1 text-xs font-bold text-slate-800 bg-slate-100 px-2 py-1 rounded-lg">
                  <Calendar className="w-3 h-3 text-slate-600" />
                  <span>{activeVisit.nextVisitDate || 'Not provided'}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Quadrant 3: Medications & Nutrition */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center space-x-2">
              <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center">
                <Pill className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-xs font-bold text-slate-900">
                  3. Medications & Nutrition
                </h3>
                <p className="text-[10px] text-slate-400">Daily adherence & stock tracker</p>
              </div>
            </div>
          </div>

          <div className="space-y-3.5">
            {/* IFA Compliance */}
            <div className="p-3 bg-slate-50/70 rounded-xl border border-slate-200/70 flex items-center justify-between">
              <div className="space-y-0.5">
                <div className="flex items-center space-x-2">
                  <span className="text-xs font-bold text-slate-800">IFA Tablets</span>
                  <span className="text-[10px] font-bold text-slate-600 bg-slate-100 px-1.5 py-0.2 rounded">
                    {activeVisit.medications.ifaTablets.source || 'Not provided'}
                  </span>
                </div>
                <p className="text-xs text-slate-600 font-medium">
                  {activeVisit.medications.ifaTablets.takingRegularly != null
                    ? `${activeVisit.medications.ifaTablets.takingRegularly ? 'Taking regularly' : 'Irregular'}${activeVisit.medications.ifaTablets.remainingTabs != null ? ` • ${activeVisit.medications.ifaTablets.remainingTabs} tabs remaining` : ''}`
                    : 'Not provided'}
                </p>
              </div>
            </div>

            {/* Calcium Tablets */}
            <div className="p-3 bg-slate-50/70 rounded-xl border border-slate-200/70 flex items-center justify-between">
              <div className="space-y-0.5">
                <span className="text-xs font-bold text-slate-800 block">Calcium / Other Medications</span>
                <p className="text-xs text-slate-600">
                  {activeVisit.medications.calciumTablets.status || 'Not provided'}
                </p>
              </div>
            </div>

            {/* Diet & Nutrition Advice */}
            <div className="p-3 bg-slate-50/70 rounded-xl border border-slate-200/70 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-800">Diet & Nutrition Notes</span>
                <span className="text-[10px] font-bold text-slate-600 bg-slate-100 px-1.5 py-0.2 rounded">
                  {activeVisit.medications.dietAdvice.advised ? 'Recorded' : 'Not provided'}
                </span>
              </div>
              <p className="text-xs text-slate-600 leading-normal">
                {activeVisit.medications.dietAdvice.description || 'Not provided'}
              </p>
            </div>
          </div>
        </div>

        {/* Quadrant 2: Symptoms & Clinical Observations */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center space-x-2">
              <div className="w-7 h-7 rounded-lg bg-red-50 text-red-600 flex items-center justify-center">
                <Activity className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-xs font-bold text-slate-900">
                  2. Symptoms & Clinical Observations
                </h3>
                <p className="text-[10px] text-slate-400">
                  {extractedSymptoms.length > 0
                    ? `${extractedSymptoms.length} extracted from transcript`
                    : 'No symptoms stated in transcript'}
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            {extractedSymptoms.length > 0 ? (
              extractedSymptoms.map((sym, idx) => (
                <div key={`${sym.name}-${idx}`} className="p-3 bg-slate-50/70 rounded-xl border border-slate-200/70 space-y-1 text-xs">
                  <div className="font-bold text-slate-900">{sym.name}</div>
                  <div className="text-[11px] text-slate-600">
                    Duration: {sym.duration || 'Not provided'} • Severity: {sym.severity || 'Not provided'} • Site: {sym.body_site || 'Not provided'}
                  </div>
                  {sym.notes && <p className="text-[11px] text-slate-500">{sym.notes}</p>}
                </div>
              ))
            ) : (
              <div className="p-3 bg-slate-50/70 rounded-xl border border-slate-200/70 text-xs text-slate-500">
                Symptoms: Not provided in transcript.
              </div>
            )}

            {dangerSigns.length > 0 && (
              <div className="p-3 bg-red-50/60 rounded-xl border border-red-200/80 space-y-1 text-xs">
                <div className="font-bold text-red-900 flex items-center space-x-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-red-600" />
                  <span>Danger Signs Detected</span>
                </div>
                {dangerSigns.map((ds, i) => (
                  <p key={i} className="text-red-800">
                    {ds.sign || 'Warning'} {ds.evidence ? `(Evidence: "${ds.evidence}")` : ''}
                  </p>
                ))}
              </div>
            )}

            {activeVisit.missingInformation && activeVisit.missingInformation.length > 0 && (
              <div className="p-3 bg-amber-50/70 rounded-xl border border-amber-200/80 space-y-1 text-xs">
                <div className="font-bold text-amber-900">Information to confirm</div>
                <ul className="list-disc list-inside text-[11px] text-amber-900 space-y-0.5">
                  {activeVisit.missingInformation.map((m, idx) => (
                    <li key={`${m.field_name}-${idx}`}>
                      <span className="font-semibold">{m.field_name}:</span> {m.prompt_question || m.reason || 'Not provided'}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>

        {/* Quadrant 4: Immunization & Lab Status */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center space-x-2">
              <div className="w-7 h-7 rounded-lg bg-teal-50 text-teal-700 flex items-center justify-center">
                <ShieldAlert className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-xs font-bold text-slate-900">
                  4. Immunization & Lab Status
                </h3>
                <p className="text-[10px] text-slate-400">Source-verified visit immunization details</p>
              </div>
            </div>
          </div>

          <div className="space-y-3.5">
            {/* Vaccination & Booster Status */}
            <div className="p-3 bg-slate-50/70 rounded-xl border border-slate-200/70 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-800">Vaccination Status</span>
                {(activeVisit.lastCorrectedField === 'Vaccination TT Booster' || activeVisit.lastCorrectedField === 'Vaccination Status') && (
                  <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100 border border-emerald-300 px-1.5 py-0.2 rounded">
                    Voice Updated ✓
                  </span>
                )}
              </div>
              <p className="text-xs font-semibold text-slate-800">
                {activeVisit.vaccinationStatus || 'Not provided'}
              </p>
              <p className="text-[11px] text-slate-500">
                Booster status: {activeVisit.boosterStatus || 'Not provided'} • Dose number: {activeVisit.doseNumber || 'Not provided'}
              </p>
            </div>

            {/* Hemoglobin */}
            <div className="p-3 bg-slate-50/70 rounded-xl border border-slate-200/70 flex items-center justify-between">
              <div>
                <div className="flex items-center space-x-2">
                  <span className="text-xs font-bold text-slate-800">Hemoglobin (Hb)</span>
                  <span className="text-xs font-semibold text-slate-700 bg-slate-100 px-2 py-0.2 rounded">
                    {activeVisit.immunizationLab.hemoglobin.value != null
                      ? `${activeVisit.immunizationLab.hemoglobin.value} ${activeVisit.immunizationLab.hemoglobin.unit || 'g/dL'}`
                      : 'Not provided'}
                  </span>
                </div>
              </div>
            </div>

            {dangerSigns.length > 0 && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-start space-x-3">
                <div className="w-6 h-6 rounded-lg bg-red-600 text-white flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                  !
                </div>
                <div>
                  <h4 className="text-xs font-bold text-red-950">Clinical Red-Flag Review Recommended</h4>
                  <p className="text-[11px] text-red-800 mt-0.5 leading-normal">
                    Danger sign detected in transcript requires qualified medical evaluation.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Footer Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-2 border-t border-slate-200/80">
        <div className="flex items-center space-x-2 text-xs text-slate-500">
          <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
          <span>Draft saved to local device cache</span>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={() => setCurrentScreen('dashboard')}
            className="text-xs font-semibold text-slate-500 hover:text-slate-800 px-4 py-2.5 transition"
          >
            Discard
          </button>
          <button
            onClick={() => setCurrentScreen('clinical-alerts')}
            className="flex items-center space-x-2 bg-teal-700 hover:bg-teal-800 text-white px-6 py-3 rounded-xl text-xs font-bold shadow-md shadow-teal-900/10 transition active:scale-95"
          >
            <span>Check Clinical Alerts & Continue</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
