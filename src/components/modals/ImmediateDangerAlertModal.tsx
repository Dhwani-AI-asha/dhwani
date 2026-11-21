import React, { useState } from 'react';
import { 
  AlertTriangle, 
  ShieldAlert, 
  Volume2, 
  PhoneCall, 
  FileText, 
  CheckCircle2, 
  X,
  RotateCcw
} from 'lucide-react';
import { useApp } from '../../context/AppContext';

export const ImmediateDangerAlertModal: React.FC = () => {
  const { 
    activeDangerAlert, 
    acknowledgeDangerAlert, 
    clearDangerAlert, 
    setIsReferralModalOpen,
    setIsCallMoModalOpen,
    activeBeneficiary
  } = useApp();

  const [acknowledgedChecked, setAcknowledgedChecked] = useState(false);

  if (!activeDangerAlert) return null;

  const handleAcknowledgeAndRefer = () => {
    acknowledgeDangerAlert();
    clearDangerAlert();
    setIsReferralModalOpen(true);
  };

  const handleReplayVoice = () => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(activeDangerAlert.hindiVoiceAlert);
      utterance.lang = 'hi-IN';
      utterance.rate = 0.95;
      window.speechSynthesis.speak(utterance);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-red-950/70 backdrop-blur-sm">
      <div className="bg-white rounded-3xl border-2 border-red-500 shadow-2xl w-full max-w-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-5 bg-red-600 text-white flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-white/20 flex items-center justify-center">
              <ShieldAlert className="w-6 h-6 text-white animate-pulse" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="bg-white/20 text-white font-mono text-[10px] px-2 py-0.5 rounded font-bold uppercase tracking-wider">
                  {activeDangerAlert.ruleCode}
                </span>
                <span className="text-red-100 text-xs font-semibold">Priority 1 Red Flag</span>
              </div>
              <h3 className="text-base font-extrabold tracking-tight mt-0.5">
                {activeDangerAlert.title}
              </h3>
            </div>
          </div>

          <button
            onClick={clearDangerAlert}
            className="w-8 h-8 rounded-lg hover:bg-red-700 text-red-100 hover:text-white flex items-center justify-center transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4 text-xs text-slate-800">
          {/* Spoken Alert Notice */}
          <div className="p-3 bg-red-50 border border-red-200 rounded-2xl flex items-center justify-between">
            <div className="flex items-center space-x-2.5">
              <Volume2 className="w-4 h-4 text-red-600 animate-bounce shrink-0" />
              <div>
                <span className="font-bold text-red-950 block">Voice Alert Active (हिंदी चेतावनी प्रसारित)</span>
                <p className="text-[11px] text-red-800 italic mt-0.5">
                  "{activeDangerAlert.hindiVoiceAlert}"
                </p>
              </div>
            </div>
            <button
              onClick={handleReplayVoice}
              className="text-xs font-semibold text-red-700 bg-white border border-red-200 hover:bg-red-50 px-2.5 py-1.5 rounded-lg shrink-0 flex items-center space-x-1 transition ml-2"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Replay</span>
            </button>
          </div>

          {/* Triggering Observation */}
          <div className="space-y-1">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
              Identified Triggering Observation (खतरे का संकेत):
            </span>
            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 font-medium text-slate-800 leading-relaxed">
              {activeDangerAlert.triggerObservation}
            </div>
          </div>

          {/* PHC Referral Instructions */}
          <div className="bg-amber-50 border border-amber-200/90 rounded-2xl p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-amber-950 flex items-center space-x-1.5">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                <span>Primary Health Centre Referral Instruction</span>
              </span>
              <span className="text-[10px] font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded">
                MOHFW PROTOCOL
              </span>
            </div>
            <p className="text-xs text-amber-900 leading-relaxed font-medium">
              {activeDangerAlert.instruction}
            </p>
            <div className="pt-2 border-t border-amber-200/80 flex flex-col sm:flex-row sm:items-center justify-between text-[11px] text-amber-950 gap-1 font-semibold">
              <span>Facility: {activeDangerAlert.referralFacility}</span>
              <span className="text-teal-800">MO: {activeDangerAlert.onDutyMO}</span>
            </div>
          </div>

          {/* Quick Emergency Actions */}
          <div className="flex items-center space-x-3 pt-1">
            <button
              onClick={() => setIsCallMoModalOpen(true)}
              className="flex-1 flex items-center justify-center space-x-2 bg-slate-900 hover:bg-black text-white py-2.5 rounded-xl font-bold transition active:scale-98 shadow-sm"
            >
              <PhoneCall className="w-3.5 h-3.5" />
              <span>Call Medical Officer ({activeDangerAlert.onDutyMO.split(' ')[1]})</span>
            </button>

            <button
              onClick={() => setIsCallMoModalOpen(true)}
              className="flex-1 flex items-center justify-center space-x-2 bg-red-600 hover:bg-red-700 text-white py-2.5 rounded-xl font-bold transition active:scale-98 shadow-sm"
            >
              <PhoneCall className="w-3.5 h-3.5" />
              <span>108 Ambulance Unit</span>
            </button>
          </div>

          {/* Worker Acknowledgement Checkbox */}
          <div className="p-3.5 rounded-2xl border-2 border-dashed border-red-300 bg-red-50/50 space-y-1.5">
            <label className="flex items-start space-x-3 cursor-pointer">
              <input
                type="checkbox"
                checked={acknowledgedChecked}
                onChange={(e) => setAcknowledgedChecked(e.target.checked)}
                className="mt-0.5 w-4 h-4 text-red-600 rounded focus:ring-red-500"
              />
              <div className="text-xs text-slate-800">
                <span className="font-bold block text-red-950">
                  Worker Emergency Acknowledgement (कार्यकर्ता पावती) *
                </span>
                <span className="text-slate-600 text-[11px] leading-normal">
                  I confirm that I have explained this emergency danger sign to beneficiary {activeBeneficiary.name} and family, and will escort/refer them to Rampur PHC immediately.
                </span>
              </div>
            </label>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <button
            onClick={clearDangerAlert}
            className="text-xs font-semibold text-slate-500 hover:text-slate-800 px-3 py-2 transition"
          >
            Dismiss
          </button>

          <button
            disabled={!acknowledgedChecked}
            onClick={handleAcknowledgeAndRefer}
            className="flex items-center space-x-2 bg-red-600 hover:bg-red-700 text-white px-5 py-2.5 rounded-xl font-bold text-xs shadow-md shadow-red-900/20 transition active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <FileText className="w-4 h-4" />
            <span>Acknowledge & Generate PHC Referral Slip</span>
          </button>
        </div>
      </div>
    </div>
  );
};
