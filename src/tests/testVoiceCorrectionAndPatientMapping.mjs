/**
 * Frontend unit & integration tests (mocked HTTP / IndexedDB) for:
 * - Part 1: model_unavailable error parsing (preserving message & reason)
 * - Part 2: Canonical patient ID resolution, missing patient handling, anti-mismatch guard
 * - Part 3 & 4: Structured voice correction sync, unrelated field preservation,
 *   confirmation gating, audit trail mapping, spoken read-back generation,
 *   and corrected values surviving page refresh (IndexedDB + backend hydration).
 */

import { mockBeneficiaries, initialActiveVisit } from '../data/mockData.ts';
import {
  resolveBeneficiaryPatientId,
  saveVisit,
  updateVisitReport,
  getVisitById,
  buildBackendReportPayload,
} from '../lib/patientApi.ts';
import { generateReport, voiceCorrectReport } from '../lib/reportApi.ts';
import {
  buildCurrentStructuredReport,
  mergeStructuredReportIntoVisit,
  buildStructuredReadBackText,
} from '../lib/visitCorrectionSync.ts';
import { saveVisitRecord, getStoredVisitById } from '../services/offlineDB.ts';

console.log('🧪 Starting Dhwani Voice Correction & Patient Mapping Frontend Test Suite...\n');

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

function makeResponse(status, jsonBody) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : status === 201 ? 'Created' : 'Error',
    async json() {
      return jsonBody;
    },
    async text() {
      return JSON.stringify(jsonBody);
    },
  };
}

// =========================================================================
// 1. Part 1: AI report unavailable-model error handling (mocked fetch)
// =========================================================================
console.log('--- 1. AI Model Unavailable Error Handling ---');
{
  const mockFetchUnavailable = async () =>
    makeResponse(400, {
      ok: false,
      error: 'model_unavailable',
      reason: 'missing_api_key',
      message: 'AI report model is not configured: LLM_API_KEY is missing in .env. Visit data preserved.',
    });

  const res = await generateReport('Pooja Devi BP 120/80', null, mockFetchUnavailable);
  assert(res.ok === false, 'generateReport returns ok: false when model unavailable');
  assert(res.error === 'model_unavailable', 'Preserves error code model_unavailable');
  assert(res.reason === 'missing_api_key', 'Surfaces safe diagnostic reason missing_api_key');
  assert(res.message.includes('preserved'), 'Surfaces safe human-readable error noting visit data is preserved');
}

// =========================================================================
// 2. Part 2: Patient ID mapping & genuinely missing beneficiary handling
// =========================================================================
console.log('\n--- 2. Patient ID Mapping & Missing Beneficiary Handling ---');
{
  const pooja = mockBeneficiaries[0];
  assert(pooja.rchId === '#9842-8819', 'Pooja Devi RCH ID remains #9842-8819 for display');
  assert(pooja.patientId === 'PAT-2026-0002', 'Pooja Devi carries canonical backend patientId PAT-2026-0002');

  const seenRequests = [];
  const mockPatientBackend = async (url, init = {}) => {
    seenRequests.push({ url, method: init.method || 'GET', body: init.body ? JSON.parse(init.body) : null });
    if (url.endsWith('/api/v1/patients/PAT-2026-0002')) {
      return makeResponse(200, {
        patient_id: 'PAT-2026-0002',
        name: 'Pooja Devi',
        age: 24,
        address: 'Village Rampur, Gali 2, Ward 4 (RCH #9842-8819)',
      });
    }
    if (url.endsWith('/api/v1/patients/PAT-2026-9999')) {
      return makeResponse(404, { detail: "Patient with ID 'PAT-2026-9999' not found." });
    }
    if (url.includes('/api/v1/patients/?search=')) {
      return makeResponse(200, { total: 0, patients: [] });
    }
    if (url.endsWith('/api/v1/visits/') && init.method === 'POST') {
      const payload = JSON.parse(init.body);
      if (payload.patient_id !== 'PAT-2026-0002') {
        return makeResponse(404, { detail: `Patient with ID '${payload.patient_id}' not found.` });
      }
      return makeResponse(201, {
        visit_id: 'VIS-2026-0005',
        patient_id: payload.patient_id,
        visit_date: payload.visit_date,
        report: payload.report,
        created_at: '2026-11-22T03:00:00',
        updated_at: '2026-11-22T03:00:00',
      });
    }
    return makeResponse(404, { detail: 'Not found' });
  };

  // Correct resolution & save for Pooja Devi
  const resolvedId = await resolveBeneficiaryPatientId(pooja, mockPatientBackend);
  assert(resolvedId === 'PAT-2026-0002', 'resolveBeneficiaryPatientId resolves Pooja Devi to PAT-2026-0002');

  const savedVisit = await saveVisit(pooja, 'ANC visit BP 120/80 weight 55 kg', null, mockPatientBackend);
  assert(savedVisit.visit_id === 'VIS-2026-0005', 'saveVisit persists visit and returns backend visit_id');
  const postCall = seenRequests.find((r) => r.method === 'POST' && r.url.endsWith('/api/v1/visits/'));
  assert(postCall.body.patient_id === 'PAT-2026-0002', 'POST /api/v1/visits/ sends canonical PAT-2026-0002, NOT #9842-8819');

  // Guard: Refuses to silently attach to a different patient if backend record has a mismatched name
  const mockWrongPatientFetch = async () =>
    makeResponse(200, { patient_id: 'PAT-2026-0002', name: 'Completely Different Person', age: 40 });
  let mismatchBlocked = false;
  try {
    await resolveBeneficiaryPatientId(pooja, mockWrongPatientFetch);
  } catch (err) {
    mismatchBlocked = err.message.includes('Refusing to attach visit to a different patient');
  }
  assert(mismatchBlocked, 'Refuses to silently attach visit if backend patient record belongs to someone else');

  // Genuinely missing beneficiary throws clear error
  let missingErrMsg = '';
  try {
    await resolveBeneficiaryPatientId(
      { id: 'b-ghost', patientId: 'PAT-2026-9999', name: 'Nonexistent Person', rchId: '#0000-0000', age: 30, village: 'X', ward: '1' },
      mockPatientBackend
    );
  } catch (err) {
    missingErrMsg = err.message;
  }
  assert(missingErrMsg.includes('not found'), 'Genuinely missing beneficiary throws clear not-found error');
}

