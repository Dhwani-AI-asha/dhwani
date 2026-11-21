import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import { 
  AshaWorker,
  Beneficiary, 
  DangerSignAlert,
  FollowUpTask, 
  NavScreen, 
  StructuredVisitData, 
  VisitHistoryItem 
} from '../types';
import { 
  initialActiveVisit, 
  mockAshaWorkers,
  mockBeneficiaries, 
  mockFollowUpTasks, 
  mockVisitHistory,
  predefinedDangerSigns
} from '../data/mockData';
import { voiceClient, VoiceStatus } from '../lib/voiceClient';
import { speak, stopSpeaking } from '../lib/speak';

interface AppContextType {
  // Authentication
  currentUser: AshaWorker | null;
  login: (workerId: string, pass: string) => { success: boolean; error?: string };
  logout: () => void;

  // Navigation
  currentScreen: NavScreen;
  setCurrentScreen: (screen: NavScreen) => void;
  activeBeneficiary: Beneficiary;
  setActiveBeneficiary: (b: Beneficiary) => void;
  activeVisit: StructuredVisitData;
  setActiveVisit: React.Dispatch<React.SetStateAction<StructuredVisitData>>;
  followUpTasks: FollowUpTask[];
  setFollowUpTasks: React.Dispatch<React.SetStateAction<FollowUpTask[]>>;
  visitHistory: VisitHistoryItem[];
  setVisitHistory: React.Dispatch<React.SetStateAction<VisitHistoryItem[]>>;
  
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
  applyVoiceCorrection: (field: 'weight' | 'name' | 'visitType' | 'vaccine' | 'nextDate', value: any) => string;
  lastCorrectedMessage: string | null;

  // Immediate Danger-Sign Voice Alert (Feature 3)
  activeDangerAlert: DangerSignAlert | null;
  triggerDangerSign: (alertId: string) => void;
  acknowledgeDangerAlert: () => void;
  clearDangerAlert: () => void;

  // Modals
  isBeneficiaryModalOpen: boolean;
  setIsBeneficiaryModalOpen: (open: boolean) => void;
  isReferralModalOpen: boolean;
  setIsReferralModalOpen: (open: boolean) => void;
  isCallMoModalOpen: boolean;
  setIsCallMoModalOpen: (open: boolean) => void;

  // Helper actions
  confirmVisitAndSave: (asEscalated: boolean) => void;
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
  const [activeBeneficiary, setActiveBeneficiary] = useState<Beneficiary>(mockBeneficiaries[0]);
  const [activeVisit, setActiveVisit] = useState<StructuredVisitData>(initialActiveVisit);
  const [followUpTasks, setFollowUpTasks] = useState<FollowUpTask[]>(mockFollowUpTasks);
  const [visitHistory, setVisitHistory] = useState<VisitHistoryItem[]>(mockVisitHistory);

  // Voice & Recording states
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [recordingSeconds, setRecordingSeconds] = useState<number>(0);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [liveSegments, setLiveSegments] = useState<string[]>([]);
  const [liveTranscript, setLiveTranscript] = useState<string>('');
  const [voiceStatus, setVoiceStatus] = useState<VoiceStatus>('idle');
  const [voiceError, setVoiceError] = useState<string | null>(null);

  const liveTranscriptRef = useRef<string>('');
  const recordingSessionIdRef = useRef<number>(0);

  // Wire up VoiceClient callbacks
  useEffect(() => {
    voiceClient.setCallbacks({
      onSegment: (text: string) => {
        const trimmed = text.trim();
        if (!trimmed) return;
        setLiveSegments((prev) => {
          const next = [...prev, trimmed];
          const fullText = next.join(' ');
          liveTranscriptRef.current = fullText;
          setLiveTranscript(fullText);
          return next;
        });
      },
      onTurn: (_text: string) => {
        // Server emits joined turn after silence; segments already kept in sync
      },
      onError: (errMsg: string) => {
        setVoiceError(errMsg);
      },
      onStatus: (status: VoiceStatus) => {
        setVoiceStatus(status);
      },
    });

    return () => {
      voiceClient.stop();
    };
  }, []);

  // Audio Playback simulation
  const [isPlayingAudio, setIsPlayingAudio] = useState<boolean>(false);
  const [audioCurrentTime, setAudioCurrentTime] = useState<number>(34);

  // Read-back modal & states
  const [isReadBackActive, setIsReadBackActive] = useState<boolean>(false);
  const [readBackState, setReadBackState] = useState<'idle' | 'speaking' | 'paused' | 'listening'>('idle');
  const [lastCorrectedMessage, setLastCorrectedMessage] = useState<string | null>(null);

  // Danger sign active state
  const [activeDangerAlert, setActiveDangerAlert] = useState<DangerSignAlert | null>(null);

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

