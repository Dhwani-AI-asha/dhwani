import { Beneficiary, FollowUpTask, StructuredVisitData, VisitHistoryItem } from '../types';

export const mockBeneficiaries: Beneficiary[] = [
  {
    id: 'b-pooja',
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
  audioDurationText: '01:42',
  languageDetected: 'Hindi (हिन्दी) with English Clinical Terms',
  confidenceScore: 98.4,
  originalTranscript: 'पूजा देवी, उम्र 24 वर्ष, गर्भावस्था का 32वां सप्ताह (3rd trimester)। आज गृह भेंट में बीपी मापा गया जो 130/85 mmHg आया। नाड़ी 78 प्रति मिनट। लाभार्थी ने बताया कि पिछले 3 दिनों से दोनों पैरों में सूजन (bilateral pedal edema) आ रही है और कल शाम से हल्का सिरदर्द है। भ्रूण की हलचल (fetal movement) सामान्य है। आयरन और फोलिक एसिड की गोलियां रोज ले रही हैं, अभी 15 गोलियां बची हैं। टिटनेस का दूसरा टीका (TT-2) पिछले महीने लग चुका है। वजन 56 किलो है, पिछले महीने से 2 किलो बढ़ा है।',
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