// =========================================================================
// 3. Part 3, 4, 5: Structured Voice Corrections, Unrelated Fields, Read-Back & Confirmation Gating
// =========================================================================
console.log('\n--- 3. Structured Voice Corrections, Confirmation Gating & Read-Back ---');
{
  let visit = JSON.parse(JSON.stringify(initialActiveVisit));
  visit.vitals.systolic = 120;
  visit.vitals.diastolic = 80;
  visit.vitals.weight = 55;
  visit.visitType = 'ANC';
  visit.nextVisitDate = '25 November';
  visit.status = 'PENDING_VERIFICATION';
  visit.vaccinationStatus = undefined;

  const initialReport = buildCurrentStructuredReport(visit);
  assert(initialReport.vital_signs_mentioned.bp === '120/80', 'Initial structured report carries BP 120/80');
  assert(initialReport.vital_signs_mentioned.weight === '55 kg', 'Initial structured report carries Weight 55 kg');

  // Simulate backend /report/voice-correct response for BP correction 120/80 -> 110/90
  const bpCorrectedReport = {
    ...initialReport,
    vital_signs_mentioned: { ...initialReport.vital_signs_mentioned, bp: '110/90' },
    confirmed: false,
    correction_history: [
      {
        field: 'blood_pressure',
        original_value: '120/80',
        corrected_value: '110/90',
        timestamp: '2026-11-22T03:05:00Z',
        source: 'voice',
      },
    ],
  };

  visit = mergeStructuredReportIntoVisit(visit, bpCorrectedReport, {
    confirmed: false,
    lastChangedField: 'blood_pressure',
  });
  assert(visit.vitals.systolic === 110 && visit.vitals.diastolic === 90, 'BP updated in structured visit state to 110/90');
  assert(visit.vitals.weight === 55, 'Unrelated field weight (55 kg) preserved untouched');
  assert(visit.nextVisitDate === '25 November', 'Unrelated field nextVisitDate preserved untouched');
  assert(visit.visitType === 'ANC', 'Unrelated field visitType preserved untouched');
  assert(visit.status === 'PENDING_VERIFICATION', 'Report NOT marked CONFIRMED after correction before explicit confirmation');
  assert(visit.correctionHistory.length === 1 && visit.correctionHistory[0].source === 'voice', 'Audit trail records voice correction');

  // Simulate adding weight, next visit date, and vaccination status
  const multiCorrectedReport = {
    ...bpCorrectedReport,
    vital_signs_mentioned: { bp: '110/90', weight: '58 kg', pulse: '78 bpm' },
    next_visit_date: '28 November',
    vaccination_status: 'TT injection administered',
    confirmed: false,
    correction_history: [
      ...bpCorrectedReport.correction_history,
      { field: 'weight', original_value: '55 kg', corrected_value: '58 kg', timestamp: '2026-11-22T03:05:10Z', source: 'voice' },
      { field: 'next_visit_date', original_value: '25 November', corrected_value: '28 November', timestamp: '2026-11-22T03:05:20Z', source: 'voice' },
      { field: 'vaccination_status', original_value: null, corrected_value: 'TT injection administered', timestamp: '2026-11-22T03:05:30Z', source: 'voice' },
    ],
  };
  visit = mergeStructuredReportIntoVisit(visit, multiCorrectedReport, {
    confirmed: false,
    lastChangedField: 'vaccination_status',
  });
  assert(visit.vitals.weight === 58, 'Weight updated to 58 kg');
  assert(visit.nextVisitDate === '28 November', 'Next visit date updated to 28 November');
  assert(visit.vaccinationStatus === 'TT injection administered', 'Vaccination status added via voice');
  assert(visit.correctionHistory.length === 4, 'All 4 corrections preserved in audit history');
  assert(visit.status === 'PENDING_VERIFICATION', 'Still unconfirmed prior to explicit worker confirmation');

  // Read-back text reflects updated structured fields & asks for confirmation
  const readback = buildStructuredReadBackText(visit, 'en');
  assert(readback.speech.includes('110/90') && readback.speech.includes('58 kg'), 'Read-back speech includes updated BP 110/90 and weight 58 kg');
  assert(readback.speech.includes('28 November') && readback.speech.includes('TT injection administered'), 'Read-back speech includes updated next visit date and vaccination');
  assert(readback.speech.includes('Is this report correct?'), 'Read-back speech asks explicit confirmation question');

  // Explicit confirmation marks report CONFIRMED
  visit = mergeStructuredReportIntoVisit(
    visit,
    { ...multiCorrectedReport, confirmed: true, confirmed_at: '2026-11-22T03:06:00Z' },
    { confirmed: true }
  );
  assert(visit.status === 'CONFIRMED', 'Explicit confirmation transitions report status to CONFIRMED');
  assert(typeof visit.confirmedAt === 'string', 'Confirmation timestamp recorded');

  // Backend payload carries full structured data + audit trail
  const backendPayload = buildBackendReportPayload(visit);
  assert(backendPayload.vital_signs_mentioned.bp === '110/90', 'Backend payload preserves corrected BP 110/90');
  assert(backendPayload.vital_signs_mentioned.weight === '58 kg', 'Backend payload preserves corrected weight 58 kg');
  assert(backendPayload.next_visit_date === '28 November', 'Backend payload preserves corrected next visit date');
  assert(backendPayload.vaccination_status === 'TT injection administered', 'Backend payload preserves vaccination status');
  assert(backendPayload.correction_history.length === 4, 'Backend payload preserves all 4 audit trail entries');
  assert(backendPayload.confirmed === true, 'Backend payload marks confirmed=true after explicit confirmation');

  // =========================================================================
  // 4. Part 6 Item 12: Corrected values survive page refresh (IndexedDB + Backend GET)
  // =========================================================================
  console.log('\n--- 4. Corrected Values Surviving Page Refresh ---');
  const storeMap = new Map();
  const mockIDB = {
    open() {
      const db = {
        objectStoreNames: { contains: () => true },
        close() {},
        transaction() {
          const tx = { oncomplete: null, onerror: null, onabort: null };
          tx.objectStore = () => ({
            put(rec) {
              const req = { onsuccess: null, onerror: null };
              setTimeout(() => {
                storeMap.set(rec.id, JSON.parse(JSON.stringify(rec)));
                req.onsuccess?.({ target: req });
                setTimeout(() => tx.oncomplete?.({ target: tx }), 2);
              }, 2);
              return req;
            },
            get(id) {
              const req = { result: null, onsuccess: null, onerror: null };
              setTimeout(() => {
                req.result = storeMap.get(id) || null;
                req.onsuccess?.({ target: req });
                setTimeout(() => tx.oncomplete?.({ target: tx }), 2);
              }, 2);
              return req;
            },
          });
          return tx;
        },
      };
      const openReq = { result: db, onsuccess: null, onerror: null };
      setTimeout(() => openReq.onsuccess?.({ target: openReq }), 2);
      return openReq;
    },
  };
  globalThis.window = { indexedDB: mockIDB };

  // Persist locally & simulate backend PATCH + reload GET
  const savedLocal = await saveVisitRecord(visit, { id: 'local-vis-refresh-test', syncStatus: 'synced' });
  const restoredLocal = await getStoredVisitById(savedLocal.id);
  assert(restoredLocal.visitData.vitals.systolic === 110 && restoredLocal.visitData.vitals.diastolic === 90, 'Corrected BP 110/90 survives page refresh in IndexedDB');
  assert(restoredLocal.visitData.vitals.weight === 58, 'Corrected weight 58 kg survives page refresh in IndexedDB');
  assert(restoredLocal.visitData.nextVisitDate === '28 November', 'Corrected next visit date survives page refresh in IndexedDB');
  assert(restoredLocal.visitData.vaccinationStatus === 'TT injection administered', 'Added vaccination status survives page refresh in IndexedDB');
  assert(restoredLocal.visitData.correctionHistory.length === 4, 'Correction history survives page refresh in IndexedDB');

  // Simulate backend PATCH then page reload GET /api/v1/visits/{visit_id}
  let storedBackendVisit = null;
  const mockPersistenceFetch = async (url, init = {}) => {
    if (url.endsWith('/api/v1/visits/VIS-2026-0005') && init.method === 'PATCH') {
      const body = JSON.parse(init.body);
      storedBackendVisit = {
        visit_id: 'VIS-2026-0005',
        patient_id: 'PAT-2026-0002',
        visit_date: '2026-11-22',
        report: body.report,
        created_at: '2026-11-22T03:00:00',
        updated_at: '2026-11-22T03:06:00',
      };
      return makeResponse(200, storedBackendVisit);
    }
    if (url.endsWith('/api/v1/visits/VIS-2026-0005') && (!init.method || init.method === 'GET')) {
      return makeResponse(200, storedBackendVisit);
    }
    return makeResponse(404, { detail: 'Not found' });
  };

  await updateVisitReport('VIS-2026-0005', backendPayload, mockPersistenceFetch);
  const reloadedFromBackend = await getVisitById('VIS-2026-0005', mockPersistenceFetch);
  const freshStateAfterRefresh = mergeStructuredReportIntoVisit(
    JSON.parse(JSON.stringify(initialActiveVisit)),
    reloadedFromBackend.report,
    { backendVisitId: reloadedFromBackend.visit_id }
  );
  assert(freshStateAfterRefresh.vitals.systolic === 110 && freshStateAfterRefresh.vitals.diastolic === 90, 'Corrected BP 110/90 survives full page reload from backend DB');
  assert(freshStateAfterRefresh.vitals.weight === 58, 'Corrected weight 58 kg survives full page reload from backend DB');
  assert(freshStateAfterRefresh.nextVisitDate === '28 November', 'Corrected next visit date survives full page reload from backend DB');
  assert(freshStateAfterRefresh.vaccinationStatus === 'TT injection administered', 'Added vaccination status survives full page reload from backend DB');
  assert(freshStateAfterRefresh.status === 'CONFIRMED', 'Confirmed status survives full page reload from backend DB');

  // Verify voiceCorrectReport API wrapper
  const vcRes = await voiceCorrectReport(
    initialReport,
    'Nahi, BP 110/90 hai.',
    'BP 120/80',
    'hinglish',
    'voice',
    async () =>
      makeResponse(200, {
        ok: true,
        action: 'updated',
        confirmed: false,
        report: bpCorrectedReport,
        changes: bpCorrectedReport.correction_history,
        correction_history: bpCorrectedReport.correction_history,
        narration: 'Blood pressure: 110/90.',
        narration_speech: 'Blood pressure 110/90.',
        assistant_reply: 'Updated blood pressure to 110/90.',
        assistant_reply_speech: 'Updated blood pressure to 110/90. Is the updated report correct?',
        confirmation_prompt: 'Is the updated report correct?',
        narration_language: 'hinglish',
        transcript_used: 'BP 120/80\nASHA correction: Nahi, BP 110/90 hai.',
        disclaimer: 'AI-generated documentation aid.',
      })
  );
  assert(vcRes.ok === true && vcRes.action === 'updated' && vcRes.report.vital_signs_mentioned.bp === '110/90', 'voiceCorrectReport client parses updated structured report response');
}

console.log(`\n========================================`);
console.log(`Result: ${passed} / ${total} tests passed (${Math.round((passed / total) * 100)}%)`);
console.log(`========================================\n`);

process.exit(passed === total ? 0 : 1);