  const startRecording = async () => {
    const currentSessionId = ++recordingSessionIdRef.current;
    setLiveSegments([]);
    setLiveTranscript('');
    liveTranscriptRef.current = '';
    setVoiceError(null);
    setIsRecording(true);
    setIsPaused(false);
    setRecordingSeconds(0);
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
    setIsPaused(prev => {
      const willBePaused = !prev;
      if (willBePaused) {
        voiceClient.pause();
      } else {
        voiceClient.resume();
      }
      return willBePaused;
    });
  };

  const stopRecordingAndReview = () => {
    recordingSessionIdRef.current++;
    stopSpeaking();
    voiceClient.stop();
    setIsRecording(false);
    setIsPaused(false);

    // Save joined text into activeVisit.originalTranscript
    const joinedText = liveTranscriptRef.current.trim();
    if (joinedText) {
      setActiveVisit(prev => ({
        ...prev,
        originalTranscript: joinedText,
      }));
    }

    setCurrentScreen('review-transcript');
  };

  const cancelRecording = () => {
    recordingSessionIdRef.current++;
    stopSpeaking();
    voiceClient.stop();
    setIsRecording(false);
    setIsPaused(false);
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

    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const textToRead = customText || 
        `पुष्टि हेतु विवरण: लाभार्थी ${activeBeneficiary.name}, भेंट प्रकार ${activeVisit.visitType}, बीपी ${activeVisit.vitals.systolic} बटा ${activeVisit.vitals.diastolic}, वजन ${activeVisit.vitals.weight} किलोग्राम, पैरों में हल्की सूजन, टिटनेस टीका सत्यापित, अगली गृह भेंट तारीख ${activeVisit.nextVisitDate}। क्या यह सही है?`;
      
      const utterance = new SpeechSynthesisUtterance(textToRead);
      utterance.lang = 'hi-IN';
      utterance.rate = 0.95;
      utterance.onend = () => {
        setReadBackState('idle');
      };
      utterance.onerror = () => {
        setReadBackState('idle');
      };
      window.speechSynthesis.speak(utterance);
    }
  };

  const pauseReadBack = () => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.pause();
      setReadBackState('paused');
    }
  };

  const resumeReadBack = () => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.resume();
      setReadBackState('speaking');
    }
  };

  const stopReadBack = () => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setReadBackState('idle');
    setIsReadBackActive(false);
  };

  const interruptReadBackForCorrection = () => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setReadBackState('listening');
  };

  // Atomic voice correction to specific field
  const applyVoiceCorrection = (field: 'weight' | 'name' | 'visitType' | 'vaccine' | 'nextDate', value: any): string => {
    let confirmationHindi = '';
    let updatedFieldLabel = '';

    if (field === 'weight') {
      setActiveVisit(prev => ({
        ...prev,
        vitals: { ...prev.vitals, weight: Number(value) },
        lastCorrectedField: 'Maternal Weight'
      }));
      updatedFieldLabel = `वजन ${value} kg`;
      confirmationHindi = `वजन सुधार दिया गया है। नया वजन ${value} किलोग्राम दर्ज हुआ। क्या यह सही है?`;
    } else if (field === 'name') {
      setActiveBeneficiary(prev => ({ ...prev, name: value }));
      setActiveVisit(prev => ({
        ...prev,
        beneficiary: { ...prev.beneficiary, name: value },
        lastCorrectedField: 'Beneficiary Name'
      }));
      updatedFieldLabel = `नाम: ${value}`;
      confirmationHindi = `लाभार्थी का नाम बदलकर ${value} कर दिया गया है। क्या यह सही है?`;
    } else if (field === 'visitType') {
      setActiveVisit(prev => ({
        ...prev,
        visitType: value,
        lastCorrectedField: 'Visit Type'
      }));
      updatedFieldLabel = `भेंट: ${value}`;
      confirmationHindi = `भेंट का प्रकार ${value} दर्ज किया गया। क्या यह सही है?`;
    } else if (field === 'vaccine') {
      setActiveVisit(prev => ({
        ...prev,
        immunizationLab: {
          ...prev.immunizationLab,
          ttBooster: { ...prev.immunizationLab.ttBooster, administered: true, verified: true }
        },
        lastCorrectedField: 'Vaccination TT Booster'
      }));
      updatedFieldLabel = `टीका: TT Booster सत्यापित`;
      confirmationHindi = `टिटनेस बूस्टर टीका आज लगा दिया गया है, रिकॉर्ड में सत्यापित किया गया। क्या यह सही है?`;
    } else if (field === 'nextDate') {
      setActiveVisit(prev => ({
        ...prev,
        nextVisitDate: value,
        lastCorrectedField: 'Next Visit Date'
      }));
      updatedFieldLabel = `अगली तारीख: ${value}`;
      confirmationHindi = `अगली गृह भेंट की तारीख ${value} निर्धारित कर दी गई है। क्या यह सही है?`;
    }

    setLastCorrectedMessage(updatedFieldLabel);
    setReadBackState('speaking');

    // Read back the updated value aloud
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(confirmationHindi);
      utterance.lang = 'hi-IN';
      utterance.rate = 0.95;
      utterance.onend = () => setReadBackState('idle');
      window.speechSynthesis.speak(utterance);
    }

    return updatedFieldLabel;
  };

  // ==========================================
  // FEATURE 3: Immediate Danger-Sign Voice Alert
  // ==========================================
  const triggerDangerSign = (alertId: string) => {
    // 1. Immediately interrupt any running normal report read-back!
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setReadBackState('idle');

    // 2. Locate danger sign rule
    const alertObj = predefinedDangerSigns.find(ds => ds.id === alertId) || predefinedDangerSigns[0];
    const activatedAlert: DangerSignAlert = { ...alertObj, isAcknowledged: false };
    setActiveDangerAlert(activatedAlert);

    // 3. Flag visit record as ESCALATED
    setActiveVisit(prev => ({
      ...prev,
      status: 'ESCALATED',
      dangerAlertTriggered: true
    }));

    // 4. Speak urgent audible warning immediately
    if ('speechSynthesis' in window) {
      const urgentUtterance = new SpeechSynthesisUtterance(activatedAlert.hindiVoiceAlert);
      urgentUtterance.lang = 'hi-IN';
      urgentUtterance.rate = 0.95;
      window.speechSynthesis.speak(urgentUtterance);
    }
  };

  const acknowledgeDangerAlert = () => {
    if (activeDangerAlert) {
      setActiveDangerAlert(prev => prev ? { ...prev, isAcknowledged: true } : null);
    }
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  };

  const clearDangerAlert = () => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setActiveDangerAlert(null);
  };

  const confirmVisitAndSave = (asEscalated: boolean) => {
    const updatedStatus = asEscalated ? 'ESCALATED' : 'CONFIRMED';
    setActiveVisit(prev => ({ ...prev, status: updatedStatus }));

    // Add to Visit History
    const newHistoryItem: VisitHistoryItem = {
      id: `vis-${Date.now()}`,
      beneficiaryName: activeBeneficiary.name,
      spouseName: activeBeneficiary.spouseName,
      age: activeBeneficiary.age,
      rchId: activeBeneficiary.rchId,
      visitType: activeVisit.visitType,
      timestampText: 'Just now, 11:05 AM',
      statusBadge: asEscalated ? 'PHC Referral Flagged' : 'Complete',
      statusType: asEscalated ? 'red' : 'green',
      audioDuration: `Hindi (${Math.floor(recordingSeconds / 60)}:${(recordingSeconds % 60).toString().padStart(2, '0')})`,
      vitalsSummary: asEscalated 
        ? `⚠️ Vitals: BP ${activeVisit.vitals.systolic}/${activeVisit.vitals.diastolic} mmHg • Bilateral Edema • Headache`
        : `Normal visit • Weight ${activeVisit.vitals.weight}kg • BP ${activeVisit.vitals.systolic}/${activeVisit.vitals.diastolic}`,
      hasReferralSlip: asEscalated,
      category: 'anc',
      isAlert: asEscalated
    };

    setVisitHistory(prev => [newHistoryItem, ...prev]);

    // Add urgent follow-up task if escalated
    if (asEscalated) {
      const urgentTask: FollowUpTask = {
        id: `task-urgent-${Date.now()}`,
        title: `Escort ${activeBeneficiary.name} to Rampur PHC for BP & Albumin Evaluation`,
        beneficiaryName: `${activeBeneficiary.name} (Age ${activeBeneficiary.age}, ${activeBeneficiary.stage})`,
        beneficiarySubtitle: `${activeBeneficiary.village}, ${activeBeneficiary.gali || ''} • ${activeBeneficiary.contactNumber || ''}`,
        category: 'urgent',
        priorityBadge: `Urgent Action Needed • Due: Today by 02:00 PM • Flagged Visit`,
        badgeType: 'red',
        dueText: 'Today by 02:00 PM',
        contactNumber: activeBeneficiary.contactNumber,
        detailsNote: 'Clinical Flag: Elevated BP + bilateral pedal edema + persistent headache. Suspected pre-eclampsia protocol.',
        actionButtonText: 'Confirm PHC Visit',
        secondaryButtonText: 'Call Beneficiary',
        isCompleted: false
      };
      setFollowUpTasks(prev => [urgentTask, ...prev]);
    }

    // Navigate to Visit History or Follow-ups
    setCurrentScreen(asEscalated ? 'follow-ups' : 'visit-history');
  };

  const toggleTaskCompletion = (taskId: string) => {
    setFollowUpTasks(prev => 
      prev.map(task => task.id === taskId ? { ...task, isCompleted: !task.isCompleted } : task)
    );
  };

  return (
    <AppContext.Provider value={{
      currentUser,
      login,
      logout,
      currentScreen,
      setCurrentScreen,
      activeBeneficiary,
      setActiveBeneficiary,
      activeVisit,
      setActiveVisit,
      followUpTasks,
      setFollowUpTasks,
      visitHistory,
      setVisitHistory,
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
      triggerDangerSign,
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
