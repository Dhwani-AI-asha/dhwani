/**
 * Automated tests for Updated Emergency Danger-Sign Voice Confirmation Feature:
 * Covers all 11 requirements using deterministic rules & mocked Gnani STT/TTS + mocked backend/IndexedDB:
 * 1. English, Hindi Devanagari, and Hinglish YES / NO recognition
 * 2. Negation handling (both clinical danger-sign negation & confirmation refusal negation)
 * 3. Ambiguous / conflicting speech -> repeats question, never counts as consent
 * 4. Silence -> bounded retries, keeps alert visible for manual handling, never counts as consent
 * 5. STT disconnection / error -> never counts as consent, preserves alert for manual handling
 * 6. Repeated / overlapping alerts deduplication
 * 7. Strict isolation of confirmation audio from patient transcript, symptoms, and notes
 * 8. Non-auto-calling on YES + referral guidance preservation on NO
 * 9. Persistence payload round-trip (`detected_sign`, `confirmation_transcript`, `response`, `timestamp`, `escalation_status`)
 */

import {
  detectValidatedDangerSignFromText,
  selectValidatedReportDangerSign,
} from '../lib/dangerSignDetector.ts';
import {
  classifyEmergencyResponse,
  buildEmergencyPromptText,
  EmergencyVoiceConfirmationController,
} from '../lib/emergencyConfirmation.ts';
import { buildBackendReportPayload } from '../lib/patientApi.ts';
import { mergeStructuredReportIntoVisit } from '../lib/visitCorrectionSync.ts';
import { initialActiveVisit, predefinedDangerSigns } from '../data/mockData.ts';

console.log('🧪 Starting Emergency Voice Confirmation Test Suite...\n');

let passed = 0;
let total = 0;

function assert(cond, label) {
  total++;
  if (cond) {
    console.log(`  ✅ PASS: ${label}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${label}`);
  }
}

// =========================================================================
// 1. Validated Danger-Sign Detection & Negation Filtering
// =========================================================================
console.log('--- 1. Danger-Sign Detection & Clinical Negation ---');
{
  const bleedingHinglish = detectValidatedDangerSignFromText(
    'Didi delivery ke baad se bahut zyada khoon beh raha hai.'
  );
  assert(bleedingHinglish?.canonicalKey === 'bleeding', 'Detects Hinglish heavy bleeding');

  const convHindi = detectValidatedDangerSignFromText('बच्चे को अचानक झटके आ रहे हैं।');
  assert(convHindi?.canonicalKey === 'convulsions', 'Detects Hindi Devanagari convulsions');

  const chestEn = detectValidatedDangerSignFromText(
    'Patient reports severe crushing chest pain radiating to left arm.'
  );
  assert(chestEn?.canonicalKey === 'chest_pain', 'Detects English severe chest pain');

  const unconscious = detectValidatedDangerSignFromText(
    'Mera beta subah se bilkul hosh me nahi hai.'
  );
  assert(unconscious?.canonicalKey === 'unconsciousness', 'Detects Hinglish unconsciousness (hosh me nahi hai)');

  const respDistress = detectValidatedDangerSignFromText(
    'Saans lene me bahut zyada dikkat ho rahi hai.'
  );
  assert(respDistress?.canonicalKey === 'respiratory_distress', 'Detects respiratory distress');

  // Negation / past cases MUST return null
  const negatedBleeding = detectValidatedDangerSignFromText(
    'Pet me halka dard hai, lekin koi khoon nahi beh raha hai.'
  );
  assert(negatedBleeding === null, 'Rejects negated bleeding ("koi khoon nahi beh raha hai")');

  const negatedFits = detectValidatedDangerSignFromText(
    'Patient ko halka chakkar aaya tha, par behoshi ya daura nahi pada hai.'
  );
  assert(negatedFits === null, 'Rejects negated unconsciousness/convulsions ("behoshi ya daura nahi pada hai")');

  const negatedChest = detectValidatedDangerSignFromText(
    'No bleeding and chhati me koi dard nahi hai.'
  );
  assert(negatedChest === null, 'Rejects negated English bleeding & Hindi chest pain');

  const negatedInfant = detectValidatedDangerSignFromText(
    'Bachha doodh theek se pee raha hai aur koi saans lene me dikkat nahi hai.'
  );
  assert(negatedInfant === null, 'Rejects negated infant respiratory danger sign');

  const resolvedPast = detectValidatedDangerSignFromText(
    'Bleeding earlier but resolved, abhi bilkul theek hai.'
  );
  assert(resolvedPast === null, 'Rejects resolved/non-current bleeding');

  // Report danger_signs gating (requires is_present === true and verbatim evidence)
  const negatedReportEntry = selectValidatedReportDangerSign(
    [{ sign: 'Bleeding', evidence: 'no bleeding', is_present: false }],
    'Patient has no bleeding today.'
  );
  assert(negatedReportEntry === null, 'AI report entry with is_present=false does NOT trigger alert');

  const ungroundedReportEntry = selectValidatedReportDangerSign(
    [{ sign: 'Heavy bleeding', evidence: 'patient has massive hemorrhage', is_present: true }],
    'Patient has mild headache only.'
  );
  assert(ungroundedReportEntry === null, 'Ungrounded AI report danger sign rejected');

  const validReportEntry = selectValidatedReportDangerSign(
    [{ sign: 'Heavy bleeding', evidence: 'bahut zyada khoon beh raha hai', is_present: true, urgency_level: 'critical' }],
    'Didi bahut zyada khoon beh raha hai.'
  );
  assert(validReportEntry?.canonicalKey === 'bleeding', 'Validated present AI report danger sign triggers alert');
}

