export type NavScreen = 
  | 'dashboard' 
  | 'new-visit' 
  | 'review-transcript' 
  | 'verify-record' 
  | 'clinical-alerts' 
  | 'beneficiaries' 
  | 'visit-history' 
  | 'follow-ups'
  | 'sync-centre';

export interface AshaWorker {
  id: string; // e.g. "ASHA-9041"
  name: string; // e.g. "Sunita Devi"
  ward: string; // e.g. "Ward 4"
  subCenter: string; // e.g. "Community Health Sub-Center Rampur"
  allocatedHouseholds: number;
  avatarUrl: string;
}

export interface Beneficiary {
  id: string;
  patientId?: string; // Canonical backend Patient.patient_id (e.g. "PAT-2026-0002")
  name: string;
  spouseName?: string;
  age: number | null;
  village: string;
  gali?: string;
  rchId: string;
  subCenter: string;
  ward: string;
  stage: string;
  gestationalWeeks?: number;
  edd?: string;
  lmp?: string;
  baselineBp?: string;
  contactNumber?: string;
  avatarInitials: string;
  photoUrl?: string;
}

export interface CorrectionAuditEntry {
  field: string;
  originalValue: string | number | boolean | null;
  correctedValue: string | number | boolean | null;
  timestamp: string;
  source: 'voice' | 'text' | 'manual';
}

export interface ConversationMessage {
  id: string;
  role: 'ai' | 'worker';
  text: string;
  timestamp: string;
  action?: 'readback' | 'updated' | 'clarify' | 'confirmed' | 'error';
  changes?: CorrectionAuditEntry[];
}

export interface MaternalVitals {
  systolic: number | null;
  diastolic: number | null;
  bpStatus: 'Confirmed' | 'Needs verification' | 'Flagged' | null;
  pulseRate: number | null;
  pulseStatus: 'Speech' | 'Manual' | 'Normal' | null;
  weight: number | null;
  weightGain: number | null; // e.g. +2.0
  weightStatus: 'Speech' | 'Manual' | null;
  gestationalAgeWeeks: number | null;
  lmpDate: string | null;
}

export interface ClinicalSymptoms {
  pedalEdema: {
    present: boolean;
    duration: string; // "last 48 hours"
    grading: string; // "Mild / Bilateral (Grading +1)"
    flagged: boolean;
  };
  headache: {
    present: boolean;
    onset: string; // "Past 24 hours"
    statement: string; // "कल दोपहर से लगातार हल्का भारीपन और सिरदर्द बना हुआ है।"
    severity: string; // "Mild-th"
    flagged: boolean;
  };
  fetalMovement: {
    status: string; // "Active & Normal (>10 kicks/day)"
    confirmed: boolean;
  };
  pallor: {
    observation: string; // "Mild Pallor observed (Possible low iron)"
    recorded: boolean;
  };
  bleeding?: {
    present: boolean;
    duration: string;
    severity: string;
    flagged: boolean;
  };
}

export interface MedicationsNutrition {
  ifaTablets: {
    takingRegularly: boolean | null;
    remainingTabs: number | null;
    source: 'Speech' | 'Manual' | null;
  };
  calciumTablets: {
    status: 'Needs Refill' | 'Sufficient' | null;
    exhaustedDaysAgo: number | null;
  };
  dietAdvice: {
    advised: boolean;
    description: string;
    tags: string[];
  };
}

export interface ImmunizationLab {
  ttBooster: {
    administered: boolean | null;
    date: string | null;
    location: string | null;
    verified: boolean;
    boosterStatus?: string | null;
    doseNumber?: string | null;
  };
  hemoglobin: {
    value: number | null;
    unit: string | null;
    status: string | null; // "Mild Anemia"
    lastTestedDate: string | null;
  };
  preEclampsiaAlert: {
    flagged: boolean;
    summary: string;
  };
}

export type EmergencyConfirmationPhase =
  | 'idle'
  | 'speaking_alert'
  | 'listening'
  | 'retrying'
  | 'confirmed'
  | 'declined'
  | 'no_response';

export type EmergencyResponseDecision = 'pending' | 'yes' | 'no' | 'no_response';

export type EmergencyEscalationStatus =
  | 'pending_confirmation'
  | 'confirmed'
  | 'declined'
  | 'no_response';

export interface EmergencyEscalationRecord {
  id: string;
  alertId: string;
  ruleCode: string;
  detectedSign: string;
  evidence?: string;
  detectedAt: string;
  confirmationTranscript: string;
  response: EmergencyResponseDecision;
  respondedAt?: string;
  escalationStatus: EmergencyEscalationStatus;
  attempts: number;
  sttDisconnected?: boolean;
}

