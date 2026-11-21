import React, { useState } from 'react';
import { Calendar, Plus, Radio, LogOut, User } from 'lucide-react';
import { useApp } from '../../context/AppContext';

export const Header: React.FC = () => {
  const { startRecording, currentUser, logout } = useApp();
  const [showProfileMenu, setShowProfileMenu] = useState(false);

  return (
    <header className="h-16 bg-white border-b border-slate-200 px-6 flex items-center justify-between shrink-0 relative z-30">
      {/* Breadcrumbs / Info tags */}
      <div className="flex items-center space-x-3 text-xs text-slate-500 font-medium">
        <div className="flex items-center space-x-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-teal-600"></span>
          <span className="text-slate-700 font-semibold">Community Care Portal</span>
        </div>
        <span>/</span>
        <span className="text-slate-600">{currentUser?.ward || "ASHA Assistant"}</span>
        <span>/</span>
        <div className="flex items-center space-x-1 text-slate-500">
          <Calendar className="w-3.5 h-3.5" />
          <span>Wednesday, 24 Oct 2024</span>
        </div>
        <span>/</span>
        <div className="hidden sm:flex items-center space-x-1.5 bg-emerald-50 text-emerald-800 border border-emerald-200 px-2.5 py-1 rounded-full text-[11px] font-semibold">
          <Radio className="w-3 h-3 text-emerald-600 animate-pulse" />
          <span>System Online • PHC Connected</span>
        </div>
      </div>

      {/* Right Action buttons */}
      <div className="flex items-center space-x-3">
        <button
          onClick={startRecording}
          className="flex items-center space-x-2 bg-teal-700 hover:bg-teal-800 text-white px-4 py-2 rounded-lg text-xs font-semibold shadow-sm transition-all active:scale-95"
        >
          <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
          <span>Record Visit</span>
        </button>

        <div className="relative">
          <button
            onClick={() => setShowProfileMenu(prev => !prev)}
            className="flex items-center space-x-2 focus:outline-none"
          >
            <img
              src={currentUser?.avatarUrl || "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=80&auto=format&fit=crop&q=80"}
              alt="Profile"
              className="w-8 h-8 rounded-full border border-slate-200 object-cover cursor-pointer hover:ring-2 hover:ring-teal-600 transition"
            />
          </button>

          {showProfileMenu && (
            <div className="absolute right-0 mt-2 w-56 bg-white border border-slate-200 rounded-2xl shadow-xl p-3 space-y-2 z-50 animate-in fade-in zoom-in-95">
              <div className="px-2 py-1 border-b border-slate-100">
                <p className="text-xs font-bold text-slate-900">{currentUser?.name}</p>
                <p className="text-[11px] text-slate-500">ID: {currentUser?.id}</p>
                <p className="text-[10px] text-teal-800 font-medium">{currentUser?.subCenter}</p>
              </div>

              <button
                onClick={() => {
                  setShowProfileMenu(false);
                  logout();
                }}
                className="w-full flex items-center space-x-2 px-2.5 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 rounded-xl transition"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Log Out (लॉग आउट)</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