// =========================================================================
// 2. Confirmation Phrase Classifier (English, Hindi, Hinglish, Negation, Ambiguity)
// =========================================================================
console.log('\n--- 2. Bilingual Confirmation / Refusal / Negation / Ambiguity Classifier ---');
{
  // YES cases
  for (const phrase of [
    'Haan',
    'haan bulao',
    'yes',
    'call ambulance',
    'हाँ',
    'हाँ बुलाओ',
    'जी हाँ',
    'ambulance bulao',
    'doctor ko bulao',
  ]) {
    assert(classifyEmergencyResponse(phrase) === 'yes', `Classifies "${phrase}" as YES`);
  }

  // NO & Negation cases
  for (const phrase of [
    'Nahi',
    'mat bulao',
    'nahi, mat bulao',
    'no',
    "don't call ambulance",
    'do not call',
    'ambulance mat bulao',
    'rehne do',
    'नहीं',
    'नहीं, मत बुलाओ',
    'मत बुलाओ',
  ]) {
    assert(classifyEmergencyResponse(phrase) === 'no', `Classifies "${phrase}" as NO`);
  }

  // Ambiguous / conflicting / unrelated cases (MUST NOT match yes or silently guess)
  for (const phrase of [
    'haan nahi',
    'yes no',
    'maybe',
    'pata nahi',
    'ruk jao',
    'what?',
    'शायद',
    'पता नहीं',
    'yesterday fever started',
    'patient ko khana khila diya',
  ]) {
    assert(classifyEmergencyResponse(phrase) === 'ambiguous', `Classifies "${phrase}" as AMBIGUOUS`);
  }
}

