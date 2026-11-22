/**
 * src/tests/testSourceGroundingAndIdentity.mjs
 *
 * Regression tests for strict source-only report extraction, zero mock leakage,
 * verbatim patient identity preservation, identity validation gating, and
 * consistent state/read-back/backend-payload/patient-resolution behavior.
 */
import assert from 'node:assert/strict';
import { normalizeHttpBaseUrl, normalizeWsUrl } from '../lib/apiConfig.ts';
import {
  buildBackendReportPayload,
  ensureTranscriptNamedPatient,
  resolveVisitPatientId,
} from '../lib/patientApi.ts';
import {
  buildCurrentStructuredReport,
  buildStructuredReadBackText,
  createEmptyVisitData,
  mergeStructuredReportIntoVisit,
} from '../lib/visitCorrectionSync.ts';

let passed = 0;
let total = 0;

function check(cond, label) {
  total++;
  if (cond) {
    passed++;
    console.log(`  ✅ PASS: ${label}`);
  } else {
    console.error(`  ❌ FAIL: ${label}`);
    process.exitCode = 1;
  }
}

console.log('🧪 Starting Source Grounding & Patient Identity Regression Tests...\n');

// ---------------------------------------------------------------------------
// 1. Clean empty visit contains ZERO mock defaults
// ---------------------------------------------------------------------------
console.log('--- 1. Clean Empty Visit State (No Mock Leakage) ---');
const emptyVisit = createEmptyVisitData(null);
check(emptyVisit.beneficiary.name === '', 'Unselected visit starts with empty patient name');
check(emptyVisit.isBeneficiarySelected === false, 'Unselected visit marks isBeneficiarySelected=false');
check(emptyVisit.identityStatus === 'missing', 'Unselected visit starts with identityStatus=missing');
check(emptyVisit.vitals.systolic === null && emptyVisit.vitals.diastolic === null, 'BP starts null');
check(emptyVisit.vitals.weight === null, 'Weight starts null');
check(emptyVisit.visitType === null, 'Visit type starts null');
check(emptyVisit.nextVisitDate === null, 'Next visit date starts null');
check(emptyVisit.vaccinationStatus === null, 'Vaccination status starts null');
check(emptyVisit.boosterStatus === null, 'Booster status starts null');
check(emptyVisit.immunizationLab.ttBooster.administered === null, 'TT administered flag starts null');

// ---------------------------------------------------------------------------
// 2. Exact regression transcript: "राधिमा को TT injection लगाया है। इसका BP 120/80 है।"
// ---------------------------------------------------------------------------
console.log('\n--- 2. Exact Transcript Source-Only Grounding ("राधिमा") ---');
const groundedBackendReport = {
  patient_name: 'राधिमा',
  patient_age: null,
  patient_gender: null,
  chief_complaint: 'TT injection and BP check',
  symptoms: [],
  danger_signs: [],
  vital_signs_mentioned: { bp: '120/80' },
  missing_information: [
    { field_name: 'weight', reason: 'Patient weight was not stated.', prompt_question: 'Record weight if measured.', importance: 'medium' },
  ],
  professional_review_required: false,
  summary: 'Patient: राधिमा. TT injection administered. Vitals recorded: BP: 120/80.',
  visit_type: null,
  next_visit_date: null,
  vaccination_status: 'TT injection administered',
  booster_status: null,
  dose_number: null,
  identity_status: 'verified',
  patient_name_source: 'transcript',
};

const radhimaVisit = mergeStructuredReportIntoVisit(
  { ...emptyVisit, originalTranscript: 'राधिमा को TT injection लगाया है। इसका BP 120/80 है।' },
  groundedBackendReport,
  { confirmed: false, isFreshExtraction: true }
);

check(radhimaVisit.beneficiary.name === 'राधिमा', 'Patient name preserved verbatim as "राधिमा"');
check(radhimaVisit.vitals.systolic === 120 && radhimaVisit.vitals.diastolic === 80, 'BP matches exact 120/80');
check(radhimaVisit.vitals.weight === null, 'Weight stays null (never 56 kg)');
check(radhimaVisit.visitType === null, 'Visit type stays null (never Antenatal Care Visit #3)');
check(radhimaVisit.nextVisitDate === null, 'Next visit stays null (never 24 Nov 2024)');
check(radhimaVisit.vaccinationStatus === 'TT injection administered', 'Vaccination recorded strictly as TT injection administered');
check(radhimaVisit.boosterStatus === null, 'Booster status stays null (not assumed)');
check(radhimaVisit.doseNumber === null, 'Dose number stays null');

