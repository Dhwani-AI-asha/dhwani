import React from 'react';
import { Calendar, Plus, Radio } from 'lucide-react';
import { useApp } from '../../context/AppContext';

export const Header: React.FC = () => {
  const { startRecording } = useApp();

  return (
    <header className="h-16 bg-white border-b border-slate-200 px-6 flex items-center justify-between shrink-0">
      {/* Breadcrumbs / Info tags */}
      <div className="flex items-center space-x-3 text-xs text-slate-500 font-medium">
        <div className="flex items-center space-x-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-teal-600"></span>
          <span className="text-slate-700 font-semibold">Community Care Portal</span>
        </div>
        <span>/</span>
        <span className="text-slate-600">ASHA Assistant</span>
        <span>/</span>
        <div className="flex items-center space-x-1 text-slate-500">
          <Calendar className="w-3.5 h-3.5" />
          <span>Wednesday, 24 Oct 2024</span>
        </div>
        <span>/</span>
        <div className="flex items-center space-x-1.5 bg-emerald-50 text-emerald-800 border border-emerald-200 px-2.5 py-1 rounded-full text-[11px] font-semibold">
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

        <img
          src="https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=80&auto=format&fit=crop&q=80"
          alt="Profile"
          className="w-8 h-8 rounded-full border border-slate-200 object-cover"
        />
      </div>
    </header>
  );
};
