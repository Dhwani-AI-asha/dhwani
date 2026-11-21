import React, { useState } from 'react';
import { 
  Volume2, 
  X, 
  Mic, 
  CheckCircle2, 
  Sparkles, 
  RotateCcw, 
  AlertCircle,
  Square
} from 'lucide-react';
import { useApp } from '../../context/AppContext';

export const ReadBackVoiceModal: React.FC = () => {
  const { 
    isReadBackActive, 
    stopReadBack, 
    activeBeneficiary, 
    activeVisit, 
    applyVoiceCorrection,
    setCurrentScreen 
  } = useApp();

  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);

  if (!isReadBackActive) return null;

  const handleCorrection = (label: string, field: string, val: any) => {
    applyVoiceCorrection(field, val);
    setFeedbackMessage(`सुधार दर्ज किया गया: ${label}`);
    setTimeout(() => setFeedbackMessage(null), 3000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-5 bg-teal-800 text-white flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <Volume2 className="w-5 h-5 text-teal-300 animate-bounce" />
            <div>
              <h3 className="text-sm font-bold tracking-tight">
                Voice Read-Back & Verification (आवाज से पुष्टि)
              </h3>
              <p className="text-[11px] text-teal-200">
                Agent is reading extracted clinical notes aloud
              </p>
            </div>
          </div>
          <button
            onClick={stopReadBack}
            className="w-8 h-8 rounded-lg hover:bg-teal-700 text-teal-200 hover:text-white flex items-center justify-center transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5 text-center">
          {/* Speaking Audio Graphic */}
          <div className="py-2 flex justify-center items-center">
            <div className="relative">
              <div className="w-20 h-20 rounded-full bg-teal-50 border-4 border-teal-600 flex items-center justify-center text-teal-700 shadow-inner">
                <Volume2 className="w-8 h-8" />
              </div>
              <span className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-emerald-500 border-2 border-white flex items-center justify-center text-white text-[10px] font-bold">
                HI
              </span>
            </div>
          </div>

          <div className="space-y-1">
            <h4 className="text-base font-bold text-slate-900">
              "लाभार्थी {activeBeneficiary.name}, बीपी {activeVisit.vitals.systolic}/{activeVisit.vitals.diastolic}, वजन {activeVisit.vitals.weight} kg, पैरों में सूजन..."
            </h4>
            <p className="text-xs text-slate-500 font-medium">
              You can interrupt (barge-in) anytime to correct or confirm.
            </p>
          </div>

          {/* Feedback pill */}
          {feedbackMessage && (
            <div className="p-2.5 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-xl text-xs font-semibold flex items-center justify-center space-x-1.5 animate-in fade-in">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              <span>{feedbackMessage}</span>
            </div>
          )}

          {/* Simulated Voice Correction Quick Cues */}
          <div className="text-left bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-2.5">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
              Simulate Voice Corrections (बोल कर सुधारें):
            </span>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => handleCorrection('वजन 54 किलो', 'weight', 54)}
                className="text-xs bg-white hover:bg-teal-50 text-slate-700 hover:text-teal-800 border border-slate-200 hover:border-teal-300 px-3 py-1.5 rounded-xl font-medium transition"
              >
                "नहीं, वजन 54 किलो है"
              </button>

              <button
                onClick={() => handleCorrection('बीपी 120/80', 'bp', { sys: 120, dia: 80 })}
                className="text-xs bg-white hover:bg-teal-50 text-slate-700 hover:text-teal-800 border border-slate-200 hover:border-teal-300 px-3 py-1.5 rounded-xl font-medium transition"
              >
                "बीपी 120 बटा 80 था"
              </button>

              <button
                onClick={() => handleCorrection('सिरदर्द सामान्य', 'headache', 'None')}
                className="text-xs bg-white hover:bg-teal-50 text-slate-700 hover:text-teal-800 border border-slate-200 hover:border-teal-300 px-3 py-1.5 rounded-xl font-medium transition"
              >
                "सिरदर्द नहीं है"
              </button>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-center space-x-3 pt-2">
            <button
              onClick={stopReadBack}
              className="flex items-center space-x-2 bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2.5 rounded-xl text-xs font-semibold transition"
            >
              <Square className="w-3.5 h-3.5" />
              <span>Interrupt / Stop (रुकिए)</span>
            </button>

            <button
              onClick={() => {
                stopReadBack();
                setCurrentScreen('clinical-alerts');
              }}
              className="flex items-center space-x-2 bg-teal-700 hover:bg-teal-800 text-white px-5 py-2.5 rounded-xl text-xs font-bold shadow-md shadow-teal-900/10 transition active:scale-95"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Confirm & Continue (पुष्टि करें)</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
