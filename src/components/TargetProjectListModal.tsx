import React, { useState, useEffect, useMemo } from 'react';
import { 
  ClipboardList, 
  X, 
  Check, 
  Plus, 
  Trash2, 
  Sparkles, 
  Search, 
  CheckCircle2, 
  AlertCircle, 
  Smartphone, 
  Apple, 
  ArrowRight,
  Filter,
  Layers,
  RotateCcw
} from 'lucide-react';
import { IssueRecord, FormulaConfig, ProjectAlias } from '../types';
import { parseTargetProjectItem, matchIssueToTargetList, ParsedTargetProject } from '../utils/projectMatcher';
import { normalizeProjectName } from '../utils/metricsEngine';

interface TargetProjectListModalProps {
  isOpen: boolean;
  onClose: () => void;
  customProjectList: string[];
  useCustomProjectListOnly: boolean;
  formulaConfig: FormulaConfig;
  projectAliases: ProjectAlias[];
  issues: IssueRecord[];
  onSaveTargetList: (list: string[], useOnly: boolean) => void;
}

export const TargetProjectListModal: React.FC<TargetProjectListModalProps> = ({
  isOpen,
  onClose,
  customProjectList,
  useCustomProjectListOnly,
  formulaConfig,
  projectAliases,
  issues,
  onSaveTargetList,
}) => {
  const [rawText, setRawText] = useState<string>('');
  const [isStrictOnly, setIsStrictOnly] = useState<boolean>(useCustomProjectListOnly);
  const [activeTab, setActiveTab] = useState<'paste' | 'list'>('paste');
  const [newSingleItem, setNewSingleItem] = useState<string>('');

  useEffect(() => {
    if (isOpen) {
      setRawText((customProjectList || []).join('\n'));
      setIsStrictOnly(useCustomProjectListOnly);
    }
  }, [isOpen, customProjectList, useCustomProjectListOnly]);

  // Current parsed items from raw text
  const currentList = useMemo(() => {
    return rawText
      .split('\n')
      .map(s => s.trim())
      .filter(s => s.length > 0);
  }, [rawText]);

  // Parsed target structures
  const parsedTargets: ParsedTargetProject[] = useMemo(() => {
    return currentList.map(item => parseTargetProjectItem(item, formulaConfig));
  }, [currentList, formulaConfig]);

  // Live Matching Simulation against dataset
  const matchAnalysis = useMemo(() => {
    if (parsedTargets.length === 0 || issues.length === 0) return new Map<string, { count: number; sampleMatch?: string }>();

    const counts = new Map<string, { count: number; sampleMatch?: string }>();
    parsedTargets.forEach(t => counts.set(t.cleanName, { count: 0 }));

    issues.forEach(issue => {
      const match = matchIssueToTargetList(issue, parsedTargets, formulaConfig, projectAliases);
      if (match) {
        const entry = counts.get(match.matchedProjectName);
        if (entry) {
          entry.count++;
          if (!entry.sampleMatch) {
            entry.sampleMatch = match.matchReason;
          }
        }
      }
    });

    return counts;
  }, [parsedTargets, issues, formulaConfig, projectAliases]);

  if (!isOpen) return null;

  // Actions
  const handleSave = () => {
    onSaveTargetList(currentList, isStrictOnly);
    onClose();
  };

  const handlePopulateFromData = () => {
    const detected = new Set<string>();
    issues.forEach(i => {
      const raw = i.baseProject || i.project;
      if (raw) detected.add(raw);
    });

    const combined = Array.from(new Set([...currentList, ...Array.from(detected)]));
    setRawText(combined.join('\n'));
  };

  const handleAddPlatformVariants = () => {
    const newItems: string[] = [];
    currentList.forEach(item => {
      newItems.push(item);
      const parsed = parseTargetProjectItem(item, formulaConfig);
      if (!parsed.isPlatformSpecific) {
        newItems.push(`${item} IOS`);
        newItems.push(`${item} AOS`);
      }
    });
    setRawText(Array.from(new Set(newItems)).join('\n'));
  };

  const handleAddSingleItem = () => {
    if (!newSingleItem.trim()) return;
    const updated = [...currentList, newSingleItem.trim()];
    setRawText(updated.join('\n'));
    setNewSingleItem('');
  };

  const handleRemoveItem = (indexToRemove: number) => {
    const updated = currentList.filter((_, idx) => idx !== indexToRemove);
    setRawText(updated.join('\n'));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-900">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400">
              <ClipboardList className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Target Project Watchlist & Auto-Matcher</h2>
              <p className="text-xs text-slate-400">
                Provide your custom list of project names to search, filter, and track from uploaded data.
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

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-xs">
          {/* Quick Explanation Banner */}
          <div className="bg-blue-950/40 border border-blue-800/60 rounded-xl p-4 space-y-2">
            <div className="flex items-center space-x-2 text-blue-300 font-semibold">
              <Sparkles className="w-4 h-4 text-blue-400 shrink-0" />
              <span>Smart Search & Matching Rules:</span>
            </div>
            <ul className="text-slate-300 space-y-1.5 list-disc list-inside text-[11px] leading-relaxed">
              <li>
                <strong>Summary Tags Extraction (e.g. <code className="text-amber-300 font-mono">[IOS][Staffcentral]</code> / <code className="text-emerald-300 font-mono">[AOS][Doorspace]</code>):</strong> The matcher extracts project names from summary brackets and automatically routes issues into targets like <code className="text-sky-300 font-mono">Staffcentral IOS Project</code> or <code className="text-emerald-300 font-mono">Staffcentral AOS Project</code>.
              </li>
              <li>
                <strong>Web Applications (No [IOS] and No [AOS]):</strong> Issues with <code className="text-amber-300 font-mono">[Staffcentral]</code> without platform tags automatically route into the Web application target (e.g. <code className="text-slate-300 font-mono">Staffcentral</code>).
              </li>
              <li>
                <strong>Zero-Issue Display:</strong> Any project in your target list that has 0 issues is still created as a separate project with 0 count so you can easily verify that it has zero issues.
              </li>
            </ul>
          </div>

          {/* Mode Switcher & Quick Helper Actions */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-950 p-3.5 rounded-xl border border-slate-800">
            <label className="flex items-center space-x-3 cursor-pointer">
              <input
                type="checkbox"
                checked={isStrictOnly}
                onChange={e => setIsStrictOnly(e.target.checked)}
                className="rounded border-slate-700 text-blue-600 focus:ring-blue-500 w-4 h-4 cursor-pointer"
              />
              <div>
                <span className="font-semibold text-slate-200 text-xs">Strict Watchlist Mode</span>
                <p className="text-[11px] text-slate-400">
                  Only show and report the applications listed in this target list on the dashboard.
                </p>
              </div>
            </label>

            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={handlePopulateFromData}
                className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg transition text-[11px] font-medium border border-slate-700 whitespace-nowrap"
                title="Extract and append project names detected in your uploaded dataset"
              >
                + From Dataset
              </button>

              <button
                type="button"
                onClick={handleAddPlatformVariants}
                className="px-2.5 py-1.5 bg-blue-950/80 hover:bg-blue-900 text-blue-300 rounded-lg transition text-[11px] font-medium border border-blue-800/80 whitespace-nowrap"
                title="Automatically create IOS and AOS variants for general project names"
              >
                + Add IOS/AOS Variants
              </button>
            </div>
          </div>

          {/* Tabs: Bulk Paste vs Interactive Item View */}
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <div className="flex space-x-2">
                <button
                  type="button"
                  onClick={() => setActiveTab('paste')}
                  className={`px-3 py-1 rounded-lg font-medium text-xs transition ${
                    activeTab === 'paste'
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800'
                  }`}
                >
                  Bulk Paste (Lines / List)
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('list')}
                  className={`px-3 py-1 rounded-lg font-medium text-xs transition ${
                    activeTab === 'list'
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800'
                  }`}
                >
                  List & Live Match Inspector ({currentList.length})
                </button>
              </div>

              <span className="text-slate-400 text-xs font-mono">
                {currentList.length} Target Project(s)
              </span>
            </div>

            {/* TAB 1: Bulk Paste Textarea */}
            {activeTab === 'paste' && (
              <div className="space-y-2">
                <label className="block text-slate-300 font-semibold">
                  Paste or type project names (one per line):
                </label>
                <textarea
                  rows={9}
                  value={rawText}
                  onChange={e => setRawText(e.target.value)}
                  placeholder={`Example:\nStaffcentral IOS Project\nStaffcentral AOS Project\nStaffcentral\nDoorspace AOS\nDoorspace IOS\nRadio AOS\nBoardroom AOS\nGenesis\nGenesis IOS\nGenesis AOS`}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3.5 font-mono text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 leading-relaxed"
                />
                <p className="text-[11px] text-slate-500">
                  Tip: You can copy an entire column of project names from Excel or a text document and paste it directly here.
                </p>
              </div>
            )}

            {/* TAB 2: List View with Live Match Testing */}
            {activeTab === 'list' && (
              <div className="space-y-3">
                {/* Add single item row */}
                <div className="flex items-center space-x-2">
                  <input
                    type="text"
                    value={newSingleItem}
                    onChange={e => setNewSingleItem(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleAddSingleItem(); }}
                    placeholder="Enter project name (e.g. Genesis IOS)..."
                    className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:border-blue-500 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleAddSingleItem}
                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-medium transition flex items-center space-x-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add</span>
                  </button>
                </div>

                {/* Items List with Live Match Status */}
                <div className="bg-slate-950 border border-slate-800 rounded-xl divide-y divide-slate-800 max-h-72 overflow-y-auto">
                  {currentList.length === 0 ? (
                    <div className="p-6 text-center text-slate-500">
                      No project names in target list yet. Switch to Bulk Paste or add one above.
                    </div>
                  ) : (
                    currentList.map((item, idx) => {
                      const matchInfo = matchAnalysis.get(item);
                      const count = matchInfo?.count || 0;
                      const parsed = parsedTargets[idx];

                      return (
                        <div
                          key={`${item}-${idx}`}
                          className="p-3 flex items-center justify-between hover:bg-slate-900/60 transition"
                        >
                          <div className="flex items-center space-x-3">
                            <span className="font-mono text-slate-500 text-[11px] w-5 text-right">
                              {idx + 1}.
                            </span>
                            <div>
                              <div className="flex items-center space-x-2">
                                <span className="font-semibold text-slate-200 text-xs">{item}</span>
                                {parsed?.requiredPlatformTag === 'IOS' && (
                                  <span className="inline-flex items-center space-x-0.5 px-1.5 py-0.2 rounded text-[9px] font-semibold bg-sky-950 text-sky-300 border border-sky-800">
                                    <Apple className="w-2.5 h-2.5" />
                                    <span>IOS Keyword Match</span>
                                  </span>
                                )}
                                {parsed?.requiredPlatformTag === 'AOS' && (
                                  <span className="inline-flex items-center space-x-0.5 px-1.5 py-0.2 rounded text-[9px] font-semibold bg-emerald-950 text-emerald-300 border border-emerald-800">
                                    <Smartphone className="w-2.5 h-2.5" />
                                    <span>AOS Keyword Match</span>
                                  </span>
                                )}
                              </div>
                              <p className="text-[11px] text-slate-400 mt-0.5">
                                {count > 0 ? (
                                  <span className="text-emerald-400 font-medium">
                                    &bull; {count} tickets matched ({matchInfo?.sampleMatch || 'matched'})
                                  </span>
                                ) : (
                                  <span className="text-slate-500">
                                    &bull; 0 tickets found in dataset (will display 0 metrics)
                                  </span>
                                )}
                              </p>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleRemoveItem(idx)}
                            className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-950/40 rounded transition"
                            title="Remove from target list"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-900 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setRawText('')}
            className="px-3 py-1.5 text-xs text-slate-400 hover:text-red-400 transition"
          >
            Clear List
          </button>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition shadow-md shadow-blue-600/30 flex items-center space-x-1.5"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Apply Target Watchlist ({currentList.length})</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
