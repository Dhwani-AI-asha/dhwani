import React, { useState, useEffect } from 'react';
import { X, PhoneCall, PhoneOff, Mic, ShieldAlert, CheckCircle2 } from 'lucide-react';
import { useApp } from '../../context/AppContext';

export const CallMoModal: React.FC = () => {
  const { isCallMoModalOpen, setIsCallMoModalOpen } = useApp();
  const [callStatus, setCallStatus] = useState<'dialing' | 'connected' | 'ended'>('dialing');
  const [callDuration, setCallDuration] = useState(0);

  useEffect(() => {
    let timer: any;
    if (isCallMoModalOpen) {
      setCallStatus('dialing');
      setCallDuration(0);
      const dialTimeout = setTimeout(() => {
        setCallStatus('connected');
      }, 2500);

      timer = setInterval(() => {
        setCallDuration(prev => prev + 1);
      }, 1000);

      return () => {
        clearTimeout(dialTimeout);
        clearInterval(timer);
      };
    }
  }, [isCallMoModalOpen]);

  if (!isCallMoModalOpen) return null;

  const handleEndCall = () => {
    setCallStatus('ended');
    setTimeout(() => {
      setIsCallMoModalOpen(false);
    }, 600);
  };

  const formatSec = (s: number) => {
    const min = Math.floor(s / 60);
    const sec = s % 60;
    return `${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-slate-900 text-white rounded-3xl border border-slate-800 shadow-2xl w-full max-w-sm overflow-hidden text-center p-6 space-y-6 animate-in fade-in zoom-in-95 duration-150">
        <div className="flex justify-end">
          <button
            onClick={() => setIsCallMoModalOpen(false)}
            className="text-slate-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Doctor Avatar */}
        <div className="relative mx-auto w-24 h-24">
          {callStatus === 'connected' && (
            <div className="absolute inset-0 rounded-full bg-emerald-500/20 animate-ping"></div>
          )}
          <img
            src="https://images.unsplash.com/photo-1622253692010-333f2da6031d?w=150&auto=format&fit=crop&q=80"
            alt="Dr. Rajesh Varma"
            className="w-24 h-24 rounded-full object-cover border-2 border-emerald-400 shadow-lg relative z-10"
          />
        </div>

        <div>
          <h3 className="text-lg font-bold text-white">Dr. Rajesh Varma (MBBS)</h3>
          <p className="text-xs text-slate-400 mt-0.5">Medical Officer • Rampur PHC</p>
          <p className="text-xs text-teal-400 font-medium mt-1">
            {callStatus === 'dialing' && 'Ringing... (घंटी बज रही है)'}
            {callStatus === 'connected' && `Connected • ${formatSec(callDuration)}`}
            {callStatus === 'ended' && 'Call Ended'}
          </p>
        </div>

        {/* Emergency clinical context preview */}
        <div className="bg-slate-800/80 rounded-2xl p-3.5 text-left text-xs border border-slate-700/80 space-y-1">
          <div className="flex items-center space-x-1.5 text-red-400 font-bold text-[11px]">
            <ShieldAlert className="w-3.5 h-3.5" />
            <span>EMERGENCY DISPATCH CONTEXT</span>
          </div>
          <p className="text-slate-300">
            Pooja Devi (ANC 32w) - BP 130/85, bilateral edema & frontal headache.
          </p>
          <p className="text-[10px] text-slate-400">
            Ambulance 108 Rampur unit notified on standby.
          </p>
        </div>

        {/* Call Controls */}
        <div className="flex items-center justify-center space-x-6 pt-2">
          <button
            onClick={handleEndCall}
            className="w-14 h-14 rounded-full bg-red-600 hover:bg-red-700 text-white flex items-center justify-center shadow-lg shadow-red-900/30 transition active:scale-95"
          >
            <PhoneOff className="w-6 h-6" />
          </button>
        </div>
      </div>
    </div>
  );
};