const radhimaPayload = buildBackendReportPayload(radhimaVisit, radhimaVisit.structuredReport);
check(radhimaPayload.patient_name === 'राधिमा', 'Backend payload preserves exact patient_name "राधिमा"');
check(radhimaPayload.vital_signs_mentioned.bp === '120/80', 'Backend payload sends exact BP 120/80');
check(radhimaPayload.vital_signs_mentioned.weight === undefined, 'Backend payload does NOT include null/fake weight');
check(radhimaPayload.visit_type === null, 'Backend payload stores visit_type: null');
check(radhimaPayload.next_visit_date === null, 'Backend payload stores next_visit_date: null');
check(radhimaPayload.vaccination_status === 'TT injection administered', 'Backend payload keeps exact vaccination_status');
check(radhimaPayload.booster_status === null, 'Backend payload stores booster_status: null');

const radhimaReadback = buildStructuredReadBackText(radhimaVisit, 'hi');
check(radhimaReadback.speech.includes('राधिमा'), 'Hindi read-back speaks "राधिमा"');
check(radhimaReadback.speech.includes('120 बटा 80'), 'Hindi read-back speaks 120/80');
check(radhimaReadback.speech.includes('TT injection administered'), 'Hindi read-back includes TT injection administered');
check(!radhimaReadback.speech.includes('null'), 'Read-back never speaks literal "null" for missing fields');
check(!radhimaReadback.speech.includes('Pooja') && !radhimaReadback.speech.includes('250'), 'Read-back has zero mock leakage');

// ---------------------------------------------------------------------------
// 3. Missing Name, Identity Mismatch & Selected Beneficiary Protection
// ---------------------------------------------------------------------------
console.log('\n--- 3. Missing Name & Identity Mismatch Protection ---');
const missingNameVisit = mergeStructuredReportIntoVisit(emptyVisit, {
  patient_name: null,
  vital_signs_mentioned: { bp: '118/78' },
  visit_type: null,
  next_visit_date: null,
  vaccination_status: null,
  identity_status: 'missing',
  patient_name_source: 'missing',
}, { confirmed: false, isFreshExtraction: true });

check(missingNameVisit.beneficiary.name === '', 'Missing name leaves name empty');
check(missingNameVisit.identityStatus === 'missing', 'Missing name sets identityStatus=missing');
const missingReadback = buildStructuredReadBackText(missingNameVisit, 'en');
check(missingReadback.speech.includes('Name not provided'), 'Missing patient name read-back says "Name not provided"');

const selectedPooja = {
  id: 'ben-2',
  patientId: 'PAT-2026-0002',
  name: 'Pooja Devi',
  age: 26,
  village: 'Rampur',
  rchId: '#9842-8819',
  subCenter: 'Rampur PHC',
  ward: 'Ward 4',
  stage: 'ANC',
  avatarInitials: 'PD',
};
const selectedVisit = createEmptyVisitData(selectedPooja);
const mismatchVisit = mergeStructuredReportIntoVisit(selectedVisit, {
  patient_name: 'Pooja Devi',
  transcript_patient_name: 'राधिमा',
  identity_status: 'mismatch',
  identity_mismatch_detail: "Selected beneficiary 'Pooja Devi' does not match transcript patient 'राधिमा'.",
  vital_signs_mentioned: { bp: '120/80' },
  visit_type: null,
  next_visit_date: null,
  vaccination_status: 'TT injection administered',
}, { confirmed: false, isFreshExtraction: true });

check(mismatchVisit.beneficiary.name === 'Pooja Devi', 'Selected beneficiary name preserved');
check(mismatchVisit.identityStatus === 'mismatch', 'Mismatch flagged cleanly for identity validation gate');

// ---------------------------------------------------------------------------
// 4. Voice Correction Preserves Nulls and Survives Subsequent Sync
// ---------------------------------------------------------------------------
console.log('\n--- 4. Explicit Correction Preservation ---');
const correctedVisit = mergeStructuredReportIntoVisit(
  radhimaVisit,
  {
    patient_name: 'राधिमा',
    vital_signs_mentioned: { bp: '110/90' },
    visit_type: null,
    next_visit_date: null,
    vaccination_status: 'TT injection administered',
    confirmed: false,
  },
  { confirmed: false, lastChangedField: 'blood_pressure' }
);
check(correctedVisit.vitals.systolic === 110 && correctedVisit.vitals.diastolic === 90, 'BP updated from 120/80 to 110/90');
check(correctedVisit.vitals.weight === null, 'Unmentioned weight stays null after correction');
check(correctedVisit.confirmedFields.blood_pressure === true, 'Confirmed field tracked for blood_pressure');

