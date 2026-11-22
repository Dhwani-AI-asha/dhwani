import type { AshaWorker, Beneficiary, DangerSignAlert, FollowUpTask, StructuredVisitData, VisitHistoryItem } from '../types/index.ts';

export const mockAshaWorkers: AshaWorker[] = [
  {
    id: 'ASHA-9041',
    name: 'Sunita Devi',
    ward: 'Ward 4',
    subCenter: 'Community Health Sub-Center Rampur',
    allocatedHouseholds: 6,
    avatarUrl: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150&auto=format&fit=crop&q=80',
  },
  {
    id: 'ASHA-9042',
    name: 'Radha Verma',
    ward: 'Ward 2',
    subCenter: 'Community Health Sub-Center Rampur',
    allocatedHouseholds: 8,
    avatarUrl: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150&auto=format&fit=crop&q=80',
  },
  {
    id: 'ASHA-9043',
    name: 'Meena Bai',
    ward: 'Ward 5',
    subCenter: 'Community Health Sub-Center Rampur',
    allocatedHouseholds: 5,
    avatarUrl: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=150&auto=format&fit=crop&q=80',
  },
  {
    id: 'ASHA-9044',
    name: 'Anita Sharma',
    ward: 'Ward 1',
    subCenter: 'Community Health Sub-Center Rampur',
    allocatedHouseholds: 7,
    avatarUrl: 'https://images.unsplash.com/photo-1567532939604-b6b5b0db2604?w=150&auto=format&fit=crop&q=80',
  }
];

export const predefinedDangerSigns: DangerSignAlert[] = [
  {
    id: 'DS-BLEEDING',
    ruleCode: 'ANC-APH-01',
    title: 'Vaginal Bleeding during Pregnancy',
    hindiTitle: 'गर्भावस्था में रक्तस्राव (एंटीपार्टम हेमरेज)',
    severity: 'CRITICAL',
    triggerObservation: 'Beneficiary reported active vaginal bleeding with lower abdominal tightness since this morning.',
    hindiVoiceAlert: 'आपातकालीन चेतावनी! गर्भावस्था के दौरान रक्तस्राव देखा गया है। तुरंत प्राथमिक स्वास्थ्य केंद्र रेफर करें! 108 एम्बुलेंस बुलाएं!',
    englishVoiceAlert: 'Emergency warning! Vaginal bleeding detected during pregnancy. Immediate PHC referral required. Dispatch ambulance 108.',
    instruction: 'Do not perform digital vaginal examination. Keep patient lying down on left lateral position. Escort immediately to Rampur PHC.',
    referralFacility: 'Rampur Primary Health Centre (PHC) - 2.8 km',
    onDutyMO: 'Dr. Rajesh Varma (MBBS)',
    ambulanceHelpline: 'Dial 108 / Rampur Unit Active',
    isAcknowledged: false
  },
  {
    id: 'DS-PREECLAMPSIA',
    ruleCode: 'ANC-PIH-04',
    title: 'Severe Pre-Eclampsia Alert',
    hindiTitle: 'गंभीर प्री-एक्लेम्पसिया (उच्च रक्तचाप + सूजन + सिरदर्द)',
    severity: 'HIGH',
    triggerObservation: 'Blood pressure 148/94 mmHg with bilateral pedal edema and persistent severe frontal headache in 3rd trimester.',
    hindiVoiceAlert: 'चेतावनी: उच्च रक्तचाप 148 बटा 94 और लगातार सिरदर्द। संभावित प्री-एक्लेम्पसिया। तुरंत प्राथमिक स्वास्थ्य केंद्र भेजें!',
    englishVoiceAlert: 'Alert: High blood pressure with edema and persistent headache. Potential pre-eclampsia. Immediate PHC referral required.',
    instruction: 'Arrange immediate escort to Rampur PHC for urine albumin screening and medical officer evaluation.',
    referralFacility: 'Rampur Primary Health Centre (PHC) - 2.8 km',
    onDutyMO: 'Dr. Rajesh Varma (MBBS)',
    ambulanceHelpline: 'Dial 108 / Rampur Unit Active',
    isAcknowledged: false
  },
  {
    id: 'DS-NEWBORN-FEVER',
    ruleCode: 'IMNCI-NB-02',
    title: 'Newborn Danger Sign: High Fever & Inability to Feed',
    hindiTitle: 'नवजात शिशु में तेज बुखार और दूध न पीना',
    severity: 'CRITICAL',
    triggerObservation: 'Day 7 newborn baby with axillary temperature 39.2°C (102.5°F), lethargic and unable to breastfeed.',
    hindiVoiceAlert: 'आपातकालीन चेतावनी! नवजात शिशु को तेज बुखार और दूध पीने में असमर्थता। तुरंत प्राथमिक स्वास्थ्य केंद्र ले जाएं!',
    englishVoiceAlert: 'Emergency newborn alert! Temperature 39.2 degrees with feeding inability. Immediate emergency transport required.',
    instruction: 'Keep baby warm with Kangaroo Mother Care. Avoid cold sponges. Immediate transfer to Newborn Care Corner (NBCC) at Rampur PHC.',
    referralFacility: 'Rampur PHC - Newborn Stabilization Unit (NBCC)',
    onDutyMO: 'Dr. Rajesh Varma (MBBS)',
    ambulanceHelpline: 'Dial 102 / Janani Shishu Express',
    isAcknowledged: false
  }
];