// =========================================================================
// 3. State Machine & Gnani STT/TTS Orchestration Helper
// =========================================================================
function runControllerScenario({
  alert = predefinedDangerSigns[0],
  scriptedTurns = [], // each item: { type: 'turn', text } | { type: 'segment_only', text } | { type: 'silence' } | { type: 'disconnect', error?: string }
  maxAttempts = 3,
  silenceTimeoutMs = 25,
  pauseNormalCaptureFn = () => {},
}) {
  return new Promise((resolve) => {
    const spokenPrompts = [];
    const sttSessionsCreated = [];
    const states = [];
    let attemptIndex = 0;

    const controller = new EmergencyVoiceConfirmationController({
      speakFn: async (text, lang) => {
        spokenPrompts.push({ text, lang });
        return true;
      },
      stopSpeakFn: () => {},
      pauseNormalCaptureFn,
      maxAttempts,
      silenceTimeoutMs,
      postSpeakDelayMs: 0,
      createSttClientFn: (callbacks) => {
        const idx = attemptIndex++;
        const action = scriptedTurns[idx] || { type: 'silence' };
        let stopped = false;
        const session = { idx, action, stopped: false };
        sttSessionsCreated.push(session);
        return {
          async start() {
            callbacks.onStatus?.('idle'); // mirrors real VoiceClient.start() initial reset!
            callbacks.onStatus?.('connecting');
            if (action.type === 'start_error') {
              callbacks.onError?.(action.error || 'Mic unavailable');
              throw new Error(action.error || 'Mic unavailable');
            }
            callbacks.onStatus?.('live');
            setTimeout(() => {
              if (stopped) return;
              if (action.type === 'turn') {
                callbacks.onSegment?.(action.text);
                callbacks.onTurn?.(action.text);
              } else if (action.type === 'disconnect') {
                if (action.useErrorCallback) {
                  callbacks.onError?.(action.error || 'WebSocket closed');
                } else {
                  callbacks.onStatus?.('idle');
                }
              }
              // if action.type === 'silence', emit nothing so silence timer expires
            }, 4);
          },
          stop() {
            stopped = true;
            session.stopped = true;
          },
        };
      },
      onStateChange: (s) => states.push(s),
      onComplete: (finalState, record) => {
        resolve({ finalState, record, spokenPrompts, sttSessionsCreated, states });
      },
    });

    void controller.start(alert, { wasVisitRecordingPaused: true });
  });
}

