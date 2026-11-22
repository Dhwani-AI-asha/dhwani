/**
 * Conversational Voice Emergency Confirmation Engine for Dhwani.
 *
 * Strictly reuses existing Gnani TTS (/tts via speak) and Gnani STT (/ws/stt via VoiceClient):
 * - Speaks a concise bilingual Hindi/English emergency alert + question via Gnani TTS.
 * - Opens a dedicated VoiceClient STT session isolated from normal patient transcription.
 * - Handles English, Hindi (Devanagari), Hinglish, negation, ambiguity, silence retries,
 *   and STT disconnection safely (silence / STT error / ambiguity NEVER count as consent).
 * - Never auto-places a call or contacts authorities on YES — records consent and offers
 *   explicit UI dialler/contact buttons.
 * - Preserves the danger-sign alert and emergency referral guidance on NO refusal.
 */
import type {
  DangerSignAlert,
  EmergencyConfirmationState,
  EmergencyEscalationRecord,
} from '../types/index.ts';
import type { VoiceClientCallbacks, VoiceStatus } from './voiceClient.ts';

export type EmergencyIntent = 'yes' | 'no' | 'ambiguous' | 'empty';

export const DEFAULT_MAX_EMERGENCY_ATTEMPTS = 3; // 1 initial question + up to 2 retries
export const DEFAULT_EMERGENCY_SILENCE_TIMEOUT_MS = 7000;

export interface EmergencySttClientLike {
  start(): Promise<void>;
  stop(): void;
}

export interface EmergencyVoiceControllerDeps {
  speakFn: (text: string, language?: string) => Promise<boolean>;
  stopSpeakFn: () => void;
  createSttClientFn: (callbacks: VoiceClientCallbacks) => EmergencySttClientLike;
  pauseNormalCaptureFn: () => void;
  onStateChange: (state: EmergencyConfirmationState) => void;
  onComplete: (
    finalState: EmergencyConfirmationState,
    record: EmergencyEscalationRecord
  ) => void;
  maxAttempts?: number;
  silenceTimeoutMs?: number;
  postSpeakDelayMs?: number;
}

// =========================================================================
// Bilingual Confirmation / Refusal / Negation / Ambiguity Classifier
// =========================================================================

// Hesitation, uncertainty, or clarifying requests must ALWAYS repeat/clarify, never guess
const AMBIGUOUS_UNCERTAINTY_LATIN_RE =
  /(?<![a-z])(?:maybe|perhaps|not\s+sure|unsure|uncertain|wait|hold\s+on|one\s+second|one\s+minute|pardon|repeat|confused|pata\s+nahi|maloom\s+nahi|shayad|ek\s+minute|ruk\s+jao|ruko|samajh\s+nahi|kya\s+bola|dobara|dubara|phir\s+se)(?![a-z])/i;

const AMBIGUOUS_UNCERTAINTY_DEVANAGARI_RE =
  /(?:शायद|पता\s+नहीं|मालूम\s+नहीं|रुक\s+जाओ|रुको|एक\s+मिनट|समझ\s+नहीं|दोबारा|फिर\s+से|क्या\s+बोला)/;