export const mockBeneficiaries: Beneficiary[] = [
  {
    id: 'b-pooja',
    patientId: 'PAT-2026-0002',
    name: 'Pooja Devi',
    spouseName: 'Manoj Kumar',
    age: 24,
    village: 'Village Rampur',
    gali: 'Gali 2',
    rchId: '#9842-8819',
    subCenter: 'Sub-Center Rampur',
    ward: 'Ward 4',
    stage: 'ANC 3rd Trimester • 32 Weeks',
    gestationalWeeks: 32,
    edd: '18 Dec 2024',
    lmp: '14 Mar 2024',
    baselineBp: '110/70 mmHg',
    contactNumber: '+91 98721 44510',
    avatarInitials: 'PD',
    photoUrl: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150&auto=format&fit=crop&q=80',
  },
  {
    id: 'b-meena',
    patientId: 'PAT-2026-0003',
    name: 'Meena Kumari',
    spouseName: 'Rajesh',
    age: 28,
    village: 'Village Rampur',
    gali: 'Gali 1',
    rchId: '#7712-4011',
    subCenter: 'Sub-Center Rampur',
    ward: 'Ward 4',
    stage: 'ANC 2nd Trimester • 24 Weeks',
    gestationalWeeks: 24,
    edd: '12 Feb 2025',
    baselineBp: '118/76 mmHg',
    contactNumber: '+91 98112 33441',
    avatarInitials: 'MK',
  },
  {
    id: 'b-aarav',
    patientId: 'PAT-2026-0004',
    name: 'Aarav Sharma',
    spouseName: 'Sunita (Mother)',
    age: 1.5,
    village: 'East Basti, Rampur',
    gali: 'House #08',
    rchId: '#5521-9032',
    subCenter: 'Sub-Center Rampur',
    ward: 'Ward 4',
    stage: 'Routine Immunization (18 mo)',
    avatarInitials: 'AS',
  },
  {
    id: 'b-savitri',
    patientId: 'PAT-2026-0005',
    name: 'Savitri Devi',
    age: 58,
    village: 'Main Road, Rampur',
    gali: 'House #19',
    rchId: '#3319-1102',
    subCenter: 'Sub-Center Rampur',
    ward: 'Ward 4',
    stage: 'Hypertension & Diabetes Monitoring',
    baselineBp: '142/90 mmHg',
    avatarInitials: 'SD',
  },
  {
    id: 'b-geeta',
    patientId: 'PAT-2026-0006',
    name: 'Geeta Patel',
    spouseName: 'Vikram',
    age: 21,
    village: 'Rampur South',
    rchId: '#8801-6543',
    subCenter: 'Sub-Center Rampur',
    ward: 'Ward 4',
    stage: 'Postnatal Care (PNC Day 14)',
    avatarInitials: 'GP',
  }
];

export const initialActiveVisit: StructuredVisitData = {
  beneficiary: mockBeneficiaries[0],
  visitType: 'Antenatal Care Visit #3 (Home ANC Follow-up)',
  visitDate: '24 Oct 2024',
  nextVisitDate: '24 Nov 2024',
  audioDurationText: '01:42',
  languageDetected: 'Hindi (हिन्दी) with English Clinical Terms',
  confidenceScore: 0,
  originalTranscript: '',
  vitals: {
    systolic: 130,
    diastolic: 85,
    bpStatus: 'Confirmed',
    pulseRate: 78,
    pulseStatus: 'Speech',
    weight: 56,
    weightGain: 2.0,
    weightStatus: 'Speech',
    gestationalAgeWeeks: 32,
    lmpDate: '14 Mar 2024'
  },
  symptoms: {
    pedalEdema: {
      present: true,
      duration: 'Last 48 hours',
      grading: 'Mild / Bilateral (Grading +1)',
      flagged: true
    },
    headache: {
      present: true,
      onset: 'Past 24 hours',
      statement: 'कल दोपहर से लगातार हल्का भारीपन और सिरदर्द बना हुआ है।',
      severity: 'Mild-th (Persistent)',
      flagged: true
    },
    fetalMovement: {
      status: 'Active & Normal (>10 kicks/day)',
      confirmed: true
    },
    pallor: {
      observation: 'Mild Pallor observed (Possible low iron)',
      recorded: true
    }
  },
  medications: {
    ifaTablets: {
      takingRegularly: true,
      remainingTabs: 15,
      source: 'Speech'
    },
    calciumTablets: {
      status: 'Needs Refill',
      exhaustedDaysAgo: 3
    },
    dietAdvice: {
      advised: true,
      description: 'High protein intake (Dal/Egg) & green leafy vegetables emphasized for mild pallor.',
      tags: ['High Protein', 'Hydration', 'Low Salt Notice']
    }
  },
  immunizationLab: {
    ttBooster: {
      administered: true,
      date: '18 Sep 2024',
      location: 'Rampur PHC',
      verified: true
    },
    hemoglobin: {
      value: 10.2,
      unit: 'g/dL',
      status: 'Mild Anemia',
      lastTestedDate: '28 Aug 2024'
    },
    preEclampsiaAlert: {
      flagged: true,
      summary: 'Combination of BP (130/85) + bilateral edema + persistent headache warrants immediate PHC Medical Officer consultation.'
    }
  },
  counselingChecklist: {
    dietPostureCare: true,
    familyEmergencyBriefing: false,
    emergencyFollowUp: false
  },
  status: 'DRAFT'
};

