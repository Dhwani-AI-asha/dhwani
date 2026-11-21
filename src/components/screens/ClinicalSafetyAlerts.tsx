import React, { useState } from 'react';
import { 
  AlertTriangle, 
  ShieldAlert, 
  PhoneCall, 
  FileText, 
  Volume2, 
  ArrowLeft, 
  ArrowRight, 
  CheckCircle2, 
  Activity, 
  HeartPulse, 
  Clock, 
  Sparkles,
  Pause,
  Play
} from 'lucide-react';
import { useApp } from '../../context/AppContext';

export const ClinicalSafetyAlerts: React.FC = () => {
  const { 
    activeBeneficiary, 
    activeVisit,
    setCurrentScreen, 
    setIsReferralModalOpen, 
    setIsCallMoModalOpen,
    confirmVisitAndSave,
    isSavingVisit,
    visitSaveError,
    clearVisitSaveError
  } = useApp();

  const patientNameDisplay = activeVisit.beneficiary?.name?.trim() || activeBeneficiary.name?.trim() || 'Name not provided';
  const bpDisplay =
    activeVisit.vitals.systolic != null && activeVisit.vitals.diastolic != null
      ? `${activeVisit.vitals.systolic}/${activeVisit.vitals.diastolic}`
      : 'Not provided';
  const weightDisplay = activeVisit.vitals.weight != null ? `${activeVisit.vitals.weight} kg` : 'Not provided';
  const dangerSigns = Array.isArray((activeVisit.structuredReport as any)?.danger_signs)
    ? ((activeVisit.structuredReport as any).danger_signs as Array<{ sign?: string; evidence?: string }>)
    : [];

  // Counseling checklist state
  const [checklist, setChecklist] = useState({
    dietPosture: true,
    familyBriefing: false,
    emergencyFollowUp: false,
  });

  const [isPlayingCounseling, setIsPlayingCounseling] = useState(false);

  const completedCount = Object.values(checklist).filter(Boolean).length;

  const toggleCheck = (key: keyof typeof checklist) => {
    setChecklist(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handlePlayCounseling = () => {
    setIsPlayingCounseling(prev => !prev);
    if ('speechSynthesis' in window) {
      if (!isPlayingCounseling) {
        window.speechSynthesis.cancel();
        const text = "पूजा जी, आपको बायीं करवट होकर आराम करना चाहिए और खाने में नमक कम रखना है। अगर सिर में तेज दर्द हो, आंखों से धुंधला दिखे या पेट में तेज दर्द हो, तो तुरंत प्राथमिक स्वास्थ्य केंद्र जाएं।";
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'hi-IN';
        utterance.rate = 0.95;
        utterance.onend = () => setIsPlayingCounseling(false);
        window.speechSynthesis.speak(utterance);
      } else {
        window.speechSynthesis.cancel();
      }
    }
  };

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-6">
      {/* Top Protocol Status Banner */}
      <div className="bg-slate-100 border border-slate-200/90 rounded-xl px-4 py-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs font-semibold text-slate-700">
        <div className="flex items-center space-x-2">
          <CheckCircle2 className="w-3.5 h-3.5 text-teal-700" />
          <span>Standard MOHFW Maternal Health Protocol Active • Rule Matrix v4.2</span>
        </div>
        <span className="text-[11px] text-slate-500 font-medium">
          Zero AI Diagnostic Generation • Deterministic Clinical Rule Only
        </span>
      </div>

      {/* Breadcrumb & Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="space-y-1">
          <div className="text-xs text-slate-500">
            New Visit / <span className="text-slate-700 font-semibold">{activeBeneficiary.name}</span> / <span className="text-red-700 font-bold">Health Alerts</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Clinical Safety & Protocol Alerts
          </h1>
          <p className="text-xs text-slate-500">
            Rule-based clinical triage engine for community frontline decision support
          </p>
        </div>

        <div className="flex items-center space-x-1.5 bg-red-100/80 text-red-800 border border-red-300 px-3 py-1.5 rounded-full text-xs font-bold self-start sm:self-auto">
          <span className="w-2 h-2 rounded-full bg-red-600 animate-ping"></span>
          <span>Level-2 Alert: Clinical Escalation Required</span>
        </div>
      </div>

      {/* Beneficiary Header Strip */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center space-x-3.5">
          <img
            src={activeBeneficiary.photoUrl || "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150&auto=format&fit=crop&q=80"}
            alt={activeBeneficiary.name}
            className="w-12 h-12 rounded-full object-cover border border-slate-200"
          />
          <div>
            <div className="flex items-center space-x-2">
              <h3 className="text-base font-bold text-slate-900">{patientNameDisplay}</h3>
              <span className="text-xs text-slate-400">RCH ID: {activeBeneficiary.rchId || 'Not provided'}</span>
            </div>
            <div className="flex items-center space-x-3 text-xs text-slate-500 mt-0.5">
              <span className="text-teal-700 font-medium">{activeVisit.visitType || 'Visit type: Not provided'}</span>
              <span>•</span>
              <span>Age: {activeVisit.patientAge || (activeBeneficiary.age != null ? `${activeBeneficiary.age} yrs` : 'Not provided')}</span>
              <span>•</span>
              <span>{activeBeneficiary.ward || 'Not provided'}</span>
            </div>
          </div>
        </div>

        <div className="text-right text-xs text-slate-500 space-y-0.5">
          <div>Visit Date: <span className="font-semibold text-slate-800">{activeVisit.visitDate || 'Not provided'}</span></div>
          <div>Next Visit: <span className="font-semibold text-slate-800">{activeVisit.nextVisitDate || 'Not provided'}</span></div>
        </div>
      </div>

      {/* Main Red Alert Card */}
      <div className="bg-red-50/70 border border-red-200 rounded-2xl p-6 shadow-sm space-y-5">
        <div className="flex items-start space-x-3.5">
          <div className="w-8 h-8 rounded-xl bg-red-600 text-white flex items-center justify-center font-bold text-lg shrink-0 mt-0.5">
            !
          </div>
          <div>
            <div className="text-[10px] font-bold text-red-700 uppercase tracking-wider">
              {dangerSigns.length > 0 ? 'CLINICAL RED-FLAG ALERT' : 'VISIT SAFETY REVIEW'}
            </div>
            <h2 className="text-lg font-bold text-red-950 mt-0.5">
              {dangerSigns.length > 0
                ? 'Potential Danger Sign Identified from Visit Transcript'
                : 'No Danger Signs Explicitly Reported in Transcript'}
            </h2>
            <p className="text-xs text-red-800 mt-0.5">
              Absence of reported danger signs does not rule out underlying risk; verify all missing information before closing the visit.
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <div className="text-xs font-bold text-slate-700">
            Source-Grounded Clinical Summary
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {/* Metric 1: BP & Weight */}
            <div className="bg-white rounded-xl border border-red-200 p-4 space-y-1.5 shadow-2xs">
              <div className="flex items-center justify-between text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                <span>Vitals Metric</span>
              </div>
              <div className="text-lg font-bold text-slate-900">
                {bpDisplay} {bpDisplay !== 'Not provided' && <span className="text-xs font-normal text-slate-500">mmHg</span>}
              </div>
              <p className="text-xs text-slate-600 leading-normal">
                Weight: {weightDisplay}
              </p>
              <div className="text-[10px] text-slate-500 pt-1 font-medium">
                Vaccination: {activeVisit.vaccinationStatus || 'Not provided'} (Booster: {activeVisit.boosterStatus || 'Not provided'})
              </div>
            </div>

            {/* Metric 2: Danger Signs */}
            <div className="bg-white rounded-xl border border-red-200 p-4 space-y-1.5 shadow-2xs">
              <div className="flex items-center justify-between text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                <span>Danger Signs</span>
                <Activity className="w-3.5 h-3.5 text-red-500" />
              </div>
              <div className="text-base font-bold text-slate-900">
                {dangerSigns.length > 0 ? dangerSigns.map((d) => d.sign).join(', ') : 'None flagged'}
              </div>
              <p className="text-xs text-slate-600 leading-normal">
                {dangerSigns.length > 0
                  ? `Evidence: "${dangerSigns.map((d) => d.evidence).filter(Boolean).join('; ')}"`
                  : 'No acute warning signs stated in transcript.'}
              </p>
            </div>

            {/* Metric 3: Reported Symptoms */}
            <div className="bg-white rounded-xl border border-red-200 p-4 space-y-1.5 shadow-2xs">
              <div className="flex items-center justify-between text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                <span>Symptoms Log</span>
                <Clock className="w-3.5 h-3.5 text-red-500" />
              </div>
              <div className="text-base font-bold text-slate-900">
                {activeVisit.extractedSymptoms && activeVisit.extractedSymptoms.length > 0
                  ? activeVisit.extractedSymptoms.map((s) => s.name).join(', ')
                  : 'Not provided'}
              </div>
              <p className="text-xs text-slate-600 leading-normal">
                Extracted strictly from visit transcript.
              </p>
            </div>
          </div>
        </div>

        {/* Standard Protocol Callout */}
        <div className="bg-white/80 rounded-xl border border-red-200/80 p-3.5 text-xs text-slate-700 space-y-1">
          <div className="font-bold text-red-950 flex items-center space-x-1.5">
            <ShieldAlert className="w-4 h-4 text-red-600" />
            <span>CLINICAL DOCUMENTATION REMINDER</span>
          </div>
          <p className="text-xs text-slate-700 leading-relaxed">
            Escalate immediately if any danger signs are present. Note: Automated extraction does NOT constitute a physician diagnosis.
          </p>
        </div>
      </div>

      {/* Two Lower Boxes: Escalate & Checklist */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: PHC Referral Protocol */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm space-y-4">
          <div className="space-y-1">
            <span className="bg-red-50 text-red-700 border border-red-200 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider">
              PHC Escalation Option
            </span>
            <h3 className="text-base font-bold text-slate-900 mt-1">
              Escalate to Primary Health Centre (PHC) Medical Officer
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Arrange immediate transportation or escort {patientNameDisplay} to the nearest PHC if medical evaluation is required.
            </p>
          </div>

          <div className="bg-slate-50 rounded-xl border border-slate-200/80 p-3.5 space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-slate-500 font-medium">Ambulance Dispatch Helpline:</span>
              <span className="font-bold text-teal-800">Dial 108</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <button
              onClick={() => setIsCallMoModalOpen(true)}
              className="flex items-center space-x-2 bg-slate-800 hover:bg-slate-900 text-white px-4 py-2.5 rounded-xl text-xs font-semibold shadow-sm transition active:scale-95"
            >
              <PhoneCall className="w-3.5 h-3.5" />
              <span>Contact PHC Medical Officer</span>
            </button>

            <button
              onClick={() => setIsReferralModalOpen(true)}
              className="flex items-center space-x-2 bg-teal-700 hover:bg-teal-800 text-white px-4 py-2.5 rounded-xl text-xs font-semibold shadow-sm transition active:scale-95"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Generate Referral Slip</span>
            </button>
          </div>
        </div>

        {/* Right: Protocol Counseling Checklist */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900">Protocol Counseling Checklist</h3>
            <span className="text-xs font-bold text-teal-800 bg-teal-50 px-2.5 py-0.5 rounded-full">
              {completedCount}/3 Done
            </span>
          </div>
          <p className="text-xs text-slate-500">
            Complete mandatory face-to-face counseling steps with {patientNameDisplay} before saving this field log.
          </p>

          <div className="space-y-3">
            {/* Checklist Item 1 */}
            <label className="flex items-start space-x-3 p-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 cursor-pointer transition">
              <input
                type="checkbox"
                checked={checklist.dietPosture}
                onChange={() => toggleCheck('dietPosture')}
                className="mt-0.5 rounded text-teal-700 focus:ring-teal-600 w-4 h-4"
              />
              <div className="text-xs">
                <span className="font-bold text-slate-800 block">Diet & Posture Care</span>
                <span className="text-slate-500">
                  Reviewed general care instructions appropriate for the visit.
                </span>
              </div>
            </label>

            {/* Checklist Item 2 */}
            <label className="flex items-start space-x-3 p-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 cursor-pointer transition">
              <input
                type="checkbox"
                checked={checklist.familyBriefing}
                onChange={() => toggleCheck('familyBriefing')}
                className="mt-0.5 rounded text-teal-700 focus:ring-teal-600 w-4 h-4"
              />
              <div className="text-xs">
                <span className="font-bold text-slate-800 block">Family Emergency Briefing</span>
                <span className="text-slate-500">
                  Informed family members about danger signs requiring immediate PHC visit.
                </span>
              </div>
            </label>

            {/* Checklist Item 3 */}
            <label className="flex items-start space-x-3 p-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 cursor-pointer transition">
              <input
                type="checkbox"
                checked={checklist.emergencyFollowUp}
                onChange={() => toggleCheck('emergencyFollowUp')}
                className="mt-0.5 rounded text-teal-700 focus:ring-teal-600 w-4 h-4"
              />
              <div className="text-xs">
                <span className="font-bold text-slate-800 block">Follow-up Planning</span>
                <span className="text-slate-500">
                  Next visit date: {activeVisit.nextVisitDate || 'Not provided'}.
                </span>
              </div>
            </label>
          </div>

          {/* Hindi Counseling Audio Player */}
          <div className="p-3 bg-teal-50/70 rounded-xl border border-teal-200 flex items-center justify-between">
            <div className="flex items-center space-x-2 text-xs font-semibold text-teal-900">
              <Volume2 className="w-4 h-4 text-teal-700" />
              <span>Play counseling prompt in Hindi (ऑडियो परामर्श सुनें)</span>
            </div>
            <button
              onClick={handlePlayCounseling}
              className="flex items-center space-x-1.5 bg-teal-700 hover:bg-teal-800 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition"
            >
              {isPlayingCounseling ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
              <span>{isPlayingCounseling ? 'Pause' : 'Play'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Save Error Alert Banner */}
      {visitSaveError && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-2xl flex items-start justify-between gap-3 text-xs text-red-800 animate-fadeIn">
          <div className="flex items-start space-x-2.5">
            <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            <div>
              <div className="font-bold text-red-900">
                रिकॉर्ड सहेजने में विफल / Failed to Save Visit Locally
              </div>
              <p className="text-red-700 mt-0.5">{visitSaveError}</p>
            </div>
          </div>
          <button
            onClick={clearVisitSaveError}
            className="text-[11px] font-semibold text-red-700 hover:text-red-900 underline shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Bottom Footer Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-4 border-t border-slate-200/80">
        <button
          onClick={() => setCurrentScreen('verify-record')}
          className="text-xs font-semibold text-slate-600 hover:text-slate-900 flex items-center space-x-1.5"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Edit Record</span>
          <span className="text-slate-400 font-normal ml-2">Draft saved locally on device</span>
        </button>

        <div className="flex items-center space-x-3">
          <button
            disabled={isSavingVisit}
            onClick={() => confirmVisitAndSave(false)}
            className="text-xs font-semibold text-slate-600 hover:text-slate-900 bg-white border border-slate-200 px-4 py-2.5 rounded-xl transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSavingVisit ? 'Saving to device...' : 'Save as Regular Follow-up'}
          </button>

          <button
            disabled={isSavingVisit}
            onClick={() => confirmVisitAndSave(true)}
            className="flex items-center space-x-2 bg-teal-700 hover:bg-teal-800 text-white px-6 py-3 rounded-xl text-xs font-bold shadow-md shadow-teal-900/10 transition active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span>{isSavingVisit ? 'Saving to device...' : 'Save Visit & Create PHC Referral Slip'}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
