import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { 
  Beneficiary, 
  FollowUpTask, 
  NavScreen, 
  StructuredVisitData, 
  VisitHistoryItem 
} from '../types';
import { 
  initialActiveVisit, 
  mockBeneficiaries, 
  mockFollowUpTasks, 
  mockVisitHistory 
} from '../data/mockData';

interface AppContextType {
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
  
  // Audio playback states
  isPlayingAudio: boolean;
  audioCurrentTime: number;
  togglePlayAudio: () => void;
  seekAudio: (seconds: number) => void;
  
  // Voice Read-back & Verification
  isReadBackActive: boolean;
  startReadBack: () => void;
  stopReadBack: () => void;
  applyVoiceCorrection: (field: string, value: any) => void;

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
  const [currentScreen, setCurrentScreen] = useState<NavScreen>('dashboard');
  const [activeBeneficiary, setActiveBeneficiary] = useState<Beneficiary>(mockBeneficiaries[0]);
  const [activeVisit, setActiveVisit] = useState<StructuredVisitData>(initialActiveVisit);
  const [followUpTasks, setFollowUpTasks] = useState<FollowUpTask[]>(mockFollowUpTasks);
  const [visitHistory, setVisitHistory] = useState<VisitHistoryItem[]>(mockVisitHistory);

  // Recording simulation
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [recordingSeconds, setRecordingSeconds] = useState<number>(102); // 01:42 equivalent
  const [isPaused, setIsPaused] = useState<boolean>(false);

  // Audio Playback simulation
  const [isPlayingAudio, setIsPlayingAudio] = useState<boolean>(false);
  const [audioCurrentTime, setAudioCurrentTime] = useState<number>(34); // 00:34 / 01:42 as in screenshot

  // Read-back modal/state
  const [isReadBackActive, setIsReadBackActive] = useState<boolean>(false);

  // Modals
  const [isBeneficiaryModalOpen, setIsBeneficiaryModalOpen] = useState<boolean>(false);
  const [isReferralModalOpen, setIsReferralModalOpen] = useState<boolean>(false);
  const [isCallMoModalOpen, setIsCallMoModalOpen] = useState<boolean>(false);

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

  const startRecording = () => {
    setIsRecording(true);
    setIsPaused(false);
    setRecordingSeconds(0);
    setCurrentScreen('new-visit');
  };

  const pauseRecording = () => {
    setIsPaused(prev => !prev);
  };

  const stopRecordingAndReview = () => {
    setIsRecording(false);
    setIsPaused(false);
    setCurrentScreen('review-transcript');
  };

  const cancelRecording = () => {
    setIsRecording(false);
    setIsPaused(false);
    setCurrentScreen('dashboard');
  };

  const togglePlayAudio = () => {
    setIsPlayingAudio(prev => !prev);
  };

  const seekAudio = (seconds: number) => {
    setAudioCurrentTime(seconds);
  };

  // Voice Read-back simulation with Web Speech API
  const startReadBack = () => {
    setIsReadBackActive(true);
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const textToRead = `पुष्टि हेतु विवरण: लाभार्थी पूजा देवी, बीपी 130 बटा 85, वजन 56 किलो, पैरों में हल्की सूजन और सिरदर्द दर्ज किया गया है। क्या यह सही है?`;
      const utterance = new SpeechSynthesisUtterance(textToRead);
      utterance.lang = 'hi-IN';
      utterance.rate = 0.95;
      utterance.onend = () => {
        // Keeps modal active so user can click voice correction or confirm
      };
      window.speechSynthesis.speak(utterance);
    }
  };

  const stopReadBack = () => {
    setIsReadBackActive(false);
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  };

  const applyVoiceCorrection = (field: string, value: any) => {
    if (field === 'weight') {
      setActiveVisit(prev => ({
        ...prev,
        vitals: { ...prev.vitals, weight: value }
      }));
    } else if (field === 'bp') {
      setActiveVisit(prev => ({
        ...prev,
        vitals: { ...prev.vitals, systolic: value.sys, diastolic: value.dia }
      }));
    } else if (field === 'headache') {
      setActiveVisit(prev => ({
        ...prev,
        symptoms: {
          ...prev.symptoms,
          headache: { ...prev.symptoms.headache, severity: value }
        }
      }));
    }
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
      isPlayingAudio,
      audioCurrentTime,
      togglePlayAudio,
      seekAudio,
      isReadBackActive,
      startReadBack,
      stopReadBack,
      applyVoiceCorrection,
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
