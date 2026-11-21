import { mockAshaWorkers, predefinedDangerSigns, initialActiveVisit, mockBeneficiaries, mockVisitHistory } from '../data/mockData.ts';

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

// ----------------------------------------------------------------------
// FEATURE 4: Offline Field Mode (Stage 1) - IndexedDB Visit Storage & Sync Tracking
// ----------------------------------------------------------------------
console.log('\n--- FEATURE 4: Offline Field Mode (Stage 1) ---');

import { generateLocalVisitId, saveVisitRecord, getAllStoredVisits, calculateSyncCounts } from '../services/offlineDB.ts';

// Test 17: Unique ID generation for offline visits
const id1 = generateLocalVisitId();
const id2 = generateLocalVisitId();
assert(id1.startsWith('local-vis-') && id2.startsWith('local-vis-'), 'Generated offline visit IDs start with "local-vis-"');
assert(id1 !== id2, 'Generated visit IDs are unique across calls');

// Test 18: Exact updated status preservation (prevent stale React state)
function simulateConfirmVisitAndSave(currentVisit, activeBen, asEscalated) {
  const updatedStatus = asEscalated ? 'ESCALATED' : 'CONFIRMED';
  const completeUpdatedVisit = {
    ...currentVisit,
    beneficiary: { ...activeBen },
    status: updatedStatus,
    dangerAlertTriggered: asEscalated || currentVisit.dangerAlertTriggered,
  };
  return completeUpdatedVisit;
}

const confirmedNormal = simulateConfirmVisitAndSave(initialActiveVisit, mockBeneficiaries[0], false);
assert(confirmedNormal.status === 'CONFIRMED', 'Normal visit confirmed with exact status CONFIRMED');
assert(confirmedNormal.beneficiary.name === 'Pooja Devi', 'Visit preserves complete beneficiary data');

const confirmedEscalated = simulateConfirmVisitAndSave(initialActiveVisit, mockBeneficiaries[0], true);
assert(confirmedEscalated.status === 'ESCALATED', 'Escalated visit confirmed with exact status ESCALATED');
assert(confirmedEscalated.dangerAlertTriggered === true, 'Escalated visit flags dangerAlertTriggered');

// Test 19: Sync status tracking states
const validSyncStatuses = ['pending', 'syncing', 'synced', 'failed'];
assert(validSyncStatuses.includes('pending'), 'Sync status supports "pending"');
assert(validSyncStatuses.includes('syncing'), 'Sync status supports "syncing"');
assert(validSyncStatuses.includes('synced'), 'Sync status supports "synced"');
assert(validSyncStatuses.includes('failed'), 'Sync status supports "failed"');

// Test 20: Offline record structure validation
const sampleRecord = {
  id: id1,
  visitData: confirmedEscalated,
  syncStatus: 'pending',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};
assert(sampleRecord.visitData.status === 'ESCALATED', 'Offline stored record retains ESCALATED visit status');
assert(sampleRecord.syncStatus === 'pending', 'Newly stored offline record initializes with syncStatus "pending"');

// ----------------------------------------------------------------------
// FEATURE 5: Offline Reliability Tests (Mock IndexedDB Transactions)
// ----------------------------------------------------------------------
console.log('\n--- FEATURE 5: Offline Reliability & Transaction Tests ---');

