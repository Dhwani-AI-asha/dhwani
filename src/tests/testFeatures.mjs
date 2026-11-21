import { mockAshaWorkers, predefinedDangerSigns, initialActiveVisit, mockBeneficiaries } from '../data/mockData.ts';

console.log('🧪 Starting DHWANI Feature Test Suite...\n');

let passedTests = 0;
let totalTests = 0;

function assert(condition, testName) {
  totalTests++;
  if (condition) {
    console.log(`  ✅ PASS: ${testName}`);
    passedTests++;
  } else {
    console.error(`  ❌ FAIL: ${testName}`);
  }
}

// ----------------------------------------------------------------------
// FEATURE 1: ASHA Worker Login
// ----------------------------------------------------------------------
console.log('--- FEATURE 1: ASHA Worker Login ---');

function mockLogin(workerId, password) {
  const trimmedId = (workerId || '').trim().toUpperCase();
  const worker = mockAshaWorkers.find(w => w.id.toUpperCase() === trimmedId);
  if (!worker) {
    return { success: false, error: 'Worker ID not found' };
  }
  if (password !== 'asha@123') {
    return { success: false, error: 'Invalid password' };
  }
  return { success: true, worker };
}

// Test 1: Valid login Sunita Devi
const login1 = mockLogin('ASHA-9041', 'asha@123');
assert(login1.success === true && login1.worker.name === 'Sunita Devi', 'Valid login for Sunita Devi (ASHA-9041)');

// Test 2: Valid login Radha Verma (case-insensitive)
const login2 = mockLogin('asha-9042', 'asha@123');
assert(login2.success === true && login2.worker.name === 'Radha Verma' && login2.worker.ward === 'Ward 2', 'Valid case-insensitive login for Radha Verma (ASHA-9042)');

// Test 3: Invalid worker ID
const login3 = mockLogin('ASHA-9999', 'asha@123');
assert(login3.success === false && login3.error.includes('not found'), 'Invalid worker ID rejected with error');

// Test 4: Invalid password
const login4 = mockLogin('ASHA-9041', 'wrongpass');
assert(login4.success === false && login4.error.includes('password'), 'Invalid password rejected');

// Test 5: Synthetic accounts count
assert(mockAshaWorkers.length >= 4, '4 synthetic demo ASHA worker accounts exist');

// ----------------------------------------------------------------------
// FEATURE 2: Spoken Report Read-Back and Correction
// ----------------------------------------------------------------------
console.log('\n--- FEATURE 2: Spoken Report Read-Back & Correction ---');

let visitState = JSON.parse(JSON.stringify(initialActiveVisit));
let beneficiaryState = JSON.parse(JSON.stringify(mockBeneficiaries[0]));
let readBackState = 'idle';

function startReadBack() {
  readBackState = 'speaking';
  return `पुष्टि हेतु विवरण: लाभार्थी ${beneficiaryState.name}, भेंट ${visitState.visitType}, वजन ${visitState.vitals.weight} किलो`;
}

function pauseReadBack() {
  if (readBackState === 'speaking') readBackState = 'paused';
}

function resumeReadBack() {
  if (readBackState === 'paused') readBackState = 'speaking';
}

function interruptReadBack() {
  readBackState = 'listening';
}

function applyVoiceCorrection(field, value) {
  let confirmation = '';
  if (field === 'weight') {
    visitState.vitals.weight = Number(value);
    visitState.lastCorrectedField = 'Maternal Weight';
    confirmation = `वजन सुधार दिया गया है: नया वजन ${value} kg`;
  } else if (field === 'name') {
    beneficiaryState.name = value;
    visitState.beneficiary.name = value;
    visitState.lastCorrectedField = 'Beneficiary Name';
    confirmation = `लाभार्थी का नाम बदलकर ${value} किया गया`;
  } else if (field === 'visitType') {
    visitState.visitType = value;
    visitState.lastCorrectedField = 'Visit Type';
    confirmation = `भेंट का प्रकार ${value} दर्ज हुआ`;
  } else if (field === 'vaccine') {
    visitState.immunizationLab.ttBooster.administered = true;
    visitState.immunizationLab.ttBooster.verified = true;
    visitState.lastCorrectedField = 'Vaccination TT Booster';
    confirmation = `टिटनेस बूस्टर टीका सत्यापित हुआ`;
  } else if (field === 'nextDate') {
    visitState.nextVisitDate = value;
    visitState.lastCorrectedField = 'Next Visit Date';
    confirmation = `अगली भेंट तारीख ${value} तय हुई`;
  }
  readBackState = 'speaking';
  return confirmation;
}

