import React, { useState } from 'react';
import { 
  Activity, 
  Lock, 
  User, 
  Eye, 
  EyeOff, 
  AlertCircle, 
  CheckCircle2, 
  ArrowRight,
  ShieldCheck,
  Sparkles
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { mockAshaWorkers } from '../../data/mockData';

export const Login: React.FC = () => {
  const { login } = useApp();
  const [workerId, setWorkerId] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!workerId.trim()) {
      setErrorMessage('कृपया आशा कार्यकर्ता आईडी दर्ज करें (Worker ID is required)');
      return;
    }
    if (!password) {
      setErrorMessage('कृपया पासवर्ड दर्ज करें (Password is required)');
      return;
    }

    setIsLoading(true);
    setTimeout(() => {
      const result = login(workerId, password);
      setIsLoading(false);
      if (!result.success) {
        setErrorMessage(result.error || 'अमान्य क्रेडेंशियल्स (Invalid credentials)');
      }
    }, 400);
  };

  const handleQuickDemoLogin = (worker: typeof mockAshaWorkers[0]) => {
    setWorkerId(worker.id);
    setPassword('asha@123');
    setErrorMessage(null);
    setIsLoading(true);
    setTimeout(() => {
      login(worker.id, 'asha@123');
      setIsLoading(false);
    }, 300);
  };

  return (
    <div className="min-h-screen bg-[#F4F7F6] flex flex-col justify-center items-center p-4 sm:p-6 select-none font-sans">
      <div className="w-full max-w-md space-y-6">
        {/* Brand Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-teal-700 text-white shadow-lg shadow-teal-900/20 mb-2">
            <Activity className="w-8 h-8" />
          </div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">
            DHWANI
          </h1>
          <p className="text-xs font-semibold tracking-wider text-slate-500 uppercase">
            Frontline Healthcare Field Register
          </p>
          <div className="inline-flex items-center space-x-1.5 bg-emerald-50 text-emerald-800 border border-emerald-200 px-3 py-1 rounded-full text-xs font-medium">
            <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
            <span>Voice-First Assistant for ASHA Workers</span>
          </div>
        </div>

        {/* Login Card */}
        <div className="bg-white rounded-3xl border border-slate-200/90 shadow-xl p-6 sm:p-8 space-y-5">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              ASHA Worker Sign In (लॉगिन)
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Enter your assigned Worker ID and password to access Rampur Sector field registers.
            </p>
          </div>

          {/* Error Alert */}
          {errorMessage && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-800 rounded-xl text-xs flex items-start space-x-2 animate-in fade-in">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Worker ID Field */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700">
                ASHA Worker ID (कार्यकर्ता आईडी)
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="e.g. ASHA-9041"
                  value={workerId}
                  onChange={(e) => setWorkerId(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-2.5 text-sm font-semibold text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-700 focus:bg-white transition"
                />
              </div>
            </div>

            {/* Password Field */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-bold text-slate-700">
                  Password (पासवर्ड)
                </label>
                <span className="text-[11px] text-slate-400">Default: asha@123</span>
              </div>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-10 py-2.5 text-sm font-semibold text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-700 focus:bg-white transition"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(prev => !prev)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-teal-700 hover:bg-teal-800 active:scale-98 text-white font-bold py-3 rounded-xl text-sm shadow-md shadow-teal-900/10 flex items-center justify-center space-x-2 transition disabled:opacity-50"
            >
              <span>{isLoading ? 'Verifying...' : 'Sign In to Register (साइन इन)'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          {/* Quick Demo Accounts Selection */}
          <div className="pt-2 border-t border-slate-100 space-y-2.5">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
              <span>One-Click Synthetic Demo Workers:</span>
              <span className="text-[11px] text-teal-700 bg-teal-50 px-2 py-0.5 rounded">Tap to Test</span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {mockAshaWorkers.map(w => (
                <button
                  key={w.id}
                  type="button"
                  onClick={() => handleQuickDemoLogin(w)}
                  className="p-2.5 rounded-xl border border-slate-200/90 bg-slate-50/70 hover:bg-teal-50/80 hover:border-teal-300 text-left transition flex items-center space-x-2"
                >
                  <img
                    src={w.avatarUrl}
                    alt={w.name}
                    className="w-7 h-7 rounded-full object-cover shrink-0"
                  />
                  <div className="overflow-hidden">
                    <p className="text-xs font-bold text-slate-900 truncate">{w.name}</p>
                    <p className="text-[10px] text-slate-500 truncate">{w.id} • {w.ward}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Prototype Safety Notice */}
        <div className="p-3.5 bg-amber-50/80 border border-amber-200/80 rounded-2xl flex items-start space-x-2.5 text-xs text-amber-900 shadow-2xs">
          <ShieldCheck className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <span className="font-bold block">Prototype Demonstration Environment:</span>
            <p className="text-[11px] text-amber-800 leading-normal">
              Uses synthetic ASHA worker identities and test credentials only. Not a production-secure authentication system. Logic is architected to connect directly with the backend authentication service in Phase 2.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