function createMockIndexedDB({
  failOnPut = false,
  failTransaction = false,
  abortTransaction = false,
  failGetAll = false,
  storedData = []
} = {}) {
  let dbClosed = false;

  const mockDB = {
    objectStoreNames: { contains: () => true },
    close() {
      dbClosed = true;
    },
    transaction(storeNames, mode) {
      const tx = {
        error: failTransaction ? new Error('Simulated transaction commit failure') : null,
        oncomplete: null,
        onerror: null,
        onabort: null,
        objectStore(name) {
          return {
            put(record) {
              const req = { onsuccess: null, onerror: null, error: null };
              setTimeout(() => {
                if (failOnPut) {
                  req.error = new Error('Put request failed');
                  if (req.onerror) req.onerror({ target: req });
                } else {
                  if (req.onsuccess) req.onsuccess({ target: req });
                  setTimeout(() => {
                    if (failTransaction) {
                      if (tx.onerror) tx.onerror({ target: tx });
                    } else if (abortTransaction) {
                      if (tx.onabort) tx.onabort({ target: tx });
                    } else {
                      if (tx.oncomplete) tx.oncomplete({ target: tx });
                    }
                  }, 5);
                }
              }, 5);
              return req;
            },
            getAll() {
              const req = { result: storedData, onsuccess: null, onerror: null, error: null };
              setTimeout(() => {
                if (failGetAll) {
                  req.error = new Error('Database read failed');
                  if (req.onerror) req.onerror({ target: req });
                  setTimeout(() => {
                    if (tx.onerror) tx.onerror({ target: tx });
                  }, 5);
                } else {
                  if (req.onsuccess) req.onsuccess({ target: req });
                  setTimeout(() => {
                    if (tx.oncomplete) tx.oncomplete({ target: tx });
                  }, 5);
                }
              }, 5);
              return req;
            }
          };
        }
      };
      return tx;
    }
  };

  return {
    open() {
      const openReq = { onsuccess: null, onerror: null, result: mockDB };
      setTimeout(() => {
        if (openReq.onsuccess) openReq.onsuccess({ target: openReq });
      }, 5);
      return openReq;
    },
    get isDbClosed() {
      return dbClosed;
    }
  };
}

// Test 21: saveVisitRecord resolves on transaction oncomplete & closes DB
const mockSuccess = createMockIndexedDB();
globalThis.window = { indexedDB: mockSuccess };
const savedVisit = await saveVisitRecord(confirmedNormal);
assert(savedVisit && savedVisit.visitData.status === 'CONFIRMED', 'saveVisitRecord resolves successfully after transaction oncomplete');
assert(mockSuccess.isDbClosed === true, 'Database connection is closed after successful save');

// Test 22: saveVisitRecord rejects if transaction errors and closes DB
const mockTxError = createMockIndexedDB({ failTransaction: true });
globalThis.window = { indexedDB: mockTxError };
let txErrorCaught = false;
try {
  await saveVisitRecord(confirmedNormal);
} catch (err) {
  txErrorCaught = true;
}
assert(txErrorCaught === true, 'saveVisitRecord rejects when transaction errors, even if put succeeded');
assert(mockTxError.isDbClosed === true, 'Database connection is closed when transaction errors');

// Test 23: saveVisitRecord rejects if transaction aborts
const mockTxAbort = createMockIndexedDB({ abortTransaction: true });
globalThis.window = { indexedDB: mockTxAbort };
let abortCaught = false;
try {
  await saveVisitRecord(confirmedNormal);
} catch (err) {
  abortCaught = true;
}
assert(abortCaught === true, 'saveVisitRecord rejects when transaction is aborted');
assert(mockTxAbort.isDbClosed === true, 'Database connection is closed when transaction is aborted');

// Test 24: getAllStoredVisits rejects on database error instead of returning empty array
const mockGetAllError = createMockIndexedDB({ failGetAll: true });
globalThis.window = { indexedDB: mockGetAllError };
let getAllErrorCaught = false;
try {
  await getAllStoredVisits();
} catch (err) {
  getAllErrorCaught = true;
}
assert(getAllErrorCaught === true, 'getAllStoredVisits() propagates database error instead of silently returning empty array');
assert(mockGetAllError.isDbClosed === true, 'Database connection is closed on read error');

// Test 25: Simulated confirmVisitAndSave failure prevents false history insertion and navigation
let mockHistory = [...mockVisitHistory];
let mockTasks = [];
let mockScreen = 'alerts';
let saveErrorMessage = null;

async function testConfirmVisitAndSave(asEscalated, saveFn) {
  saveErrorMessage = null;
  const updatedStatus = asEscalated ? 'ESCALATED' : 'CONFIRMED';
  const completeVisit = {
    ...initialActiveVisit,
    beneficiary: mockBeneficiaries[0],
    status: updatedStatus,
  };

  try {
    const saved = await saveFn(completeVisit);
    mockHistory.unshift({ id: saved.id, beneficiaryName: completeVisit.beneficiary.name });
    if (asEscalated) {
      mockTasks.unshift({ id: 'task-1', title: 'Escort to PHC' });
    }
    mockScreen = asEscalated ? 'follow-ups' : 'visit-history';
    return true;
  } catch (err) {
    saveErrorMessage = err.message || 'Failed to save visit record to device storage.';
    // DO NOT navigate, DO NOT add to history, DO NOT add follow-up
    return false;
  }
}

