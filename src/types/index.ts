export type NavScreen = 
  | 'dashboard' 
  | 'new-visit' 
  | 'review-transcript' 
  | 'verify-record' 
  | 'clinical-alerts' 
  | 'beneficiaries' 
  | 'visit-history' 
  | 'follow-ups';

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
  name: string;
  spouseName?: string;
  age: number;
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

export interface MaternalVitals {
  systolic: number;
  diastolic: number;
  bpStatus: 'Confirmed' | 'Needs verification' | 'Flagged';
  pulseRate: number;
  pulseStatus: 'Speech' | 'Manual' | 'Normal';
  weight: number;
  weightGain: number; // e.g. +2.0
  weightStatus: 'Speech' | 'Manual';
  gestationalAgeWeeks: number;
  lmpDate: string;
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
    takingRegularly: boolean;
    remainingTabs: number;
    source: 'Speech' | 'Manual';
  };
  calciumTablets: {
    status: 'Needs Refill' | 'Sufficient';
    exhaustedDaysAgo: number;
  };
  dietAdvice: {
    advised: boolean;
    description: string;
    tags: string[];
  };
}

export interface ImmunizationLab {
  ttBooster: {
    administered: boolean;
    date: string;
    location: string;
    verified: boolean;
  };
  hemoglobin: {
    value: number;
    unit: string;
    status: string; // "Mild Anemia"
    lastTestedDate: string;
  };
  preEclampsiaAlert: {
    flagged: boolean;
    summary: string;
  };
}

export interface StructuredVisitData {
  beneficiary: Beneficiary;
  visitType: string;
  visitDate: string;
  nextVisitDate: string;
  audioDurationText: string;
  languageDetected: string;
  confidenceScore: number;
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
}

export interface DangerSignAlert {
  id: string;
  ruleCode: string;
  title: string;
  hindiTitle: string;
  severity: 'CRITICAL' | 'HIGH';
  triggerObservation: string;
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
  beneficiaryName: string;
  spouseName?: string;
  age: number;
  rchId: string;
  visitType: string;
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
