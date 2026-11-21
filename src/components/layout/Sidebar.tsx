import React from 'react';
import { 
  LayoutDashboard, 
  Mic, 
  Users, 
  FileText, 
  CalendarCheck,
  Activity
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { NavScreen } from '../../types';

export const Sidebar: React.FC = () => {
  const { currentScreen, setCurrentScreen, startRecording } = useApp();

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'new-visit', label: 'New Visit', icon: Mic, badge: 'AI Mic' },
    { id: 'beneficiaries', label: 'Beneficiaries', icon: Users },
    { id: 'visit-history', label: 'Visit History', icon: FileText },
    { id: 'follow-ups', label: 'Follow-ups', icon: CalendarCheck },
  ];

  const handleNavClick = (id: string) => {
    if (id === 'new-visit') {
      startRecording();
    } else {
      setCurrentScreen(id as NavScreen);
    }
  };

  const isCurrentActive = (id: string) => {
    if (id === 'new-visit') {
      return currentScreen === 'new-visit' || currentScreen === 'review-transcript' || currentScreen === 'verify-record' || currentScreen === 'clinical-alerts';
    }
    return currentScreen === id;
  };

  return (
    <aside className="w-64 bg-white border-r border-slate-200 flex flex-col justify-between shrink-0 min-h-screen select-none">
      <div>
        {/* Brand Header */}
        <div className="p-5 border-b border-slate-100 flex items-center space-x-3">
          <div className="w-9 h-9 rounded-lg bg-teal-700 flex items-center justify-center text-white shadow-sm">
            <Activity className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center space-x-1.5">
              <span className="font-bold text-teal-800 text-lg tracking-tight">DHWANI</span>
            </div>
            <p className="text-[10px] tracking-wider font-semibold text-slate-400 uppercase">
              Frontline Healthcare Assistant
            </p>
          </div>
        </div>

        {/* Navigation Links */}
        <nav className="p-3 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isCurrentActive(item.id);
            return (
              <button
                key={item.id}
                onClick={() => handleNavClick(item.id)}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  active
                    ? 'bg-teal-700 text-white shadow-sm'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <div className="flex items-center space-x-3">
                  <Icon className={`w-4 h-4 ${active ? 'text-white' : 'text-slate-500'}`} />
                  <span>{item.label}</span>
                </div>
                {item.badge && (
                  <span
                    className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                      active
                        ? 'bg-teal-600 text-teal-100 border border-teal-500'
                        : 'bg-emerald-100 text-emerald-800'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* ASHA Worker Profile Card */}
      <div className="p-4 border-t border-slate-100">
        <div className="flex items-center space-x-3 p-2 rounded-lg bg-slate-50 border border-slate-100">
          <img
            src="https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=100&auto=format&fit=crop&q=80"
            alt="Sunita Devi"
            className="w-10 h-10 rounded-full object-cover border border-slate-200"
          />
          <div className="overflow-hidden">
            <h4 className="text-xs font-bold text-slate-800 truncate">Sunita Devi</h4>
            <p className="text-[11px] text-slate-500 truncate">ASHA Worker • Ward 4, Rampur</p>
            <div className="flex items-center space-x-1.5 mt-0.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              <span className="text-[10px] font-medium text-emerald-700">Synced with PHC</span>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
};
