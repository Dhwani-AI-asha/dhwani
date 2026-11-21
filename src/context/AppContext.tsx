import React, { createContext, useContext, useState, useEffect, useRef, useMemo, useCallback, ReactNode } from 'react';
import { 
  AshaWorker,
  Beneficiary, 
  ConversationMessage,
  CorrectionAuditEntry,
  DangerSignAlert,
  EmergencyConfirmationState,
  EmergencyEscalationRecord,
  FollowUpTask, 
  NavScreen, 
  StoredVisitRecord,
  StructuredVisitData, 
  SyncCounts,
  VisitHistoryItem 
} from '../types';
import { 
  mockAshaWorkers,
  mockBeneficiaries, 
  mockFollowUpTasks, 
  mockVisitHistory,
  predefinedDangerSigns
} from '../data/mockData';
import { VoiceClient, voiceClient, VoiceStatus } from '../lib/voiceClient';
import { speak, stopSpeaking } from '../lib/speak';
import {
  detectValidatedDangerSignFromText,
  normalizeDangerSignKey,
  selectValidatedReportDangerSign,
} from '../lib/dangerSignDetector';
import { EmergencyVoiceConfirmationController } from '../lib/emergencyConfirmation';
import {
  generateReport,
  voiceCorrectReport,
  ReportSuccess,
} from '../lib/reportApi';
import {
  buildBackendReportPayload,
  getVisitById,
  listPatients,
  resolveVisitPatientId,
  saveVisit,
  updateVisitReport,
} from '../lib/patientApi';
import {
  ACTIVE_VISIT_REF_STORAGE_KEY,
  ActiveVisitPersistenceRef,
  buildCurrentStructuredReport,
  buildStructuredReadBackText,
  computeAvatarInitials,
  createEmptyVisitData,
  createUnselectedBeneficiary,
  mapAuditItems,
  mergeStructuredReportIntoVisit,
} from '../lib/visitCorrectionSync';
import { 
  getAllStoredVisits, 
  getStoredVisitById,
  saveVisitRecord, 
  calculateSyncCounts, 
  updateVisitSyncStatus,
  getAllFollowUpTasks,
  saveFollowUpRecord,
  updateFollowUpStatus
} from '../services/offlineDB';
import { useNetworkStatus } from '../hooks/useNetworkStatus';

interface AppContextType {
  // Authentication
  currentUser: AshaWorker | null;
  login: (workerId: string, pass: string) => { success: boolean; error?: string };
  logout: () => void;

  // Navigation
  currentScreen: NavScreen;
  setCurrentScreen: (screen: NavScreen) => void;
  beneficiaries: Beneficiary[];
  activeBeneficiary: Beneficiary;
  isBeneficiarySelected: boolean;
  setActiveBeneficiary: (b: Beneficiary) => void;
  clearBeneficiarySelection: () => void;
  confirmPatientIdentity: (confirmedName: string) => void;
  activeVisit: StructuredVisitData;
  setActiveVisit: React.Dispatch<React.SetStateAction<StructuredVisitData>>;
  followUpTasks: FollowUpTask[];
  setFollowUpTasks: React.Dispatch<React.SetStateAction<FollowUpTask[]>>;
  visitHistory: VisitHistoryItem[];
  setVisitHistory: React.Dispatch<React.SetStateAction<VisitHistoryItem[]>>;
  storedVisits: StoredVisitRecord[];
  isOfflineDBLoaded: boolean;
  isOnline: boolean;
  syncCounts: SyncCounts;
  pendingAttentionCount: number;
  refreshStoredVisits: () => Promise<void>;
  
  // Voice & Recording states
  isRecording: boolean;
  recordingSeconds: number;
  isPaused: boolean;
  startRecording: () => void;
  pauseRecording: () => void;
  stopRecordingAndReview: () => void;
  cancelRecording: () => void;
  liveSegments: string[];
  liveTranscript: string;
  voiceStatus: VoiceStatus;
  voiceError: string | null;
  reportResult: ReportSuccess | null;
  reportError: string | null;
  reportErrorMessage: string | null;
  isReportLoading: boolean;
  replayReport: () => void;
  submitCorrection: (correction: string, source?: 'voice' | 'text') => Promise<void>;
  confirmConversationalReport: () => Promise<void>;
  conversationLog: ConversationMessage[];
  isListeningForCorrection: boolean;
  correctionLiveTranscript: string;
  isReportConfirmed: boolean;
  startVoiceCorrectionListening: () => Promise<void>;
  stopVoiceCorrectionListening: () => void;
  persistCurrentVisitToBackend: (visitSnapshot?: StructuredVisitData, aiReportSnapshot?: Record<string, unknown> | null) => Promise<{ ok: boolean; visitId?: string; error?: string }>;
  // Audio playback states
  isPlayingAudio: boolean;
  audioCurrentTime: number;
  togglePlayAudio: () => void;
  seekAudio: (seconds: number) => void;
  
  // Voice Read-back & Verification (Feature 2)
  isReadBackActive: boolean;
  readBackState: 'idle' | 'speaking' | 'paused' | 'listening';
  startReadBack: (customText?: string) => void;
  pauseReadBack: () => void;
  resumeReadBack: () => void;
  stopReadBack: () => void;
  interruptReadBackForCorrection: () => void;
  applyVoiceCorrection: (field: 'bp' | 'weight' | 'name' | 'visitType' | 'vaccine' | 'nextDate', value: any) => string;
  lastCorrectedMessage: string | null;

  // Immediate Danger-Sign Voice Alert & Confirmation (Feature 3)
  activeDangerAlert: DangerSignAlert | null;
  emergencyConfirmation: EmergencyConfirmationState | null;
  triggerDangerSign: (alertId: string) => void;
  retryEmergencyVoiceConfirmation: () => void;
  acknowledgeDangerAlert: () => void;
  clearDangerAlert: () => void;

  // Modals
  isBeneficiaryModalOpen: boolean;
  setIsBeneficiaryModalOpen: (open: boolean) => void;
  isReferralModalOpen: boolean;
  setIsReferralModalOpen: (open: boolean) => void;
  isCallMoModalOpen: boolean;
  setIsCallMoModalOpen: (open: boolean) => void;

  // Offline persistence & visit state
  isSavingVisit: boolean;
  visitSaveError: string | null;
  clearVisitSaveError: () => void;
  dbRestoreError: string | null;
  isSyncing: boolean;
  syncError: string | null;
  attemptAutoSync: () => Promise<void>;

