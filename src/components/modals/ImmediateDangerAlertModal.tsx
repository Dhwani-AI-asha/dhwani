import React, { useState, useEffect } from 'react';
import {
  AlertTriangle,
  ShieldAlert,
  Volume2,
  PhoneCall,
  FileText,
  CheckCircle2,
  X,
  RotateCcw,
  Mic,
  PauseCircle,
  XCircle,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { speak } from '../../lib/speak';

export const ImmediateDangerAlertModal: React.FC = () => {
  const {
    activeDangerAlert,
    emergencyConfirmation,
    retryEmergencyVoiceConfirmation,
    acknowledgeDangerAlert,
    clearDangerAlert,
    setIsReferralModalOpen,
    setIsCallMoModalOpen,
    activeBeneficiary,
  } = useApp();

  const [acknowledgedChecked, setAcknowledgedChecked] = useState(false);

  useEffect(() => {
    setAcknowledgedChecked(Boolean(activeDangerAlert?.isAcknowledged));
  }, [activeDangerAlert?.id, activeDangerAlert?.isAcknowledged]);

  if (!activeDangerAlert) return null;

  const phase = emergencyConfirmation?.phase ?? 'idle';
  const escalationStatus = emergencyConfirmation?.escalationStatus ?? 'pending_confirmation';
  const isVoiceInProgress =
    phase === 'speaking_alert' || phase === 'listening' || phase === 'retrying';
  const canGenerateReferral =
    acknowledgedChecked ||
    Boolean(activeDangerAlert.isAcknowledged) ||
    escalationStatus === 'confirmed';

  const handleAcknowledgeAndRefer = () => {
    acknowledgeDangerAlert();
    clearDangerAlert();
    setIsReferralModalOpen(true);
  };

  const handleReplayVoice = () => {
    const prompt =
      emergencyConfirmation?.promptText ||
      `${activeDangerAlert.hindiVoiceAlert} ${activeDangerAlert.englishVoiceAlert}`;
    void speak(prompt, 'hi-IN');
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
                <span className="text-red-100 text-xs font-semibold">
                  Priority 1 Red Flag • Voice Confirmation
                </span>
              </div>
              <h3 className="text-base font-extrabold tracking-tight mt-0.5">
                {activeDangerAlert.title}
              </h3>
            </div>
          </div>

          <button
            onClick={clearDangerAlert}
            aria-label="Close emergency alert"
            className="w-8 h-8 rounded-lg hover:bg-red-700 text-red-100 hover:text-white flex items-center justify-center transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4 text-xs text-slate-800 max-h-[75vh] overflow-y-auto">
          {/* Dedicated Voice Confirmation State Panel */}
          <div
            className={`p-3.5 rounded-2xl border space-y-2.5 ${
              phase === 'confirmed'
                ? 'bg-emerald-50 border-emerald-300'
                : phase === 'declined' || phase === 'no_response'
                ? 'bg-amber-50 border-amber-300'
                : 'bg-red-50 border-red-200'
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-start space-x-2.5">
                {phase === 'listening' ? (
                  <Mic className="w-4 h-4 text-red-600 animate-pulse shrink-0 mt-0.5" />
                ) : phase === 'confirmed' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                ) : phase === 'declined' ? (
                  <XCircle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                ) : (
                  <Volume2 className="w-4 h-4 text-red-600 animate-bounce shrink-0 mt-0.5" />
                )}

                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-slate-900">
                      {phase === 'speaking_alert' && 'Gnani TTS Alert Active (चेतावनी प्रसारित)'}
                      {phase === 'retrying' &&
                        `Repeating Voice Question (Attempt ${emergencyConfirmation?.attempt ?? 1}/${emergencyConfirmation?.maxAttempts ?? 3})`}
                      {phase === 'listening' &&
                        'Listening via Dedicated Gnani STT (हाँ या नहीं बोलें)'}
                      {phase === 'confirmed' && 'Worker Voice Consent Recorded (Escalation Confirmed)'}
                      {phase === 'declined' &&
                        'Escalation Call Declined by Worker (Referral Guidance Preserved)'}
                      {phase === 'no_response' &&
                        'No Voice Response Recorded — Manual Handling Required'}
                      {phase === 'idle' && 'Voice Emergency Alert'}
                    </span>

                    {emergencyConfirmation?.wasVisitRecordingPaused && (
                      <span className="inline-flex items-center space-x-1 text-[10px] font-bold bg-white/90 text-slate-700 border border-slate-300 px-2 py-0.5 rounded-full">
                        <PauseCircle className="w-3 h-3 text-teal-700" />
                        <span>Patient Capture Paused & Isolated</span>
                      </span>
                    )}
                  </div>

                  <p className="text-[11px] text-slate-700 italic mt-1">
                    "{emergencyConfirmation?.promptText || activeDangerAlert.hindiVoiceAlert}"
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={handleReplayVoice}
                  className="text-xs font-semibold text-red-700 bg-white border border-red-200 hover:bg-red-50 px-2.5 py-1.5 rounded-lg flex items-center space-x-1 transition"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Replay</span>
                </button>
              </div>
            </div>

            {/* Dedicated Mic Listening Preview */}
            {phase === 'listening' && (
              <div className="bg-white/90 border border-red-200 rounded-xl p-2.5 text-[11px] text-slate-700 space-y-1">
                <div className="font-semibold text-red-800">
                  {emergencyConfirmation?.liveSttTranscript
                    ? `Hearing confirmation: "${emergencyConfirmation.liveSttTranscript}"`
                    : 'Listening for your voice response (isolated from patient transcript)...'}
                </div>
                <div className="text-[10px] text-slate-500">
                  Say: <span className="font-semibold">"Haan" / "Haan bulao" / "Yes" / "Call ambulance"</span> OR{' '}
                  <span className="font-semibold">"Nahi" / "Mat bulao" / "No"</span>
                </div>
              </div>
            )}

            {/* Status / STT Disconnect / Retry Controls */}
            {emergencyConfirmation?.statusMessage && (
              <div className="text-[11px] font-medium text-slate-700">
                {emergencyConfirmation.statusMessage}
              </div>
            )}

            {emergencyConfirmation?.sttDisconnected && (
              <div className="bg-white border border-red-200 rounded-xl p-2 text-[11px] text-red-700 font-semibold">
                Microphone / Gnani STT disconnected ({emergencyConfirmation.errorMessage || 'connection lost'}). Never treated as consent.
              </div>
            )}

            {emergencyConfirmation?.confirmationTranscript && (
              <div className="text-[11px] text-slate-600 bg-white/80 rounded-lg px-2.5 py-1.5 border border-slate-200">
                <span className="font-bold text-slate-700">Confirmation transcript (isolated): </span>
                <span>"{emergencyConfirmation.confirmationTranscript}"</span>
                {emergencyConfirmation.respondedAt && (
                  <span className="text-[10px] text-slate-400 ml-2">
                    • {new Date(emergencyConfirmation.respondedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                )}
              </div>
            )}

            {!isVoiceInProgress && (phase === 'no_response' || phase === 'declined' || phase === 'confirmed') && (
              <div className="flex items-center justify-end">
                <button
                  type="button"
                  onClick={retryEmergencyVoiceConfirmation}
                  className="text-[11px] font-semibold text-teal-800 bg-white hover:bg-teal-50 border border-teal-200 px-2.5 py-1 rounded-lg transition"
                >
                  Re-run Voice Question
                </button>
              </div>
            )}
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

          {/* PHC Referral Instructions (always preserved on YES, NO refusal, and no_response) */}
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

          {/* Explicit Emergency Contact Actions (Worker must tap manually; never called automatically) */}
          <div className="space-y-1.5 pt-1">
            {phase === 'confirmed' && (
              <div className="text-[11px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">
                Voice consent recorded. Tap below to open emergency dialler (no automatic call was placed):
              </div>
            )}
            <div className="flex items-center space-x-3">
              <button
                type="button"
                onClick={() => setIsCallMoModalOpen(true)}
                className="flex-1 flex items-center justify-center space-x-2 bg-slate-900 hover:bg-black text-white py-2.5 rounded-xl font-bold transition active:scale-98 shadow-sm"
              >
                <PhoneCall className="w-3.5 h-3.5" />
                <span>Open MO Dialler ({activeDangerAlert.onDutyMO.split(' ')[1]})</span>
              </button>

              <button
                type="button"
                onClick={() => setIsCallMoModalOpen(true)}
                className="flex-1 flex items-center justify-center space-x-2 bg-red-600 hover:bg-red-700 text-white py-2.5 rounded-xl font-bold transition active:scale-98 shadow-sm"
              >
                <PhoneCall className="w-3.5 h-3.5" />
                <span>108 Ambulance Unit</span>
              </button>
            </div>
          </div>

          {/* Worker Acknowledgement Checkbox (automatically satisfied if voice consent recorded, optional manual check otherwise) */}
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
                  Worker Emergency Acknowledgement (कार्यकर्ता पावती)
                </span>
                <span className="text-slate-600 text-[11px] leading-normal">
                  I confirm that I have explained this emergency danger sign to beneficiary {activeBeneficiary.name?.trim() || 'Name not provided'} and family, and understand the Rampur PHC referral guidance.
                </span>
              </div>
            </label>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <button
            type="button"
            onClick={clearDangerAlert}
            className="text-xs font-semibold text-slate-500 hover:text-slate-800 px-3 py-2 transition"
          >
            Dismiss
          </button>

          <button
            type="button"
            disabled={!canGenerateReferral}
            onClick={handleAcknowledgeAndRefer}
            className="flex items-center space-x-2 bg-red-600 hover:bg-red-700 text-white px-5 py-2.5 rounded-xl font-bold text-xs shadow-md shadow-red-900/20 transition active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <FileText className="w-4 h-4" />
            <span>Generate PHC Referral Slip</span>
          </button>
        </div>
      </div>
    </div>
  );
};
