import React, { useState } from 'react';
import { 
  Volume2, 
  X, 
  Mic, 
  CheckCircle2, 
  Sparkles, 
  RotateCcw, 
  AlertCircle,
  Square,
  Play,
  Pause,
  ArrowRight,
  ShieldAlert,
  AlertTriangle,
  HelpCircle
} from 'lucide-react';
import { useApp } from '../../context/AppContext';

export const ReadBackVoiceModal: React.FC = () => {
  const { 
    isReadBackActive, 
    readBackState,
    startReadBack,
    pauseReadBack,
    resumeReadBack,
    stopReadBack, 
    interruptReadBackForCorrection,
    activeBeneficiary, 
    activeVisit, 
    applyVoiceCorrection,
    lastCorrectedMessage,
    triggerDangerSign,
    setCurrentScreen,
    isListeningForCorrection,
    correctionLiveTranscript,
    stopVoiceCorrectionListening,
    submitCorrection,
    confirmConversationalReport,
  } = useApp();

  const [activeCorrectionField, setActiveCorrectionField] = useState<string | null>(null);
  const [customInputVal, setCustomInputVal] = useState('');
  const [isSimulatingMicInput, setIsSimulatingMicInput] = useState(false);

  if (!isReadBackActive) return null;

  const handleQuickCorrection = (field: 'bp' | 'weight' | 'name' | 'visitType' | 'vaccine' | 'nextDate', val: any) => {
    setIsSimulatingMicInput(true);
    setTimeout(() => {
      applyVoiceCorrection(field, val);
      setIsSimulatingMicInput(false);
      setActiveCorrectionField(null);
    }, 200);
  };

  const handleCustomVoiceSubmit = (field: 'weight' | 'name' | 'visitType' | 'vaccine' | 'nextDate') => {
    if (!customInputVal.trim()) return;
    applyVoiceCorrection(field, customInputVal);
    setCustomInputVal('');
    setActiveCorrectionField(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-5 bg-teal-800 text-white flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className={`w-10 h-10 rounded-2xl flex items-center justify-center ${
              readBackState === 'speaking' ? 'bg-teal-700 animate-pulse' : 'bg-teal-900'
            }`}>
              <Volume2 className="w-5 h-5 text-teal-200" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-sm font-bold tracking-tight">
                  Spoken Report Read-Back & Voice Verification
                </h3>
                <span className="bg-teal-700 text-teal-200 font-mono text-[10px] px-2 py-0.2 rounded font-bold uppercase">
                  Hindi TTS
                </span>
              </div>
              <p className="text-[11px] text-teal-200/90 mt-0.5">
                {readBackState === 'speaking' && 'Speaking extracted visit summary aloud (रिपोर्ट पढ़ रहे हैं)...'}
                {readBackState === 'paused' && 'Read-back paused (रुका हुआ)'}
                {readBackState === 'listening' && 'Listening for your voice correction (सुन रहे हैं)...'}
                {readBackState === 'idle' && 'Read-back complete. Confirm or correct below.'}
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

        {/* Modal Body */}
        <div className="p-6 space-y-5 text-center text-xs">
          {/* Speaking / Listening Visual Indicator */}
          <div className="py-2 flex justify-center items-center">
            <div className="relative">
              {readBackState === 'speaking' && (
                <>
                  <div className="absolute -inset-3 rounded-full bg-teal-500/20 animate-ping"></div>
                  <div className="absolute -inset-6 rounded-full bg-teal-500/10 animate-pulse"></div>
                </>
              )}
              {readBackState === 'listening' && (
                <>
                  <div className="absolute -inset-3 rounded-full bg-red-500/20 animate-ping"></div>
                  <div className="absolute -inset-6 rounded-full bg-red-500/10 animate-pulse"></div>
                </>
              )}

              <div className={`w-20 h-20 rounded-full border-4 flex items-center justify-center transition-all ${
                readBackState === 'speaking'
                  ? 'border-teal-600 bg-teal-50 text-teal-700'
                  : readBackState === 'listening'
                  ? 'border-red-600 bg-red-50 text-red-600'
                  : 'border-slate-300 bg-slate-50 text-slate-500'
              }`}>
                {readBackState === 'listening' ? (
                  <Mic className="w-8 h-8 animate-bounce" />
                ) : (
                  <Volume2 className="w-8 h-8" />
                )}
              </div>

              <span className={`absolute -bottom-1 -right-1 px-1.5 py-0.5 rounded-full border-2 border-white text-[10px] font-bold text-white ${
                readBackState === 'listening' ? 'bg-red-600' : 'bg-emerald-600'
              }`}>
                {readBackState === 'listening' ? 'REC' : 'TTS'}
              </span>
            </div>
          </div>

          {/* Current Spoken Text */}
          <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200 space-y-1.5">
            <div className="flex items-center justify-between text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              <span>Read-Back Stream (पढ़ा जाने वाला विवरण):</span>
              <span className="text-teal-700">{readBackState.toUpperCase()}</span>
            </div>
            <p className="text-sm font-semibold text-slate-900 leading-relaxed font-['Noto_Sans_Devanagari',sans-serif]">
              लाभार्थी{' '}
              <span className="text-teal-800 font-bold">
                {activeVisit.beneficiary?.name?.trim() || activeBeneficiary.name?.trim() || 'Name not provided'}
              </span>
              , भेंट{' '}
              <span className="text-teal-800 font-bold">{activeVisit.visitType || 'Not provided'}</span>
              , बीपी{' '}
              <span className="text-teal-800 font-bold">
                {activeVisit.vitals.systolic != null && activeVisit.vitals.diastolic != null
                  ? `${activeVisit.vitals.systolic}/${activeVisit.vitals.diastolic}`
                  : 'Not provided'}
              </span>
              , वजन{' '}
              <span className="text-teal-800 font-bold">
                {activeVisit.vitals.weight != null ? `${activeVisit.vitals.weight} kg` : 'Not provided'}
              </span>
              , टीकाकरण{' '}
              <span className="text-teal-800 font-bold">
                {activeVisit.vaccinationStatus || 'Not provided'}
              </span>
              , अगली भेंट{' '}
              <span className="text-teal-800 font-bold">{activeVisit.nextVisitDate || 'Not provided'}</span>।
            </p>
          </div>

          {/* Last Corrected Feedback Notification */}
          {lastCorrectedMessage && (
            <div className="p-3 bg-emerald-50 text-emerald-900 border border-emerald-200 rounded-2xl text-xs font-semibold flex items-center justify-between animate-in fade-in">
              <div className="flex items-center space-x-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>सुधार सफल (Voice Updated): {lastCorrectedMessage}</span>
              </div>
              <span className="text-[10px] text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded">
                Verified ✓
              </span>
            </div>
          )}

          {/* Controls: Pause / Resume / Stop / Interrupt */}
          <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
            {readBackState === 'speaking' && (
              <button
                onClick={pauseReadBack}
                className="flex items-center space-x-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 px-3.5 py-2 rounded-xl font-semibold transition"
              >
                <Pause className="w-3.5 h-3.5" />
                <span>Pause (रोकें)</span>
              </button>
            )}

            {readBackState === 'paused' && (
              <button
                onClick={resumeReadBack}
                className="flex items-center space-x-1.5 bg-teal-700 hover:bg-teal-800 text-white px-3.5 py-2 rounded-xl font-semibold transition"
              >
                <Play className="w-3.5 h-3.5" />
                <span>Resume (जारी रखें)</span>
              </button>
            )}

            <button
              onClick={() => {
                if (isListeningForCorrection) {
                  stopVoiceCorrectionListening();
                } else {
                  interruptReadBackForCorrection();
                }
              }}
              className={`flex items-center space-x-1.5 px-4 py-2 rounded-xl font-bold transition shadow-sm ${
                readBackState === 'listening' || isListeningForCorrection
                  ? 'bg-red-600 text-white animate-pulse'
                  : 'bg-teal-50 text-teal-800 border border-teal-200 hover:bg-teal-100'
              }`}
            >
              <Mic className="w-4 h-4" />
              <span>
                {isListeningForCorrection
                  ? 'Stop & Apply Spoken Correction'
                  : readBackState === 'listening'
                  ? 'Listening... Speak now'
                  : 'Interrupt to Correct (बोलकर रोकें)'}
              </span>
            </button>

            <button
              onClick={() => startReadBack()}
              className="flex items-center space-x-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-2 rounded-xl font-semibold transition"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Read Again</span>
            </button>
          </div>

          {/* Live STT preview & natural conversational correction input */}
          {isListeningForCorrection && (
            <div className="p-2.5 bg-red-50 border border-red-200 rounded-xl text-xs text-red-800 font-medium">
              {correctionLiveTranscript
                ? `Hearing: "${correctionLiveTranscript}"`
                : 'Listening via Gnani STT... e.g. "Nahi, BP 110/90 hai" or "Haan, correct hai"'}
            </div>
          )}

          <div className="flex items-center gap-2">
            <input
              value={customInputVal}
              onChange={(e) => setCustomInputVal(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && customInputVal.trim()) {
                  const txt = customInputVal;
                  setCustomInputVal('');
                  void submitCorrection(txt, 'text');
                }
              }}
              placeholder='Speak or type: "Nahi, BP 110/90 hai" / "Weight 58 kg hai"'
              className="flex-1 text-xs border border-slate-200 rounded-xl px-3 py-2"
            />
            <button
              type="button"
              onClick={() => {
                if (!customInputVal.trim()) return;
                const txt = customInputVal;
                setCustomInputVal('');
                void submitCorrection(txt, 'text');
              }}
              className="text-xs font-bold bg-teal-700 hover:bg-teal-800 text-white px-3.5 py-2 rounded-xl"
            >
              Send
            </button>
          </div>

          {/* Micro-Interaction: Verbal Correction Cues */}
          <div className="text-left bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                Simulate Field Spoken Corrections (6 Target Fields):
              </span>
              <span className="text-[10px] text-slate-400">Atomic field updates</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              {/* 0. BP correction */}
              <button
                onClick={() => handleQuickCorrection('bp', '110/90')}
                className="p-2.5 rounded-xl border border-slate-200 bg-white hover:bg-teal-50 hover:border-teal-300 text-left transition space-y-0.5"
              >
                <div className="flex items-center justify-between font-bold text-slate-800">
                  <span>0. Correct BP (बीपी)</span>
                  <span className="text-teal-700 font-mono text-[10px]">110/90</span>
                </div>
                <p className="text-[11px] text-slate-500 italic">"नहीं, बीपी 110/90 है"</p>
              </button>
              {/* 1. Weight correction */}
              <button
                onClick={() => handleQuickCorrection('weight', 54)}
                className="p-2.5 rounded-xl border border-slate-200 bg-white hover:bg-teal-50 hover:border-teal-300 text-left transition space-y-0.5"
              >
                <div className="flex items-center justify-between font-bold text-slate-800">
                  <span>1. Correct Weight (वजन)</span>
                  <span className="text-teal-700 font-mono text-[10px]">54 kg</span>
                </div>
                <p className="text-[11px] text-slate-500 italic">"नहीं, वजन 54 किलो है"</p>
              </button>

              {/* 2. Beneficiary Name correction */}
              <button
                onClick={() => handleQuickCorrection('name', 'Sunita Devi')}
                className="p-2.5 rounded-xl border border-slate-200 bg-white hover:bg-teal-50 hover:border-teal-300 text-left transition space-y-0.5"
              >
                <div className="flex items-center justify-between font-bold text-slate-800">
                  <span>2. Correct Name (नाम)</span>
                  <span className="text-teal-700 font-mono text-[10px]">Sunita Devi</span>
                </div>
                <p className="text-[11px] text-slate-500 italic">"लाभार्थी का नाम सुनीता देवी है"</p>
              </button>

              {/* 3. Visit Type correction */}
              <button
                onClick={() => handleQuickCorrection('visitType', 'Antenatal Care Visit #4')}
                className="p-2.5 rounded-xl border border-slate-200 bg-white hover:bg-teal-50 hover:border-teal-300 text-left transition space-y-0.5"
              >
                <div className="flex items-center justify-between font-bold text-slate-800">
                  <span>3. Correct Visit Type</span>
                  <span className="text-teal-700 font-mono text-[10px]">ANC #4</span>
                </div>
                <p className="text-[11px] text-slate-500 italic">"यह चौथा एएनसी चेकअप है"</p>
              </button>

              {/* 4. Vaccination status */}
              <button
                onClick={() => handleQuickCorrection('vaccine', 'TT injection administered')}
                className="p-2.5 rounded-xl border border-slate-200 bg-white hover:bg-teal-50 hover:border-teal-300 text-left transition space-y-0.5"
              >
                <div className="flex items-center justify-between font-bold text-slate-800">
                  <span>4. Correct Vaccine (टीका)</span>
                  <span className="text-teal-700 font-mono text-[10px]">TT Injection</span>
                </div>
                <p className="text-[11px] text-slate-500 italic">"टीटी इंजेक्शन आज लगाया गया"</p>
              </button>

              {/* 5. Next Visit Date */}
              <button
                onClick={() => handleQuickCorrection('nextDate', '15 Nov 2024')}
                className="p-2.5 rounded-xl border border-slate-200 bg-white hover:bg-teal-50 hover:border-teal-300 text-left transition space-y-0.5 sm:col-span-2"
              >
                <div className="flex items-center justify-between font-bold text-slate-800">
                  <span>5. Correct Next Visit Date (अगली भेंट तारीख)</span>
                  <span className="text-teal-700 font-mono text-[10px]">15 Nov 2024</span>
                </div>
                <p className="text-[11px] text-slate-500 italic">"अगली भेंट 15 नवंबर को तय करें"</p>
              </button>
            </div>
          </div>

          {/* Test Immediate Danger-Sign Interruption Demonstration */}
          <div className="bg-red-50/70 border border-red-200 rounded-2xl p-3.5 text-left space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-red-950 flex items-center space-x-1.5 text-xs">
                <ShieldAlert className="w-4 h-4 text-red-600" />
                <span>Feature 3: Test Immediate Danger-Sign Voice Alert</span>
              </span>
              <span className="text-[10px] text-red-700 font-bold bg-red-100 px-2 py-0.5 rounded">
                Predefined Test Cases
              </span>
            </div>
            <p className="text-[11px] text-red-800">
              Triggering any danger sign immediately interrupts ongoing read-back and speaks an urgent audible triage warning.
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  stopReadBack();
                  triggerDangerSign('DS-BLEEDING');
                }}
                className="text-xs bg-red-600 hover:bg-red-700 text-white font-bold px-3 py-1.5 rounded-xl transition shadow-2xs"
              >
                🚨 Trigger: Bleeding in Pregnancy
              </button>
              <button
                type="button"
                onClick={() => {
                  stopReadBack();
                  triggerDangerSign('DS-PREECLAMPSIA');
                }}
                className="text-xs bg-red-100 hover:bg-red-200 text-red-800 font-bold px-3 py-1.5 rounded-xl border border-red-300 transition"
              >
                ⚠️ Trigger: Pre-Eclampsia
              </button>
              <button
                type="button"
                onClick={() => {
                  stopReadBack();
                  triggerDangerSign('DS-NEWBORN-FEVER');
                }}
                className="text-xs bg-red-100 hover:bg-red-200 text-red-800 font-bold px-3 py-1.5 rounded-xl border border-red-300 transition"
              >
                👶 Trigger: Newborn High Fever
              </button>
            </div>
          </div>

          {/* Confirmation & Proceed Action */}
          <div className="flex items-center justify-between pt-2 border-t border-slate-100">
            <span className="text-[11px] text-slate-500">
              Ask worker to confirm before saving (पुष्टि करें)
            </span>

            <div className="flex items-center space-x-2">
              <button
                onClick={stopReadBack}
                className="text-xs font-semibold text-slate-500 hover:text-slate-800 px-3 py-2 transition"
              >
                Cancel
              </button>

              <button
                onClick={async () => {
                  await confirmConversationalReport();
                  stopReadBack();
                  setCurrentScreen('clinical-alerts');
                }}
                className="flex items-center space-x-2 bg-teal-700 hover:bg-teal-800 text-white px-5 py-2.5 rounded-xl font-bold text-xs shadow-md shadow-teal-900/10 transition active:scale-95"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Confirm Record (पुष्टि करें)</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
