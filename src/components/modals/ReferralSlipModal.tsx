import React from 'react';
import { X, Printer, Download, Share2, ShieldAlert, CheckCircle2 } from 'lucide-react';
import { useApp } from '../../context/AppContext';

export const ReferralSlipModal: React.FC = () => {
  const { isReferralModalOpen, setIsReferralModalOpen, activeBeneficiary } = useApp();

  if (!isReferralModalOpen) return null;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-4 bg-teal-800 text-white flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <ShieldAlert className="w-5 h-5 text-red-300" />
            <div>
              <h3 className="text-sm font-bold tracking-tight">
                Emergency PHC Clinical Referral Slip (रेफरल पर्ची)
              </h3>
              <p className="text-[11px] text-teal-200">
                MoHFW Maternal Health Safety Protocol • Form RCH-REF-09
              </p>
            </div>
          </div>
          <button
            onClick={() => setIsReferralModalOpen(false)}
            className="w-8 h-8 rounded-lg hover:bg-teal-700 text-teal-200 hover:text-white flex items-center justify-center transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Slip Body */}
        <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto text-xs text-slate-800">
          {/* Top Stamp */}
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <div>
              <h4 className="font-bold text-slate-900 text-sm">
                GOVERNMENT OF INDIA • NATIONAL HEALTH MISSION
              </h4>
              <p className="text-[11px] text-slate-500">
                Community Health Sub-Center Rampur, Ward 4 • Rampur Block PHC
              </p>
            </div>
            <div className="text-right">
              <span className="bg-red-100 text-red-800 border border-red-300 px-2.5 py-0.5 rounded font-bold text-[10px] uppercase">
                Urgent Priority 1
              </span>
              <p className="text-[10px] text-slate-400 mt-1">Ref ID: #REF-2024-8921</p>
            </div>
          </div>

          {/* Beneficiary Info Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
            <div>
              <span className="text-[10px] text-slate-400 block font-semibold">PATIENT NAME</span>
              <span className="font-bold text-slate-900">{activeBeneficiary.name}</span>
            </div>
            <div>
              <span className="text-[10px] text-slate-400 block font-semibold">SPOUSE / GUARDIAN</span>
              <span className="font-semibold text-slate-800">{activeBeneficiary.spouseName || 'Manoj Kumar'}</span>
            </div>
            <div>
              <span className="text-[10px] text-slate-400 block font-semibold">AGE & GESTATION</span>
              <span className="font-semibold text-slate-800">{activeBeneficiary.age} Yrs • 32 Weeks</span>
            </div>
            <div>
              <span className="text-[10px] text-slate-400 block font-semibold">RCH ID</span>
              <span className="font-bold text-slate-900">{activeBeneficiary.rchId}</span>
            </div>
            <div>
              <span className="text-[10px] text-slate-400 block font-semibold">ADDRESS</span>
              <span className="font-semibold text-slate-800">{activeBeneficiary.village}, {activeBeneficiary.gali || ''}</span>
            </div>
            <div>
              <span className="text-[10px] text-slate-400 block font-semibold">CONTACT</span>
              <span className="font-semibold text-teal-800">{activeBeneficiary.contactNumber || '+91 98721 44510'}</span>
            </div>
          </div>

          {/* Clinical Reasons for Referral */}
          <div className="space-y-2 border border-red-200 bg-red-50/50 p-4 rounded-xl">
            <h5 className="font-bold text-red-950 flex items-center space-x-1.5">
              <span>Reason for Emergency Referral: Suspected Pre-Eclampsia</span>
            </h5>
            <ul className="space-y-1.5 text-xs text-slate-700 list-disc list-inside">
              <li>
                <span className="font-bold text-slate-900">Elevated Blood Pressure:</span> Recorded at 130/85 mmHg (Baseline 110/70 mmHg, 3rd trimester).
              </li>
              <li>
                <span className="font-bold text-slate-900">Bilateral Pedal Edema:</span> New onset visible pitting swelling in feet/ankles for 3 consecutive days.
              </li>
              <li>
                <span className="font-bold text-slate-900">Persistent Headache:</span> Frontal dull ache reported continuously since yesterday.
              </li>
              <li>
                <span className="font-bold text-slate-900">Lab History:</span> Hb 10.2 g/dL (Mild Anemia). Urine albumin evaluation mandatory.
              </li>
            </ul>
          </div>

          {/* Referral Instructions */}
          <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-2">
            <h5 className="font-bold text-slate-900">Referral Facility & MO Attendant:</h5>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between text-xs gap-2">
              <div>
                <span className="text-slate-500">Destination:</span>{' '}
                <span className="font-bold text-slate-900">Rampur Primary Health Centre (PHC) - 2.8 km</span>
              </div>
              <div>
                <span className="text-slate-500">Attending MO:</span>{' '}
                <span className="font-bold text-slate-900">Dr. Rajesh Varma (MBBS)</span>
              </div>
            </div>
            <p className="text-[11px] text-slate-500">
              Transport arranged via Janani Express / 108 Ambulance Unit. ASHA Worker Sunita Devi to accompany beneficiary.
            </p>
          </div>

          {/* Signatures */}
          <div className="flex items-center justify-between pt-4 border-t border-slate-200 text-xs">
            <div>
              <p className="text-[10px] text-slate-400 font-semibold uppercase">Referring Field Worker</p>
              <p className="font-bold text-slate-800">Sunita Devi (ASHA Ward 4)</p>
              <p className="text-[10px] text-emerald-700">Digitally Verified via DHWANI</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] text-slate-400 font-semibold uppercase">PHC Receiving MO</p>
              <div className="h-6 w-32 border-b border-dashed border-slate-300 mt-1"></div>
              <p className="text-[10px] text-slate-400 mt-0.5">Signature & Stamp</p>
            </div>
          </div>
        </div>

        {/* Footer actions */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <span className="text-[11px] text-slate-400">
            Confidential medical record • Synthetic prototype data
          </span>

          <div className="flex items-center space-x-2">
            <button
              onClick={handlePrint}
              className="flex items-center space-x-1.5 bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 px-3.5 py-2 rounded-xl text-xs font-semibold transition"
            >
              <Printer className="w-3.5 h-3.5 text-slate-500" />
              <span>Print Slip</span>
            </button>

            <button
              onClick={() => setIsReferralModalOpen(false)}
              className="bg-teal-700 hover:bg-teal-800 text-white px-4 py-2 rounded-xl text-xs font-bold transition"
            >
              Done / Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
