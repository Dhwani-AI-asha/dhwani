import React, { useState, useRef, useEffect } from 'react';
import { 
  Play, 
  Pause, 
  RotateCcw, 
  Volume2, 
  Sparkles, 
  AlertTriangle, 
  CheckCircle2, 
  ArrowRight, 
  FileEdit,
  Radio,
  VolumeX
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { saveVisit } from '../../lib/patientApi';

export const ReviewTranscript: React.FC = () => {
  const { 
    activeBeneficiary, 
    activeVisit,
    setCurrentScreen, 
    startRecording,
    isPlayingAudio,
    audioCurrentTime,
    togglePlayAudio,
    seekAudio
  } = useApp();

  const [isEditingInline, setIsEditingInline] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<'1.0x' | '1.2x' | '1.5x'>('1.0x');
  const [isMuted, setIsMuted] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const navTimeoutRef = useRef<any>(null);

  useEffect(() => {
    return () => {
      if (navTimeoutRef.current) {
        clearTimeout(navTimeoutRef.current);
      }
    };
  }, []);

  const handleConfirmAndSave = async () => {
    setIsSaving(true);
    setStatusMessage(null);
    try {
      const transcript = activeVisit.originalTranscript || '';
      await saveVisit('PAT-2026-0001', transcript);
      setStatusMessage({ type: 'success', text: 'Visit saved successfully.' });
      navTimeoutRef.current = setTimeout(() => {
        setCurrentScreen('verify-record');
      }, 400);
    } catch (err: any) {
      const errorMsg = err?.message || 'Failed to save visit';
      setStatusMessage({ type: 'error', text: errorMsg });
    } finally {
      setIsSaving(false);
    }
  };

  const formatAudioTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const handleSpeedCycle = () => {
    if (playbackSpeed === '1.0x') setPlaybackSpeed('1.2x');
    else if (playbackSpeed === '1.2x') setPlaybackSpeed('1.5x');
    else setPlaybackSpeed('1.0x');
  };

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-6">
      {/* Step Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="space-y-1">
          <div className="text-[11px] font-bold text-teal-800 tracking-wider uppercase">
            STEP 3 OF 4 • SPEECH ANALYSIS
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Review Speech Transcript
          </h1>
          <p className="text-xs text-slate-500">
            Verify the recorded audio text before extracting medical details.
          </p>
        </div>

        <div className="flex items-center space-x-1.5 bg-slate-100 text-slate-700 px-3 py-1.5 rounded-full text-xs font-semibold self-start sm:self-auto border border-slate-200">
          <Sparkles className="w-3.5 h-3.5 text-teal-600" />
          <span>On-Device Whisper ASR Ready</span>
        </div>
      </div>

      {/* Beneficiary Mini Strip */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center space-x-3.5">
          <img
            src={activeBeneficiary.photoUrl || "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150&auto=format&fit=crop&q=80"}
            alt={activeBeneficiary.name}
            className="w-11 h-11 rounded-full object-cover border border-slate-200"
          />
          <div>
            <div className="flex items-center space-x-2">
              <h3 className="text-sm font-bold text-slate-900">{activeBeneficiary.name}</h3>
              <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded text-[11px] font-semibold">
                {activeBeneficiary.stage.split('•')[0]}
              </span>
              <span className="text-xs text-slate-400">RCH ID: {activeBeneficiary.rchId}</span>
            </div>
            <div className="flex items-center space-x-3 text-xs text-slate-500 mt-0.5">
              <span>Recorded 2 minutes ago</span>
              <span>•</span>
              <span className="font-medium text-slate-700">Audio Duration: 1m 42s</span>
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-4 shrink-0 text-xs">
          <div className="text-right">
            <span className="text-slate-400 text-[11px] block">Visit Type</span>
            <span className="font-semibold text-slate-800">Home ANC Follow-up</span>
          </div>
          <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-1.5 rounded-xl font-semibold flex items-center space-x-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-red-600" />
            <span>High Priority Alert: BP 130/85 + Edema</span>
          </div>
        </div>
      </div>

      {/* Detected Language Banner */}
      <div className="bg-emerald-50/80 border border-emerald-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
        <div className="flex items-start space-x-3">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
          <div>
            <div className="flex items-center space-x-2 font-bold text-emerald-900">
              <span>Detected Language: Hindi (हिन्दी) with English Clinical Terms</span>
              <span className="bg-emerald-200 text-emerald-800 text-[10px] px-2 py-0.2 rounded-full">
                Confidence: 98%
              </span>
            </div>
            <p className="text-emerald-700 mt-0.5 text-[11px]">
              Automatic language detection verified. Mixed Hindi/English colloquial terms recognized accurately.
            </p>
          </div>
        </div>

        <div className="text-emerald-800 font-semibold text-[11px] bg-emerald-100/70 px-3 py-1 rounded-lg shrink-0">
          Acoustic Dialect: Bhojpuri-Hindi Mix
        </div>
      </div>

      {/* Audio Player Card */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
          <div className="flex items-center space-x-2">
            <Radio className="w-4 h-4 text-teal-600" />
            <span>Original Audio Recording</span>
          </div>
          <span className="text-[11px] text-slate-400 font-normal">
            Master WAV • 48 kHz High Fidelity
          </span>
        </div>

        <div className="flex items-center space-x-4">
          <button
            onClick={togglePlayAudio}
            className="w-11 h-11 rounded-full bg-teal-700 hover:bg-teal-800 text-white flex items-center justify-center shrink-0 shadow-md shadow-teal-900/10 transition active:scale-95"
          >
            {isPlayingAudio ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
          </button>

          <span className="text-xs font-mono font-semibold text-slate-700 w-12">
            {formatAudioTime(audioCurrentTime)}
          </span>

          {/* Interactive Scrubber & Waveform */}
          <div className="flex-1 relative flex items-center">
            <input
              type="range"
              min="0"
              max="102"
              value={audioCurrentTime}
              onChange={(e) => seekAudio(Number(e.target.value))}
              className="w-full accent-teal-700 h-1.5 bg-slate-200 rounded-lg cursor-pointer"
            />
          </div>

          <span className="text-xs font-mono text-slate-400 w-12 text-right">
            01:42
          </span>

          <button
            onClick={handleSpeedCycle}
            className="text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 px-2.5 py-1 rounded-lg transition"
          >
            {playbackSpeed}
          </button>

          <button
            onClick={() => setIsMuted(prev => !prev)}
            className="text-slate-400 hover:text-slate-600 p-1 rounded transition"
          >
            {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Transcribed Text (Editable) Box */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <div className="flex items-center space-x-2">
              <h3 className="text-sm font-bold text-slate-900">Transcribed Text (Editable)</h3>
              <FileEdit className="w-3.5 h-3.5 text-teal-600" />
            </div>
            <p className="text-xs text-slate-500">
              Click any sentence or word below to correct spelling, phonetic transcriptions, or medical entities.
            </p>
          </div>

          <button
            onClick={() => setIsEditingInline(prev => !prev)}
            className="text-xs font-semibold text-teal-700 bg-teal-50 hover:bg-teal-100 px-3 py-1.5 rounded-xl border border-teal-200 transition"
          >
            {isEditingInline ? 'Done Editing' : 'Tap any word to edit'}
          </button>
        </div>

        {/* Entity Recognition Legend */}
        <div className="flex flex-wrap items-center gap-4 text-xs font-medium text-slate-600 bg-slate-50/70 p-2.5 rounded-xl border border-slate-100">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Entity Recognition:</span>
          <div className="flex items-center space-x-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
            <span>Medical Vitals & Dosages</span>
          </div>
          <div className="flex items-center space-x-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500"></span>
            <span>Symptoms & Clinical Risks</span>
          </div>
          <div className="flex items-center space-x-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-teal-500"></span>
            <span>Vaccines & Supplies</span>
          </div>
        </div>

        {/* Transcript as Plain Text */}
        <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-sm leading-relaxed text-slate-800 font-['Noto_Sans_Devanagari',sans-serif] whitespace-pre-wrap">
          {activeVisit.originalTranscript || 'No transcript recorded.'}
        </div>

        <div className="flex items-center justify-between text-xs text-slate-500 pt-1">
          <span>Character count: 482 words • All 6 Medical Entities Synced</span>
          <div className="flex items-center space-x-3">
            <button className="hover:text-slate-800 font-medium transition">
              Undo changes
            </button>
            <span>•</span>
            <button 
              onClick={togglePlayAudio}
              className="text-teal-700 hover:text-teal-800 font-medium transition flex items-center space-x-1"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Re-listen sentence</span>
            </button>
          </div>
        </div>
      </div>

      {/* ASHA Guidance Protocol Box */}
      <div className="bg-sky-50 border border-sky-200 rounded-2xl p-4 flex items-start space-x-3 text-xs">
        <Sparkles className="w-4 h-4 text-sky-600 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <h4 className="font-bold text-sky-950">
            ASHA Guidance Protocol (ANC Protocol 4.2)
          </h4>
          <p className="text-sky-800 leading-relaxed">
            DHWANI detected early signs of gestational hypertension (BP 130/85 with new bilateral pedal edema & headache). Once verified, the next screen will formulate the PHC referral slip and emergency follow-up alert.
          </p>
        </div>
      </div>

      {/* Save Status / Error Message */}
      {statusMessage && (
        <div
          role="alert"
          className={`p-4 rounded-xl border text-xs font-semibold flex items-center space-x-2 ${
            statusMessage.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-red-50 border-red-200 text-red-700'
          }`}
        >
          {statusMessage.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
          )}
          <span>{statusMessage.text}</span>
        </div>
      )}

      {/* Bottom Action Footer */}
      <div className="flex items-center justify-between pt-2">
        <button
          onClick={startRecording}
          className="text-xs font-semibold text-slate-600 hover:text-slate-900 bg-white border border-slate-200 px-4 py-2.5 rounded-xl transition"
        >
          Re-record Audio
        </button>

        <div className="flex items-center space-x-4">
          <span className="text-xs text-slate-500 font-medium">Ready for clinical parsing</span>
          <button
            onClick={handleConfirmAndSave}
            disabled={isSaving}
            className="flex items-center space-x-2 bg-teal-700 hover:bg-teal-800 text-white px-6 py-3 rounded-xl text-xs font-bold shadow-md shadow-teal-900/10 transition active:scale-95 disabled:opacity-50"
          >
            <span>Continue to Extract & Verify Record</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