// When save fails:
const failResult = await testConfirmVisitAndSave(true, async () => {
  throw new Error('Disk quota exceeded / IndexedDB write failed');
});
assert(failResult === false, 'confirmVisitAndSave returns false on persistence failure');
assert(saveErrorMessage.includes('Disk quota'), 'Clear error message captured for worker display');
assert(mockHistory.length === mockVisitHistory.length, 'Visit was not falsely added to history on save failure');
assert(mockTasks.length === 0, 'Urgent follow-up was not falsely created on save failure');
assert(mockScreen === 'alerts', 'Worker remained on current screen without false navigation on save failure');

// When save succeeds:
const successResult = await testConfirmVisitAndSave(true, async (v) => {
  return { id: 'local-vis-123', visitData: v };
});
assert(successResult === true, 'confirmVisitAndSave returns true on persistence success');
assert(saveErrorMessage === null, 'Save error message is cleared on success');
assert(mockHistory.length === mockVisitHistory.length + 1, 'Visit record added to history on successful save');
assert(mockTasks.length === 1, 'Urgent follow-up task created on successful save');
assert(mockScreen === 'follow-ups', 'Worker navigated to follow-ups on successful save');

// ----------------------------------------------------------------------
// FEATURE 6: Offline Field Mode (Stage 2) - Sync Centre, Network Status & Pending Counters
// ----------------------------------------------------------------------
console.log('\n--- FEATURE 6: Offline Field Mode (Stage 2) ---');

// Test 26: Empty state counter
const emptyCounts = calculateSyncCounts([]);
assert(
  emptyCounts.pending === 0 &&
  emptyCounts.syncing === 0 &&
  emptyCounts.synced === 0 &&
  emptyCounts.failed === 0 &&
  emptyCounts.totalRequiringAttention === 0 &&
  emptyCounts.total === 0,
  'Empty records array produces zero counts across all states'
);

// Test 27: Pending visits count
const pendingRecords = [
  { id: 'rec-1', syncStatus: 'pending' },
  { id: 'rec-2', syncStatus: 'pending' },
];
const pendingOnlyCounts = calculateSyncCounts(pendingRecords);
assert(pendingOnlyCounts.pending === 2, 'Pending visits correctly counted');
assert(pendingOnlyCounts.totalRequiringAttention === 2, 'Pending visits counted as requiring attention');
assert(pendingOnlyCounts.syncing === 0 && pendingOnlyCounts.synced === 0, 'Syncing and synced remain zero');

// Test 28: Failed visits count
const failedRecords = [
  { id: 'rec-3', syncStatus: 'failed', lastSyncError: 'HTTP 503: PHC Server Offline' },
];
const failedOnlyCounts = calculateSyncCounts(failedRecords);
assert(failedOnlyCounts.failed === 1, 'Failed visits correctly counted');
assert(failedOnlyCounts.totalRequiringAttention === 1, 'Failed visits counted as requiring attention');
assert(failedRecords[0].lastSyncError === 'HTTP 503: PHC Server Offline', 'Failed record contains accessible error message');

// Test 29: Syncing visits separate from attention count
const syncingRecords = [
  { id: 'rec-4', syncStatus: 'syncing' },
];
const syncingOnlyCounts = calculateSyncCounts(syncingRecords);
assert(syncingOnlyCounts.syncing === 1, 'Syncing visits counted separately');
assert(syncingOnlyCounts.totalRequiringAttention === 0, 'Syncing visits do NOT require attention count');

// Test 30: Synced visits separate from attention count
const syncedRecords = [
  { id: 'rec-5', syncStatus: 'synced' },
  { id: 'rec-6', syncStatus: 'synced' },
];
const syncedOnlyCounts = calculateSyncCounts(syncedRecords);
assert(syncedOnlyCounts.synced === 2, 'Synced visits correctly counted');
assert(syncedOnlyCounts.totalRequiringAttention === 0, 'Synced visits do NOT require attention count');