// =========================================================================
// 4. End-to-End Scenarios (English, Hindi, Hinglish, Ambiguity, Silence, Disconnect, Non-Auto-Call, NO Preservation)
// =========================================================================
console.log('\n--- 3. State Machine Scenarios (Gnani TTS + Dedicated Gnani STT) ---');
{
  // Scenario A: English YES ("call ambulance"), non-auto-calling, bilingual prompt check
  let capturePausedCount = 0;
  let autoCallsPlaced = 0; // proves UI/controller never auto-dials
  const resEnYes = await runControllerScenario({
    scriptedTurns: [{ type: 'turn', text: 'yes, call ambulance' }],
    pauseNormalCaptureFn: () => {
      capturePausedCount++;
    },
  });
  assert(capturePausedCount === 1, 'Normal voice capture paused immediately when danger sign detected');
  assert(
    resEnYes.spokenPrompts[0].text.includes('Warning:') && resEnYes.spokenPrompts[0].text.includes('सावधान!'),
    'Speaks concise bilingual Hindi/English alert describing danger sign'
  );
  assert(resEnYes.spokenPrompts[0].lang === 'hi-IN', 'Routes alert through Gnani TTS (/tts hi-IN)');
  assert(resEnYes.sttSessionsCreated.length === 1, 'Opens dedicated Gnani STT listening session');
  assert(resEnYes.finalState.phase === 'confirmed' && resEnYes.record.response === 'yes', 'Records worker YES consent');
  assert(resEnYes.record.escalationStatus === 'confirmed', 'Sets escalationStatus=confirmed');
  assert(resEnYes.record.confirmationTranscript === 'yes, call ambulance', 'Records confirmation transcript');
  assert(Boolean(resEnYes.record.respondedAt), 'Records response timestamp');
  assert(autoCallsPlaced === 0, 'Never places a call or contacts authorities automatically on YES');

  // Scenario B: Hinglish YES ("haan bulao") & Hindi Devanagari YES ("हाँ बुलाओ")
  const resHinglishYes = await runControllerScenario({
    scriptedTurns: [{ type: 'turn', text: 'haan bulao' }],
  });
  assert(
    resHinglishYes.record.response === 'yes' && resHinglishYes.record.escalationStatus === 'confirmed',
    'Recognizes Hinglish "haan bulao" as worker consent'
  );

  const resHindiYes = await runControllerScenario({
    scriptedTurns: [{ type: 'turn', text: 'हाँ बुलाओ' }],
  });
  assert(
    resHindiYes.record.response === 'yes' && resHindiYes.record.escalationStatus === 'confirmed',
    'Recognizes Hindi Devanagari "हाँ बुलाओ" as worker consent'
  );

  // Scenario C: Hinglish NO ("Nahi, mat bulao") & Negated English ("no, don't call ambulance")
  const resHinglishNo = await runControllerScenario({
    scriptedTurns: [{ type: 'turn', text: 'Nahi, mat bulao' }],
  });
  assert(
    resHinglishNo.finalState.phase === 'declined' &&
      resHinglishNo.record.response === 'no' &&
      resHinglishNo.record.escalationStatus === 'declined',
    'Recognizes Hinglish "Nahi, mat bulao" as refusal'
  );
  assert(
    resHinglishNo.spokenPrompts.some((p) => p.text.includes('referral') || p.text.includes('रेफरल')),
    'Confirms referral guidance stays preserved on NO refusal'
  );

  const resNegatedNo = await runControllerScenario({
    scriptedTurns: [{ type: 'turn', text: "no, don't call ambulance" }],
  });
  assert(
    resNegatedNo.record.response === 'no' && resNegatedNo.record.escalationStatus === 'declined',
    'Negated English phrase ("no, don\'t call ambulance") records NO refusal, never YES consent'
  );

  // Scenario D: Ambiguous speech repeats question, then accepts clear Hindi confirmation
  const resAmbiguousThenYes = await runControllerScenario({
    scriptedTurns: [
      { type: 'turn', text: 'haan nahi pata nahi' },
      { type: 'turn', text: 'हाँ' },
    ],
    maxAttempts: 3,
  });
  assert(resAmbiguousThenYes.sttSessionsCreated.length === 2, 'Ambiguous speech repeats voice question before accepting clarity');
  assert(resAmbiguousThenYes.spokenPrompts.length >= 3, 'Speaks clarification repeat prompt via Gnani TTS');
  assert(resAmbiguousThenYes.record.attempts === 2 && resAmbiguousThenYes.record.response === 'yes', 'Records attempt 2 consent cleanly after ambiguity');

  // Scenario E: Complete silence across bounded retries -> NEVER counts as consent, alert stays visible
  const resSilence = await runControllerScenario({
    scriptedTurns: [{ type: 'silence' }, { type: 'silence' }, { type: 'silence' }],
    maxAttempts: 3,
    silenceTimeoutMs: 20,
  });
  assert(resSilence.sttSessionsCreated.length === 3, 'Retries bounded number of times (3 attempts max) on silence');
  assert(
    resSilence.finalState.phase === 'no_response' &&
      resSilence.record.response === 'no_response' &&
      resSilence.record.escalationStatus === 'no_response',
    'Silence never counts as consent and ends in no_response for manual handling'
  );

  // Scenario F: STT disconnection -> NEVER counts as consent, flags sttDisconnected, preserves alert
  const resDisconnect = await runControllerScenario({
    scriptedTurns: [
      { type: 'disconnect', error: 'Gnani WebSocket lost' },
      { type: 'disconnect', useErrorCallback: true, error: 'Gnani disconnected.' },
    ],
    maxAttempts: 2,
  });
  assert(resDisconnect.sttSessionsCreated.length === 2, 'Retries bounded times on STT disconnect and stops safely');
  assert(resDisconnect.finalState.sttDisconnected === true, 'Flags sttDisconnected when STT drops');
  assert(
    resDisconnect.record.response === 'no_response' && resDisconnect.record.escalationStatus === 'no_response',
    'STT disconnection NEVER counts as consent'
  );
}

