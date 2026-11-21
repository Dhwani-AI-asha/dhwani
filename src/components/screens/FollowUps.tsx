import React, { useState } from 'react';
import { 
  Calendar, 
  Search, 
  PhoneCall, 
  CheckCircle2, 
  AlertTriangle, 
  Clock, 
  Package, 
  HeartHandshake, 
  Radio, 
  Check, 
  RotateCw,
  ExternalLink
} from 'lucide-react';
import { useApp } from '../../context/AppContext';

export const FollowUps: React.FC = () => {
  const { followUpTasks, toggleTaskCompletion, setIsCallMoModalOpen } = useApp();

  const [activeTab, setActiveTab] = useState<'all' | 'due' | 'urgent' | 'supplies'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredTasks = followUpTasks.filter((task) => {
    const matchesSearch = 
      task.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      task.beneficiaryName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      task.beneficiarySubtitle.toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesSearch) return false;

    if (activeTab === 'due') return task.dueText.toLowerCase().includes('today');
    if (activeTab === 'urgent') return task.category === 'urgent';
    if (activeTab === 'supplies') return task.category === 'supplies' || task.category === 'delivery';
    return true;
  });

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-6">
      {/* Top Protocol Header Hero */}
      <div className="bg-gradient-to-r from-teal-800 to-teal-900 rounded-2xl p-6 text-white shadow-md flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-1.5 max-w-xl">
          <div className="text-[11px] font-bold text-teal-300 uppercase tracking-wider">
            WARD 4 COMMUNITY PROTOCOL
          </div>
          <h1 className="text-2xl font-bold tracking-tight">
            Beneficiary Follow-up Tasks
          </h1>
          <p className="text-xs text-teal-100/90 leading-relaxed">
            Scheduled home visits, urgent referrals, and supply deliveries for your assigned families.
          </p>
        </div>

        <div className="bg-teal-950/60 border border-teal-700/50 rounded-xl p-3.5 flex items-center space-x-3 shrink-0 self-start md:self-auto">
          <div className="w-8 h-8 rounded-lg bg-teal-800 flex items-center justify-center text-teal-300">
            <Radio className="w-4 h-4 animate-pulse" />
          </div>
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-teal-300">BMO LIVE SYNC</div>
            <div className="text-xs font-semibold flex items-center space-x-1.5 text-white">
              <Check className="w-3.5 h-3.5 text-emerald-400 stroke-[3]" />
              <span>Active & Connected</span>
            </div>
          </div>
        </div>
      </div>

      {/* 3 Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Metric 1 */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-xs font-bold text-slate-500 uppercase tracking-wider">
            <span>Overdue Priority</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="flex items-baseline space-x-2">
            <span className="text-2xl font-bold text-slate-900">0</span>
            <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
              On track
            </span>
          </div>
          <p className="text-[11px] text-slate-400">All high-risk cases addressed on time</p>
        </div>

        {/* Metric 2: Active / Due Today */}
        <div className="bg-teal-700 text-white rounded-2xl p-5 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-xs font-bold text-teal-200 uppercase tracking-wider">
            <span>Due Today •</span>
            <Clock className="w-4 h-4 text-teal-200" />
          </div>
          <div className="flex items-baseline space-x-2">
            <span className="text-2xl font-bold">2</span>
            <span className="text-xs font-medium text-teal-100">Tasks</span>
          </div>
          <div className="flex items-center space-x-2 text-[11px] text-teal-100 pt-1 font-medium">
            <span className="bg-teal-800/80 px-2 py-0.5 rounded">1 Critical PHC</span>
            <span className="bg-teal-800/80 px-2 py-0.5 rounded">1 Delivery</span>
          </div>
        </div>

        {/* Metric 3 */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-xs font-bold text-slate-500 uppercase tracking-wider">
            <span>Upcoming This Week</span>
            <Calendar className="w-4 h-4 text-blue-600" />
          </div>
          <div className="flex items-baseline space-x-2">
            <span className="text-2xl font-bold text-slate-900">5</span>
            <span className="text-xs font-semibold text-slate-500">Tasks</span>
          </div>
          <p className="text-[11px] text-slate-400">Scheduled home visits until 30 Oct</p>
        </div>
      </div>

      {/* Filter Tabs & Search */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3.5 rounded-2xl border border-slate-200/80 shadow-sm">
        <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
          <button
            onClick={() => setActiveTab('all')}
            className={`px-3 py-1.5 rounded-lg transition ${
              activeTab === 'all'
                ? 'bg-teal-700 text-white shadow-2xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            All Tasks {followUpTasks.length}
          </button>

          <button
            onClick={() => setActiveTab('due')}
            className={`px-3 py-1.5 rounded-lg transition ${
              activeTab === 'due'
                ? 'bg-teal-700 text-white shadow-2xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Due Today 2
          </button>

          <button
            onClick={() => setActiveTab('urgent')}
            className={`px-3 py-1.5 rounded-lg transition ${
              activeTab === 'urgent'
                ? 'bg-red-600 text-white shadow-2xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Urgent Alerts 2
          </button>

          <button
            onClick={() => setActiveTab('supplies')}
            className={`px-3 py-1.5 rounded-lg transition ${
              activeTab === 'supplies'
                ? 'bg-teal-700 text-white shadow-2xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Supplies Delivery 3
          </button>
        </div>

        <div className="relative">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by patient or house..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full sm:w-56 bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-teal-700"
          />
        </div>
      </div>

      {/* Follow-up Tasks List */}
      <div className="space-y-4">
        {filteredTasks.map((task) => {
          const isUrgent = task.category === 'urgent';
          return (
            <div
              key={task.id}
              className={`bg-white rounded-2xl border p-5 shadow-sm transition hover:border-slate-300 ${
                task.isCompleted ? 'opacity-60 bg-slate-50' : ''
              } ${isUrgent ? 'border-l-4 border-l-red-600 border-slate-200' : 'border-slate-200/80'}`}
            >
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded tracking-wide ${
                      isUrgent
                        ? 'bg-red-100 text-red-800'
                        : task.category === 'pnc'
                        ? 'bg-emerald-100 text-emerald-800'
                        : task.category === 'ncd'
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-cyan-100 text-cyan-800'
                    }`}>
                      {task.priorityBadge}
                    </span>
                  </div>

                  <h3 className={`text-sm font-bold ${task.isCompleted ? 'line-through text-slate-500' : 'text-slate-900'}`}>
                    {task.title}
                  </h3>

                  <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600">
                    <span className="font-semibold text-slate-800">{task.beneficiaryName}</span>
                    <span>•</span>
                    <span>{task.beneficiarySubtitle}</span>
                  </div>

                  <p className="text-xs text-slate-600 bg-slate-50/80 rounded-lg p-2.5 border border-slate-100 leading-normal">
                    {task.detailsNote}
                  </p>
                </div>

                {/* Task Action Buttons */}
                <div className="flex flex-wrap sm:flex-nowrap md:flex-col items-end gap-2 shrink-0">
                  <button
                    onClick={() => toggleTaskCompletion(task.id)}
                    className={`flex items-center space-x-1.5 px-4 py-2 rounded-xl text-xs font-bold transition shadow-2xs ${
                      task.isCompleted
                        ? 'bg-slate-200 text-slate-700'
                        : 'bg-teal-700 hover:bg-teal-800 text-white'
                    }`}
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>{task.isCompleted ? 'Completed ✓' : task.actionButtonText}</span>
                  </button>

                  {task.secondaryButtonText && (
                    <button
                      onClick={() => setIsCallMoModalOpen(true)}
                      className="flex items-center space-x-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 px-3.5 py-2 rounded-xl text-xs font-semibold transition"
                    >
                      <PhoneCall className="w-3.5 h-3.5 text-slate-500" />
                      <span>{task.secondaryButtonText}</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer sync info */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-4 border-t border-slate-200/80 text-xs text-slate-500 font-medium">
        <span>All tasks sync directly with Block Medical Officer dashboard & Rampur PHC registry.</span>
        <div className="flex items-center space-x-2">
          <span>Auto-sync interval: 5m</span>
          <span>•</span>
          <button className="text-teal-700 hover:underline flex items-center space-x-1 font-semibold">
            <RotateCw className="w-3 h-3" />
            <span>Sync Now</span>
          </button>
        </div>
      </div>
    </div>
  );
};
