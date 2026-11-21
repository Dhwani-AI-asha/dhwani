import React from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { Sidebar } from './components/layout/Sidebar';
import { Header } from './components/layout/Header';
import { Dashboard } from './components/screens/Dashboard';
import { NewVisitRecording } from './components/screens/NewVisitRecording';
import { ReviewTranscript } from './components/screens/ReviewTranscript';
import { VerifyStructuredRecord } from './components/screens/VerifyStructuredRecord';
import { ClinicalSafetyAlerts } from './components/screens/ClinicalSafetyAlerts';
import { VisitHistory } from './components/screens/VisitHistory';
import { FollowUps } from './components/screens/FollowUps';
import { Beneficiaries } from './components/screens/Beneficiaries';
import { BeneficiaryModal } from './components/modals/BeneficiaryModal';
import { ReferralSlipModal } from './components/modals/ReferralSlipModal';
import { CallMoModal } from './components/modals/CallMoModal';
import { ReadBackVoiceModal } from './components/modals/ReadBackVoiceModal';

const MainLayout: React.FC = () => {
  const { currentScreen } = useApp();

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#F4F7F6]">
      {/* Sidebar */}
      <Sidebar />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Header />

        <main className="flex-1 overflow-y-auto">
          {currentScreen === 'dashboard' && <Dashboard />}
          {currentScreen === 'new-visit' && <NewVisitRecording />}
          {currentScreen === 'review-transcript' && <ReviewTranscript />}
          {currentScreen === 'verify-record' && <VerifyStructuredRecord />}
          {currentScreen === 'clinical-alerts' && <ClinicalSafetyAlerts />}
          {currentScreen === 'visit-history' && <VisitHistory />}
          {currentScreen === 'follow-ups' && <FollowUps />}
          {currentScreen === 'beneficiaries' && <Beneficiaries />}
        </main>
      </div>

      {/* Global Modals */}
      <BeneficiaryModal />
      <ReferralSlipModal />
      <CallMoModal />
      <ReadBackVoiceModal />
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <AppProvider>
      <MainLayout />
    </AppProvider>
  );
};

export default App;
