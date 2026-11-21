import React from 'react';
import { X, CheckCircle2, UserCheck } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { mockBeneficiaries } from '../../data/mockData';
import { Beneficiary } from '../../types';

export const BeneficiaryModal: React.FC = () => {
  const { 
    isBeneficiaryModalOpen, 
    setIsBeneficiaryModalOpen, 
    activeBeneficiary, 
    setActiveBeneficiary 
  } = useApp();

  if (!isBeneficiaryModalOpen) return null;

  const handleSelect = (b: Beneficiary) => {
    setActiveBeneficiary(b);
    setIsBeneficiaryModalOpen(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-slate-900">Select Beneficiary</h3>
            <p className="text-xs text-slate-500">
              Assigned synthetic households in Rampur Ward 4
            </p>
          </div>
          <button
            onClick={() => setIsBeneficiaryModalOpen(false)}
            className="w-8 h-8 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700 flex items-center justify-center transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-2.5 max-h-[60vh] overflow-y-auto">
          {mockBeneficiaries.map((b) => {
            const isSelected = b.id === activeBeneficiary.id;
            return (
              <div
                key={b.id}
                onClick={() => handleSelect(b)}
                className={`p-3.5 rounded-xl border cursor-pointer transition flex items-center justify-between ${
                  isSelected
                    ? 'bg-teal-50/70 border-teal-300 shadow-2xs'
                    : 'bg-white border-slate-200 hover:bg-slate-50 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center space-x-3">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-xs ${
                    isSelected ? 'bg-teal-700 text-white' : 'bg-slate-100 text-slate-700'
                  }`}>
                    {b.avatarInitials}
                  </div>
                  <div>
                    <div className="flex items-center space-x-2">
                      <h4 className="text-xs font-bold text-slate-900">{b.name}</h4>
                      {b.spouseName && (
                        <span className="text-[11px] text-slate-400">({b.spouseName})</span>
                      )}
                      <span className="text-[10px] font-semibold text-teal-800 bg-teal-100/60 px-2 py-0.2 rounded">
                        {b.stage.split('•')[0]}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      {b.age} Yrs • {b.village}, {b.gali || ''} • RCH ID: {b.rchId}
                    </p>
                  </div>
                </div>

                {isSelected && (
                  <CheckCircle2 className="w-5 h-5 text-teal-700 shrink-0 ml-2" />
                )}
              </div>
            );
          })}
        </div>

        <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
          <span>Responsible AI: 100% synthetic patient records</span>
          <button
            onClick={() => setIsBeneficiaryModalOpen(false)}
            className="text-xs font-semibold text-slate-700 hover:text-slate-900"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