  // Helper actions
  confirmVisitAndSave: (asEscalated: boolean) => Promise<boolean>;
  toggleTaskCompletion: (taskId: string) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  // Authentication State: check localStorage first; if null, user will see Login screen
  const [currentUser, setCurrentUser] = useState<AshaWorker | null>(() => {
    const saved = localStorage.getItem('dhwani_asha_worker');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        return null;
      }
    }
    // Default logged in as Sunita Devi for seamless initial experience
    return mockAshaWorkers[0];
  });

  const [currentScreen, setCurrentScreen] = useState<NavScreen>('dashboard');
  const [beneficiaries, setBeneficiaries] = useState<Beneficiary[]>(mockBeneficiaries);
  const [isBeneficiarySelected, setIsBeneficiarySelected] = useState<boolean>(false);
  const isBeneficiarySelectedRef = useRef<boolean>(false);
  const [activeBeneficiaryState, setActiveBeneficiaryState] = useState<Beneficiary>(createUnselectedBeneficiary);
  const [activeVisit, setActiveVisit] = useState<StructuredVisitData>(() => createEmptyVisitData(null));
  const activeVisitRef = useRef<StructuredVisitData>(activeVisit);
  const activeBeneficiaryRef = useRef<Beneficiary>(activeBeneficiaryState);
  const activeLocalVisitIdRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    activeVisitRef.current = activeVisit;
  }, [activeVisit]);

  useEffect(() => {
    activeBeneficiaryRef.current = activeBeneficiaryState;
  }, [activeBeneficiaryState]);

  useEffect(() => {
    isBeneficiarySelectedRef.current = isBeneficiarySelected;
  }, [isBeneficiarySelected]);

  const setActiveBeneficiary = useCallback((b: Beneficiary) => {
    const switchingPatient =
      b.id !== activeBeneficiaryRef.current.id ||
      (b.patientId && b.patientId !== activeBeneficiaryRef.current.patientId) ||
      !isBeneficiarySelectedRef.current;
    setIsBeneficiarySelected(true);
    isBeneficiarySelectedRef.current = true;
    setActiveBeneficiaryState(b);
    activeBeneficiaryRef.current = b;
    setActiveVisit((prev) => ({
      ...prev,
      beneficiary: { ...b },
      isBeneficiarySelected: true,
      patientNameSource: 'selected_beneficiary',
      identityStatus: 'verified',
      identityMismatchDetail: null,
      ...(switchingPatient ? { backendVisitId: undefined } : {}),
    }));
    if (switchingPatient) {
      activeLocalVisitIdRef.current = undefined;
    }
  }, []);

  const clearBeneficiarySelection = useCallback(() => {
    const emptyBen = createUnselectedBeneficiary();
    setIsBeneficiarySelected(false);
    isBeneficiarySelectedRef.current = false;
    setActiveBeneficiaryState(emptyBen);
    activeBeneficiaryRef.current = emptyBen;
    activeLocalVisitIdRef.current = undefined;
    setActiveVisit((prev) => {
      const reportName =
        typeof prev.structuredReport?.patient_name === 'string' && prev.structuredReport.patient_name.trim()
          ? prev.structuredReport.patient_name.trim()
          : '';
      return {
        ...prev,
        beneficiary: reportName
          ? { ...emptyBen, name: reportName, avatarInitials: computeAvatarInitials(reportName) }
          : emptyBen,
        isBeneficiarySelected: false,
        patientNameSource: reportName ? 'transcript' : 'missing',
        identityStatus: reportName ? 'verified' : 'missing',
        identityMismatchDetail: null,
        backendVisitId: undefined,
      };
    });
  }, []);

  const confirmPatientIdentity = useCallback((confirmedName: string) => {
    const cleaned = confirmedName.trim();
    if (!cleaned) return;
    setActiveBeneficiaryState((prev) => {
      const nextBen: Beneficiary = {
        ...prev,
        name: cleaned,
        avatarInitials: computeAvatarInitials(cleaned),
      };
      activeBeneficiaryRef.current = nextBen;
      return nextBen;
    });
    setActiveVisit((prev) => {
      const nextReport = prev.structuredReport
        ? {
            ...prev.structuredReport,
            patient_name: cleaned,
            identity_status: 'verified',
            patient_name_source: prev.isBeneficiarySelected ? 'selected_beneficiary' : 'confirmed',
            patient_name_ambiguous: false,
            identity_mismatch_detail: null,
          }
        : prev.structuredReport;
      const updated: StructuredVisitData = {
        ...prev,
        beneficiary: {
          ...prev.beneficiary,
          name: cleaned,
          avatarInitials: computeAvatarInitials(cleaned),
        },
        identityStatus: 'verified',
        patientNameSource: prev.isBeneficiarySelected ? 'selected_beneficiary' : 'confirmed',
        identityMismatchDetail: null,
        confirmedFields: { ...(prev.confirmedFields || {}), patient_name: true },
        structuredReport: nextReport,
      };
      activeVisitRef.current = updated;
      return updated;
    });
  }, []);

  const activeBeneficiary = activeBeneficiaryState;
  const [followUpTasks, setFollowUpTasks] = useState<FollowUpTask[]>(mockFollowUpTasks);
  const [visitHistory, setVisitHistory] = useState<VisitHistoryItem[]>(mockVisitHistory);
  const [storedVisits, setStoredVisits] = useState<StoredVisitRecord[]>([]);
  const [isOfflineDBLoaded, setIsOfflineDBLoaded] = useState<boolean>(false);
  const [isSavingVisit, setIsSavingVisit] = useState<boolean>(false);
  const [visitSaveError, setVisitSaveError] = useState<string | null>(null);
  const [dbRestoreError, setDbRestoreError] = useState<string | null>(null);
  const [isReportConfirmed, setIsReportConfirmed] = useState<boolean>(false);

  // Reconcile synthetic beneficiaries with real backend patient records on startup (no duplicate creation)
  useEffect(() => {
    let isMounted = true;
    listPatients()
      .then((backendPatients) => {
        if (!isMounted || !Array.isArray(backendPatients) || backendPatients.length === 0) return;
        setBeneficiaries((prev) =>
          prev.map((b) => {
            const matched = backendPatients.find(
              (p) =>
                (b.patientId && p.patient_id === b.patientId) ||
                (b.rchId && p.address && p.address.includes(b.rchId)) ||
                p.name.trim().toLowerCase() === b.name.trim().toLowerCase()
            );
            return matched ? { ...b, patientId: matched.patient_id } : b;
          })
        );
        setActiveBeneficiaryState((prev) => {
          if (!prev.name || !prev.name.trim()) return prev;
          const matched = backendPatients.find(
            (p) =>
              (prev.patientId && p.patient_id === prev.patientId) ||
              (prev.rchId && p.address && p.address.includes(prev.rchId)) ||
              p.name.trim().toLowerCase() === prev.name.trim().toLowerCase()
          );
          if (!matched || matched.patient_id === prev.patientId) return prev;
          return { ...prev, patientId: matched.patient_id };
        });
      })
      .catch(() => {
        // Backend offline — retain canonical synthetic patientId mappings
      });
    return () => {
      isMounted = false;
    };
  }, []);

  // Restore last active persisted visit (with corrected structured fields & audit trail) on page refresh / app restart
  useEffect(() => {
    let isMounted = true;
    const rawRef = localStorage.getItem(ACTIVE_VISIT_REF_STORAGE_KEY);
    if (!rawRef) return;
    let parsedRef: ActiveVisitPersistenceRef | null = null;
    try {
      parsedRef = JSON.parse(rawRef) as ActiveVisitPersistenceRef;
    } catch {
      return;
    }
    if (!parsedRef) return;

    const restore = async () => {
      if (parsedRef?.localVisitId) {
        activeLocalVisitIdRef.current = parsedRef.localVisitId;
      }

      // 1. Prefer backend DB record (source of truth surviving page refresh & app restart)
      if (parsedRef?.backendVisitId) {
        try {
          const backendVisit = await getVisitById(parsedRef.backendVisitId);
          if (backendVisit && isMounted) {
            const matchedBen = parsedRef?.beneficiaryId
              ? mockBeneficiaries.find(
                  (b) => b.patientId === backendVisit.patient_id || b.id === parsedRef?.beneficiaryId
                )
              : undefined;
            const reportName =
              typeof backendVisit.report?.patient_name === 'string' && backendVisit.report.patient_name.trim()
                ? backendVisit.report.patient_name.trim()
                : '';
            const restoredBen: Beneficiary = matchedBen
              ? matchedBen
              : {
                  ...createUnselectedBeneficiary(),
                  patientId: backendVisit.patient_id,
                  name: reportName,
                  avatarInitials: computeAvatarInitials(reportName),
                };
            const wasSelected = Boolean(matchedBen);
            setIsBeneficiarySelected(wasSelected);
            isBeneficiarySelectedRef.current = wasSelected;
            setActiveBeneficiaryState(restoredBen);
            activeBeneficiaryRef.current = restoredBen;
            const hydrated = mergeStructuredReportIntoVisit(
              {
                ...createEmptyVisitData(wasSelected ? restoredBen : null),
                beneficiary: restoredBen,
                isBeneficiarySelected: wasSelected,
              },
              backendVisit.report,
              { backendVisitId: backendVisit.visit_id, isFreshExtraction: true }
            );
            setActiveVisit(hydrated);
            activeVisitRef.current = hydrated;
            setIsReportConfirmed(hydrated.status === 'CONFIRMED' || hydrated.status === 'ESCALATED');
            return;
          }
        } catch {
          // Fall back to IndexedDB if backend is temporarily unreachable
        }
      }

      // 2. Fallback: IndexedDB snapshot
      if (parsedRef?.localVisitId) {
        try {
          const localRec = await getStoredVisitById(parsedRef.localVisitId);
          if (localRec?.visitData && isMounted) {
            const wasSelected = Boolean(localRec.visitData.isBeneficiarySelected);
            setIsBeneficiarySelected(wasSelected);
            isBeneficiarySelectedRef.current = wasSelected;
            setActiveBeneficiaryState(localRec.visitData.beneficiary);
            activeBeneficiaryRef.current = localRec.visitData.beneficiary;
            setActiveVisit(localRec.visitData);
            activeVisitRef.current = localRec.visitData;
            setIsReportConfirmed(
              localRec.visitData.status === 'CONFIRMED' || localRec.visitData.status === 'ESCALATED'
            );
          }
        } catch {
          // Ignore restore failure
        }
      }
    };

    void restore();
    return () => {
      isMounted = false;
    };
  }, []);

  // Monitor real-time browser network status
  const { isOnline } = useNetworkStatus();

  // Compute pending, syncing, synced, and failed counts from stored visits
  const syncCounts: SyncCounts = useMemo(() => {
    return calculateSyncCounts(storedVisits);
  }, [storedVisits]);

  const pendingAttentionCount = syncCounts.totalRequiringAttention;

  const refreshStoredVisits = useCallback(async () => {
    try {
      const records = await getAllStoredVisits();
      setStoredVisits(records);
    } catch (err) {
      console.warn('[AppContext] Failed to refresh stored visits:', err);
    }
  }, []);

  // Restore saved visits from IndexedDB on startup while preserving mock data
  useEffect(() => {
    let isMounted = true;
    getAllStoredVisits()
      .then((records) => {
        if (!isMounted) return;
        setStoredVisits(records);
        setIsOfflineDBLoaded(true);
        setDbRestoreError(null);

        if (Array.isArray(records) && records.length > 0) {
          try {
            // Convert stored IndexedDB visit records to VisitHistoryItems
            const restoredHistoryItems: VisitHistoryItem[] = records
              .filter((rec) => rec && rec.visitData && rec.visitData.beneficiary)
              .map((rec) => {
                const isEscalated = rec.visitData.status === 'ESCALATED';
                const dateObj = new Date(rec.createdAt);
                const timeStr = !isNaN(dateObj.getTime())
                  ? dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                  : 'Earlier';

                return {
                  id: rec.id,
                  beneficiaryName: rec.visitData.beneficiary.name,
                  spouseName: rec.visitData.beneficiary.spouseName,
                  age: rec.visitData.beneficiary.age,
                  rchId: rec.visitData.beneficiary.rchId,
                  visitType: rec.visitData.visitType,
                  timestampText: `Offline • ${timeStr}`,
                  statusBadge: isEscalated ? 'PHC Referral Flagged' : 'Complete',
                  statusType: isEscalated ? 'red' : 'green',
                  audioDuration: rec.visitData.audioDurationText || 'Voice Recorded',
                  vitalsSummary: isEscalated
                    ? `⚠️ Vitals: BP ${rec.visitData.vitals?.systolic || 0}/${rec.visitData.vitals?.diastolic || 0} mmHg • Bilateral Edema • Flagged`
                    : `Normal visit • Weight ${rec.visitData.vitals?.weight || 0}kg • BP ${rec.visitData.vitals?.systolic || 0}/${rec.visitData.vitals?.diastolic || 0}`,
                  hasReferralSlip: isEscalated,
                  category: 'anc',
                  isAlert: isEscalated,
                };
              });

            // Prepend restored local offline records ahead of default mock history, avoiding duplicate IDs
            setVisitHistory((prev) => {
              const existingIds = new Set(prev.map((item) => item.id));
              const newRestored = restoredHistoryItems.filter((item) => !existingIds.has(item.id));
              return [...newRestored, ...prev];
            });
          } catch (parseErr) {
            console.error('[AppContext] Error parsing restored visits:', parseErr);
          }
        }
      })
      .catch((err) => {
        console.warn('[AppContext] Failed to load offline visits from IndexedDB:', err);
        if (isMounted) {
          setIsOfflineDBLoaded(true);
          setDbRestoreError(err instanceof Error ? err.message : String(err));
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  // Restore saved follow-up tasks from IndexedDB on startup
  useEffect(() => {
    let isMounted = true;
    getAllFollowUpTasks()
      .then((savedTasks) => {
        if (!isMounted) return;
        if (Array.isArray(savedTasks) && savedTasks.length > 0) {
          setFollowUpTasks((prev) => {
            const savedIds = new Set(savedTasks.map(t => t.id));
            const remainingMock = prev.filter(t => !savedIds.has(t.id));
            return [...savedTasks, ...remainingMock];
          });
        }
      })
      .catch((err) => {
        console.warn('[AppContext] Failed to load offline follow-ups:', err);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  // Voice & Recording states
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [recordingSeconds, setRecordingSeconds] = useState<number>(0);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [liveSegments, setLiveSegments] = useState<string[]>([]);
  const [liveTranscript, setLiveTranscript] = useState<string>('');
  const [voiceStatus, setVoiceStatus] = useState<VoiceStatus>('idle');
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [reportResult, setReportResult] = useState<ReportSuccess | null>(null);
  const [reportError, setReportError] = useState<string | null>(null);
  const [reportErrorMessage, setReportErrorMessage] = useState<string | null>(null);
  const [isReportLoading, setIsReportLoading] = useState<boolean>(false);
  const [conversationLog, setConversationLog] = useState<ConversationMessage[]>([]);
  const [isListeningForCorrection, setIsListeningForCorrection] = useState<boolean>(false);
  const [correctionLiveTranscript, setCorrectionLiveTranscript] = useState<string>('');

  const reportRequestIdRef = useRef<number>(0);
  const reportResultRef = useRef<ReportSuccess | null>(null);
  const liveTranscriptRef = useRef<string>('');
  const recordingSessionIdRef = useRef<number>(0);
  const voiceModeRef = useRef<'visit' | 'correction'>('visit');
  const correctionBufferRef = useRef<string[]>([]);
  const correctionSubmittedRef = useRef<boolean>(false);
  const submitCorrectionHandlerRef = useRef<((text: string, source?: 'voice' | 'text') => Promise<void>) | null>(null);
  const isRecordingRef = useRef<boolean>(false);
  const isPausedRef = useRef<boolean>(false);

  // Danger sign active state & dedicated voice confirmation controller
  const [activeDangerAlert, setActiveDangerAlert] = useState<DangerSignAlert | null>(null);
  const [emergencyConfirmation, setEmergencyConfirmation] = useState<EmergencyConfirmationState | null>(null);
  const activeDangerAlertRef = useRef<DangerSignAlert | null>(null);
  const emergencyActiveRef = useRef<boolean>(false);
  const handledEmergencyKeysRef = useRef<Set<string>>(new Set());
  const emergencyControllerRef = useRef<EmergencyVoiceConfirmationController | null>(null);
  const startEmergencyConfirmationRef = useRef<((alert: DangerSignAlert) => void) | null>(null);

  useEffect(() => {
    isRecordingRef.current = isRecording;
  }, [isRecording]);

  useEffect(() => {
    isPausedRef.current = isPaused;
  }, [isPaused]);

  useEffect(() => {
    activeDangerAlertRef.current = activeDangerAlert;
  }, [activeDangerAlert]);

  useEffect(() => {
    reportResultRef.current = reportResult;
  }, [reportResult]);

  // Wire up VoiceClient callbacks (supports both initial visit capture & conversational voice corrections via Gnani STT)
  useEffect(() => {
    voiceClient.setCallbacks({
      onSegment: (text: string) => {
        const trimmed = text.trim();
        if (!trimmed) return;
        // Hard isolation: during emergency voice confirmation, never append to patient transcript or correction notes
        if (emergencyActiveRef.current) {
          return;
        }
        if (voiceModeRef.current === 'correction') {
          correctionBufferRef.current = [...correctionBufferRef.current, trimmed];
          setCorrectionLiveTranscript(correctionBufferRef.current.join(' '));
          return;
        }
        if (isPausedRef.current) {
          return;
        }
        setLiveSegments((prev) => {
          const next = [...prev, trimmed];
          const fullText = next.join(' ');
          liveTranscriptRef.current = fullText;
          setLiveTranscript(fullText);
          return next;
        });
      },
      onTurn: (turnText: string) => {
        if (emergencyActiveRef.current) {
          return;
        }
        if (voiceModeRef.current === 'correction') {
          const finalUtterance = (turnText || correctionBufferRef.current.join(' ')).trim();
          if (!finalUtterance || correctionSubmittedRef.current) return;
          correctionSubmittedRef.current = true;
          correctionBufferRef.current = [];
          setCorrectionLiveTranscript('');
          setIsListeningForCorrection(false);
          voiceClient.stop();
          voiceModeRef.current = 'visit';
          void submitCorrectionHandlerRef.current?.(finalUtterance, 'voice');
          return;
        }
        if (isPausedRef.current) {
          return;
        }
        const checkText = (turnText || '').trim();
        if (checkText) {
          const detectedAlert = detectValidatedDangerSignFromText(
            checkText,
            handledEmergencyKeysRef.current
          );
          if (detectedAlert) {
            startEmergencyConfirmationRef.current?.(detectedAlert);
          }
        }
      },
      onError: (errMsg: string) => {
        if (emergencyActiveRef.current) {
          return;
        }
        setVoiceError(errMsg);
        if (voiceModeRef.current === 'correction') {
          setIsListeningForCorrection(false);
          voiceModeRef.current = 'visit';
        }
      },
      onStatus: (status: VoiceStatus) => {
        setVoiceStatus(status);
      },
    });

    return () => {
      voiceClient.stop();
      emergencyControllerRef.current?.dispose();
    };
  }, []);

  // Audio Playback simulation
  const [isPlayingAudio, setIsPlayingAudio] = useState<boolean>(false);
  const [audioCurrentTime, setAudioCurrentTime] = useState<number>(34);

  // Read-back modal & states
  const [isReadBackActive, setIsReadBackActive] = useState<boolean>(false);
  const [readBackState, setReadBackState] = useState<'idle' | 'speaking' | 'paused' | 'listening'>('idle');
  const [lastCorrectedMessage, setLastCorrectedMessage] = useState<string | null>(null);

  // Modals
  const [isBeneficiaryModalOpen, setIsBeneficiaryModalOpen] = useState<boolean>(false);
  const [isReferralModalOpen, setIsReferralModalOpen] = useState<boolean>(false);
  const [isCallMoModalOpen, setIsCallMoModalOpen] = useState<boolean>(false);

  // Authentication logic
  const login = (workerId: string, pass: string): { success: boolean; error?: string } => {
    const trimmedId = workerId.trim().toUpperCase();
    const worker = mockAshaWorkers.find(w => w.id.toUpperCase() === trimmedId);
    
    if (!worker) {
      return { 
        success: false, 
        error: `Worker ID "${workerId}" not found in Rampur Sub-Center register. Use demo accounts ASHA-9041 to ASHA-9044.` 
      };
    }

    if (pass !== 'asha@123') {
      return { 
        success: false, 
        error: 'Invalid password. (For synthetic demo accounts, use password: asha@123)' 
      };
    }

    setCurrentUser(worker);
    localStorage.setItem('dhwani_asha_worker', JSON.stringify(worker));
    return { success: true };
  };

  const logout = () => {
    voiceClient.stop();
    stopReadBack();
    clearDangerAlert();
    setCurrentUser(null);
    localStorage.removeItem('dhwani_asha_worker');
  };

  // Timer effect for recording
  useEffect(() => {
    let interval: any = null;
    if (isRecording && !isPaused) {
      interval = setInterval(() => {
        setRecordingSeconds(prev => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isRecording, isPaused]);

  // Timer effect for audio player
  useEffect(() => {
    let interval: any = null;
    if (isPlayingAudio) {
      interval = setInterval(() => {
        setAudioCurrentTime(prev => {
          if (prev >= 102) {
            setIsPlayingAudio(false);
            return 0;
          }
          return prev + 1;
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isPlayingAudio]);

  const appendConversation = useCallback((msg: Omit<ConversationMessage, 'id' | 'timestamp'>) => {
    const entry: ConversationMessage = {
      ...msg,
      id: `conv-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: new Date().toISOString(),
    };
    setConversationLog((prev) => [...prev, entry]);
  }, []);

  const persistActiveVisitSnapshot = useCallback(
    async (
      visitSnapshot?: StructuredVisitData,
      aiReportSnapshot?: Record<string, unknown> | null
    ): Promise<{ ok: boolean; visitId?: string; error?: string }> => {
      const visit = visitSnapshot || activeVisitRef.current;
      let beneficiary = visit.beneficiary || activeBeneficiaryRef.current;
      const reportPayload = buildBackendReportPayload(
        visit,
        aiReportSnapshot !== undefined ? aiReportSnapshot : (reportResultRef.current?.report ?? visit.structuredReport)
      );

      let backendVisitId = visit.backendVisitId;
      let backendError: string | undefined;

      try {
        if (backendVisitId) {
          const updated = await updateVisitReport(backendVisitId, reportPayload);
          backendVisitId = updated.visit_id;
        } else {
          const resolvedPatientId = await resolveVisitPatientId(visit);
          beneficiary = { ...beneficiary, patientId: resolvedPatientId };
          const saved = await saveVisit(
            resolvedPatientId,
            visit.originalTranscript || String(reportPayload.summary ?? ''),
            reportPayload
          );
          backendVisitId = saved.visit_id;
        }
      } catch (err: any) {
        backendError = err?.message || 'Failed to save visit to backend';
      }

      const finalVisit: StructuredVisitData = {
        ...visit,
        beneficiary: { ...beneficiary },
        backendVisitId,
        structuredReport: reportPayload,
      };
      setActiveVisit(finalVisit);
      activeVisitRef.current = finalVisit;
      if (beneficiary.patientId && beneficiary.patientId !== activeBeneficiaryRef.current.patientId) {
        setActiveBeneficiaryState(beneficiary);
        activeBeneficiaryRef.current = beneficiary;
      }

      // Also persist locally in IndexedDB and remember active ref so corrections survive refresh/restart
      let localVisitId = activeLocalVisitIdRef.current;
      try {
        const savedLocal = await saveVisitRecord(finalVisit, {
          id: localVisitId,
          syncStatus: backendVisitId && !backendError ? 'synced' : 'pending',
        });
        localVisitId = savedLocal.id;
        activeLocalVisitIdRef.current = savedLocal.id;
        setStoredVisits((prev) => [savedLocal, ...prev.filter((r) => r.id !== savedLocal.id)]);
      } catch (idbErr) {
        console.warn('[AppContext] Local IndexedDB snapshot save failed:', idbErr);
      }

      try {
        const ref: ActiveVisitPersistenceRef = {
          backendVisitId,
          localVisitId,
          patientId: beneficiary.patientId,
          beneficiaryId: beneficiary.id,
        };
        localStorage.setItem(ACTIVE_VISIT_REF_STORAGE_KEY, JSON.stringify(ref));
      } catch {
        // Ignore storage quota issues
      }

      if (backendError) {
        return { ok: false, visitId: backendVisitId, error: backendError };
      }
      return { ok: true, visitId: backendVisitId };
    },
    []
  );

  const startRecording = async () => {
    const currentSessionId = ++recordingSessionIdRef.current;
    reportRequestIdRef.current++;
    voiceModeRef.current = 'visit';
    emergencyControllerRef.current?.dispose();
    emergencyActiveRef.current = false;
    handledEmergencyKeysRef.current.clear();
    setEmergencyConfirmation(null);
    setActiveDangerAlert(null);
    setIsListeningForCorrection(false);
    setCorrectionLiveTranscript('');
    setConversationLog([]);
    setIsReportConfirmed(false);
    setReportResult(null);
    setReportError(null);
    setReportErrorMessage(null);
    setIsReportLoading(false);
    setIsPlayingAudio(false);
    setLiveSegments([]);
    setLiveTranscript('');
    liveTranscriptRef.current = '';
    setVoiceError(null);
    setIsRecording(true);
    isRecordingRef.current = true;
    setIsPaused(false);
    isPausedRef.current = false;
    setRecordingSeconds(0);
    activeLocalVisitIdRef.current = undefined;
    const selectedForNewVisit =
      isBeneficiarySelectedRef.current && activeBeneficiaryRef.current.name.trim()
        ? activeBeneficiaryRef.current
        : null;
    if (!selectedForNewVisit) {
      const emptyBen = createUnselectedBeneficiary();
      setActiveBeneficiaryState(emptyBen);
      activeBeneficiaryRef.current = emptyBen;
    }
    const freshVisit = createEmptyVisitData(selectedForNewVisit);
    setActiveVisit(freshVisit);
    activeVisitRef.current = freshVisit;
    setCurrentScreen('new-visit');
    setVoiceStatus('connecting');

    const DISCLOSURE_HINDI = "नमस्ते, मैं एक AI सहायक हूँ। मैं आपकी बातें सुनकर विज़िट नोट्स लिखने में मदद करती हूँ।";
    let played = false;
    try {
      played = await speak(DISCLOSURE_HINDI, 'hi-IN');
    } catch {
      played = false;
    }

    // If recording was cancelled while disclosure was playing, don't start voice client
    if (recordingSessionIdRef.current !== currentSessionId) {
      return;
    }

    if (!played) {
      setVoiceError("AI assistant disclosure could not be played");
    }

    voiceClient.start().catch((err: unknown) => {
      console.error('Failed to start voice client:', err);
    });
  };

  const pauseRecording = () => {
    if (emergencyActiveRef.current) {
      // Do not unpause normal visit capture while dedicated emergency confirmation is active
      return;
    }
    setIsPaused(prev => {
      const willBePaused = !prev;
      isPausedRef.current = willBePaused;
      if (willBePaused) {
        voiceClient.pause();
      } else {
        voiceClient.resume();
      }
      return willBePaused;
    });
  };

  const resolveTtsLang = (lang?: string | null): string => {
    if (!lang) return 'hi-IN';
    const low = lang.toLowerCase();
    if (low === 'en' || low.startsWith('en-')) return 'en-IN';
    return 'hi-IN';
  };

  const runReport = async (transcript: string) => {
    const requestId = ++reportRequestIdRef.current;
    setReportResult(null);
    setReportError(null);
    setReportErrorMessage(null);
    setIsReportConfirmed(false);
    setConversationLog([]);
    setIsReportLoading(true);

    const selectedName =
      isBeneficiarySelectedRef.current && activeBeneficiaryRef.current.name.trim()
        ? activeBeneficiaryRef.current.name.trim()
        : null;
    const result = await generateReport(transcript, null, fetch, selectedName);

    if (reportRequestIdRef.current !== requestId) return;
    setIsReportLoading(false);

    if (result.ok) {
      setReportResult(result);
      reportResultRef.current = result;

      // Sync extracted structured report into activeVisit (strict source-only extraction, unconfirmed draft)
      const merged = mergeStructuredReportIntoVisit(activeVisitRef.current, result.report, {
        confirmed: false,
        isFreshExtraction: true,
      });
      setActiveVisit(merged);
      activeVisitRef.current = merged;

      if (!isBeneficiarySelectedRef.current) {
        setActiveBeneficiaryState(merged.beneficiary);
        activeBeneficiaryRef.current = merged.beneficiary;
      }

      const confirmPrompt =
        result.confirmation_prompt ||
        (result.narration_language === 'en'
          ? 'Is this report correct? Would you like to make any changes?'
          : 'क्या यह रिपोर्ट सही है? क्या आप कोई बदलाव करना चाहती हैं?');

      appendConversation({
        role: 'ai',
        text: `${result.narration_speech} ${confirmPrompt}`.trim(),
        action: 'readback',
      });

      const validatedDangerAlert = selectValidatedReportDangerSign(
        result.report?.danger_signs,
        result.transcript_used || transcript,
        handledEmergencyKeysRef.current
      );
      if (validatedDangerAlert && !emergencyActiveRef.current) {
        startEmergencyConfirmationRef.current?.(validatedDangerAlert);
        return;
      }

      await speak(`${result.narration_speech} ${confirmPrompt}`.trim(), resolveTtsLang(result.narration_language));
    } else {
      setReportError(result.error);
      setReportErrorMessage(result.message || null);
      // Visit transcript and beneficiary data remain preserved in activeVisit even when AI model is unavailable
    }
  };

  const replayReport = () => {
    if (reportResult) {
      const confirmPrompt =
        reportResult.confirmation_prompt ||
        (reportResult.narration_language === 'en'
          ? 'Is this report correct? Would you like to make any changes?'
          : 'क्या यह रिपोर्ट सही है? क्या आप कोई बदलाव करना चाहती हैं?');
      void speak(
        `${reportResult.narration_speech} ${confirmPrompt}`.trim(),
        resolveTtsLang(reportResult.narration_language)
      );
      return;
    }
    const fallbackReadback = buildStructuredReadBackText(activeVisitRef.current, 'hi');
    void speak(fallbackReadback.speech, 'hi-IN');
  };

  const submitCorrection = useCallback(
    async (correction: string, source: 'voice' | 'text' = 'text') => {
      const text = correction.trim();
      if (!text) return;

      const requestId = ++reportRequestIdRef.current;
      stopSpeaking();
      setReportError(null);
      setReportErrorMessage(null);
      setIsReportLoading(true);

      appendConversation({
        role: 'worker',
        text,
      });

      const currentStructured = buildCurrentStructuredReport(
        activeVisitRef.current,
        reportResultRef.current?.report
      );
      const runningTranscript =
        reportResultRef.current?.transcript_used || activeVisitRef.current.originalTranscript || null;

      const selectedName =
        isBeneficiarySelectedRef.current && activeBeneficiaryRef.current.name.trim()
          ? activeBeneficiaryRef.current.name.trim()
          : null;

      const result = await voiceCorrectReport(
        currentStructured,
        text,
        runningTranscript,
        reportResultRef.current?.narration_language || null,
        source,
        fetch,
        selectedName
      );

      if (reportRequestIdRef.current !== requestId) return;
      setIsReportLoading(false);

      if (!result.ok) {
        setReportError(result.error);
        setReportErrorMessage(result.message || null);
        appendConversation({
          role: 'ai',
          text: result.message || `Correction error: ${result.error}`,
          action: 'error',
        });
        return;
      }

      const ttsLang = resolveTtsLang(result.narration_language);
      const mappedChanges: CorrectionAuditEntry[] = mapAuditItems(result.changes);

      if (result.action === 'clarify') {
        // Ambiguous utterance — do NOT mutate structured data; ask clarification question aloud
        setIsReportConfirmed(false);
        appendConversation({
          role: 'ai',
          text: result.assistant_reply,
          action: 'clarify',
        });
        await speak(result.assistant_reply_speech, ttsLang);
        return;
      }

      if (result.action === 'confirmed') {
        const confirmedVisit = mergeStructuredReportIntoVisit(activeVisitRef.current, result.report, {
          confirmed: true,
        });
        setActiveVisit(confirmedVisit);
        activeVisitRef.current = confirmedVisit;
        setIsReportConfirmed(true);

        const updatedResult: ReportSuccess = {
          ok: true,
          report: result.report,
          narration: result.narration,
          narration_speech: result.narration_speech,
          narration_language: result.narration_language,
          transcript_used: result.transcript_used || runningTranscript || '',
          disclaimer: result.disclaimer,
          confirmation_prompt: '',
          confirmed: true,
        };
        setReportResult(updatedResult);
        reportResultRef.current = updatedResult;

        await persistActiveVisitSnapshot(confirmedVisit, result.report);

        appendConversation({
          role: 'ai',
          text: result.assistant_reply,
          action: 'confirmed',
        });
        await speak(result.assistant_reply_speech, ttsLang);
        return;
      }

      // action === 'updated'
      const lastChangedField = result.changes[result.changes.length - 1]?.field;
      const updatedVisit = mergeStructuredReportIntoVisit(activeVisitRef.current, result.report, {
        confirmed: false,
        lastChangedField,
      });
      setActiveVisit(updatedVisit);
      activeVisitRef.current = updatedVisit;
      setIsReportConfirmed(false);

      if (lastChangedField === 'patient_name' || !isBeneficiarySelectedRef.current) {
        setActiveBeneficiaryState(updatedVisit.beneficiary);
        activeBeneficiaryRef.current = updatedVisit.beneficiary;
      }

      const updatedResult: ReportSuccess = {
        ok: true,
        report: result.report,
        narration: result.narration,
        narration_speech: result.narration_speech,
        narration_language: result.narration_language,
        transcript_used: result.transcript_used || runningTranscript || '',
        disclaimer: result.disclaimer,
        confirmation_prompt: result.confirmation_prompt,
        confirmed: false,
      };
      setReportResult(updatedResult);
      reportResultRef.current = updatedResult;

      // Persist corrected structured values immediately so they survive page refresh / restart
      await persistActiveVisitSnapshot(updatedVisit, result.report);

      appendConversation({
        role: 'ai',
        text: `${result.assistant_reply} ${result.confirmation_prompt}`.trim(),
        action: 'updated',
        changes: mappedChanges,
      });

      const correctionDangerAlert =
        selectValidatedReportDangerSign(
          result.report?.danger_signs,
          result.transcript_used || runningTranscript || '',
          handledEmergencyKeysRef.current
        ) || detectValidatedDangerSignFromText(text, handledEmergencyKeysRef.current);
      if (correctionDangerAlert && !emergencyActiveRef.current) {
        startEmergencyConfirmationRef.current?.(correctionDangerAlert);
        return;
      }

      await speak(result.assistant_reply_speech, ttsLang);
    },
    [appendConversation, persistActiveVisitSnapshot]
  );

  useEffect(() => {
    submitCorrectionHandlerRef.current = submitCorrection;
  }, [submitCorrection]);

  const confirmConversationalReport = useCallback(async () => {
    const lang = reportResultRef.current?.narration_language;
    const phrase = lang === 'en' ? 'Yes, it is correct.' : 'Haan, correct hai.';
    await submitCorrection(phrase, 'text');
  }, [submitCorrection]);

  const startVoiceCorrectionListening = useCallback(async () => {
    stopSpeaking();
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setVoiceError(null);
    correctionBufferRef.current = [];
    correctionSubmittedRef.current = false;
    setCorrectionLiveTranscript('');
    voiceModeRef.current = 'correction';
    setIsListeningForCorrection(true);
    try {
      await voiceClient.start();
    } catch (err: unknown) {
      setIsListeningForCorrection(false);
      voiceModeRef.current = 'visit';
      const msg = err instanceof Error ? err.message : 'Microphone unavailable for voice correction';
      setVoiceError(msg);
    }
  }, []);

  const stopVoiceCorrectionListening = useCallback(() => {
    const buffered = correctionBufferRef.current.join(' ').trim();
    voiceClient.stop();
    voiceModeRef.current = 'visit';
    setIsListeningForCorrection(false);
    setCorrectionLiveTranscript('');
    correctionBufferRef.current = [];
    if (buffered && !correctionSubmittedRef.current) {
      correctionSubmittedRef.current = true;
      void submitCorrection(buffered, 'voice');
    }
  }, [submitCorrection]);

  const stopRecordingAndReview = () => {
    recordingSessionIdRef.current++;
    emergencyControllerRef.current?.dispose();
    emergencyActiveRef.current = false;
    stopSpeaking();
    voiceClient.stop();
    voiceModeRef.current = 'visit';
    setIsRecording(false);
    isRecordingRef.current = false;
    setIsPaused(false);
    isPausedRef.current = false;
    setIsPlayingAudio(false);

    // Save joined text into activeVisit.originalTranscript
    const joinedText = liveTranscriptRef.current.trim();
    const durationText = `Hindi (${Math.floor(recordingSeconds / 60)}:${(recordingSeconds % 60).toString().padStart(2, '0')})`;
    if (joinedText) {
      const nextDraft: StructuredVisitData = {
        ...activeVisitRef.current,
        beneficiary: { ...activeBeneficiaryRef.current },
        originalTranscript: joinedText,
        audioDurationText: durationText,
        status: 'PENDING_VERIFICATION',
      };
      activeVisitRef.current = nextDraft;
      setActiveVisit(nextDraft);
      void runReport(joinedText);
    } else {
      const emptyDraft: StructuredVisitData = {
        ...activeVisitRef.current,
        beneficiary: { ...activeBeneficiaryRef.current },
        originalTranscript: '',
        audioDurationText: durationText,
      };
      activeVisitRef.current = emptyDraft;
      setActiveVisit(emptyDraft);
      setReportError('no_transcript');
    }

    setCurrentScreen('review-transcript');
  };

  const cancelRecording = () => {
    recordingSessionIdRef.current++;
    emergencyControllerRef.current?.dispose();
    emergencyControllerRef.current = null;
    emergencyActiveRef.current = false;
    handledEmergencyKeysRef.current.clear();
    setEmergencyConfirmation(null);
    setActiveDangerAlert(null);
    activeDangerAlertRef.current = null;
    stopSpeaking();
    reportRequestIdRef.current++;
    setIsReportLoading(false);
    voiceClient.stop();
    voiceModeRef.current = 'visit';
    setIsListeningForCorrection(false);
    setIsRecording(false);
    isRecordingRef.current = false;
    setIsPaused(false);
    isPausedRef.current = false;
    setIsPlayingAudio(false);
    setRecordingSeconds(0);
    setLiveSegments([]);
    setLiveTranscript('');
    liveTranscriptRef.current = '';
    setVoiceError(null);
    setVoiceStatus('idle');
    setCurrentScreen('dashboard');
  };

  const togglePlayAudio = () => {
    setIsPlayingAudio(prev => !prev);
  };

  const seekAudio = (seconds: number) => {
    setAudioCurrentTime(seconds);
  };

  // ==========================================
  // FEATURE 2: Spoken Report Read-Back & Correction
  // ==========================================
  const startReadBack = (customText?: string) => {
    setIsReadBackActive(true);
    setReadBackState('speaking');
    const visit = activeVisitRef.current;
    const fallback = buildStructuredReadBackText(visit, 'hi');
    const textToRead = customText || fallback.speech;

    void speak(textToRead, 'hi-IN').then((played) => {
      if (played) {
        setReadBackState('idle');
        return;
      }
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(textToRead);
        utterance.lang = 'hi-IN';
        utterance.rate = 0.95;
        utterance.onend = () => setReadBackState('idle');
        utterance.onerror = () => setReadBackState('idle');
        window.speechSynthesis.speak(utterance);
      } else {
        setReadBackState('idle');
      }
    });
  };

  const pauseReadBack = () => {
    stopSpeaking();
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.pause();
    }
    setReadBackState('paused');
  };

  const resumeReadBack = () => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.resume();
    }
    setReadBackState('speaking');
  };

  const stopReadBack = () => {
    stopSpeaking();
    if (voiceModeRef.current === 'correction') {
      stopVoiceCorrectionListening();
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setReadBackState('idle');
    setIsReadBackActive(false);
  };

  const interruptReadBackForCorrection = () => {
    stopSpeaking();
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setReadBackState('listening');
    void startVoiceCorrectionListening();
  };

  // Atomic voice correction to specific field (updates structured data, records audit entry, persists & speaks confirmation)
  const applyVoiceCorrection = (field: 'bp' | 'weight' | 'name' | 'visitType' | 'vaccine' | 'nextDate', value: any): string => {
    let confirmationHindi = '';
    let updatedFieldLabel = '';
    const nowIso = new Date().toISOString();
    const prevVisit = activeVisitRef.current;
    let nextVisit: StructuredVisitData = prevVisit;
    let auditEntry: CorrectionAuditEntry | null = null;

    if (field === 'bp') {
      const parts = String(value).match(/(\d{2,3})\s*\/\s*(\d{2,3})/);
      const sys = parts ? Number(parts[1]) : prevVisit.vitals.systolic;
      const dia = parts ? Number(parts[2]) : prevVisit.vitals.diastolic;
      const oldBp =
        prevVisit.vitals.systolic != null && prevVisit.vitals.diastolic != null
          ? `${prevVisit.vitals.systolic}/${prevVisit.vitals.diastolic}`
          : null;
      auditEntry = {
        field: 'blood_pressure',
        originalValue: oldBp,
        correctedValue: sys != null && dia != null ? `${sys}/${dia}` : null,
        timestamp: nowIso,
        source: 'voice',
      };
      nextVisit = {
        ...prevVisit,
        vitals: { ...prevVisit.vitals, systolic: sys, diastolic: dia, bpStatus: 'Confirmed' },
        confirmedFields: { ...(prevVisit.confirmedFields || {}), blood_pressure: true },
        status: 'PENDING_VERIFICATION',
        lastCorrectedField: 'Blood Pressure',
        correctionHistory: [...(prevVisit.correctionHistory || []), auditEntry],
      };
      updatedFieldLabel = `बीपी ${sys}/${dia}`;
      confirmationHindi = `ब्लड प्रेशर सुधार दिया गया है। नया बीपी ${sys} बटा ${dia} दर्ज हुआ। क्या यह सही है?`;
    } else if (field === 'weight') {
      auditEntry = {
        field: 'weight',
        originalValue: prevVisit.vitals.weight != null ? `${prevVisit.vitals.weight} kg` : null,
        correctedValue: `${Number(value)} kg`,
        timestamp: nowIso,
        source: 'voice',
      };
      nextVisit = {
        ...prevVisit,
        vitals: { ...prevVisit.vitals, weight: Number(value), weightStatus: 'Speech' },
        confirmedFields: { ...(prevVisit.confirmedFields || {}), weight: true },
        status: 'PENDING_VERIFICATION',
        lastCorrectedField: 'Maternal Weight',
        correctionHistory: [...(prevVisit.correctionHistory || []), auditEntry],
      };
      updatedFieldLabel = `वजन ${value} kg`;
      confirmationHindi = `वजन सुधार दिया गया है। नया वजन ${value} किलोग्राम दर्ज हुआ। क्या यह सही है?`;
    } else if (field === 'name') {
      const trimmedName = String(value).trim();
      auditEntry = {
        field: 'patient_name',
        originalValue: prevVisit.beneficiary.name || null,
        correctedValue: trimmedName,
        timestamp: nowIso,
        source: 'voice',
      };
      const updatedBen = {
        ...prevVisit.beneficiary,
        name: trimmedName,
        avatarInitials: computeAvatarInitials(trimmedName),
      };
      setActiveBeneficiaryState(updatedBen);
      activeBeneficiaryRef.current = updatedBen;
      nextVisit = {
        ...prevVisit,
        beneficiary: updatedBen,
        identityStatus: 'verified',
        patientNameSource: 'confirmed',
        identityMismatchDetail: null,
        confirmedFields: { ...(prevVisit.confirmedFields || {}), patient_name: true },
        status: 'PENDING_VERIFICATION',
        lastCorrectedField: 'Beneficiary Name',
        correctionHistory: [...(prevVisit.correctionHistory || []), auditEntry],
      };
      updatedFieldLabel = `नाम: ${trimmedName}`;
      confirmationHindi = `लाभार्थी का नाम बदलकर ${trimmedName} कर दिया गया है। क्या यह सही है?`;
    } else if (field === 'visitType') {
      auditEntry = {
        field: 'visit_type',
        originalValue: prevVisit.visitType || null,
        correctedValue: String(value),
        timestamp: nowIso,
        source: 'voice',
      };
      nextVisit = {
        ...prevVisit,
        visitType: value,
        confirmedFields: { ...(prevVisit.confirmedFields || {}), visit_type: true },
        status: 'PENDING_VERIFICATION',
        lastCorrectedField: 'Visit Type',
        correctionHistory: [...(prevVisit.correctionHistory || []), auditEntry],
      };
      updatedFieldLabel = `भेंट: ${value}`;
      confirmationHindi = `भेंट का प्रकार ${value} दर्ज किया गया। क्या यह सही है?`;
    } else if (field === 'vaccine') {
      const vaccText = typeof value === 'string' && value.trim() ? value.trim() : 'TT injection administered';
      const hasBooster = vaccText.toLowerCase().includes('booster');
      auditEntry = {
        field: 'vaccination_status',
        originalValue: prevVisit.vaccinationStatus || null,
        correctedValue: vaccText,
        timestamp: nowIso,
        source: 'voice',
      };
      nextVisit = {
        ...prevVisit,
        vaccinationStatus: vaccText,
        boosterStatus: hasBooster ? vaccText : null,
        confirmedFields: { ...(prevVisit.confirmedFields || {}), vaccination_status: true },
        immunizationLab: {
          ...prevVisit.immunizationLab,
          ttBooster: {
            ...prevVisit.immunizationLab.ttBooster,
            administered: true,
            verified: true,
            boosterStatus: hasBooster ? vaccText : null,
          },
        },
        status: 'PENDING_VERIFICATION',
        lastCorrectedField: 'Vaccination Status',
        correctionHistory: [...(prevVisit.correctionHistory || []), auditEntry],
      };
      updatedFieldLabel = `टीका: ${vaccText}`;
      confirmationHindi = `टीकाकरण जानकारी अपडेट हो गई है: ${vaccText}। क्या यह सही है?`;
    } else if (field === 'nextDate') {
      auditEntry = {
        field: 'next_visit_date',
        originalValue: prevVisit.nextVisitDate || null,
        correctedValue: String(value),
        timestamp: nowIso,
        source: 'voice',
      };
      nextVisit = {
        ...prevVisit,
        nextVisitDate: value,
        confirmedFields: { ...(prevVisit.confirmedFields || {}), next_visit_date: true },
        status: 'PENDING_VERIFICATION',
        lastCorrectedField: 'Next Visit Date',
        correctionHistory: [...(prevVisit.correctionHistory || []), auditEntry],
      };
      updatedFieldLabel = `अगली तारीख: ${value}`;
      confirmationHindi = `अगली गृह भेंट की तारीख ${value} निर्धारित कर दी गई है। क्या यह सही है?`;
    }

    setActiveVisit(nextVisit);
    activeVisitRef.current = nextVisit;
    setIsReportConfirmed(false);
    setLastCorrectedMessage(updatedFieldLabel);
    setReadBackState('speaking');

    void persistActiveVisitSnapshot(nextVisit);

    // Read back the updated value aloud via Gnani TTS (with browser TTS fallback)
    void speak(confirmationHindi, 'hi-IN').then((played) => {
      if (played) {
        setReadBackState('idle');
        return;
      }
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(confirmationHindi);
        utterance.lang = 'hi-IN';
        utterance.rate = 0.95;
        utterance.onend = () => setReadBackState('idle');
        window.speechSynthesis.speak(utterance);
      } else {
        setReadBackState('idle');
      }
    });

    return updatedFieldLabel;
  };

  // ==========================================
  // FEATURE 3: Immediate Danger-Sign Voice Alert & Voice Confirmation
  // ==========================================
  const launchEmergencyConfirmation = useCallback(
    (alertObj: DangerSignAlert, options?: { allowRepeat?: boolean }) => {
      const canonicalKey = alertObj.canonicalKey || normalizeDangerSignKey(alertObj.title);
      if (emergencyActiveRef.current) {
        return;
      }
      if (!options?.allowRepeat && handledEmergencyKeysRef.current.has(canonicalKey)) {
        return;
      }

      handledEmergencyKeysRef.current.add(canonicalKey);
      emergencyActiveRef.current = true;

      // 1. Pause normal patient voice capture & cancel any unrelated read-back speech
      const wasRecording = isRecordingRef.current && !isPausedRef.current;
      if (isRecordingRef.current) {
        voiceClient.pause();
        isPausedRef.current = true;
        setIsPaused(true);
      }
      if (voiceModeRef.current === 'correction') {
        voiceClient.stop();
        voiceModeRef.current = 'visit';
        setIsListeningForCorrection(false);
        setCorrectionLiveTranscript('');
      }
      stopSpeaking();
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
      setReadBackState('idle');

      // 2. Display alert modal in dedicated confirmation state (do NOT mark confirmed before voice consent)
      const activatedAlert: DangerSignAlert = {
        ...alertObj,
        canonicalKey,
        isAcknowledged: false,
      };
      setActiveDangerAlert(activatedAlert);
      activeDangerAlertRef.current = activatedAlert;

      // 3. Create & start dedicated Gnani TTS -> dedicated Gnani STT confirmation controller
      emergencyControllerRef.current?.dispose();
      const controller = new EmergencyVoiceConfirmationController({
        speakFn: (text, lang) => speak(text, lang || 'hi-IN'),
        stopSpeakFn: stopSpeaking,
        createSttClientFn: (callbacks) => new VoiceClient(callbacks),
        pauseNormalCaptureFn: () => {
          if (isRecordingRef.current) {
            voiceClient.pause();
            isPausedRef.current = true;
            setIsPaused(true);
          }
        },
        onStateChange: (nextState) => {
          setEmergencyConfirmation(nextState);
        },
        onComplete: (finalState, record: EmergencyEscalationRecord) => {
          emergencyActiveRef.current = false;
          setEmergencyConfirmation(finalState);

          const isConsented = finalState.escalationStatus === 'confirmed';
          if (isConsented) {
            setActiveDangerAlert((prev) => (prev ? { ...prev, isAcknowledged: true } : prev));
          }

          const currentVisit = activeVisitRef.current;
          const updatedEscalations = [...(currentVisit.emergencyEscalations || []), record];
          const updatedVisit: StructuredVisitData = {
            ...currentVisit,
            emergencyEscalations: updatedEscalations,
            dangerAlertTriggered: isConsented || Boolean(currentVisit.dangerAlertTriggered),
            status: isConsented ? 'ESCALATED' : currentVisit.status,
          };

          setActiveVisit(updatedVisit);
          activeVisitRef.current = updatedVisit;
          void persistActiveVisitSnapshot(updatedVisit);
        },
      });

      emergencyControllerRef.current = controller;
      void controller.start(activatedAlert, {
        wasVisitRecordingPaused: wasRecording,
      });
    },
    [persistActiveVisitSnapshot]
  );

  useEffect(() => {
    startEmergencyConfirmationRef.current = (alertObj) =>
      launchEmergencyConfirmation(alertObj, { allowRepeat: false });
  }, [launchEmergencyConfirmation]);

  const triggerDangerSign = useCallback(
    (alertId: string) => {
      const found = predefinedDangerSigns.find((ds) => ds.id === alertId) || predefinedDangerSigns[0];
      const canonicalKey = found.canonicalKey || normalizeDangerSignKey(found.title);
      launchEmergencyConfirmation(
        {
          ...found,
          canonicalKey,
          evidence: found.triggerObservation,
        },
        { allowRepeat: true }
      );
    },
    [launchEmergencyConfirmation]
  );

  const retryEmergencyVoiceConfirmation = useCallback(() => {
    const current = activeDangerAlertRef.current;
    if (!current) return;
    emergencyControllerRef.current?.dispose();
    emergencyActiveRef.current = false;
    launchEmergencyConfirmation(current, { allowRepeat: true });
  }, [launchEmergencyConfirmation]);

  const acknowledgeDangerAlert = () => {
    if (activeDangerAlert) {
      setActiveDangerAlert(prev => prev ? { ...prev, isAcknowledged: true } : null);
    }
    stopSpeaking();
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  };

  const clearDangerAlert = () => {
    emergencyControllerRef.current?.dispose();
    emergencyControllerRef.current = null;
    emergencyActiveRef.current = false;
    stopSpeaking();
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setEmergencyConfirmation(null);
    setActiveDangerAlert(null);
    activeDangerAlertRef.current = null;
  };

  const confirmVisitAndSave = async (asEscalated: boolean): Promise<boolean> => {
    setVisitSaveError(null);

    const currentVisit = activeVisitRef.current;
    const visitBen = isBeneficiarySelectedRef.current
      ? activeBeneficiaryRef.current
      : currentVisit.beneficiary;
    const resolvedName = (visitBen?.name || '').trim();
    const idStatus = currentVisit.identityStatus;

    // Identity validation gate: block confirmation when name is missing, ambiguous, or mismatched
    if (!resolvedName || idStatus === 'missing' || idStatus === 'ambiguous' || idStatus === 'mismatch') {
      const errMsg =
        idStatus === 'mismatch'
          ? currentVisit.identityMismatchDetail ||
            'Patient name in transcript does not match the selected beneficiary. Please resolve identity before confirming.'
          : idStatus === 'ambiguous'
            ? 'Patient name in transcript is ambiguous. Please confirm the exact patient name before saving.'
            : 'Patient name is not provided. Please select a beneficiary or confirm the patient name before saving.';
      setVisitSaveError(errMsg);
      return false;
    }

    setIsSavingVisit(true);

    const updatedStatus: 'ESCALATED' | 'CONFIRMED' = asEscalated ? 'ESCALATED' : 'CONFIRMED';

    const completeUpdatedVisit: StructuredVisitData = {
      ...currentVisit,
      beneficiary: { ...visitBen, name: resolvedName },
      identityStatus: 'verified',
      status: updatedStatus,
      confirmedAt: currentVisit.confirmedAt || new Date().toISOString(),
      dangerAlertTriggered: asEscalated || currentVisit.dangerAlertTriggered,
      audioDurationText:
        currentVisit.audioDurationText ||
        `Hindi (${Math.floor(recordingSeconds / 60)}:${(recordingSeconds % 60).toString().padStart(2, '0')})`,
    };

    try {
      const backendRes = await persistActiveVisitSnapshot(completeUpdatedVisit);
      const visitWithBackendId: StructuredVisitData = {
        ...activeVisitRef.current,
        ...completeUpdatedVisit,
        beneficiary: activeVisitRef.current.beneficiary,
        backendVisitId: backendRes.visitId || completeUpdatedVisit.backendVisitId,
      };
      const savedRecord = await saveVisitRecord(visitWithBackendId, {
        id: activeLocalVisitIdRef.current,
        syncStatus: backendRes.ok ? 'synced' : 'pending',
      });
      activeLocalVisitIdRef.current = savedRecord.id;

      setActiveVisit(visitWithBackendId);
      activeVisitRef.current = visitWithBackendId;
      setIsReportConfirmed(true);
      setStoredVisits(prev => [savedRecord, ...prev.filter(r => r.id !== savedRecord.id)]);

      const nowTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const bpLabel =
        visitWithBackendId.vitals.systolic != null && visitWithBackendId.vitals.diastolic != null
          ? `BP ${visitWithBackendId.vitals.systolic}/${visitWithBackendId.vitals.diastolic}`
          : 'BP: Not provided';
      const wtLabel =
        visitWithBackendId.vitals.weight != null
          ? `Weight ${visitWithBackendId.vitals.weight} kg`
          : 'Weight: Not provided';
      const vaccLabel = visitWithBackendId.vaccinationStatus
        ? ` • ${visitWithBackendId.vaccinationStatus}`
        : '';

      const newHistoryItem: VisitHistoryItem = {
        id: savedRecord.id || `vis-${Date.now()}`,
        backendVisitId: visitWithBackendId.backendVisitId,
        patientId: visitWithBackendId.beneficiary.patientId,
        beneficiaryName: resolvedName,
        spouseName: visitWithBackendId.beneficiary.spouseName,
        age: visitWithBackendId.beneficiary.age,
        rchId: visitWithBackendId.beneficiary.rchId,
        visitType: visitWithBackendId.visitType || 'Not provided',
        timestampText: `Just now, ${nowTime}`,
        statusBadge: asEscalated ? 'PHC Referral Flagged' : 'Complete',
        statusType: asEscalated ? 'red' : 'green',
        audioDuration:
          visitWithBackendId.audioDurationText ||
          `Hindi (${Math.floor(recordingSeconds / 60)}:${(recordingSeconds % 60).toString().padStart(2, '0')})`,
        vitalsSummary: `${bpLabel} • ${wtLabel}${vaccLabel}`,
        hasReferralSlip: asEscalated,
        category: visitWithBackendId.vaccinationStatus ? 'immunization' : 'anc',
        isAlert: asEscalated,
      };

      setVisitHistory(prev => [newHistoryItem, ...prev.filter(v => v.id !== newHistoryItem.id)]);

      if (asEscalated) {
        const ageText =
          visitWithBackendId.beneficiary.age != null
            ? `Age ${visitWithBackendId.beneficiary.age}`
            : 'Age: Not provided';
        const urgentTask: FollowUpTask = {
          id: `task-urgent-${Date.now()}`,
          patientId: visitWithBackendId.beneficiary.patientId,
          title: `Escort ${resolvedName} to PHC for Clinical Evaluation`,
          beneficiaryName: `${resolvedName} (${ageText})`,
          beneficiarySubtitle: [visitWithBackendId.beneficiary.village, visitWithBackendId.beneficiary.contactNumber]
            .filter(Boolean)
            .join(' • '),
          category: 'urgent',
          priorityBadge: 'Urgent Action Needed • Flagged Visit',
          badgeType: 'red',
          dueText: 'Immediate',
          contactNumber: visitWithBackendId.beneficiary.contactNumber,
          detailsNote: `Clinical Flag recorded during visit (${bpLabel}).`,
          actionButtonText: 'Confirm PHC Visit',
          secondaryButtonText: 'Call Beneficiary',
          isCompleted: false,
        };
        setFollowUpTasks(prev => [urgentTask, ...prev]);
        void saveFollowUpRecord(urgentTask).catch(err =>
          console.warn('[AppContext] Failed saving follow-up to IDB:', err)
        );
      }

      setIsSavingVisit(false);
      setVisitSaveError(null);
      setCurrentScreen(asEscalated ? 'follow-ups' : 'visit-history');
      return true;
    } catch (err: any) {
      console.error('[AppContext] Error saving visit to IndexedDB:', err);
      const errorMessage = err?.message || 'Failed to save visit record to device storage. Please try again.';
      setVisitSaveError(errorMessage);
      setIsSavingVisit(false);
      return false;
    }
  };

  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  // Probe backend server reachability before auto-sync
  const checkBackendReachable = async (): Promise<boolean> => {
    const voiceBase =
      (typeof import.meta !== 'undefined' &&
        (import.meta as unknown as { env?: { VITE_VOICE_HTTP_URL?: string } }).env?.VITE_VOICE_HTTP_URL) ||
      'http://localhost:8000';
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);
      const res = await fetch(`${voiceBase}/health`, { signal: controller.signal });
      clearTimeout(timeoutId);
      return res.status < 500;
    } catch {
      return false;
    }
  };

  const attemptAutoSync = useCallback(async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    setSyncError(null);

    try {
      const isReachable = await checkBackendReachable();
      if (!isReachable) {
        setSyncError('Voice/AI report server unreachable');
        setIsSyncing(false);
        return;
      }

      const allRecords = await getAllStoredVisits();
      const needsSync = allRecords.filter(r => r.syncStatus === 'pending' || r.syncStatus === 'failed');

      for (const record of needsSync) {
        await updateVisitSyncStatus(record.id, 'syncing');
        setStoredVisits(prev =>
          prev.map(r => r.id === record.id ? { ...r, syncStatus: 'syncing' } : r)
        );

        const transcript = record.visitData?.originalTranscript || '';
        const visitName = record.visitData?.beneficiary?.name?.trim() || null;
        try {
          let updatedData = record.visitData;
          if (transcript && !record.visitData?.structuredReport) {
            const reportRes = await generateReport(transcript, null, fetch, visitName);
            if (!reportRes.ok) {
              await updateVisitSyncStatus(record.id, 'failed', reportRes.error);
              setStoredVisits(prev =>
                prev.map(r => r.id === record.id ? { ...r, syncStatus: 'failed', lastSyncError: reportRes.error } : r)
              );
              continue;
            }
            updatedData = mergeStructuredReportIntoVisit(record.visitData, reportRes.report, {
              confirmed: record.visitData.status === 'CONFIRMED' || record.visitData.status === 'ESCALATED',
              isFreshExtraction: true,
            });
          }

          if (updatedData.beneficiary?.name?.trim()) {
            const payload = buildBackendReportPayload(updatedData, updatedData.structuredReport);
            if (updatedData.backendVisitId) {
              await updateVisitReport(updatedData.backendVisitId, payload);
            } else {
              const pid = await resolveVisitPatientId(updatedData);
              const saved = await saveVisit(pid, transcript || String(payload.summary ?? ''), payload);
              updatedData = {
                ...updatedData,
                beneficiary: { ...updatedData.beneficiary, patientId: pid },
                backendVisitId: saved.visit_id,
              };
            }
            await saveVisitRecord(updatedData, { id: record.id, syncStatus: 'synced' });
          } else {
            await updateVisitSyncStatus(record.id, 'synced');
          }

          setStoredVisits(prev =>
            prev.map(r =>
              r.id === record.id
                ? { ...r, visitData: updatedData, syncStatus: 'synced', lastSyncError: undefined }
                : r
            )
          );
        } catch (itemErr: any) {
          const errMsg = itemErr?.message || 'Sync failed';
          await updateVisitSyncStatus(record.id, 'failed', errMsg);
          setStoredVisits(prev =>
            prev.map(r => r.id === record.id ? { ...r, syncStatus: 'failed', lastSyncError: errMsg } : r)
          );
        }
      }
    } catch (err: any) {
      setSyncError(err?.message || 'Auto-sync encounter error');
    } finally {
      setIsSyncing(false);
    }
  }, [isSyncing]);

  // When connection transitions from offline to online, trigger auto-sync
  const prevOnlineRef = useRef<boolean>(isOnline);
  useEffect(() => {
    if (!prevOnlineRef.current && isOnline) {
      void attemptAutoSync();
    }
    prevOnlineRef.current = isOnline;
  }, [isOnline, attemptAutoSync]);

  const toggleTaskCompletion = (taskId: string) => {
    setFollowUpTasks(prev => 
      prev.map(task => {
        if (task.id === taskId) {
          const updated = !task.isCompleted;
          void updateFollowUpStatus(taskId, updated).catch(err =>
            console.warn('[AppContext] Failed updating follow-up in IDB:', err)
          );
          return { ...task, isCompleted: updated };
        }
        return task;
      })
    );
  };

  return (
    <AppContext.Provider value={{
      currentUser,
      login,
      logout,
      currentScreen,
      setCurrentScreen,
      beneficiaries,
      activeBeneficiary,
      isBeneficiarySelected,
      setActiveBeneficiary,
      clearBeneficiarySelection,
      confirmPatientIdentity,
      activeVisit,
      setActiveVisit,
      followUpTasks,
      setFollowUpTasks,
      visitHistory,
      setVisitHistory,
      storedVisits,
      isOfflineDBLoaded,
      isOnline,
      syncCounts,
      pendingAttentionCount,
      refreshStoredVisits,
      isSavingVisit,
      visitSaveError,
      clearVisitSaveError: () => setVisitSaveError(null),
      dbRestoreError,
      isSyncing,
      syncError,
      attemptAutoSync,
      isRecording,
      recordingSeconds,
      isPaused,
      startRecording,
      pauseRecording,
      stopRecordingAndReview,
      cancelRecording,
      liveSegments,
      liveTranscript,
      voiceStatus,
      voiceError,
      reportResult,
      reportError,
      reportErrorMessage,
      isReportLoading,
      replayReport,
      submitCorrection,
      confirmConversationalReport,
      conversationLog,
      isListeningForCorrection,
      correctionLiveTranscript,
      isReportConfirmed,
      startVoiceCorrectionListening,
      stopVoiceCorrectionListening,
      persistCurrentVisitToBackend: persistActiveVisitSnapshot,
      isPlayingAudio,
      audioCurrentTime,
      togglePlayAudio,
      seekAudio,
      isReadBackActive,
      readBackState,
      startReadBack,
      pauseReadBack,
      resumeReadBack,
      stopReadBack,
      interruptReadBackForCorrection,
      applyVoiceCorrection,
      lastCorrectedMessage,
      activeDangerAlert,
      emergencyConfirmation,
      triggerDangerSign,
      retryEmergencyVoiceConfirmation,
      acknowledgeDangerAlert,
      clearDangerAlert,
      isBeneficiaryModalOpen,
      setIsBeneficiaryModalOpen,
      isReferralModalOpen,
      setIsReferralModalOpen,
      isCallMoModalOpen,
      setIsCallMoModalOpen,
      confirmVisitAndSave,
      toggleTaskCompletion,
    }}>
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
