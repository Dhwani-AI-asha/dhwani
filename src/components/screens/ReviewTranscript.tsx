import React, { useState, useRef, useEffect } from 'react';
import { 
  Sparkles, 
  AlertTriangle, 
  CheckCircle2, 
  ArrowRight, 
  FileEdit,
  Mic,
  Square,
  Volume2,
  History
} from 'lucide-react';
import { useApp } from '../../context/AppContext';

export const ReviewTranscript: React.FC = () => {
  const { 
    activeBeneficiary, 
    isBeneficiarySelected,
    confirmPatientIdentity,
    setIsBeneficiaryModalOpen,
    activeVisit,
    setCurrentScreen, 
    startRecording,
    reportResult,
    reportError,
    reportErrorMessage,
    isReportLoading,
    replayReport,
    submitCorrection,
    confirmConversationalReport,
    conversationLog,
    isListeningForCorrection,
    correctionLiveTranscript,
    isReportConfirmed,
    startVoiceCorrectionListening,
    stopVoiceCorrectionListening,
    persistCurrentVisitToBackend,
  } = useApp();

  const [isEditingInline, setIsEditingInline] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [correctionText, setCorrectionText] = useState('');
  const [identityInput, setIdentityInput] = useState('');
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const navTimeoutRef = useRef<any>(null);

  const displayName = activeVisit.beneficiary?.name?.trim() || activeBeneficiary.name?.trim() || '';
  const hasIdentityIssue =
    !displayName ||
    activeVisit.identityStatus === 'missing' ||
    activeVisit.identityStatus === 'ambiguous' ||
    activeVisit.identityStatus === 'mismatch';

  useEffect(() => {
    return () => {
      if (navTimeoutRef.current) {
        clearTimeout(navTimeoutRef.current);
      }
    };
  }, []);

  const handleConfirmAndSave = async () => {
    if (hasIdentityIssue) {
      setStatusMessage({
        type: 'error',
        text:
          activeVisit.identityStatus === 'mismatch'
            ? activeVisit.identityMismatchDetail || 'Patient name in transcript does not match the selected beneficiary. Resolve identity below before continuing.'
            : 'Patient name is not confirmed. Please enter/confirm the exact patient name or select a beneficiary before continuing.',
      });
      return;
    }
    setIsSaving(true);
    setStatusMessage(null);
    try {
      const result = await persistCurrentVisitToBackend(activeVisit, reportResult?.report ?? activeVisit.structuredReport);
      if (!result.ok) {
        setStatusMessage({
          type: 'error',
          text: result.error || 'Failed to save visit to backend. Your visit data has been preserved locally.',
        });
        return;
      }
      setStatusMessage({
        type: 'success',
        text: result.visitId
          ? `Visit saved successfully (${result.visitId}).`
          : 'Visit saved successfully.',
      });
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
          <span>Gnani STT</span>
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
              <h3 className="text-sm font-bold text-slate-900">
                {displayName || 'Name not provided'}
              </h3>
              {isBeneficiarySelected && activeBeneficiary.stage && (
                <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded text-[11px] font-semibold">
                  {activeBeneficiary.stage.split('•')[0]}
                </span>
              )}
              {activeBeneficiary.rchId && (
                <span className="text-xs text-slate-400">RCH ID: {activeBeneficiary.rchId}</span>
              )}
              {activeBeneficiary.patientId && (
                <span className="text-[11px] font-mono text-teal-700 bg-teal-50 px-1.5 py-0.5 rounded border border-teal-200">
                  {activeBeneficiary.patientId}
                </span>
              )}
            </div>
            <div className="flex items-center space-x-3 text-xs text-slate-500 mt-0.5">
              {activeVisit.audioDurationText && (
                <span className="font-medium text-slate-700">Duration: {activeVisit.audioDurationText}</span>
              )}
              <span>
                Identity source: {activeVisit.patientNameSource === 'selected_beneficiary'
                  ? 'Selected beneficiary'
                  : activeVisit.patientNameSource === 'transcript' || activeVisit.patientNameSource === 'confirmed'
                  ? 'From transcript / confirmed'
                  : 'Not provided'}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-4 shrink-0 text-xs">
          <div className="text-right">
            <span className="text-slate-400 text-[11px] block">Visit Type</span>
            <span className="font-semibold text-slate-800">{activeVisit.visitType || 'Not provided'}</span>
          </div>
        </div>
      </div>

      {/* Detected Language Banner */}
      <div className="bg-emerald-50/80 border border-emerald-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
        <div className="flex items-start space-x-3">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
          <div>
            <div className="flex items-center space-x-2 font-bold text-emerald-900">
              <span>
                {activeVisit.languageDetected
                  ? `Detected Language: ${activeVisit.languageDetected}`
                  : 'Language detection pending'}
              </span>
            </div>
            <p className="text-emerald-700 mt-0.5 text-[11px]">
              Automatic language detection by Gnani STT. Review the transcript below before proceeding.
            </p>
          </div>
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
          <span>
            {activeVisit.originalTranscript
              ? `${activeVisit.originalTranscript.trim().split(/\s+/).filter(Boolean).length} words`
              : 'No transcript recorded'}
          </span>
          <div className="flex items-center space-x-3">
            <button className="hover:text-slate-800 font-medium transition">
              Undo changes
            </button>
          </div>
        </div>
      </div>

      {/* ASHA Guidance Protocol Box — only shown when report indicates danger signs */}
      {reportResult && (reportResult.report as any)?.danger_signs?.length > 0 && (
        <div className="bg-sky-50 border border-sky-200 rounded-2xl p-4 flex items-start space-x-3 text-xs">
          <Sparkles className="w-4 h-4 text-sky-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h4 className="font-bold text-sky-950">
              ASHA Clinical Guidance
            </h4>
            <p className="text-sky-800 leading-relaxed">
              AI detected potential danger signs in the recorded visit. Review the extracted fields carefully. The next screen will help you verify vitals and generate a referral if needed.
            </p>
          </div>
        </div>
      )}

      {/* Spoken Read-Back & Conversational Voice Correction */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-semibold text-slate-700">
          <div className="flex items-center space-x-2">
            <span>AI Read-Back of Visit Report</span>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                isReportConfirmed
                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                  : 'bg-amber-50 text-amber-800 border border-amber-200'
              }`}
            >
              {isReportConfirmed ? 'Confirmed ✓' : 'Unconfirmed Draft'}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={replayReport}
              className="flex items-center space-x-1 text-teal-700 bg-teal-50 hover:bg-teal-100 px-3 py-1.5 rounded-lg border border-teal-200 transition"
            >
              <Volume2 className="w-3.5 h-3.5" />
              <span>Read Report Aloud</span>
            </button>

            <button
              type="button"
              onClick={() => {
                if (isListeningForCorrection) {
                  stopVoiceCorrectionListening();
                } else {
                  void startVoiceCorrectionListening();
                }
              }}
              disabled={isReportLoading}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg font-bold transition disabled:opacity-50 ${
                isListeningForCorrection
                  ? 'bg-red-600 hover:bg-red-700 text-white animate-pulse'
                  : 'bg-teal-700 hover:bg-teal-800 text-white'
              }`}
            >
              {isListeningForCorrection ? (
                <>
                  <Square className="w-3 h-3" />
                  <span>Stop & Send Voice</span>
                </>
              ) : (
                <>
                  <Mic className="w-3.5 h-3.5" />
                  <span>Speak Correction / Confirm</span>
                </>
              )}
            </button>
          </div>
        </div>

        {isReportLoading && (
          <p className="text-xs text-slate-500 italic">Preparing report and read-back...</p>
        )}

        {reportError && (
          <div role="alert" className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl p-3 space-y-1">
            <p className="font-semibold">Report service error: {reportError}</p>
            {reportErrorMessage && <p className="text-[11px] text-red-600">{reportErrorMessage}</p>}
          </div>
        )}

        {/* Identity Validation Gate */}
        {hasIdentityIssue && (
          <div role="alert" className="bg-amber-50 border border-amber-300 rounded-xl p-3 space-y-2 text-xs text-amber-950">
            <div className="flex items-center space-x-2 font-bold">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>
                {activeVisit.identityStatus === 'mismatch'
                  ? 'Patient Identity Mismatch'
                  : activeVisit.identityStatus === 'ambiguous'
                  ? 'Patient Name Ambiguous — Please Confirm'
                  : 'Patient Name Required Before Confirmation'}
              </span>
            </div>
            <p className="text-[11px] text-amber-900">
              {activeVisit.identityMismatchDetail ||
                'Confirm or type the exact patient name from this visit, or select the matching beneficiary.'}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={identityInput}
                onChange={(e) => setIdentityInput(e.target.value)}
                placeholder="Enter exact patient name (Hindi/English)"
                className="flex-1 min-w-[180px] text-xs bg-white border border-amber-300 rounded-lg px-2.5 py-1.5 text-slate-900"
              />
              <button
                type="button"
                disabled={!identityInput.trim()}
                onClick={() => {
                  confirmPatientIdentity(identityInput);
                  setIdentityInput('');
                }}
                className="text-xs font-bold bg-amber-700 hover:bg-amber-800 text-white px-3 py-1.5 rounded-lg disabled:opacity-50"
              >
                Confirm Name
              </button>
              <button
                type="button"
                onClick={() => setIsBeneficiaryModalOpen(true)}
                className="text-xs font-semibold bg-white border border-amber-300 text-amber-900 px-3 py-1.5 rounded-lg hover:bg-amber-100"
              >
                Select Beneficiary
              </button>
            </div>
          </div>
        )}

        {/* Structured Visit Data Snapshot (Single Source of Truth) */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 text-xs bg-slate-50 rounded-xl border border-slate-200/80 p-3">
          <div>
            <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold block">Patient Name</span>
            <span className="font-bold text-slate-900">
              {displayName || 'Name not provided'}
            </span>
          </div>
          <div>
            <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold block">Blood Pressure</span>
            <span className="font-bold text-slate-900">
              {activeVisit.vitals.systolic != null && activeVisit.vitals.diastolic != null
                ? `${activeVisit.vitals.systolic}/${activeVisit.vitals.diastolic} mmHg`
                : 'Not provided'}
            </span>
          </div>
          <div>
            <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold block">Weight</span>
            <span className="font-bold text-slate-900">
              {activeVisit.vitals.weight != null ? `${activeVisit.vitals.weight} kg` : 'Not provided'}
            </span>
          </div>
          <div>
            <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold block">Visit Type</span>
            <span className="font-bold text-slate-900">{activeVisit.visitType || 'Not provided'}</span>
          </div>
          <div>
            <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold block">Next Visit</span>
            <span className="font-bold text-slate-900">{activeVisit.nextVisitDate || 'Not provided'}</span>
          </div>
          <div>
            <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold block">Vaccination</span>
            <span className="font-bold text-slate-900">
              {activeVisit.vaccinationStatus || 'Not provided'}
            </span>
            <span className="text-[10px] text-slate-500 block">
              Booster: {activeVisit.boosterStatus || 'Not provided'}
            </span>
          </div>
        </div>

        {/* Information to confirm (unmentioned clinical details, never auto-populated) */}
        {activeVisit.missingInformation && activeVisit.missingInformation.length > 0 && (
          <div className="bg-slate-50/90 border border-slate-200 rounded-xl p-3 space-y-1.5 text-xs">
            <div className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">
              Information to confirm
            </div>
            <ul className="space-y-1 list-disc list-inside text-slate-700">
              {activeVisit.missingInformation.map((item, idx) => (
                <li key={`${item.field_name}-${idx}`}>
                  <span className="font-semibold">{item.field_name}:</span>{' '}
                  {item.prompt_question || item.reason || 'Not provided in transcript.'}
                </li>
              ))}
            </ul>
          </div>
        )}

        {reportResult && (
          <div className="space-y-1">
            <p className="text-xs text-slate-700 leading-relaxed">
              {String((reportResult.report as { summary?: string }).summary ?? '')}
            </p>
            <p className="text-[11px] text-slate-400">{reportResult.disclaimer}</p>
          </div>
        )}

        {/* Live Voice Listening Preview */}
        {isListeningForCorrection && (
          <div className="bg-red-50/70 border border-red-200 rounded-xl p-3 text-xs text-red-800 flex items-center justify-between">
            <span className="font-medium">
              {correctionLiveTranscript
                ? `Hearing: "${correctionLiveTranscript}"`
                : 'Listening via Gnani STT... Say a correction (e.g. "Nahi, BP 110/90 hai") or "Haan, correct hai".'}
            </span>
          </div>
        )}

        {/* Conversation Log */}
        {conversationLog.length > 0 && (
          <div className="space-y-2 max-h-48 overflow-y-auto bg-slate-50/70 border border-slate-200/70 rounded-xl p-3">
            {conversationLog.map((msg) => (
              <div
                key={msg.id}
                className={`text-xs px-3 py-2 rounded-xl ${
                  msg.role === 'worker'
                    ? 'bg-teal-700 text-white ml-8'
                    : msg.action === 'clarify'
                    ? 'bg-amber-50 text-amber-900 border border-amber-200 mr-8'
                    : msg.action === 'confirmed'
                    ? 'bg-emerald-50 text-emerald-900 border border-emerald-200 mr-8'
                    : 'bg-white text-slate-800 border border-slate-200 mr-8'
                }`}
              >
                <span className="text-[10px] font-bold uppercase opacity-75 block mb-0.5">
                  {msg.role === 'worker' ? 'ASHA Worker' : 'Dhwani AI'}
                </span>
                <span>{msg.text}</span>
              </div>
            ))}
          </div>
        )}

        {/* Typed Correction / Confirmation Fallback + Explicit Confirm Button */}
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={correctionText}
            onChange={(e) => setCorrectionText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && correctionText.trim() && !isReportLoading) {
                const txt = correctionText;
                setCorrectionText('');
                void submitCorrection(txt, 'text');
              }
            }}
            placeholder='Say or type correction, e.g. "Nahi, BP 110/90 hai", "Weight 58 kg hai", or "Haan, correct hai"'
            className="flex-1 min-w-[220px] text-xs border border-slate-200 rounded-xl px-3 py-2"
          />
          <button
            type="button"
            onClick={async () => {
              const txt = correctionText;
              setCorrectionText('');
              await submitCorrection(txt, 'text');
            }}
            disabled={isReportLoading || !correctionText.trim()}
            className="text-xs font-bold text-white bg-teal-700 hover:bg-teal-800 px-4 py-2 rounded-xl disabled:opacity-50"
          >
            Apply correction
          </button>
          <button
            type="button"
            onClick={() => void confirmConversationalReport()}
            disabled={isReportLoading || isReportConfirmed || hasIdentityIssue}
            className="text-xs font-bold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-3.5 py-2 rounded-xl disabled:opacity-50"
          >
            {isReportConfirmed ? 'Confirmed ✓' : 'Confirm Report'}
          </button>
        </div>

        {/* Correction Audit Trail */}
        {activeVisit.correctionHistory && activeVisit.correctionHistory.length > 0 && (
          <div className="border-t border-slate-100 pt-3 space-y-1.5">
            <div className="flex items-center space-x-1.5 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              <History className="w-3.5 h-3.5 text-teal-600" />
              <span>Correction Audit Trail ({activeVisit.correctionHistory.length})</span>
            </div>
            <div className="space-y-1">
              {activeVisit.correctionHistory.map((item, idx) => (
                <div
                  key={`${item.timestamp}-${item.field}-${idx}`}
                  className="text-[11px] text-slate-600 flex flex-wrap items-center justify-between gap-2 bg-slate-50 px-2.5 py-1.5 rounded-lg border border-slate-100"
                >
                  <span>
                    <strong className="text-slate-800">{item.field}</strong>:{' '}
                    <span className="line-through text-slate-400">{String(item.originalValue ?? 'None')}</span>{' '}
                    → <span className="font-semibold text-teal-800">{String(item.correctedValue)}</span>
                  </span>
                  <span className="text-[10px] text-slate-400">
                    {item.source} • {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
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