// Test 6: Report read-back starts speaking
const initialSummary = startReadBack();
assert(readBackState === 'speaking' && initialSummary.includes('Pooja Devi'), 'Report read-back starts and generates Hindi summary');

// Test 7: Pause & Resume
pauseReadBack();
assert(readBackState === 'paused', 'Read-back paused successfully');
resumeReadBack();
assert(readBackState === 'speaking', 'Read-back resumed successfully');

// Test 8: Interruption
interruptReadBack();
assert(readBackState === 'listening', 'Read-back interrupted into listening state');

// Test 9: Atomic Weight correction
const initialSys = visitState.vitals.systolic;
applyVoiceCorrection('weight', 54);
assert(visitState.vitals.weight === 54 && visitState.vitals.systolic === initialSys, 'Atomic weight correction to 54kg preserves systolic BP');

// Test 10: Beneficiary name correction
applyVoiceCorrection('name', 'Pooja Kumari');
assert(beneficiaryState.name === 'Pooja Kumari' && visitState.beneficiary.name === 'Pooja Kumari', 'Voice correction updates beneficiary name');

// Test 11: Visit Type correction
applyVoiceCorrection('visitType', 'Antenatal Care Visit #4');
assert(visitState.visitType === 'Antenatal Care Visit #4', 'Voice correction updates visit type to ANC #4');

// Test 12: Vaccination TT Booster correction
applyVoiceCorrection('vaccine', true);
assert(visitState.immunizationLab.ttBooster.verified === true, 'Voice correction updates vaccination record');

// Test 13: Next Visit Date correction
applyVoiceCorrection('nextDate', '15 Nov 2024');
assert(visitState.nextVisitDate === '15 Nov 2024', 'Voice correction updates next visit date to 15 Nov 2024');

// ----------------------------------------------------------------------
// FEATURE 3: Immediate Danger-Sign Voice Alert
// ----------------------------------------------------------------------
console.log('\n--- FEATURE 3: Immediate Danger-Sign Voice Alert ---');

let activeDangerAlert = null;

function triggerDangerSign(alertId) {
  // Interrupt read-back immediately
  readBackState = 'idle';
  const found = predefinedDangerSigns.find(ds => ds.id === alertId);
  activeDangerAlert = { ...found, isAcknowledged: false };
  visitState.status = 'ESCALATED';
  return activeDangerAlert;
}

function acknowledgeDangerAlert() {
  if (activeDangerAlert) {
    activeDangerAlert.isAcknowledged = true;
  }
}

// Test 14: Bleeding Danger Sign Interrupts Read-Back
startReadBack(); // assume reading
assert(readBackState === 'speaking', 'Read-back was actively speaking before danger sign');
const triggeredBleeding = triggerDangerSign('DS-BLEEDING');
assert(readBackState === 'idle', 'Danger sign immediately interrupted report read-back');
assert(visitState.status === 'ESCALATED', 'Visit record status flagged as ESCALATED');
assert(triggeredBleeding.hindiVoiceAlert.includes('रक्तस्राव') && triggeredBleeding.ruleCode === 'ANC-APH-01', 'Bleeding alert has correct MoHFW rule and urgent Hindi voice prompt');

// Test 15: Worker acknowledgement
assert(activeDangerAlert.isAcknowledged === false, 'Danger sign initially requires worker acknowledgement');
acknowledgeDangerAlert();
assert(activeDangerAlert.isAcknowledged === true, 'Worker successfully acknowledged danger alert');

// Test 16: Pre-eclampsia and Newborn danger signs exist in approved list
const preEclampsia = predefinedDangerSigns.find(d => d.id === 'DS-PREECLAMPSIA');
const newbornFever = predefinedDangerSigns.find(d => d.id === 'DS-NEWBORN-FEVER');
assert(preEclampsia && preEclampsia.ruleCode === 'ANC-PIH-04', 'Pre-eclampsia danger sign protocol verified');
assert(newbornFever && newbornFever.ruleCode === 'IMNCI-NB-02', 'Newborn high fever danger sign protocol verified');

console.log(`\n========================================`);
console.log(`Result: ${passedTests} / ${totalTests} tests passed (${Math.round((passedTests/totalTests)*100)}%)`);
console.log(`========================================\n`);

if (passedTests === totalTests) {
  process.exit(0);
} else {
  process.exit(1);
}