// Strong negation / prohibition / refusal markers
const NEGATION_LATIN_RE =
  /(?<![a-z])(?:no|nope|nah|nahi|nahin|na|mat|don'?t|do\s+not|never|cancel|stop|rehne\s+do|zaroorat\s+nahi|jarurat\s+nahi|abhi\s+nahi|mat\s+bulao|mat\s+karo|nahi\s+bulao|nahi\s+chahiye)(?![a-z])/i;

const NEGATION_DEVANAGARI_RE =
  /(?:^|[\s,.;:!?।|])(?:नहीं|नही|ना|मत|मत\s+बुलाओ|मत\s+करो|रहने\s+दो|अभी\s+नहीं|जरूरत\s+नहीं)(?=$|[\s,.;:!?।|])/;

// Standalone affirmative words (presence alongside negation creates conflict -> ambiguous!)
const AFFIRMATIVE_MARKER_LATIN_RE =
  /(?<![a-z])(?:haan|han|ha|hanji|haanji|yes|yeah|yep|yup|sure|ok|okay|confirm|confirmed|affirmative)(?![a-z])/i;

const AFFIRMATIVE_MARKER_DEVANAGARI_RE =
  /(?:^|[\s,.;:!?।|])(?:हाँ|हां|हाँ\s+जी|हां\s+जी|जी\s*हाँ|जी\s*हां)(?=$|[\s,.;:!?।|])/;

// Full YES action phrases (evaluated ONLY after checking negation & conflict)
const YES_CONSENT_LATIN_RE =
  /(?<![a-z])(?:haan|han|ha|hanji|haanji|ji\s+haan|haan\s+bulao|yes|yeah|yep|yup|confirm|confirmed|affirmative|call\s+(?:the\s+)?ambulance|call\s+(?:the\s+)?doctor|call\s+mo|call\s+108|ambulance\s+bulao|doctor\s+(?:ko\s+)?bulao|contact\s+emergency|help\s+call|madad\s+karo|sampark\s+karo|bulao|bula\s+lo)(?![a-z])/i;

const YES_CONSENT_DEVANAGARI_RE =
  /(?:^|[\s,.;:!?।|])(?:हाँ|हां|जी\s*हाँ|जी\s*हां|हाँ\s+जी|हाँ\s+बुलाओ|हां\s+बुलाओ|बुलाओ|बुला\s+लो|एम्बुलेंस\s+बुलाओ|डॉक्टर\s+को\s+बुलाओ|मदद\s+करो|संपर्क\s+करो)(?=$|[\s,.;:!?।|])/;

/**
 * Classify a worker's spoken emergency confirmation response cleanly across
 * English, Hindi, and Hinglish while guarding against negation and ambiguity.
 */
export function classifyEmergencyResponse(utterance: string): EmergencyIntent {
  if (typeof utterance !== 'string' || !utterance.trim()) {
    return 'empty';
  }

  const normalized = utterance
    .replace(/[’‘]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();

  if (
    AMBIGUOUS_UNCERTAINTY_LATIN_RE.test(normalized) ||
    AMBIGUOUS_UNCERTAINTY_DEVANAGARI_RE.test(normalized)
  ) {
    return 'ambiguous';
  }

  const hasNegation =
    NEGATION_LATIN_RE.test(normalized) || NEGATION_DEVANAGARI_RE.test(normalized);
  const hasAffirmativeWord =
    AFFIRMATIVE_MARKER_LATIN_RE.test(normalized) ||
    AFFIRMATIVE_MARKER_DEVANAGARI_RE.test(normalized);

  // Explicit conflict: contains both affirmative word ("yes"/"haan") and negation ("no"/"nahi"/"mat"/"don't")
  if (hasNegation && hasAffirmativeWord) {
    return 'ambiguous';
  }

  // Negation / refusal takes strict precedence over action nouns like "call ambulance" / "bulao"
  // e.g. "don't call ambulance", "ambulance mat bulao", "Nahi, mat bulao", "no" -> 'no'
  if (hasNegation) {
    return 'no';
  }

  if (
    YES_CONSENT_LATIN_RE.test(normalized) ||
    YES_CONSENT_DEVANAGARI_RE.test(normalized)
  ) {
    return 'yes';
  }

  return 'ambiguous';
}

// =========================================================================
// Bilingual Gnani TTS Alert & Confirmation Prompts
// =========================================================================

export function buildEmergencyPromptText(
  alert: Pick<DangerSignAlert, 'title' | 'hindiTitle'>,
  attempt: number,
  reason?: 'ambiguous' | 'silence' | 'stt_error'
): string {
  const hiLabel = alert.hindiTitle || alert.title;
  const enLabel = alert.title;

  if (attempt <= 1 || !reason) {
    return (
      `सावधान! ${hiLabel}। Warning: ${enLabel} detected. ` +
      `क्या आप इमरजेंसी सेवा से संपर्क करने में मदद चाहती हैं? ` +
      `Should I help contact emergency services? कृपया हाँ या नहीं बोलें।`
    );
  }

  if (reason === 'ambiguous') {
    return (
      `साफ़ समझ नहीं आया। Please confirm clearly. ` +
      `${enLabel} के लिए इमरजेंसी मदद चाहिए? Do you want help contacting emergency services? ` +
      `कृपया हाँ या नहीं बोलें।`
    );
  }

  if (reason === 'stt_error') {
    return (
      `माइक कनेक्शन में समस्या आई, दोबारा कोशिश कर रहे हैं। Please speak again. ` +
      `क्या इमरजेंसी संपर्क में मदद चाहिए? Should I help contact emergency services? हाँ या नहीं बोलें।`
    );
  }

  // silence retry
  return (
    `कोई जवाब नहीं मिला। No response heard. ` +
    `${hiLabel}, ${enLabel}. क्या मैं इमरजेंसी मदद के लिए संपर्क विकल्प खोलूँ? ` +
    `Should I help contact emergency services? बोलिए हाँ या नहीं।`
  );
}

// =========================================================================
// Dedicated Emergency Voice Confirmation State Machine Controller
// =========================================================================

export class EmergencyVoiceConfirmationController {
  private deps: EmergencyVoiceControllerDeps;
  private sessionCounter = 0;
  private currentStt: EmergencySttClientLike | null = null;
  private silenceTimer: ReturnType<typeof setTimeout> | null = null;
  private settleTimer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;
  private state: EmergencyConfirmationState | null = null;

  constructor(deps: EmergencyVoiceControllerDeps) {
    this.deps = deps;
  }

  public getState(): EmergencyConfirmationState | null {
    return this.state;
  }

  public async start(
    alert: DangerSignAlert,
    options?: { wasVisitRecordingPaused?: boolean; nowIso?: string }
  ): Promise<EmergencyConfirmationState | null> {
    this.disposed = false;
    const sessionId = ++this.sessionCounter;
    this.cleanupListening();

    // Requirement 1 & 6: Immediately pause normal patient capture & stop unrelated speech
    this.deps.pauseNormalCaptureFn();
    this.deps.stopSpeakFn();

    const maxAttempts = this.deps.maxAttempts ?? DEFAULT_MAX_EMERGENCY_ATTEMPTS;
    const detectedAt = options?.nowIso || new Date().toISOString();
    const initialPrompt = buildEmergencyPromptText(alert, 1);

    this.state = {
      sessionId,
      alertId: alert.id,
      ruleCode: alert.ruleCode,
      canonicalKey: alert.canonicalKey || alert.ruleCode.toLowerCase(),
      detectedSign: alert.title,
      hindiSign: alert.hindiTitle,
      evidence: alert.evidence,
      phase: 'speaking_alert',
      promptText: initialPrompt,
      liveSttTranscript: '',
      confirmationTranscript: '',
      response: 'pending',
      escalationStatus: 'pending_confirmation',
      attempt: 1,
      maxAttempts,
      sttDisconnected: false,
      wasVisitRecordingPaused: Boolean(options?.wasVisitRecordingPaused),
      detectedAt,
      statusMessage: 'Speaking bilingual emergency alert via Gnani TTS...',
    };

    this.emitState();

    await this.runAttemptLoop(alert, sessionId);
    return this.state;
  }

  public dispose(): void {
    this.disposed = true;
    this.sessionCounter++;
    this.cleanupListening();
    this.deps.stopSpeakFn();
  }

  private clearTimers(): void {
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }
    if (this.settleTimer) {
      clearTimeout(this.settleTimer);
      this.settleTimer = null;
    }
  }

  private cleanupListening(): void {
    this.clearTimers();
    if (this.currentStt) {
      try {
        this.currentStt.stop();
      } catch {
        // Ignore cleanup errors
      }
      this.currentStt = null;
    }
  }

  private isStale(sessionId: number): boolean {
    return this.disposed || this.sessionCounter !== sessionId || !this.state;
  }

  private emitState(): void {
    if (this.state) {
      this.deps.onStateChange({ ...this.state });
    }
  }

  private updateState(patch: Partial<EmergencyConfirmationState>): void {
    if (!this.state) return;
    this.state = { ...this.state, ...patch };
    this.emitState();
  }

  private async runAttemptLoop(alert: DangerSignAlert, sessionId: number): Promise<void> {
    if (!this.state) return;
    const maxAttempts = this.state.maxAttempts;
    let retryReason: 'ambiguous' | 'silence' | 'stt_error' | undefined;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      if (this.isStale(sessionId)) return;

      const promptText = buildEmergencyPromptText(alert, attempt, retryReason);
      this.updateState({
        phase: attempt === 1 ? 'speaking_alert' : 'retrying',
        attempt,
        promptText,
        liveSttTranscript: '',
        statusMessage:
          attempt === 1
            ? 'Speaking bilingual emergency alert via Gnani TTS...'
            : `Repeating question (attempt ${attempt} of ${maxAttempts})...`,
      });

      // Speak prompt via existing Gnani TTS; never block forever if TTS fails
      try {
        await this.deps.speakFn(promptText, 'hi-IN');
      } catch {
        // Continue to dedicated STT listening / retry handling even if TTS fails
      }

      if (this.isStale(sessionId)) return;

      const postSpeakDelay = this.deps.postSpeakDelayMs ?? 150;
      if (postSpeakDelay > 0) {
        await new Promise((r) => setTimeout(r, postSpeakDelay));
      }
      if (this.isStale(sessionId)) return;

      const outcome = await this.listenOnce(sessionId);
      if (this.isStale(sessionId)) return;

      if (outcome.kind === 'disconnect') {
        this.updateState({
          sttDisconnected: true,
          errorMessage: outcome.error || 'Voice STT disconnected during emergency confirmation.',
        });
        if (attempt < maxAttempts) {
          retryReason = 'stt_error';
          continue;
        }
        // Requirement 5 & 9: STT failure NEVER counts as consent; keep alert visible for manual handling
        await this.finalizeOutcome(
          'no_response',
          'no_response',
          'no_response',
          'STT disconnected after maximum attempts. Alert kept visible for manual handling.',
          sessionId
        );
        return;
      }

      if (outcome.kind === 'silence') {
        if (attempt < maxAttempts) {
          retryReason = 'silence';
          continue;
        }
        await this.finalizeOutcome(
          'no_response',
          'no_response',
          'no_response',
          'No voice response heard. Alert kept visible for manual handling.',
          sessionId,
          'कोई जवाब नहीं मिला। अलर्ट स्क्रीन पर है, कृपया मैन्युअल रूप से आगे बढ़ें। No response received. Please handle the alert on screen.'
        );
        return;
      }

      const transcript = outcome.transcript.trim();
      const updatedTranscriptLog = this.state.confirmationTranscript
        ? `${this.state.confirmationTranscript} | ${transcript}`
        : transcript;
      this.updateState({ confirmationTranscript: updatedTranscriptLog });

      const decision = classifyEmergencyResponse(transcript);
      if (decision === 'yes') {
        await this.finalizeOutcome(
          'confirmed',
          'yes',
          'confirmed',
          'Worker consent recorded via voice. Emergency dialler & referral actions ready on screen (no automatic call placed).',
          sessionId,
          'सहमति दर्ज हो गई है। आपातकालीन कॉल के लिए स्क्रीन पर दिया गया बटन दबाएं। Worker consent recorded. Use the on-screen button to contact emergency services.'
        );
        return;
      }

      if (decision === 'no') {
        await this.finalizeOutcome(
          'declined',
          'no',
          'declined',
          'Worker declined emergency calling via voice. Danger-sign alert & PHC referral guidance remain on screen.',
          sessionId,
          'ठीक है, आपकी असहमति दर्ज कर ली गई है। रेफरल निर्देश स्क्रीन पर बने रहेंगे। Refusal recorded. Emergency referral guidance remains displayed.'
        );
        return;
      }

      // Ambiguous or empty -> repeat question if attempts remain, NEVER count as consent
      if (attempt < maxAttempts) {
        retryReason = 'ambiguous';
        continue;
      }

      await this.finalizeOutcome(
        'no_response',
        'no_response',
        'no_response',
        'Voice response remained unclear after retries. Alert kept visible for manual handling.',
        sessionId,
        'स्पष्ट उत्तर नहीं मिला। कृपया स्क्रीन से मैन्युअल रूप से कार्रवाई करें। Response remained unclear. Please handle the alert manually on screen.'
      );
      return;
    }
  }

  private listenOnce(
    sessionId: number
  ): Promise<
    | { kind: 'speech'; transcript: string }
    | { kind: 'silence' }
    | { kind: 'disconnect'; error?: string }
  > {
    return new Promise((resolve) => {
      let settled = false;
      let expectedStop = false;
      let hasEnteredActiveStt = false;
      const segments: string[] = [];
      const timeoutMs = this.deps.silenceTimeoutMs ?? DEFAULT_EMERGENCY_SILENCE_TIMEOUT_MS;

      const finish = (
        result:
          | { kind: 'speech'; transcript: string }
          | { kind: 'silence' }
          | { kind: 'disconnect'; error?: string }
      ) => {
        if (settled) return;
        settled = true;
        expectedStop = true;
        this.cleanupListening();
        resolve(result);
      };

      const startTimer = (ms: number) => {
        if (this.silenceTimer) clearTimeout(this.silenceTimer);
        this.silenceTimer = setTimeout(() => {
          const buffered = segments.join(' ').trim();
          if (buffered) {
            finish({ kind: 'speech', transcript: buffered });
          } else {
            finish({ kind: 'silence' });
          }
        }, ms);
      };

      this.updateState({
        phase: 'listening',
        liveSttTranscript: '',
        statusMessage: 'Listening for worker Yes/No via dedicated Gnani STT session...',
      });

      const callbacks: VoiceClientCallbacks = {
        onSegment: (text: string) => {
          if (settled || this.isStale(sessionId)) return;
          const clean = text.trim();
          if (!clean) return;
          segments.push(clean);
          this.updateState({ liveSttTranscript: segments.join(' ') });
          // Extend window slightly so Gnani 1.2s pause detection can emit final turn cleanly
          startTimer(Math.max(2000, Math.min(timeoutMs, 3500)));
        },
        onTurn: (turnText: string) => {
          if (settled || this.isStale(sessionId)) return;
          const clean = (turnText || segments.join(' ')).trim();
          if (clean) {
            this.updateState({ liveSttTranscript: clean });
            finish({ kind: 'speech', transcript: clean });
          }
        },
        onError: (msg: string) => {
          if (settled || this.isStale(sessionId)) return;
          finish({ kind: 'disconnect', error: msg });
        },
        onStatus: (status: VoiceStatus) => {
          if (settled || this.isStale(sessionId)) return;
          if (status === 'connecting' || status === 'live') {
            hasEnteredActiveStt = true;
            return;
          }
          if (hasEnteredActiveStt && !expectedStop && status === 'idle') {
            finish({ kind: 'disconnect', error: 'STT WebSocket disconnected unexpectedly.' });
          }
        },
      };

      this.currentStt = this.deps.createSttClientFn(callbacks);
      startTimer(timeoutMs);

      Promise.resolve(this.currentStt.start()).catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : 'Failed to start emergency voice listener';
        finish({ kind: 'disconnect', error: msg });
      });
    });
  }

  private async finalizeOutcome(
    phase: 'confirmed' | 'declined' | 'no_response',
    response: 'yes' | 'no' | 'no_response',
    escalationStatus: 'confirmed' | 'declined' | 'no_response',
    statusMessage: string,
    sessionId: number,
    closingSpeech?: string
  ): Promise<void> {
    if (this.isStale(sessionId) || !this.state) return;

    const respondedAt = new Date().toISOString();
    this.updateState({
      phase,
      response,
      escalationStatus,
      respondedAt,
      statusMessage,
    });

    const record: EmergencyEscalationRecord = {
      id: `emg-${Date.now()}-${sessionId}`,
      alertId: this.state.alertId,
      ruleCode: this.state.ruleCode,
      detectedSign: this.state.detectedSign,
      evidence: this.state.evidence,
      detectedAt: this.state.detectedAt,
      confirmationTranscript: this.state.confirmationTranscript,
      response: this.state.response,
      respondedAt,
      escalationStatus: this.state.escalationStatus,
      attempts: this.state.attempt,
      sttDisconnected: this.state.sttDisconnected || undefined,
    };

    this.deps.onComplete({ ...this.state }, record);

    if (closingSpeech) {
      try {
        await this.deps.speakFn(closingSpeech, 'hi-IN');
      } catch {
        // Closing TTS is advisory only
      }
    }
  }
}
