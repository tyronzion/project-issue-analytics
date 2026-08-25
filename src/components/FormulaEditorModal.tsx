import React, { useState } from 'react';
import { FormulaConfig, IssueRecord, DateFilter } from '../types';
import { DEFAULT_FORMULA_CONFIG } from '../utils/storage';
import { computeProjectSummaries } from '../utils/metricsEngine';
import { 
  Calculator, 
  Check, 
  X, 
  RotateCcw, 
  Save, 
  Plus, 
  Trash2, 
  HelpCircle, 
  Sparkles,
  Smartphone,
  Apple,
  Sliders,
  CheckCircle2
} from 'lucide-react';

interface FormulaEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: FormulaConfig;
  onSaveConfig: (newConfig: FormulaConfig) => void;
  currentIssues: IssueRecord[];
  dateFilter: DateFilter;
}

export const FormulaEditorModal: React.FC<FormulaEditorModalProps> = ({
  isOpen,
  onClose,
  config,
  onSaveConfig,
  currentIssues,
  dateFilter,
}) => {
  const [formData, setFormData] = useState<FormulaConfig>({ ...config });
  const [newDoneStatus, setNewDoneStatus] = useState('');
  const [newCancelledStatus, setNewCancelledStatus] = useState('');
  const [newTagName, setNewTagName] = useState('');
  const [newTagKeyword, setNewTagKeyword] = useState('');
  const [savedToast, setSavedToast] = useState(false);

  if (!isOpen) return null;

  // Real-time calculation preview
  const preview = computeProjectSummaries(
    currentIssues,
    formData,
    dateFilter,
    [],
    []
  );

  const previewTotals = preview.summaries.reduce(
    (acc, curr) => ({
      general: acc.general + curr.generalFound,
      ios: acc.ios + curr.iosFound,
      aos: acc.aos + curr.aosFound,
      totalFound: acc.totalFound + curr.totalFound,
      resolved: acc.resolved + curr.resolved,
      outstanding: acc.outstanding + curr.outstanding,
    }),
    { general: 0, ios: 0, aos: 0, totalFound: 0, resolved: 0, outstanding: 0 }
  );

  const handleAddDoneStatus = () => {
    if (!newDoneStatus.trim()) return;
    if (!formData.doneStatuses.includes(newDoneStatus.trim())) {
      setFormData({
        ...formData,
        doneStatuses: [...formData.doneStatuses, newDoneStatus.trim()],
      });
    }
    setNewDoneStatus('');
  };

  const handleRemoveDoneStatus = (status: string) => {
    setFormData({
      ...formData,
      doneStatuses: formData.doneStatuses.filter(s => s !== status),
    });
  };

  const handleAddCancelledStatus = () => {
    if (!newCancelledStatus.trim()) return;
    if (!formData.cancelledStatuses.includes(newCancelledStatus.trim())) {
      setFormData({
        ...formData,
        cancelledStatuses: [...formData.cancelledStatuses, newCancelledStatus.trim()],
      });
    }
    setNewCancelledStatus('');
  };

  const handleRemoveCancelledStatus = (status: string) => {
    setFormData({
      ...formData,
      cancelledStatuses: formData.cancelledStatuses.filter(s => s !== status),
    });
  };

  const handleAddCustomTag = () => {
    if (!newTagName.trim() || !newTagKeyword.trim()) return;
    setFormData({
      ...formData,
      additionalKeywords: [
        ...(formData.additionalKeywords || []),
        { name: newTagName.trim(), tag: newTagKeyword.trim() }
      ]
    });
    setNewTagName('');
    setNewTagKeyword('');
  };

  const handleRemoveCustomTag = (index: number) => {
    setFormData({
      ...formData,
      additionalKeywords: formData.additionalKeywords.filter((_, i) => i !== index),
    });
  };

  const handleResetDefaults = () => {
    if (window.confirm('Reset all formulas, status lists, and keywords to default values?')) {
      setFormData({ ...DEFAULT_FORMULA_CONFIG });
    }
  };

  const handleSave = () => {
    onSaveConfig(formData);
    setSavedToast(true);
    setTimeout(() => {
      setSavedToast(false);
      onClose();
    }, 800);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-900 sticky top-0 z-10">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-lg bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400">
              <Calculator className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Custom Formula & Logic Engine</h2>
              <p className="text-xs text-slate-400">
                Customize issue counts, date fields, status lists, and keyword separation rules.
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

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-xs">
          {/* Live Preview Bar */}
          <div className="bg-slate-950 border border-blue-900/40 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="font-semibold text-blue-400 flex items-center space-x-1.5">
                <Sparkles className="w-4 h-4 text-blue-400" />
                <span>Live Formula Evaluation Simulation</span>
              </span>
              <span className="text-[11px] text-slate-400">
                Based on current active dataset ({currentIssues.length} records)
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-2 border-t border-slate-800/80">
              <div className="bg-slate-900/80 p-2.5 rounded-lg border border-slate-800">
                <span className="text-blue-400 text-[10px] uppercase font-semibold">Found Issues</span>
                <p className="text-base font-bold text-white mt-0.5">{previewTotals.totalFound}</p>
              </div>
              <div className="bg-slate-900/80 p-2.5 rounded-lg border border-slate-800">
                <span className="text-emerald-400 text-[10px] uppercase font-semibold">Resolved</span>
                <p className="text-base font-bold text-emerald-400 mt-0.5">{previewTotals.resolved}</p>
              </div>
              <div className="bg-slate-900/80 p-2.5 rounded-lg border border-slate-800">
                <span className="text-amber-400 text-[10px] uppercase font-semibold">Outstanding / Backlog</span>
                <p className="text-base font-bold text-amber-400 mt-0.5">{previewTotals.outstanding}</p>
              </div>
              <div className="bg-slate-900/80 p-2.5 rounded-lg border border-slate-800">
                <span className="text-slate-300 text-[10px] uppercase font-semibold">Resolution Rate</span>
                <p className="text-base font-bold text-slate-100 mt-0.5">
                  {previewTotals.totalFound > 0 ? ((previewTotals.resolved / previewTotals.totalFound) * 100).toFixed(1) : 0}%
                </p>
              </div>
            </div>
          </div>

          {/* Section 1: Found Issues Formula */}
          <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-slate-200 text-sm">1. Found Issues Formula</h3>
                <p className="text-slate-400 text-xs">
                  Count rows if in the "Created" column date range.
                </p>
              </div>
              <span className="font-mono text-[11px] bg-blue-950 text-blue-300 px-2 py-0.5 rounded border border-blue-800">
                COUNT_IF(Created IN DateRange)
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              <div>
                <label className="block text-slate-400 mb-1 font-medium">Created Date Column Header in Excel</label>
                <input
                  type="text"
                  value={formData.columnMapping.createdColumn}
                  onChange={e =>
                    setFormData({
                      ...formData,
                      columnMapping: { ...formData.columnMapping, createdColumn: e.target.value },
                    })
                  }
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-slate-200 font-mono focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1 font-medium">Formula Description Label</label>
                <input
                  type="text"
                  value={formData.foundIssuesDescription}
                  onChange={e => setFormData({ ...formData, foundIssuesDescription: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-slate-200 focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Section 2: Platform Separation Keywords */}
          <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-slate-200 text-sm">2. Platform Separation in Summary</h3>
                <p className="text-slate-400 text-xs">
                  Check in the "Summary" column for keywords and separate them from general counts.
                </p>
              </div>
              <span className="font-mono text-[11px] bg-sky-950 text-sky-300 px-2 py-0.5 rounded border border-sky-800">
                [IOS] / [AOS] Parser
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              {/* iOS Keyword */}
              <div className="space-y-1">
                <label className="flex items-center space-x-1.5 text-sky-400 font-medium">
                  <Apple className="w-3.5 h-3.5" />
                  <span>iOS Keyword in Summary</span>
                </label>
                <input
                  type="text"
                  value={formData.iosKeyword}
                  onChange={e => setFormData({ ...formData, iosKeyword: e.target.value })}
                  placeholder="e.g. [IOS]"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-slate-200 font-mono focus:border-blue-500 focus:outline-none"
                />
              </div>

              {/* AOS Keyword */}
              <div className="space-y-1">
                <label className="flex items-center space-x-1.5 text-emerald-400 font-medium">
                  <Smartphone className="w-3.5 h-3.5" />
                  <span>Android (AOS) Keyword in Summary</span>
                </label>
                <input
                  type="text"
                  value={formData.aosKeyword}
                  onChange={e => setFormData({ ...formData, aosKeyword: e.target.value })}
                  placeholder="e.g. [AOS]"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-slate-200 font-mono focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>

            {/* Dynamic Project Naming Mode */}
            <div className="pt-3 border-t border-slate-800 space-y-2">
              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.splitProjectsByPlatform}
                  onChange={e => setFormData({ ...formData, splitProjectsByPlatform: e.target.checked })}
                  className="rounded border-slate-700 text-blue-600 focus:ring-blue-500"
                />
                <span className="font-semibold text-slate-200 text-xs">
                  Automatically create new Project Name per platform (e.g. "Genesis IOS", "Genesis AOS")
                </span>
              </label>
              <p className="text-slate-400 text-[11px] pl-5">
                When enabled, tickets in project "Genesis" with <code className="text-sky-300">[IOS]</code> become project <strong>"Genesis IOS"</strong>, and tickets with <code className="text-emerald-300">[AOS]</code> become project <strong>"Genesis AOS"</strong>.
              </p>

              {formData.splitProjectsByPlatform && (
                <div className="pl-5 pt-1">
                  <label className="block text-slate-400 text-[11px] mb-1">Naming Suffix Pattern</label>
                  <input
                    type="text"
                    value={formData.platformNamingPattern || '{project} {platform}'}
                    onChange={e => setFormData({ ...formData, platformNamingPattern: e.target.value })}
                    placeholder="{project} {platform}"
                    className="w-64 bg-slate-900 border border-slate-700 rounded-lg px-3 py-1 text-slate-200 text-xs font-mono focus:border-blue-500 focus:outline-none"
                  />
                  <span className="text-slate-500 text-[10px] ml-2">Available placeholders: <code>{'{project}'}</code>, <code>{'{platform}'}</code></span>
                </div>
              )}
            </div>

            {/* Custom Additional Tags */}
            <div className="pt-2 border-t border-slate-800">
              <label className="block text-slate-400 mb-1.5 font-medium">Custom Additional Platform Tags (Optional)</label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {(formData.additionalKeywords || []).map((k, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center space-x-1 px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300 text-xs"
                  >
                    <span>{k.name}: <strong>{k.tag}</strong></span>
                    <button
                      onClick={() => handleRemoveCustomTag(idx)}
                      className="hover:text-red-400 ml-1"
                    >
                      &times;
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex items-center space-x-2">
                <input
                  type="text"
                  placeholder="Tag Name (e.g. Web)"
                  value={newTagName}
                  onChange={e => setNewTagName(e.target.value)}
                  className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-1 text-slate-200 text-xs w-36"
                />
                <input
                  type="text"
                  placeholder="Keyword (e.g. [WEB])"
                  value={newTagKeyword}
                  onChange={e => setNewTagKeyword(e.target.value)}
                  className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-1 text-slate-200 text-xs w-36 font-mono"
                />
                <button
                  type="button"
                  onClick={handleAddCustomTag}
                  className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg border border-slate-700 text-xs flex items-center space-x-1"
                >
                  <Plus className="w-3 h-3" />
                  <span>Add Tag</span>
                </button>
              </div>
            </div>
          </div>

          {/* Section 3: Resolved Issues Formula */}
          <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-slate-200 text-sm">3. Resolved Issues Formula</h3>
                <p className="text-slate-400 text-xs">
                  Count if "Status Category change" is in date range AND "Status" = Done.
                </p>
              </div>
              <span className="font-mono text-[11px] bg-emerald-950 text-emerald-300 px-2 py-0.5 rounded border border-emerald-800">
                COUNT_IF(StatusChange IN DateRange AND Status IN DoneList)
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              <div>
                <label className="block text-slate-400 mb-1 font-medium">
                  Status Category Change Column Header
                </label>
                <input
                  type="text"
                  value={formData.columnMapping.statusChangeColumn}
                  onChange={e =>
                    setFormData({
                      ...formData,
                      columnMapping: { ...formData.columnMapping, statusChangeColumn: e.target.value },
                    })
                  }
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-slate-200 font-mono focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1 font-medium">
                  Status Column Header
                </label>
                <input
                  type="text"
                  value={formData.columnMapping.statusColumn}
                  onChange={e =>
                    setFormData({
                      ...formData,
                      columnMapping: { ...formData.columnMapping, statusColumn: e.target.value },
                    })
                  }
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-slate-200 font-mono focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>

            {/* Done Statuses Chips */}
            <div>
              <label className="block text-slate-400 mb-1.5 font-medium">
                Matching "Done" Statuses (Case-Insensitive)
              </label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {formData.doneStatuses.map(status => (
                  <span
                    key={status}
                    className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-md bg-emerald-950/80 text-emerald-300 border border-emerald-800/80 text-xs"
                  >
                    <span>{status}</span>
                    <button
                      onClick={() => handleRemoveDoneStatus(status)}
                      className="hover:text-red-300 text-emerald-400 ml-1 text-sm font-bold"
                    >
                      &times;
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex items-center space-x-2">
                <input
                  type="text"
                  placeholder="Add custom Done status (e.g. Verified)..."
                  value={newDoneStatus}
                  onChange={e => setNewDoneStatus(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAddDoneStatus()}
                  className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-1 text-slate-200 text-xs w-64"
                />
                <button
                  type="button"
                  onClick={handleAddDoneStatus}
                  className="px-2.5 py-1 bg-emerald-900/60 hover:bg-emerald-800 text-emerald-200 rounded-lg border border-emerald-700 text-xs flex items-center space-x-1"
                >
                  <Plus className="w-3 h-3" />
                  <span>Add Status</span>
                </button>
              </div>
            </div>
          </div>

          {/* Section 4: Outstanding Issues Formula */}
          <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-slate-200 text-sm">4. Outstanding / Backlog Issues Formula</h3>
                <p className="text-slate-400 text-xs">
                  Count if Status is NOT Done AND is NOT Cancelled.
                </p>
              </div>
              <span className="font-mono text-[11px] bg-amber-950 text-amber-300 px-2 py-0.5 rounded border border-amber-800">
                COUNT_IF(Status NOT IN DoneList AND Status NOT IN CancelledList)
              </span>
            </div>

            {/* Cancelled Statuses Chips */}
            <div>
              <label className="block text-slate-400 mb-1.5 font-medium">
                Matching "Cancelled / Won't Do" Statuses (Excluded from Backlog)
              </label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {formData.cancelledStatuses.map(status => (
                  <span
                    key={status}
                    className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-md bg-red-950/80 text-red-300 border border-red-800/80 text-xs"
                  >
                    <span>{status}</span>
                    <button
                      onClick={() => handleRemoveCancelledStatus(status)}
                      className="hover:text-red-200 text-red-400 ml-1 text-sm font-bold"
                    >
                      &times;
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex items-center space-x-2">
                <input
                  type="text"
                  placeholder="Add custom Cancelled status (e.g. Invalid)..."
                  value={newCancelledStatus}
                  onChange={e => setNewCancelledStatus(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAddCancelledStatus()}
                  className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-1 text-slate-200 text-xs w-64"
                />
                <button
                  type="button"
                  onClick={handleAddCancelledStatus}
                  className="px-2.5 py-1 bg-red-950/80 hover:bg-red-900 text-red-200 rounded-lg border border-red-800 text-xs flex items-center space-x-1"
                >
                  <Plus className="w-3 h-3" />
                  <span>Add Status</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-900 flex items-center justify-between">
          <button
            onClick={handleResetDefaults}
            className="flex items-center space-x-1.5 text-xs text-slate-400 hover:text-slate-200 px-3 py-1.5 rounded-lg border border-slate-700 hover:bg-slate-800 transition"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Factory Defaults</span>
          </button>

          <div className="flex items-center space-x-2">
            {savedToast && (
              <span className="text-xs text-emerald-400 flex items-center space-x-1 animate-fade-in">
                <CheckCircle2 className="w-4 h-4" />
                <span>Saved Permanently!</span>
              </span>
            )}
            <button
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-300 hover:text-white rounded-lg hover:bg-slate-800 transition"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="flex items-center space-x-1.5 px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition shadow-md shadow-blue-900/30"
            >
              <Save className="w-4 h-4" />
              <span>Save Formulas Permanently</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
