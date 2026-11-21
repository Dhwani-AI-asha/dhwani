import React, { useState, useEffect } from 'react';
import { 
  Mic, 
  Pause, 
  Play, 
  Trash2, 
  ArrowRight, 
  Users, 
  ShieldCheck, 
  Radio, 
  Sparkles,
  MapPin,
  HeartPulse,
  Pill,
  AlertOctagon,
  Calendar
} from 'lucide-react';
import { useApp } from '../../context/AppContext';

export const NewVisitRecording: React.FC = () => {
  const { 
    activeBeneficiary, 
    setIsBeneficiaryModalOpen,
    isRecording,
    recordingSeconds,
    isPaused,
    pauseRecording,
    stopRecordingAndReview,
    cancelRecording
  } = useApp();

  const [streamIndex, setStreamIndex] = useState(0);

  const fullLiveText = "पूजा देवी का 32वां हफ्ता चल रहा है। आज बीपी 130/85 था। पिछले तीन दिनों से पैरों में हल्की सूजन (edema) है और सिरदर्द की शिकायत कर रही हैं। आयरन की गोलियां नियमित ले रही हैं...";

  // Simulated typing / streaming effect
  useEffect(() => {
    if (isRecording && !isPaused) {
      const timer = setInterval(() => {
        setStreamIndex(prev => (prev < fullLiveText.length ? prev + 2 : fullLiveText.length));
      }, 150);
      return () => clearInterval(timer);
    }
  }, [isRecording, isPaused]);

  const displayedText = fullLiveText.slice(0, Math.max(30, streamIndex));

  // Format time mm:ss
  const formatTime = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-6">
      {/* Breadcrumb & GPS Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="space-y-1">
          <div className="text-xs text-slate-500 font-medium">
            Dashboard / <span className="text-slate-800 font-semibold">New Visit</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            New Household Visit
          </h1>
        </div>

        <div className="flex items-center space-x-2 text-xs font-medium text-slate-600 bg-white px-3 py-1.5 rounded-full border border-slate-200 shadow-2xs self-start sm:self-auto">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
          <span>Field Sync Active</span>
          <span className="text-slate-300">•</span>
          <div className="flex items-center space-x-1 text-slate-500">
            <MapPin className="w-3 h-3 text-slate-400" />
            <span>GPS: Rampur Sector 4</span>
          </div>
        </div>
      </div>

      {/* Beneficiary Header Strip */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center space-x-4">
          <div className="w-12 h-12 rounded-full bg-slate-100 border border-slate-200 text-teal-800 flex items-center justify-center font-bold text-base shrink-0 shadow-2xs">
            {activeBeneficiary.avatarInitials}
          </div>
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-bold text-slate-900">
                {activeBeneficiary.name}
              </h2>
              {activeBeneficiary.spouseName && (
                <span className="text-xs text-slate-500">
                  (W/o {activeBeneficiary.spouseName})
                </span>
              )}
              <span className="bg-teal-50 text-teal-700 border border-teal-200 px-2.5 py-0.5 rounded-full text-xs font-semibold">
                {activeBeneficiary.stage}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
              <span>{activeBeneficiary.age} Yrs</span>
              <span>•</span>
              <span>{activeBeneficiary.village}, {activeBeneficiary.gali || 'Ward 4'}</span>
              <span>•</span>
              <span className="font-medium text-slate-700">RCH ID: {activeBeneficiary.rchId}</span>
              <span>•</span>
              <span>{activeBeneficiary.subCenter}</span>
            </div>
          </div>
        </div>

        <button
          onClick={() => setIsBeneficiaryModalOpen(true)}
          className="flex items-center space-x-1.5 text-xs font-semibold text-teal-700 hover:text-teal-800 bg-teal-50/70 hover:bg-teal-50 px-3 py-2 rounded-xl border border-teal-200/70 transition shrink-0 self-start md:self-auto"
        >
          <Users className="w-3.5 h-3.5" />
          <span>Change Beneficiary</span>
        </button>
      </div>

      {/* Main Ambient Listener Recording Box */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-8 shadow-sm text-center space-y-6">
        <div className="inline-flex items-center space-x-1.5 bg-teal-50 text-teal-800 border border-teal-200 px-3 py-1 rounded-full text-[11px] font-semibold">
          <Sparkles className="w-3 h-3 text-teal-600" />
          <span>DHWANI AMBIENT LISTENER</span>
        </div>

        <div className="max-w-xl mx-auto space-y-1.5">
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">
            Speak naturally about the household visit
          </h2>
          <p className="text-xs text-slate-500 leading-relaxed">
            Explain symptoms, vitals, nutrition, and observations. DHWANI automatically structures medical records, identifies high risks, and logs immunizations.
          </p>
        </div>

        {/* Pulsing Mic Graphic */}
        <div className="py-4 flex justify-center items-center">
          <div className="relative">
            {/* Ripple rings */}
            {!isPaused && (
              <>
                <div className="absolute inset-0 rounded-full bg-teal-500/20 animate-ping"></div>
                <div className="absolute -inset-4 rounded-full bg-teal-500/10 animate-pulse"></div>
              </>
            )}
            <div className="w-24 h-24 rounded-full bg-gradient-to-br from-teal-600 to-teal-800 text-white flex items-center justify-center shadow-lg shadow-teal-900/20 relative z-10 transition-transform hover:scale-105">
              <Mic className="w-10 h-10" />
            </div>
          </div>
        </div>

        {/* Status & Audio Wave */}
        <div className="space-y-2">
          <div className="flex items-center justify-center space-x-2 text-sm font-semibold text-slate-800">
            <span className="w-2.5 h-2.5 rounded-full bg-red-600 animate-pulse"></span>
            <span>
              {isPaused ? 'Recording paused' : 'Recording in progress...'} {formatTime(recordingSeconds)}
            </span>
          </div>

          {/* Sound wave bars */}
          <div className="flex items-center justify-center space-x-1 h-6">
            <span className={`w-1 rounded-full bg-teal-600 ${!isPaused ? 'h-3 animate-soundwave' : 'h-1'}`}></span>
            <span className={`w-1 rounded-full bg-teal-600 ${!isPaused ? 'h-5 animate-soundwave delay-75' : 'h-2'}`}></span>
            <span className={`w-1 rounded-full bg-teal-700 ${!isPaused ? 'h-6 animate-soundwave delay-150' : 'h-1.5'}`}></span>
            <span className={`w-1 rounded-full bg-teal-600 ${!isPaused ? 'h-4 animate-soundwave delay-100' : 'h-1'}`}></span>
            <span className={`w-1 rounded-full bg-teal-600 ${!isPaused ? 'h-5 animate-soundwave delay-200' : 'h-2'}`}></span>
          </div>

          {/* Detected Language */}
          <div className="pt-1">
            <span className="inline-flex items-center space-x-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
              <span>Detected Language: Hindi (हिन्दी)</span>
            </span>
            <p className="text-[11px] text-slate-400 mt-1">
              Automatic detection active. Speak comfortably in either Hindi or English.
            </p>
          </div>
        </div>

        {/* Live Speech Transcription Stream Box */}
        <div className="max-w-2xl mx-auto bg-slate-50 rounded-xl border border-slate-200/90 p-4 text-left shadow-2xs space-y-3">
          <div className="flex items-center justify-between text-[11px] font-bold text-slate-500 tracking-wider">
            <span className="flex items-center space-x-1.5">
              <Radio className="w-3.5 h-3.5 text-teal-600" />
              <span>LIVE SPEECH TRANSCRIPTION STREAM</span>
            </span>
            <span className="flex items-center space-x-1 text-emerald-700">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span>Streaming</span>
            </span>
          </div>

          <p className="text-sm font-medium text-slate-800 leading-relaxed font-['Noto_Sans_Devanagari',sans-serif]">
            "{displayedText}"
            <span className="inline-block w-1.5 h-4 bg-teal-700 ml-1 translate-y-0.5 animate-pulse"></span>
          </p>

          <div className="flex items-center justify-between pt-2 border-t border-slate-200/60 text-[11px] text-slate-500">
            <span className="flex items-center space-x-1.5 text-slate-600">
              <ShieldCheck className="w-3.5 h-3.5 text-teal-600" />
              <span>AI Audio Clean: Wind & Ambient Noise Suppressed</span>
            </span>
            <span className="font-semibold text-slate-700">ASR Confidence: 98.4%</span>
          </div>
        </div>

        {/* Bottom Control Buttons */}
        <div className="flex flex-wrap items-center justify-center gap-4 pt-2">
          <button
            onClick={stopRecordingAndReview}
            className="flex items-center space-x-2 bg-teal-700 hover:bg-teal-800 text-white px-6 py-3 rounded-xl text-xs font-bold shadow-md shadow-teal-900/10 transition active:scale-95"
          >
            <span>Stop & Review Transcript</span>
            <ArrowRight className="w-4 h-4" />
          </button>

          <button
            onClick={pauseRecording}
            className="flex items-center space-x-2 bg-slate-100 hover:bg-slate-200 text-slate-700 px-5 py-3 rounded-xl text-xs font-semibold transition"
          >
            {isPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
            <span>{isPaused ? 'Resume Recording' : 'Pause Recording'}</span>
          </button>

          <button
            onClick={cancelRecording}
            className="flex items-center space-x-1.5 text-slate-500 hover:text-red-600 hover:bg-red-50 px-4 py-3 rounded-xl text-xs font-semibold transition"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Cancel / Discard</span>
          </button>
        </div>
      </div>

      {/* ASHA Protocol Reminders */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs font-semibold text-slate-600">
          <span className="flex items-center space-x-1.5">
            <Sparkles className="w-3.5 h-3.5 text-teal-600" />
            <span>ASHA Protocol Reminders</span>
          </span>
          <span className="text-[11px] text-slate-400 font-normal">
            Mention these cues naturally in your conversation
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Cue 1 */}
          <div className="bg-white rounded-xl border border-slate-200/80 p-3 flex items-start space-x-3 shadow-2xs">
            <div className="w-7 h-7 rounded-lg bg-teal-50 text-teal-700 flex items-center justify-center shrink-0">
              <HeartPulse className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-slate-800">Mention BP & Vit...</h4>
              <p className="text-[11px] text-slate-500 mt-0.5">State systolic/diastolic...</p>
            </div>
          </div>

          {/* Cue 2 */}
          <div className="bg-white rounded-xl border border-slate-200/80 p-3 flex items-start space-x-3 shadow-2xs">
            <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
              <Pill className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-slate-800">Check IFA Intake</h4>
              <p className="text-[11px] text-slate-500 mt-0.5">Confirm 100+ IFA tablets compliance...</p>
            </div>
          </div>

          {/* Cue 3 */}
          <div className="bg-white rounded-xl border border-slate-200/80 p-3 flex items-start space-x-3 shadow-2xs">
            <div className="w-7 h-7 rounded-lg bg-red-50 text-red-600 flex items-center justify-center shrink-0">
              <AlertOctagon className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-slate-800">Observe Danger ...</h4>
              <p className="text-[11px] text-slate-500 mt-0.5">Check for swelling (edema), blurred...</p>
            </div>
          </div>

          {/* Cue 4 */}
          <div className="bg-white rounded-xl border border-slate-200/80 p-3 flex items-start space-x-3 shadow-2xs">
            <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
              <Calendar className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-slate-800">Confirm Next PH...</h4>
              <p className="text-[11px] text-slate-500 mt-0.5">Confirm Pradhan Mantri Surakshit...</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
