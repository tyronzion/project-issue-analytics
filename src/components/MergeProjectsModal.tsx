import React, { useState, useEffect } from 'react';
import { GitMerge, X, Check, ArrowRight, Layers, AlertCircle } from 'lucide-react';
import { ProjectSummary } from '../types';

interface MergeProjectsModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedProjectNames: string[];
  summaries: ProjectSummary[];
  onConfirmMerge: (sourceProjects: string[], targetName: string) => void;
}

export const MergeProjectsModal: React.FC<MergeProjectsModalProps> = ({
  isOpen,
  onClose,
  selectedProjectNames,
  summaries,
  onConfirmMerge,
}) => {
  const [selectedTarget, setSelectedTarget] = useState<string>('');
  const [customTargetName, setCustomTargetName] = useState<string>('');
  const [isCustom, setIsCustom] = useState<boolean>(false);

  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (selectedProjectNames.length > 0) {
      setSelectedTarget(selectedProjectNames[0]);
      setCustomTargetName('');
      setIsCustom(false);
      setErrorMsg(null);
    }
  }, [selectedProjectNames, isOpen]);

  if (!isOpen || selectedProjectNames.length < 2) return null;

  const targetName = isCustom ? customTargetName.trim() : selectedTarget;

  // Calculate combined metrics preview
  const selectedSummaries = summaries.filter(s => selectedProjectNames.includes(s.projectName));
  const combinedFound = selectedSummaries.reduce((sum, s) => sum + s.totalFound, 0);
  const combinedResolved = selectedSummaries.reduce((sum, s) => sum + s.resolved, 0);
  const combinedOutstanding = selectedSummaries.reduce((sum, s) => sum + s.outstanding, 0);
  const combinedAllTime = selectedSummaries.reduce((sum, s) => sum + s.totalAllTime, 0);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetName) {
      setErrorMsg('Please select or enter a target project name for the merged application.');
      return;
    }
    setErrorMsg(null);
    onConfirmMerge(selectedProjectNames, targetName);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-900">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-purple-600/20 border border-purple-500/30 flex items-center justify-center text-purple-400">
              <GitMerge className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Merge Selected Applications</h2>
              <p className="text-xs text-slate-400">
                Combine {selectedProjectNames.length} applications into a single unified project.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5 text-xs">
          {errorMsg && (
            <div className="p-3 rounded-xl bg-red-950/60 border border-red-800/80 text-red-300 flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Applications to merge list */}
          <div className="space-y-2">
            <label className="block text-slate-300 font-semibold">
              Applications to Merge ({selectedProjectNames.length}):
            </label>
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 max-h-36 overflow-y-auto space-y-1.5 divide-y divide-slate-800/60">
              {selectedSummaries.map(s => (
                <div key={s.projectName} className="pt-1.5 first:pt-0 flex items-center justify-between">
                  <span className="font-medium text-slate-200">{s.projectName}</span>
                  <span className="text-[11px] text-slate-400 font-mono">
                    {s.totalFound} Found &bull; {s.resolved} Resolved &bull; {s.outstanding} Backlog
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Choose target merged name */}
          <div className="space-y-3">
            <label className="block text-slate-300 font-semibold">
              Target Unified Application Name:
            </label>

            <div className="space-y-2">
              {selectedProjectNames.map(pName => (
                <label
                  key={pName}
                  className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition ${
                    !isCustom && selectedTarget === pName
                      ? 'bg-purple-950/40 border-purple-600/60 text-purple-200'
                      : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center space-x-2.5">
                    <input
                      type="radio"
                      name="targetProject"
                      checked={!isCustom && selectedTarget === pName}
                      onChange={() => {
                        setIsCustom(false);
                        setSelectedTarget(pName);
                      }}
                      className="text-purple-600 focus:ring-purple-500"
                    />
                    <span className="font-medium">{pName}</span>
                  </div>
                  <span className="text-[11px] text-slate-400">Keep this name</span>
                </label>
              ))}

              {/* Custom Target Name Option */}
              <label
                className={`flex flex-col p-3 rounded-xl border cursor-pointer transition space-y-2 ${
                  isCustom
                    ? 'bg-purple-950/40 border-purple-600/60 text-purple-200'
                    : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center space-x-2.5">
                  <input
                    type="radio"
                    name="targetProject"
                    checked={isCustom}
                    onChange={() => setIsCustom(true)}
                    className="text-purple-600 focus:ring-purple-500"
                  />
                  <span className="font-medium">Enter a New Unified Name...</span>
                </div>

                {isCustom && (
                  <input
                    type="text"
                    value={customTargetName}
                    onChange={e => setCustomTargetName(e.target.value)}
                    placeholder="e.g. Genesis Mobile Suite"
                    className="w-full bg-slate-900 border border-purple-500/50 rounded-lg px-3 py-1.5 text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-purple-500 font-medium"
                    autoFocus
                  />
                )}
              </label>
            </div>
          </div>

          {/* Combined Preview Card */}
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 space-y-2">
            <span className="font-semibold text-slate-300 text-[11px] flex items-center space-x-1.5">
              <Layers className="w-3.5 h-3.5 text-purple-400" />
              <span>Resulting Merged Application Preview:</span>
            </span>
            <div className="flex items-center justify-between text-slate-200 pt-1">
              <strong className="text-purple-300 text-sm">{targetName || '—'}</strong>
              <span className="font-mono text-xs text-slate-400">
                {combinedFound} Found &bull; {combinedResolved} Resolved &bull; {combinedOutstanding} Backlog ({combinedAllTime} total)
              </span>
            </div>
            <p className="text-[11px] text-slate-500 pt-1 border-t border-slate-800/80">
              * This creates permanent alias rules. You can unmerge or remove merge rules anytime from the table or settings.
            </p>
          </div>

          {/* Modal Footer */}
          <div className="pt-3 border-t border-slate-800 flex items-center justify-end space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium rounded-lg transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!targetName}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-medium rounded-lg transition flex items-center space-x-1.5 shadow-lg shadow-purple-600/20"
            >
              <GitMerge className="w-3.5 h-3.5" />
              <span>Merge Applications</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
