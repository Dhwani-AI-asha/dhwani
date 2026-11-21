import React, { useState } from 'react';
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
  Sparkles
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
    stopReadBack
  } = useApp();

  // Local state for inline edits
  const [editingSys, setEditingSys] = useState(activeVisit.vitals.systolic);
  const [editingDia, setEditingDia] = useState(activeVisit.vitals.diastolic);
  const [editingWeight, setEditingWeight] = useState(activeVisit.vitals.weight);
  const [calciumDispensed, setCalciumDispensed] = useState(false);
  const [headacheConfirmed, setHeadacheConfirmed] = useState(false);

  const handleBpUpdate = (sys: number, dia: number) => {
    setEditingSys(sys);
    setEditingDia(dia);
    setActiveVisit(prev => ({
      ...prev,
      vitals: { ...prev.vitals, systolic: sys, diastolic: dia }
    }));
  };

  const handleWeightUpdate = (w: number) => {
    setEditingWeight(w);
    setActiveVisit(prev => ({
      ...prev,
      vitals: { ...prev.vitals, weight: w }
    }));
  };

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
          <span>•</span>
          <span className="text-slate-500">Voice Processing Complete (Hindi / Awadhi)</span>
          <span>•</span>
          <span className="text-slate-500">Original Voice Note (01:42)</span>
          <span>•</span>
          <span className="text-emerald-700 font-semibold">Confidence 96.4%</span>
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
              <h3 className="text-base font-bold text-slate-900">{activeBeneficiary.name}</h3>
              <span className="text-xs text-slate-400 font-medium">RCH ID: {activeBeneficiary.rchId}</span>
              <span className="text-xs text-slate-500">Age {activeBeneficiary.age}</span>
            </div>
            <div className="flex items-center space-x-2 text-xs text-slate-500 mt-0.5">
              <span className="text-slate-700 font-medium">Antenatal Care Visit #3</span>
              <span>•</span>
              <span>EDD: {activeBeneficiary.edd || '18 Dec 2024'}</span>
              <span>•</span>
              <span>24 Oct 2024</span>
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
              <span>Agent Voice Read-Back & Verification</span>
              <span className="bg-teal-200/70 text-teal-800 text-[10px] px-2 py-0.2 rounded-full font-semibold">
                Hands-Free Audio
              </span>
            </h4>
            <p className="text-[11px] text-teal-800 mt-0.5">
              Listen to the extracted record read aloud in Hindi. Tap "Bol kar sudharein" or speak to correct any field.
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2 shrink-0">
          {isReadBackActive ? (
            <button
              onClick={stopReadBack}
              className="flex items-center space-x-1.5 bg-red-600 hover:bg-red-700 text-white px-3.5 py-2 rounded-xl text-xs font-semibold shadow-sm transition active:scale-95"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Interrupt / Stop Read-Back</span>
            </button>
          ) : (
            <button
              onClick={startReadBack}
              className="flex items-center space-x-1.5 bg-teal-700 hover:bg-teal-800 text-white px-3.5 py-2 rounded-xl text-xs font-semibold shadow-sm transition active:scale-95"
            >
              <Volume2 className="w-3.5 h-3.5" />
              <span>Read Aloud (सुनें)</span>
            </button>
          )}

          <div className="hidden lg:flex items-center space-x-1 text-[11px] font-semibold text-slate-500 bg-white px-2.5 py-1.5 rounded-lg border border-slate-200">
            <Mic className="w-3 h-3 text-teal-600" />
            <span>Voice barge-in ready</span>
          </div>
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
                <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-full">
                  Confirmed
                </span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="flex items-center space-x-1">
                  <span className="text-[10px] font-bold text-slate-400">SYS</span>
                  <input
                    type="number"
                    value={editingSys}
                    onChange={(e) => handleBpUpdate(Number(e.target.value), editingDia)}
                    className="w-16 bg-white border border-slate-300 rounded-lg px-2 py-1 text-sm font-bold text-slate-900 text-center focus:ring-1 focus:ring-teal-600 focus:outline-none"
                  />
                </div>
                <span className="text-slate-400 text-base">/</span>
                <div className="flex items-center space-x-1">
                  <span className="text-[10px] font-bold text-slate-400">DIA</span>
                  <input
                    type="number"
                    value={editingDia}
                    onChange={(e) => handleBpUpdate(editingSys, Number(e.target.value))}
                    className="w-16 bg-white border border-slate-300 rounded-lg px-2 py-1 text-sm font-bold text-slate-900 text-center focus:ring-1 focus:ring-teal-600 focus:outline-none"
                  />
                </div>
                <Pencil className="w-3.5 h-3.5 text-slate-400 ml-auto cursor-pointer hover:text-slate-600" />
              </div>
              <p className="text-[10px] text-amber-700 font-medium">
                ⓘ Mild prehypertension threshold. Previous visit: 118/78 mmHg.
              </p>
            </div>

            {/* Pulse Rate & Maternal Weight Row */}
            <div className="grid grid-cols-2 gap-3">
              {/* Pulse Rate */}
              <div className="p-3 bg-slate-50/70 rounded-xl border border-slate-200/70 space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-700">Pulse Rate</span>
                  <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded">
                    Speech
                  </span>
                </div>
                <div className="flex items-baseline space-x-1">
                  <span className="text-lg font-bold text-slate-900">78</span>
                  <span className="text-xs text-slate-500">bpm</span>
                  <Pencil className="w-3 h-3 text-slate-400 ml-auto cursor-pointer" />
                </div>
                <p className="text-[10px] text-slate-400">Normal resting rhythm</p>
              </div>

              {/* Maternal Weight */}
              <div className="p-3 bg-slate-50/70 rounded-xl border border-slate-200/70 space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-700">Maternal Weight</span>
                  <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded">
                    Speech
                  </span>
                </div>
                <div className="flex items-baseline space-x-1">
                  <input
                    type="number"
                    value={editingWeight}
                    onChange={(e) => handleWeightUpdate(Number(e.target.value))}
                    className="w-14 bg-white border border-slate-300 rounded px-1.5 py-0.5 text-sm font-bold text-slate-900 text-center"
                  />
                  <span className="text-xs text-slate-500">kg</span>
                  <Pencil className="w-3 h-3 text-slate-400 ml-auto cursor-pointer" />
                </div>
                <p className="text-[10px] text-emerald-700 font-medium">+2.0 kg in 4 weeks (Ideal trajectory)</p>
              </div>
            </div>

            {/* Gestational Age */}
            <div className="p-3 bg-slate-50/70 rounded-xl border border-slate-200/70 flex items-center justify-between">
              <div>
                <span className="text-xs font-semibold text-slate-700 block">Gestational Age</span>
                <span className="text-[10px] text-slate-400">Auto-computed from LMP: 14 Mar 2024</span>
              </div>
              <div className="flex items-center space-x-2">
                <span className="text-xs font-bold text-teal-800 bg-teal-100/70 px-2.5 py-1 rounded-lg">
                  32 Weeks
                </span>
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
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
                  <span className="text-xs font-bold text-slate-800">IFA Tablets Compliance</span>
                  <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded">
                    ✓ Speech
                  </span>
                </div>
                <p className="text-xs text-slate-600 font-medium">
                  Taking regularly • 15 tabs remaining
                </p>
              </div>
              <Pencil className="w-3.5 h-3.5 text-slate-400 cursor-pointer hover:text-slate-600" />
            </div>

            {/* Calcium Tablets */}
            <div className="p-3 bg-slate-50/70 rounded-xl border border-slate-200/70 flex items-center justify-between">
              <div className="space-y-0.5">
                <div className="flex items-center space-x-2">
                  <span className="text-xs font-bold text-slate-800">Calcium Tablets (500mg)</span>
                  <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded ${
                    calciumDispensed ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
                  }`}>
                    {calciumDispensed ? 'Dispensed' : 'Needs Refill'}
                  </span>
                </div>
                <p className="text-xs text-slate-600">
                  {calciumDispensed ? '30 tablets dispensed from kit' : 'Stock exhausted 3 days ago'}
                </p>
              </div>
              <button
                onClick={() => setCalciumDispensed(prev => !prev)}
                className={`flex items-center space-x-1 text-xs font-semibold px-2.5 py-1 rounded-lg transition ${
                  calciumDispensed
                    ? 'bg-slate-200 text-slate-700'
                    : 'bg-teal-700 hover:bg-teal-800 text-white shadow-2xs'
                }`}
              >
                <Plus className="w-3 h-3" />
                <span>{calciumDispensed ? 'Undo' : 'Dispense 30'}</span>
              </button>
            </div>

            {/* Diet & Nutrition Advice */}
            <div className="p-3 bg-slate-50/70 rounded-xl border border-slate-200/70 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-800">Diet & Nutrition Advice</span>
                <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded">
                  ✓ Advised
                </span>
              </div>
              <p className="text-xs text-slate-600 leading-normal">
                High protein intake (Dal/Egg) & green leafy vegetables emphasized for mild pallor.
              </p>
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                <span className="text-[10px] font-semibold bg-white border border-slate-200 text-slate-700 px-2 py-0.5 rounded">
                  High Protein
                </span>
                <span className="text-[10px] font-semibold bg-white border border-slate-200 text-slate-700 px-2 py-0.5 rounded">
                  Hydration
                </span>
                <span className="text-[10px] font-semibold bg-red-50 border border-red-200 text-red-700 px-2 py-0.5 rounded">
                  Low Salt Notice
                </span>
              </div>
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
                <p className="text-[10px] text-slate-400">2 high-priority observations identified</p>
              </div>
            </div>
            <span className="text-[11px] font-semibold text-red-800 bg-red-50 px-2 py-0.5 rounded-full">
              Requires Verification
            </span>
          </div>

          <div className="space-y-3.5">
            {/* Pedal Edema */}
            <div className="p-3 bg-red-50/60 rounded-xl border border-red-200/80 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-red-950 flex items-center space-x-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-red-600" />
                  <span>Pedal Edema (पैरों में सूजन)</span>
                </span>
                <span className="text-[10px] font-bold text-red-700 bg-red-100 px-2 py-0.2 rounded-full">
                  ⚠️ Flagged observation
                </span>
              </div>
              <p className="text-xs text-slate-700">
                Beneficiary noted visible swelling in feet and ankles since the last 48 hours.
              </p>
              <div className="flex items-center justify-between pt-1">
                <select className="bg-white border border-slate-300 text-xs font-medium text-slate-800 rounded-lg px-2.5 py-1.5 focus:outline-none">
                  <option>Present - Mild / Bilateral (Grading +1)</option>
                  <option>Present - Moderate (Grading +2)</option>
                  <option>Absent</option>
                </select>
                <button className="text-xs font-semibold text-slate-600 bg-white border border-slate-200 px-2.5 py-1.5 rounded-lg hover:bg-slate-50 transition">
                  Add Note
                </button>
              </div>
            </div>

            {/* Headache */}
            <div className="p-3 bg-red-50/60 rounded-xl border border-red-200/80 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-red-950 flex items-center space-x-1.5">
                  <span className="w-2 h-2 rounded-full bg-red-600"></span>
                  <span>Headache (सिरदर्द)</span>
                </span>
                <span className="text-[10px] font-bold text-red-700 bg-red-100 px-2 py-0.2 rounded-full">
                  ⚠️ Requires attention
                </span>
              </div>
              <p className="text-xs text-slate-600 italic">
                Extracted statement: "कल दोपहर से लगातार हल्का भारीपन और सिरदर्द बना हुआ है।"
              </p>
              <div className="flex items-center justify-between pt-1">
                <span className="text-xs font-medium text-slate-700 bg-white px-2 py-1 rounded border border-slate-200">
                  Present - Reported since yesterday (Mild-th)
                </span>
                <button
                  onClick={() => setHeadacheConfirmed(prev => !prev)}
                  className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition ${
                    headacheConfirmed
                      ? 'bg-emerald-700 text-white'
                      : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {headacheConfirmed ? '✓ Confirmed' : 'Confirm'}
                </button>
              </div>
            </div>

            {/* Fetal Movements & Pallor */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200/70 flex items-center justify-between">
                <div>
                  <span className="font-bold text-slate-800 block text-[11px]">Fetal Movements (बच्चे की हलचल)</span>
                  <span className="text-[10px] text-emerald-700 font-medium">Active & Normal (&gt;10 kicks/day)</span>
                </div>
                <Pencil className="w-3 h-3 text-slate-400 cursor-pointer" />
              </div>

              <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200/70 flex items-center justify-between">
                <div>
                  <span className="font-bold text-slate-800 block text-[11px]">Pallor / Eye Conjunctiva</span>
                  <span className="text-[10px] text-slate-500">Mild Pallor (Possible low iron)</span>
                </div>
                <Pencil className="w-3 h-3 text-slate-400 cursor-pointer" />
              </div>
            </div>
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
                <p className="text-[10px] text-slate-400">Synchronized with Block PHC Data</p>
              </div>
            </div>
          </div>

          <div className="space-y-3.5">
            {/* TT-2 / Booster Dose */}
            <div className="p-3 bg-slate-50/70 rounded-xl border border-slate-200/70 flex items-center justify-between">
              <div>
                <div className="flex items-center space-x-2">
                  <span className="text-xs font-bold text-slate-800">TT-2 / Booster Dose</span>
                  <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded">
                    ✓ Verified
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Administered on 18 Sep 2024 (Rampur PHC)
                </p>
              </div>
            </div>

            {/* Hemoglobin */}
            <div className="p-3 bg-slate-50/70 rounded-xl border border-slate-200/70 flex items-center justify-between">
              <div>
                <div className="flex items-center space-x-2">
                  <span className="text-xs font-bold text-slate-800">Hemoglobin (Hb)</span>
                  <span className="text-xs font-bold text-amber-700 bg-amber-50 px-2 py-0.2 rounded">
                    10.2 g/dL • Mild Anemia
                  </span>
                </div>
                <p className="text-[10px] text-slate-400 mt-0.5">
                  Last tested: 28 Aug 2024
                </p>
              </div>
              <button className="text-xs font-semibold text-teal-700 hover:underline">
                Request Re-test
              </button>
            </div>

            {/* Potential Pre-Eclampsia Flag Card */}
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-start space-x-3">
              <div className="w-6 h-6 rounded-lg bg-red-600 text-white flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                !
              </div>
              <div>
                <h4 className="text-xs font-bold text-red-950">
                  Potential Pre-Eclampsia Flag
                </h4>
                <p className="text-[11px] text-red-800 mt-0.5 leading-normal">
                  Combination of BP (130/85) + bilateral edema + persistent headache warrants immediate PHC Medical Officer consultation.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-2 border-t border-slate-200/80">
        <div className="flex items-center space-x-2 text-xs text-slate-500">
          <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
          <span>Draft auto-saved at 10:48 AM • Offline cache synced</span>
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