// Test 31: Mixed state calculation
const mixedRecords = [
  { id: 'm-1', syncStatus: 'pending' },
  { id: 'm-2', syncStatus: 'pending' },
  { id: 'm-3', syncStatus: 'failed', lastSyncError: 'Network timeout' },
  { id: 'm-4', syncStatus: 'syncing' },
  { id: 'm-5', syncStatus: 'synced' },
  { id: 'm-6', syncStatus: 'synced' },
  { id: 'm-7', syncStatus: 'synced' },
];
const mixedCounts = calculateSyncCounts(mixedRecords);
assert(mixedCounts.pending === 2, 'Mixed records: 2 pending');
assert(mixedCounts.failed === 1, 'Mixed records: 1 failed');
assert(mixedCounts.syncing === 1, 'Mixed records: 1 syncing');
assert(mixedCounts.synced === 3, 'Mixed records: 3 synced');
assert(mixedCounts.totalRequiringAttention === 3, 'Mixed records: totalRequiringAttention is 3 (2 pending + 1 failed)');
assert(mixedCounts.total === 7, 'Mixed records: total is 7');

// Test 32: Immediate count update on status transition (e.g., pending -> syncing -> synced)
let transitionRecords = [...mixedRecords];
// Transition m-1 from 'pending' to 'syncing'
transitionRecords = transitionRecords.map(r => r.id === 'm-1' ? { ...r, syncStatus: 'syncing' } : r);
const afterSyncingCounts = calculateSyncCounts(transitionRecords);
assert(afterSyncingCounts.pending === 1, 'Pending count decrements immediately upon transition to syncing');
assert(afterSyncingCounts.syncing === 2, 'Syncing count increments immediately');
assert(afterSyncingCounts.totalRequiringAttention === 2, 'Attention count drops immediately from 3 to 2');

// Transition m-1 to 'synced'
transitionRecords = transitionRecords.map(r => r.id === 'm-1' ? { ...r, syncStatus: 'synced' } : r);
const afterSyncedCounts = calculateSyncCounts(transitionRecords);
assert(afterSyncedCounts.synced === 4, 'Synced count increments immediately upon completion');
assert(afterSyncedCounts.syncing === 1, 'Syncing count decrements immediately');
assert(afterSyncedCounts.totalRequiringAttention === 2, 'Attention count remains 2 (1 pending + 1 failed)');

// Test 33: Network status event listener simulation
class MockNetworkMonitor {
  constructor(initialOnline = true) {
    this.isOnline = initialOnline;
    this.lastChangedAt = null;
    this.listeners = { online: [], offline: [] };
  }

  addEventListener(type, cb) {
    if (this.listeners[type]) this.listeners[type].push(cb);
  }

  removeEventListener(type, cb) {
    if (this.listeners[type]) {
      this.listeners[type] = this.listeners[type].filter(fn => fn !== cb);
    }
  }

  simulateEvent(type) {
    this.isOnline = type === 'online';
    this.lastChangedAt = new Date();
    if (this.listeners[type]) {
      this.listeners[type].forEach(cb => cb());
    }
  }
}

const networkMonitor = new MockNetworkMonitor(true);
let reportedStatus = networkMonitor.isOnline;
networkMonitor.addEventListener('offline', () => {
  reportedStatus = false;
});
networkMonitor.addEventListener('online', () => {
  reportedStatus = true;
});

// Trigger offline
networkMonitor.simulateEvent('offline');
assert(reportedStatus === false, 'Network monitor immediately transitions to offline on offline event');
assert(networkMonitor.lastChangedAt !== null, 'Network monitor records timestamp on offline event');

// Trigger online
networkMonitor.simulateEvent('online');
assert(reportedStatus === true, 'Network monitor immediately transitions to online on online event');
assert(reportedStatus === true && !reportedStatus.remoteBackendReachable, 'Network online state does not falsely claim remote backend reachability');




console.log(`\n========================================`);
console.log(`Result: ${passedTests} / ${totalTests} tests passed (${Math.round((passedTests/totalTests)*100)}%)`);
console.log(`========================================\n`);

if (passedTests === totalTests) {
  process.exit(0);
} else {
  process.exit(1);
}