export const mockFollowUpTasks: FollowUpTask[] = [
  {
    id: 'task-1',
    title: 'Escort Pooja Devi to Rampur PHC for BP & Albumin Evaluation',
    beneficiaryName: 'Pooja Devi (Age 24, ANC 32 Weeks)',
    beneficiarySubtitle: 'House #42, Gali 2, Rampur • +91 98721 44510',
    category: 'urgent',
    priorityBadge: 'Urgent Action Needed • Due: Today by 02:00 PM • Flagged Visit ID: #VIS-8921',
    badgeType: 'red',
    dueText: 'Today by 02:00 PM',
    contactNumber: '+91 98721 44510',
    detailsNote: 'Clinical Flag: Combination of BP 130/85, bilateral pedal edema, and severe frontal headache flagged in today\'s field visit. Suspected early pre-eclampsia.',
    actionButtonText: 'Confirm PHC Visit',
    secondaryButtonText: 'Call Beneficiary',
    isCompleted: false
  },
  {
    id: 'task-2',
    title: 'Deliver Iron Folic Acid (IFA) Tablets (1 Bottle / 100 tabs)',
    beneficiaryName: 'Meena Kumari (ANC 2nd Trimester)',
    beneficiarySubtitle: 'House #12, Gali 1, Rampur',
    category: 'delivery',
    priorityBadge: 'Pending Delivery • Due: Today by 04:00 PM • Stock Allocated from Sub-center',
    badgeType: 'cyan',
    dueText: 'Today by 04:00 PM',
    detailsNote: 'Replenishment Note: Beneficiary has only 4 tablets remaining; ensure uninterrupted daily supplementation and observe ingestion of first tablet.',
    actionButtonText: 'Mark as Delivered',
    secondaryButtonText: 'View Supply History',
    isCompleted: false
  },
  {
    id: 'task-3',
    title: 'Day 7 Postnatal Visit & Newborn Temperature Assessment',
    beneficiaryName: 'Radha & Baby (Male, 7 Days)',
    beneficiarySubtitle: 'House #65, North Tola, Rampur',
    category: 'pnc',
    priorityBadge: 'Scheduled PNC • Due: Tomorrow, 25 Oct 2024',
    badgeType: 'green',
    dueText: 'Tomorrow, 25 Oct 2024',
    detailsNote: 'Checklists: Umbilical Cord Check • Exclusive Breastfeeding • Kangaroo Mother Care',
    actionButtonText: 'View Details',
    isCompleted: false
  },
  {
    id: 'task-4',
    title: 'Blood Pressure Re-measurement & Medication Adherence Check',
    beneficiaryName: 'Savitri Devi (Age 58, Hypertension)',
    beneficiarySubtitle: 'House #19, Main Road, Rampur',
    category: 'ncd',
    priorityBadge: 'NCD Chronic Care • Due: Friday, 26 Oct 2024',
    badgeType: 'amber',
    dueText: 'Friday, 26 Oct 2024',
    detailsNote: 'Verify daily Amlodipine 5mg intake. Previous reading was 142/90 mmHg. Check for any dizziness or ankle swelling.',
    actionButtonText: 'View Details',
    isCompleted: false
  },
  {
    id: 'task-5',
    title: 'Diarrhea Prevention Kit (2 ORS Sachets + 14 Zinc Tablets)',
    beneficiaryName: 'Rekha Sharma (Child: Aarav, 18 Mos)',
    beneficiarySubtitle: 'House #08, East Basti, Rampur',
    category: 'supplies',
    priorityBadge: 'Supplies Allocation • Due: Saturday, 27 Oct 2024',
    badgeType: 'cyan',
    dueText: 'Saturday, 27 Oct 2024',
    detailsNote: 'Proactive distribution before seasonal monsoon break. Demonstrate ORS preparation in clean water.',
    actionButtonText: 'Prepare Kit',
    isCompleted: false
  },
  {
    id: 'task-6',
    title: 'Nutritional Rehabilitation Centre (NRC) Transport Verification',
    beneficiaryName: 'Anita Yadav (Infant: Chhotu, 9 Mos - Red MUAC 11.2cm)',
    beneficiarySubtitle: 'House #31, South Purwa',
    category: 'urgent',
    priorityBadge: 'Urgent Alert • Due: 26 Oct 2024 • NRC Admission Follow-up',
    badgeType: 'red',
    dueText: '26 Oct 2024',
    detailsNote: 'Severely Acute Malnourished (SAM) infant. Coordinate with 102 ambulance service for safe transport to District Hospital NRC.',
    actionButtonText: 'Coordinate NRC',
    isCompleted: false
  },
  {
    id: 'task-7',
    title: 'Deliver Calcium & Vitamin D3 Supplement Tablets (30 Days)',
    beneficiaryName: 'Kavita Devi (Lactating Mother, 3 Mos)',
    beneficiarySubtitle: 'House #55, Railway Colony, Rampur',
    category: 'supplies',
    priorityBadge: 'Supplies Allocation • Due: 28 Oct 2024',
    badgeType: 'cyan',
    dueText: '28 Oct 2024',
    detailsNote: 'Postpartum maternal bone health protocol. Hand over 60 tablets of Calcium 500mg.',
    actionButtonText: 'Stage for Delivery',
    isCompleted: false
  }
];

