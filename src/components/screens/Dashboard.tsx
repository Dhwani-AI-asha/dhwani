import React from 'react';
import { 
  Mic, 
  AlertTriangle, 
  PhoneCall, 
  ChevronRight, 
  CheckCircle2, 
  Clock, 
  FileAudio, 
  Check, 
  HardDrive,
  Users
} from 'lucide-react';
import { useApp } from '../../context/AppContext';

export const Dashboard: React.FC = () => {
  const { 
    startRecording, 
    setCurrentScreen, 
    setIsBeneficiaryModalOpen, 
    setIsCallMoModalOpen,
    followUpTasks,
    toggleTaskCompletion,
    currentUser
  } = useApp();

  const pendingTasks = followUpTasks.slice(0, 2);
  const workerFirstName = currentUser ? currentUser.name.split(' ')[0] : 'Sunita';
  const currentDateFormatted = new Date().toLocaleDateString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      {/* Sub-center Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-1.5 text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            <span>{currentUser?.subCenter || 'Community Health Sub-Center Rampur'}</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Namaste, {workerFirstName} ji
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            {currentDateFormatted} • Ready for visits in Rampur {currentUser?.ward || 'Ward 4'} • <span className="text-slate-700 font-medium">{currentUser?.allocatedHouseholds || 6} households allocated</span>
          </p>
        </div>

        <div className="flex items-center space-x-4 bg-white px-4 py-2 rounded-xl border border-slate-200/80 shadow-sm text-xs">
          <div className="flex items-center space-x-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
            <span className="font-semibold text-slate-700">PHC Sync Status: 100% Updated</span>
          </div>
          <span className="text-slate-300">|</span>
          <span className="text-slate-400">Last ping 8m ago</span>
        </div>
      </div>

      {/* Urgent Clinical Alert Card */}
      <div className="bg-red-50 border border-red-200/80 rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm">
        <div className="flex items-start space-x-3.5">
          <div className="w-9 h-9 rounded-xl bg-red-600 text-white flex items-center justify-center font-bold text-lg shrink-0 mt-0.5">
            !
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="bg-red-600 text-white text-[10px] font-bold px-2 py-0.5 rounded tracking-wide uppercase">
                Urgent Clinical Alert
              </span>
              <span className="text-xs text-slate-500 font-medium">Recorded Today 10:15 AM</span>
            </div>
            <h3 className="text-sm font-bold text-slate-900 mt-1">
              Meena Kumari <span className="font-normal text-red-700">(Severe Anemia: Hb 7.8 g/dL)</span>
            </h3>
            <p className="text-xs text-slate-600 mt-0.5">
              Immediate parenteral iron or PHC referral mandatory before 4:00 PM today.
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2.5 shrink-0 self-end md:self-center">
          <button
            onClick={() => setIsCallMoModalOpen(true)}
            className="flex items-center space-x-1.5 bg-red-600 hover:bg-red-700 text-white px-3.5 py-2 rounded-xl text-xs font-semibold shadow-sm transition active:scale-95"
          >
            <PhoneCall className="w-3.5 h-3.5" />
            <span>Call Medical Officer</span>
          </button>
          <button 
            onClick={() => setCurrentScreen('clinical-alerts')}
            className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 px-3.5 py-2 rounded-xl text-xs font-semibold transition"
          >
            View Vitals
          </button>
        </div>
      </div>

      {/* Main Hero Card: Start New Household Visit */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-sm flex flex-col lg:flex-row items-center justify-between gap-6">
        <div className="space-y-4 max-w-xl">
          <div className="inline-flex items-center space-x-2 bg-emerald-50 text-emerald-800 border border-emerald-200/60 px-3 py-1 rounded-full text-[11px] font-semibold">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span>Dhwani Neural Voice Engine • Active in Hindi & English</span>
          </div>

          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
            Start New Household Visit
          </h2>
          <p className="text-xs text-slate-600 leading-relaxed">
            Document beneficiary visits simply by speaking in Hindi or English. Automatic clinical transcription, ANC/EPI schedule updates, and instant structured health records.
          </p>

          <div className="flex items-center space-x-3 text-xs text-slate-500 font-medium pt-1">
            <div className="flex items-center space-x-1 text-teal-600">
              <span className="inline-block w-1 h-3 bg-teal-600 rounded-full animate-bounce"></span>
              <span className="inline-block w-1 h-4 bg-teal-600 rounded-full animate-bounce delay-75"></span>
              <span className="inline-block w-1 h-2 bg-teal-600 rounded-full animate-bounce delay-150"></span>
            </div>
            <span>Ready to capture clinical conversation ambiently</span>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button
              onClick={startRecording}
              className="flex items-center space-x-2 bg-teal-700 hover:bg-teal-800 text-white px-5 py-3 rounded-xl text-sm font-semibold shadow-md shadow-teal-900/10 transition active:scale-95"
            >
              <Mic className="w-4 h-4" />
              <span>Start Voice Visit</span>
            </button>

            <button
              onClick={() => setIsBeneficiaryModalOpen(true)}
              className="flex items-center space-x-1.5 text-xs font-semibold text-teal-700 hover:text-teal-800 px-3 py-2 rounded-xl hover:bg-teal-50 transition"
            >
              <Users className="w-3.5 h-3.5" />
              <span>Select from Beneficiary List →</span>
            </button>
          </div>
        </div>

        {/* Right side Profile card inside Hero */}
        <div className="bg-slate-50 rounded-xl border border-slate-200/80 p-5 w-full lg:w-72 shrink-0 space-y-3">
          <div className="flex items-center justify-between text-[11px] font-bold text-slate-500 uppercase tracking-wider">
            <span>Field Mode Profile</span>
            <span className="bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded font-semibold text-[10px]">
              Offline Cache On
            </span>
          </div>

          <div className="space-y-2 pt-1 text-xs">
            <div className="flex items-center space-x-2 text-slate-700 font-medium">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>Auto-Form Fill RCH Register v4.2</span>
            </div>
            <div className="flex items-center justify-between text-slate-500 pt-1">
              <span className="flex items-center space-x-1.5">
                <HardDrive className="w-3.5 h-3.5 text-slate-400" />
                <span>Field Audio Storage</span>
              </span>
              <span className="font-semibold text-slate-700">640 MB / 8 GB</span>
            </div>
            <p className="text-[11px] text-slate-400 leading-normal pt-1">
              Syncs automatically whenever PHC cellular signal is acquired.
            </p>
          </div>
        </div>
      </div>

      {/* 3 Metric Cards Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Metric 1 */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
            <span>Today's Visits Completed</span>
            <span className="w-6 h-6 rounded-lg bg-teal-50 text-teal-700 flex items-center justify-center">
              <Check className="w-3.5 h-3.5" />
            </span>
          </div>
          <div className="flex items-baseline space-x-2">
            <span className="text-2xl font-bold text-slate-900">4</span>
            <span className="text-sm font-semibold text-slate-400">/ 6 Scheduled</span>
          </div>
          <div>
            <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
              <div className="bg-teal-600 h-2 rounded-full w-[67%]"></div>
            </div>
            <div className="flex items-center justify-between text-[11px] font-medium text-slate-500 mt-2">
              <span>67% Complete</span>
              <span>2 remaining</span>
            </div>
          </div>
        </div>

        {/* Metric 2 */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
            <span>High-Priority Alerts</span>
            <span className="w-6 h-6 rounded-lg bg-red-50 text-red-600 flex items-center justify-center">
              <AlertTriangle className="w-3.5 h-3.5" />
            </span>
          </div>
          <div className="flex items-baseline space-x-2">
            <span className="text-2xl font-bold text-red-600">1</span>
            <span className="text-xs font-semibold text-slate-500">Active Alert</span>
          </div>
          <div className="flex items-center justify-between pt-2 text-xs">
            <span className="flex items-center space-x-1.5 text-slate-700 font-medium">
              <span className="w-2 h-2 rounded-full bg-red-500"></span>
              <span>Anemia Follow-up</span>
            </span>
            <span className="text-red-700 font-semibold bg-red-50 px-2 py-0.5 rounded text-[11px]">
              Action Needed
            </span>
          </div>
        </div>

        {/* Metric 3 */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
            <span>Follow-ups Due Today</span>
            <span className="w-6 h-6 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
              <Clock className="w-3.5 h-3.5" />
            </span>
          </div>
          <div className="flex items-baseline space-x-2">
            <span className="text-2xl font-bold text-slate-900">2</span>
            <span className="text-xs font-semibold text-slate-500">Pending Tasks</span>
          </div>
          <div className="flex items-center justify-between pt-2 text-xs">
            <span className="text-slate-600 font-medium">2 Home Visits Left</span>
            <span className="text-slate-400 text-[11px]">{currentUser?.ward || 'Ward 4 Area'}</span>
          </div>
        </div>
      </div>

      {/* 2 Column Bottom Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Visit Activity */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Recent Visit Activity</h3>
              <p className="text-[11px] text-slate-500">Last 3 voice-documented consultations</p>
            </div>
            <button 
              onClick={() => setCurrentScreen('visit-history')}
              className="text-xs font-semibold text-teal-700 hover:text-teal-800 flex items-center space-x-1"
            >
              <span>View All Visits</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-3">
            {/* Visit Item 1 */}
            <div className="p-3.5 rounded-xl border border-slate-100 bg-slate-50/50 hover:bg-slate-50 transition flex items-center justify-between gap-3">
              <div className="flex items-center space-x-3">
                <div className="w-9 h-9 rounded-xl bg-teal-100 text-teal-800 flex items-center justify-center font-bold text-xs shrink-0">
                  MK
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-900">Meena Kumari (W/o Rajesh)</h4>
                  <p className="text-[11px] text-slate-500">Antenatal Care (ANC 2nd Trimester) • 10:15 AM today</p>
                  <div className="flex items-center space-x-2 mt-1 text-[10px] font-semibold">
                    <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">Verified & Synced</span>
                    <span className="text-slate-500">BP: 118/76 • Gest: 24w</span>
                  </div>
                </div>
              </div>
              <div className="flex flex-col items-end space-y-1 shrink-0">
                <button 
                  onClick={() => setCurrentScreen('visit-history')}
                  className="text-xs font-semibold text-slate-700 bg-white border border-slate-200 px-3 py-1.5 rounded-lg hover:bg-slate-100 transition shadow-2xs"
                >
                  Review Note
                </button>
                <span className="text-[10px] text-slate-400 flex items-center space-x-1">
                  <FileAudio className="w-3 h-3" />
                  <span>Audio 03:42</span>
                </span>
              </div>
            </div>

            {/* Visit Item 2 */}
            <div className="p-3.5 rounded-xl border border-slate-100 bg-slate-50/50 hover:bg-slate-50 transition flex items-center justify-between gap-3">
              <div className="flex items-center space-x-3">
                <div className="w-9 h-9 rounded-xl bg-blue-100 text-blue-800 flex items-center justify-center font-bold text-xs shrink-0">
                  AS
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-900">Aarav Sharma (Age 18 mo)</h4>
                  <p className="text-[11px] text-slate-500">Routine Immunization & Growth Check • 09:30 AM today</p>
                  <div className="flex items-center space-x-2 mt-1 text-[10px] font-semibold">
                    <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">Verified & Synced</span>
                    <span className="text-slate-500">DPT Booster Administered</span>
                  </div>
                </div>
              </div>
              <div className="flex flex-col items-end space-y-1 shrink-0">
                <button 
                  onClick={() => setCurrentScreen('visit-history')}
                  className="text-xs font-semibold text-slate-700 bg-white border border-slate-200 px-3 py-1.5 rounded-lg hover:bg-slate-100 transition shadow-2xs"
                >
                  Review Note
                </button>
                <span className="text-[10px] text-slate-400 flex items-center space-x-1">
                  <FileAudio className="w-3 h-3" />
                  <span>Audio 02:18</span>
                </span>
              </div>
            </div>

            {/* Visit Item 3 */}
            <div className="p-3.5 rounded-xl border border-slate-100 bg-slate-50/50 hover:bg-slate-50 transition flex items-center justify-between gap-3">
              <div className="flex items-center space-x-3">
                <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center font-bold text-xs shrink-0">
                  SD
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-900">Savitri Devi (Age 54)</h4>
                  <p className="text-[11px] text-slate-500">Hypertension Monitoring • Yesterday</p>
                  <div className="flex items-center space-x-2 mt-1 text-[10px] font-semibold">
                    <span className="text-amber-800 bg-amber-50 px-2 py-0.5 rounded">Needs Follow-up</span>
                    <span className="text-slate-500">BP: 148/92 mmHg</span>
                  </div>
                </div>
              </div>
              <div className="flex flex-col items-end space-y-1 shrink-0">
                <button 
                  onClick={() => setCurrentScreen('follow-ups')}
                  className="text-xs font-semibold text-teal-800 bg-teal-50 border border-teal-200 px-3 py-1.5 rounded-lg hover:bg-teal-100 transition"
                >
                  Action Plan
                </button>
                <span className="text-[10px] text-slate-400 flex items-center space-x-1">
                  <FileAudio className="w-3 h-3" />
                  <span>Audio 04:05</span>
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Pending Follow-ups */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Pending Follow-ups</h3>
              <p className="text-[11px] text-slate-500">Immediate action items for your ward</p>
            </div>
            <span className="bg-blue-50 text-blue-700 text-xs font-bold px-2 py-0.5 rounded-full">
              {followUpTasks.filter(t => !t.isCompleted).length} Due
            </span>
          </div>

          <div className="space-y-3">
            {pendingTasks.map((task) => (
              <div 
                key={task.id} 
                className={`p-3.5 rounded-xl border transition ${
                  task.isCompleted ? 'bg-slate-50 border-slate-200 opacity-60' : 'bg-white border-slate-200/80 shadow-2xs'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-1">
                    <h4 className={`text-xs font-bold ${task.isCompleted ? 'line-through text-slate-500' : 'text-slate-900'}`}>
                      {task.title}
                    </h4>
                    <p className="text-[11px] text-slate-500">
                      {task.dueText} • {task.beneficiarySubtitle}
                    </p>
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-end space-x-2">
                  <button
                    onClick={() => toggleTaskCompletion(task.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                      task.isCompleted
                        ? 'bg-slate-200 text-slate-700'
                        : 'bg-teal-700 hover:bg-teal-800 text-white shadow-2xs'
                    }`}
                  >
                    {task.isCompleted ? 'Completed ✓' : task.actionButtonText}
                  </button>
                </div>
              </div>
            ))}

            {/* Offline tip banner */}
            <div className="p-3 bg-teal-50/70 rounded-xl border border-teal-100 flex items-center space-x-2 text-xs text-teal-800">
              <span className="w-2 h-2 rounded-full bg-teal-600 shrink-0"></span>
              <p className="text-[11px] leading-relaxed">
                <span className="font-semibold">Tap "Start Voice Visit" at any house doorstep.</span> Dhwani runs offline without network.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