export interface EmergencyConfirmationState {
  sessionId: number;
  alertId: string;
  ruleCode: string;
  canonicalKey: string;
  detectedSign: string;
  hindiSign: string;
  evidence?: string;
  phase: EmergencyConfirmationPhase;
  promptText: string;
  liveSttTranscript: string;
  confirmationTranscript: string;
  response: EmergencyResponseDecision;
  escalationStatus: EmergencyEscalationStatus;
  attempt: number;
  maxAttempts: number;
  sttDisconnected: boolean;
  errorMessage?: string;
  wasVisitRecordingPaused: boolean;
  detectedAt: string;
  respondedAt?: string;
  statusMessage?: string;
}

export interface StructuredVisitData {
  beneficiary: Beneficiary;
  visitType: string | null;
  visitDate: string | null;
  nextVisitDate: string | null;
  audioDurationText: string;
  languageDetected: string;
  confidenceScore: number | null;
  vitals: MaternalVitals;
  symptoms: ClinicalSymptoms;
  medications: MedicationsNutrition;
  immunizationLab: ImmunizationLab;
  counselingChecklist: {
    dietPostureCare: boolean;
    familyEmergencyBriefing: boolean;
    emergencyFollowUp: boolean;
  };
  status: 'DRAFT' | 'PENDING_VERIFICATION' | 'ESCALATED' | 'CONFIRMED';
  originalTranscript: string;
  lastCorrectedField?: string;
  dangerAlertTriggered?: boolean;
  emergencyEscalations?: EmergencyEscalationRecord[];
  backendVisitId?: string;
  vaccinationStatus?: string | null;
  boosterStatus?: string | null;
  doseNumber?: string | null;
  patientAge?: string | null;
  patientGender?: string | null;
  temperature?: string | null;
  extractedSymptoms?: Array<{
    name: string;
    duration?: string | null;
    severity?: string | null;
    body_site?: string | null;
    notes?: string | null;
  }>;
  missingInformation?: Array<{
    field_name: string;
    reason?: string;
    prompt_question?: string | null;
    importance?: string | null;
  }>;
  identityStatus?: 'verified' | 'unverified' | 'ambiguous' | 'mismatch' | 'missing';
  isBeneficiarySelected?: boolean;
  patientNameSource?: 'selected_beneficiary' | 'transcript' | 'confirmed' | 'missing';
  identityMismatchDetail?: string | null;
  confirmedFields?: Record<string, boolean>;
  correctionHistory?: CorrectionAuditEntry[];
  confirmedAt?: string;
  structuredReport?: Record<string, unknown> | null;
}

export interface DangerSignAlert {
  id: string;
  ruleCode: string;
  canonicalKey?: string;
  title: string;
  hindiTitle: string;
  severity: 'CRITICAL' | 'HIGH';
  triggerObservation: string;
  evidence?: string;
  hindiVoiceAlert: string;
  englishVoiceAlert: string;
  instruction: string;
  referralFacility: string;
  onDutyMO: string;
  ambulanceHelpline: string;
  isAcknowledged: boolean;
}

export interface FollowUpTask {
  id: string;
  patientId?: string;
  title: string;
  beneficiaryName: string;
  beneficiarySubtitle: string;
  category: 'urgent' | 'delivery' | 'pnc' | 'ncd' | 'supplies';
  priorityBadge: string;
  badgeType: 'red' | 'cyan' | 'green' | 'blue' | 'amber';
  dueText: string;
  contactNumber?: string;
  detailsNote: string;
  actionButtonText: string;
  secondaryButtonText?: string;
  isCompleted: boolean;
}

export interface VisitHistoryItem {
  id: string;
  backendVisitId?: string;
  patientId?: string;
  beneficiaryName: string;
  spouseName?: string;
  age: number | null;
  rchId: string;
  visitType: string | null;
  stageBadge?: string;
  timestampText: string;
  statusBadge: string;
  statusType: 'red' | 'green' | 'cyan' | 'amber';
  audioDuration: string;
  vitalsSummary: string;
  hasReferralSlip: boolean;
  category: 'anc' | 'immunization' | 'ncd' | 'pnc';
  isAlert: boolean;
}

export type SyncStatus = 'pending' | 'syncing' | 'synced' | 'failed';

export interface SyncCounts {
  pending: number;
  syncing: number;
  synced: number;
  failed: number;
  totalRequiringAttention: number; // pending + failed
  total: number;
}

export interface StoredVisitRecord {
  id: string;
  visitData: StructuredVisitData;
  syncStatus: SyncStatus;
  createdAt: string;
  updatedAt: string;
  syncAttempts?: number;
  lastSyncError?: string;
}