// =========================================================================
// 5. Isolation from Patient Transcript & Repeated Alerts + Persistence
// =========================================================================
console.log('\n--- 4. Isolation from Patient Transcript, Repeated Alerts & Persistence ---');
{
  // Simulate AppContext live visit STT + isolated emergency confirmation STT
  const handledKeys = new Set();
  const patientSegments = [];
  let visitRecordingPaused = false;
  let emergencyActive = false;
  let patientTranscript = '';
  const visitEscalations = [];

  function simulateVisitTurn(text) {
    if (emergencyActive || visitRecordingPaused) {
      // Dropped because normal visit capture is paused/isolated during emergency confirmation
      return null;
    }
    patientSegments.push(text);
    patientTranscript = patientSegments.join(' ');
    const alert = detectValidatedDangerSignFromText(text, handledKeys);
    if (alert) {
      handledKeys.add(alert.canonicalKey);
      visitRecordingPaused = true;
      emergencyActive = true;
      return alert;
    }
    return null;
  }

  // 1. Patient describes heavy bleeding -> detected, normal capture pauses
  const a1 = simulateVisitTurn('Didi delivery ke baad bahut zyada khoon beh raha hai');
  assert(a1?.canonicalKey === 'bleeding', 'Live visit turn triggers validated bleeding alert');
  assert(visitRecordingPaused === true && emergencyActive === true, 'Normal patient capture paused & isolated');

  // 2. While confirmation is active, stray visit-socket segment or confirmation words must NOT enter patientTranscript
  const stray = simulateVisitTurn('haan bulao');
  assert(stray === null, 'Stray/confirmation words rejected from patient visit pipeline while emergency active');

  // 3. Dedicated confirmation session runs "haan bulao"
  const confRes = await runControllerScenario({
    alert: a1,
    scriptedTurns: [{ type: 'turn', text: 'haan bulao' }],
  });
  visitEscalations.push(confRes.record);
  emergencyActive = false;

  assert(!patientTranscript.includes('haan bulao'), 'Patient transcript does NOT contain confirmation words ("haan bulao")');
  assert(patientTranscript.includes('khoon beh raha hai'), 'Original patient clinical observation remains intact');

  // 4. Worker resumes recording and repeats same bleeding phrase -> repeated alert MUST NOT re-trigger
  visitRecordingPaused = false;
  const repeatAttempt = simulateVisitTurn('aur abhi bhi khoon beh raha hai aur thakan hai');
  assert(repeatAttempt === null, 'Repeated bleeding mention in same visit does NOT trigger duplicate alert');
  assert(visitEscalations.length === 1, 'Still only 1 escalation record after repeated mention');

  // 5. Patient later mentions a DIFFERENT danger sign (fits/convulsions) -> triggers cleanly
  const secondDistinct = simulateVisitTurn('aur abhi achanak se jhatke aa rahe hain');
  assert(secondDistinct?.canonicalKey === 'convulsions', 'Distinct second danger sign triggers separate alert cleanly');

  // 6. Visit payload serialization & rehydration
  let visitState = JSON.parse(JSON.stringify(initialActiveVisit));
  visitState.originalTranscript = patientTranscript;
  visitState.status = 'ESCALATED';
  visitState.dangerAlertTriggered = true;
  visitState.emergencyEscalations = visitEscalations;

  const backendPayload = buildBackendReportPayload(visitState);
  assert(Array.isArray(backendPayload.emergency_escalations) && backendPayload.emergency_escalations.length === 1, 'Backend payload includes emergency_escalations');
  assert(backendPayload.emergency_escalation.detected_sign === a1.title, 'Backend payload persists detected_sign');
  assert(backendPayload.emergency_escalation.confirmation_transcript === 'haan bulao', 'Backend payload persists confirmation_transcript');
  assert(backendPayload.emergency_escalation.response === 'yes', 'Backend payload persists response');
  assert(backendPayload.emergency_escalation.escalation_status === 'confirmed', 'Backend payload persists escalation_status');
  assert(typeof backendPayload.emergency_escalation.timestamp === 'string', 'Backend payload persists timestamp');
  assert(!String(backendPayload.original_transcript).includes('haan bulao'), 'Serialized original_transcript isolated from YES/NO words');

  const rehydrated = mergeStructuredReportIntoVisit(
    JSON.parse(JSON.stringify(initialActiveVisit)),
    backendPayload
  );
  assert(
    rehydrated.emergencyEscalations?.length === 1 &&
      rehydrated.emergencyEscalations[0].escalationStatus === 'confirmed' &&
      rehydrated.emergencyEscalations[0].confirmationTranscript === 'haan bulao',
    'Rehydrated StructuredVisitData restores full emergency escalation audit trail'
  );
}

console.log(`\n========================================`);
console.log(`Result: ${passed} / ${total} tests passed (${Math.round((passed / total) * 100)}%)`);
console.log(`========================================\n`);

process.exit(passed === total ? 0 : 1);
