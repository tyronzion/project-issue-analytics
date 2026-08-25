import React, { useState } from 'react';
import { Trash2, AlertTriangle, X } from 'lucide-react';

interface ClearDataModalProps {
  isOpen: boolean;
  onClose: () => void;
  totalIssuesCount: number;
  onConfirmClear: (options: { clearTargetList: boolean; clearAliases: boolean }) => void;
}

export const ClearDataModal: React.FC<ClearDataModalProps> = ({
  isOpen,
  onClose,
  totalIssuesCount,
  onConfirmClear,
}) => {
  const [clearTargetList, setClearTargetList] = useState(false);
  const [clearAliases, setClearAliases] = useState(false);

  if (!isOpen) return null;

  const handleClear = () => {
    onConfirmClear({ clearTargetList, clearAliases });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-900">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-red-600/20 border border-red-500/30 flex items-center justify-center text-red-400">
              <Trash2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Delete All Issue Data</h2>
              <p className="text-xs text-slate-400">Clean slate for fresh data imports</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          <div className="p-4 bg-red-950/30 border border-red-800/40 rounded-xl flex items-start space-x-3">
            <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <div className="text-xs space-y-1">
              <p className="font-semibold text-red-200">
                Are you sure you want to delete all {totalIssuesCount} issue records?
              </p>
              <p className="text-red-300/80 leading-relaxed">
                This will wipe the current dataset from memory and browser storage. When you import a new Excel/CSV file, it will start completely fresh so numbers will <strong>not add up or duplicate</strong>.
              </p>
            </div>
          </div>

          <div className="space-y-2.5 pt-2">
            <label className="text-xs font-semibold text-slate-300 block">
              Additional cleanup options:
            </label>
            <label className="flex items-center space-x-2.5 text-xs text-slate-300 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={clearTargetList}
                onChange={e => setClearTargetList(e.target.checked)}
                className="rounded border-slate-700 text-red-600 focus:ring-red-500 bg-slate-950"
              />
              <span>Also clear Target Project Watchlist</span>
            </label>
            <label className="flex items-center space-x-2.5 text-xs text-slate-300 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={clearAliases}
                onChange={e => setClearAliases(e.target.checked)}
                className="rounded border-slate-700 text-red-600 focus:ring-red-500 bg-slate-950"
              />
              <span>Also reset merged project alias rules</span>
            </label>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-950 border-t border-slate-800 flex items-center justify-between gap-2">
          <div />

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-xl transition"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleClear}
              className="px-4 py-2 text-xs font-semibold text-white bg-red-600 hover:bg-red-500 rounded-xl transition flex items-center space-x-1.5 shadow-lg shadow-red-600/20"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete All Data</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