export const mockVisitHistory: VisitHistoryItem[] = [
  {
    id: 'vis-1',
    beneficiaryName: 'Pooja Devi',
    spouseName: 'Manoj Kumar',
    age: 24,
    rchId: '#9842-8819',
    visitType: 'Antenatal Care (32 wks)',
    timestampText: 'Today, 10:48 AM',
    statusBadge: 'PHC Referral Flagged',
    statusType: 'red',
    audioDuration: 'Hindi (01:42s)',
    vitalsSummary: '⚠️ Vitals: BP 130/85 mmHg • Severe Edema • Headache',
    hasReferralSlip: true,
    category: 'anc',
    isAlert: true
  },
  {
    id: 'vis-2',
    beneficiaryName: 'Meena Kumari',
    spouseName: 'Rajesh',
    age: 28,
    rchId: '#7712-4011',
    visitType: 'ANC Visit 2',
    timestampText: 'Today, 10:15 AM',
    statusBadge: 'Complete',
    statusType: 'green',
    audioDuration: 'Hindi (03:42)',
    vitalsSummary: 'IFA tablets dispensed • Weight 56kg (+2.1kg) • BP 118/76',
    hasReferralSlip: false,
    category: 'anc',
    isAlert: false
  },
  {
    id: 'vis-3',
    beneficiaryName: 'Aarav Sharma',
    spouseName: 'Sunita',
    age: 1.5,
    rchId: '#5521-9032',
    visitType: 'Routine Immunization',
    timestampText: 'Today, 09:30 AM',
    statusBadge: 'DPT Booster Logged',
    statusType: 'cyan',
    audioDuration: 'Hindi (02:18)',
    vitalsSummary: 'DPT Booster & Vitamin A 2nd Dose Administered',
    hasReferralSlip: false,
    category: 'immunization',
    isAlert: false
  },
  {
    id: 'vis-4',
    beneficiaryName: 'Savitri Devi',
    age: 54,
    rchId: '#3319-1102',
    visitType: 'Hypertension & Diabetes',
    timestampText: '23 Oct 2024, 04:15 PM',
    statusBadge: 'BP Re-check Due',
    statusType: 'amber',
    audioDuration: 'Hindi (04:05)',
    vitalsSummary: 'Systolic BP 142 • Fasting Sugar 168 mg/dL • Next check in 3 days',
    hasReferralSlip: false,
    category: 'ncd',
    isAlert: false
  },
  {
    id: 'vis-5',
    beneficiaryName: 'Geeta Patel',
    spouseName: 'Vikram',
    age: 21,
    rchId: '#8801-6543',
    visitType: 'Postnatal Care (PNC Day 14)',
    timestampText: '22 Oct 2024, 11:30 AM',
    statusBadge: 'Complete',
    statusType: 'green',
    audioDuration: 'Hindi (01:55)',
    vitalsSummary: 'Newborn cord healed • Mother breast-feeding well • No fever',
    hasReferralSlip: false,
    category: 'pnc',
    isAlert: false
  }
];