// Even if current structured report is built back, no fake weight/visitType appear
const currentStruct = buildCurrentStructuredReport(correctedVisit, correctedVisit.structuredReport);
check(currentStruct.vital_signs_mentioned.bp === '110/90', 'buildCurrentStructuredReport keeps updated BP 110/90');
check(currentStruct.vital_signs_mentioned.weight === undefined, 'buildCurrentStructuredReport omits null weight');
check(currentStruct.visit_type === null, 'buildCurrentStructuredReport preserves visit_type: null');

// ---------------------------------------------------------------------------
// 5. Transcript-Named Patient Backend Resolution (Zero Duplicates / Zero Fake Age)
// ---------------------------------------------------------------------------
console.log('\n--- 5. Transcript-Named Patient Backend Resolution ---');
const dbPatients = [];
let createCount = 0;

const mockFetch = async (url, opts) => {
  const u = String(url);
  if (u.includes('/api/v1/patients/') && (!opts || opts.method !== 'POST')) {
    const search = decodeURIComponent(u.split('search=')[1] || '');
    const filtered = dbPatients.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()));
    return new Response(JSON.stringify({ total: filtered.length, patients: filtered }), { status: 200 });
  }
  if (u.endsWith('/api/v1/patients/') && opts?.method === 'POST') {
    createCount++;
    const body = JSON.parse(String(opts.body));
    const rec = {
      patient_id: `PAT-2026-010${createCount}`,
      name: body.name,
      age: body.age ?? null,
      gender: body.gender ?? null,
      registration_date: '2026-11-22',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    dbPatients.push(rec);
    return new Response(JSON.stringify(rec), { status: 201 });
  }
  return new Response('Not found', { status: 404 });
};

const firstRec = await ensureTranscriptNamedPatient('राधिमा', { age: null }, mockFetch);
check(firstRec.name === 'राधिमा', 'New transcript patient registered with exact name "राधिमा"');
check(firstRec.age === null, 'Unmentioned age persisted as null (never guessed)');
const secondVisitPid = await resolveVisitPatientId(radhimaVisit, mockFetch);
check(secondVisitPid === firstRec.patient_id, 'Repeated visit reuses same patient_id without duplicates');
check(createCount === 1, 'Zero duplicate patient records created');

await assert.rejects(
  () => resolveVisitPatientId(missingNameVisit, mockFetch),
  /missing|unconfirmed/i,
  'Rejects saving visit when patient identity is missing'
);
check(true, 'resolveVisitPatientId blocks saving visit with missing name');

// ---------------------------------------------------------------------------
// 6. Deployment URL Normalization (HTTPS / WSS & Trailing Slashes)
// ---------------------------------------------------------------------------
console.log('\n--- 6. Deployment URL & WSS Compatibility ---');
check(
  normalizeHttpBaseUrl('https://dhwani-api.onrender.com///', 'http://localhost:8001') ===
    'https://dhwani-api.onrender.com',
  'Strips trailing slashes from HTTPS Render URL'
);
check(
  normalizeWsUrl('wss://dhwani-api.onrender.com/ws/stt/', undefined) ===
    'wss://dhwani-api.onrender.com/ws/stt',
  'Preserves explicit wss:// WebSocket URL without double slashes'
);
check(
  normalizeWsUrl('https://dhwani-api.onrender.com/', undefined) ===
    'wss://dhwani-api.onrender.com/ws/stt',
  'Upgrades https:// base URL cleanly to wss://.../ws/stt for Vercel'
);
check(
  normalizeWsUrl(undefined, 'https://dhwani-api.onrender.com') ===
    'wss://dhwani-api.onrender.com/ws/stt',
  'Derives wss://.../ws/stt from VITE_VOICE_HTTP_URL fallback'
);

console.log(`\n========================================`);
console.log(`Result: ${passed} / ${total} tests passed`);
console.log(`========================================`);
if (passed < total) process.exit(1);
