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
    setCurrentScreen, 
    setIsReferralModalOpen, 
    setIsCallMoModalOpen,
    confirmVisitAndSave
  } = useApp();

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
              <h3 className="text-base font-bold text-slate-900">{activeBeneficiary.name}</h3>
              <span className="text-xs text-slate-400">RCH ID: {activeBeneficiary.rchId}</span>
            </div>
            <div className="flex items-center space-x-3 text-xs text-slate-500 mt-0.5">
              <span className="text-teal-700 font-medium">ANC 32 Weeks (3rd Trimester)</span>
              <span>•</span>
              <span>Age: {activeBeneficiary.age} yrs</span>
              <span>•</span>
              <span>{activeBeneficiary.ward}, Rampur</span>
            </div>
          </div>
        </div>

        <div className="text-right text-xs text-slate-500 space-y-0.5">
          <div>Recorded At: <span className="font-semibold text-slate-800">24 Oct 2024, 10:18 AM</span></div>
          <div>Field Attendant: <span className="font-semibold text-slate-800">Sunita Devi (ASHA)</span></div>
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
              PROTOCOL RED-FLAG RULE MATCHED • ANC-PIH-04
            </div>
            <h2 className="text-lg font-bold text-red-950 mt-0.5">
              Potential High-Risk Danger Sign Identified (Protocol Warning)
            </h2>
            <p className="text-xs text-red-800 mt-0.5">
              The field assistant detected signs meeting immediate escalation criteria under Government Maternal Health Safety Guidelines.
            </p>
          </div>
        </div>

        {/* 3 Specific Factors Identified */}
        <div className="space-y-2">
          <div className="text-xs font-bold text-slate-700">
            Observed Findings Triggering Alert — 3 Specific Factors Identified
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {/* Factor 1: Vitals */}
            <div className="bg-white rounded-xl border border-red-200 p-4 space-y-1.5 shadow-2xs">
              <div className="flex items-center justify-between text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                <span>Vitals Metric</span>
                <span className="text-red-500">*</span>
              </div>
              <div className="text-lg font-bold text-slate-900">130/85 <span className="text-xs font-normal text-slate-500">mmHg</span></div>
              <p className="text-xs text-slate-600 leading-normal">
                Blood Pressure recorded at 130/85 mmHg (Elevated baseline for 3rd trimester).
              </p>
              <div className="text-[10px] text-slate-400 pt-1 font-medium">Prior baseline: 110/70 mmHg</div>
            </div>

            {/* Factor 2: Physical Sign */}
            <div className="bg-white rounded-xl border border-red-200 p-4 space-y-1.5 shadow-2xs">
              <div className="flex items-center justify-between text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                <span>Physical Sign</span>
                <Activity className="w-3.5 h-3.5 text-red-500" />
              </div>
              <div className="text-base font-bold text-slate-900">Bilateral Pedal Edema</div>
              <p className="text-xs text-slate-600 leading-normal">
                New onset bilateral pedal edema (पैरों में सूजन) reported for 3 consecutive days.
              </p>
              <div className="text-[10px] text-slate-400 pt-1 font-medium">Pitting: Mild to Moderate</div>
            </div>

            {/* Factor 3: Symptom Log */}
            <div className="bg-white rounded-xl border border-red-200 p-4 space-y-1.5 shadow-2xs">
              <div className="flex items-center justify-between text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                <span>Symptom Log</span>
                <Clock className="w-3.5 h-3.5 text-red-500" />
              </div>
              <div className="text-base font-bold text-slate-900">Mild Headache</div>
              <p className="text-xs text-slate-600 leading-normal">
                Concurrent mild headache (सिरदर्द) reported by beneficiary.
              </p>
              <div className="text-[10px] text-slate-400 pt-1 font-medium">Onset: Past 24 hours</div>
            </div>
          </div>
        </div>

        {/* Standard Protocol Callout */}
        <div className="bg-white/80 rounded-xl border border-red-200/80 p-3.5 text-xs text-slate-700 space-y-1">
          <div className="font-bold text-red-950 flex items-center space-x-1.5">
            <ShieldAlert className="w-4 h-4 text-red-600" />
            <span>STANDARD MATERNAL HEALTH PROTOCOL ALERT</span>
          </div>
          <p className="text-xs text-slate-700 leading-relaxed">
            The combination of elevated blood pressure with persistent edema and headache during the 3rd trimester indicates potential risk of pregnancy-induced hypertension (Pre-eclampsia). Immediate clinical assessment is recommended.
          </p>
          <p className="text-[10px] text-slate-400 italic pt-0.5">
            Note: This is an automated safety alert governed by MOHFW Pre-eclampsia Screening guidelines. It does NOT constitute a definitive physician diagnosis.
          </p>
        </div>
      </div>

      {/* Two Lower Boxes: Escalate & Checklist */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: PHC Referral Protocol */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm space-y-4">
          <div className="space-y-1">
            <span className="bg-red-50 text-red-700 border border-red-200 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider">
              Priority 1 Action Required
            </span>
            <span className="text-xs text-slate-400 font-medium ml-2">PHC Referral Protocol</span>
            <h3 className="text-base font-bold text-slate-900 mt-1">
              Escalate to Primary Health Centre (PHC) Medical Officer
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Arrange immediate transportation or escort Pooja Devi to Rampur PHC today for urine albumin screening and medical officer evaluation.
            </p>
          </div>

          <div className="bg-slate-50 rounded-xl border border-slate-200/80 p-3.5 space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-slate-500 font-medium">Designated Center:</span>
              <span className="font-bold text-slate-800">Rampur PHC (2.8 km)</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500 font-medium">On-Duty MO:</span>
              <span className="font-bold text-slate-800">Dr. Rajesh Varma (MBBS)</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500 font-medium">Ambulance Dispatch Helpline:</span>
              <span className="font-bold text-teal-800">Dial 108 / Rampur Unit Active</span>
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
            Complete mandatory face-to-face counseling steps with Pooja Devi before saving this field log.
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
                  Advised beneficiary to rest on left side and avoid excess salt.
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
                  Informed family members (husband Manoj Kumar) about emergency danger signs (blurred vision, severe abdominal pain).
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
                <span className="font-bold text-slate-800 block">Emergency Follow-up</span>
                <span className="text-slate-500">
                  Scheduled emergency 48-hour follow-up home visit for 26 Oct 2024.
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
            onClick={() => confirmVisitAndSave(false)}
            className="text-xs font-semibold text-slate-600 hover:text-slate-900 bg-white border border-slate-200 px-4 py-2.5 rounded-xl transition"
          >
            Save as Regular Follow-up
          </button>

          <button
            onClick={() => confirmVisitAndSave(true)}
            className="flex items-center space-x-2 bg-teal-700 hover:bg-teal-800 text-white px-6 py-3 rounded-xl text-xs font-bold shadow-md shadow-teal-900/10 transition active:scale-95"
          >
            <span>Save Visit & Create PHC Referral Slip</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
