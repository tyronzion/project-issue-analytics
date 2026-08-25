import React, { useState } from 'react';
import { ProjectAlias, IssueRecord } from '../types';
import { 
  FolderKanban, 
  Trash2, 
  RotateCcw, 
  GitMerge, 
  Plus, 
  X, 
  Check, 
  AlertCircle,
  EyeOff,
  Eye
} from 'lucide-react';

interface ProjectManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  allDetectedProjects: string[];
  deletedProjects: string[];
  projectAliases: ProjectAlias[];
  onToggleDeleteProject: (projectName: string) => void;
  onRestoreAllProjects: () => void;
  onAddAlias: (from: string, to: string) => void;
  onRemoveAlias: (from: string) => void;
  issues: IssueRecord[];
}

export const ProjectManagerModal: React.FC<ProjectManagerModalProps> = ({
  isOpen,
  onClose,
  allDetectedProjects,
  deletedProjects,
  projectAliases,
  onToggleDeleteProject,
  onRestoreAllProjects,
  onAddAlias,
  onRemoveAlias,
  issues,
}) => {
  const [aliasFrom, setAliasFrom] = useState('');
  const [aliasTo, setAliasTo] = useState('');

  if (!isOpen) return null;

  const deletedSet = new Set(deletedProjects.map(p => p.toLowerCase()));

  // Calculate raw count per project
  const projectCounts = allDetectedProjects.reduce((acc, p) => {
    acc[p] = issues.filter(i => i.project === p).length;
    return acc;
  }, {} as Record<string, number>);

  const handleCreateAlias = () => {
    if (!aliasFrom.trim() || !aliasTo.trim()) return;
    if (aliasFrom.trim().toLowerCase() === aliasTo.trim().toLowerCase()) return;
    onAddAlias(aliasFrom.trim(), aliasTo.trim());
    setAliasFrom('');
    setAliasTo('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-900 sticky top-0 z-10">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-lg bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400">
              <FolderKanban className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Application & Project Manager</h2>
              <p className="text-xs text-slate-400">
                Manage tracked applications, delete unneeded projects, or merge project names.
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

        {/* Modal Content */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-xs">
          {/* Section 1: Detected Applications List */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-slate-200 text-sm">Detected Applications in Dataset</h3>
                <p className="text-slate-400 text-xs">
                  Click the trash icon to delete/hide any application. Deletions are saved permanently.
                </p>
              </div>

              {deletedProjects.length > 0 && (
                <button
                  onClick={onRestoreAllProjects}
                  className="flex items-center space-x-1 text-xs text-blue-400 hover:text-blue-300 px-2.5 py-1 rounded bg-blue-950/50 border border-blue-800/60"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Restore All ({deletedProjects.length})</span>
                </button>
              )}
            </div>

            <div className="bg-slate-950 border border-slate-800 rounded-xl divide-y divide-slate-800/80 overflow-hidden">
              {allDetectedProjects.length === 0 ? (
                <div className="p-4 text-center text-slate-500">
                  No projects detected in data. Please import an Excel or CSV file.
                </div>
              ) : (
                allDetectedProjects.map(proj => {
                  const isDeleted = deletedSet.has(proj.toLowerCase());
                  const count = projectCounts[proj] || 0;
                  return (
                    <div
                      key={proj}
                      className={`p-3 flex items-center justify-between transition-colors ${
                        isDeleted ? 'bg-slate-950/40 opacity-60' : 'hover:bg-slate-900/60'
                      }`}
                    >
                      <div className="flex items-center space-x-3">
                        <div
                          className={`w-2 h-2 rounded-full ${
                            isDeleted ? 'bg-red-500' : 'bg-emerald-400'
                          }`}
                        />
                        <div>
                          <span
                            className={`font-medium text-xs ${
                              isDeleted ? 'line-through text-slate-500' : 'text-slate-200'
                            }`}
                          >
                            {proj}
                          </span>
                          <span className="text-[11px] text-slate-500 ml-2">
                            ({count} tickets found)
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center space-x-2">
                        {isDeleted ? (
                          <button
                            onClick={() => onToggleDeleteProject(proj)}
                            className="flex items-center space-x-1 px-2 py-1 text-xs font-medium text-emerald-400 bg-emerald-950/50 border border-emerald-800/60 rounded hover:bg-emerald-900/50 transition"
                          >
                            <Eye className="w-3 h-3" />
                            <span>Restore</span>
                          </button>
                        ) : (
                          <button
                            onClick={() => onToggleDeleteProject(proj)}
                            className="flex items-center space-x-1 px-2 py-1 text-xs font-medium text-red-400 bg-red-950/40 border border-red-800/60 rounded hover:bg-red-900/40 transition"
                          >
                            <Trash2 className="w-3 h-3" />
                            <span>Delete App</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Section 2: Project Aliases & Merging */}
          <div className="space-y-3 pt-4 border-t border-slate-800">
            <div>
              <h3 className="font-semibold text-slate-200 text-sm flex items-center space-x-1.5">
                <GitMerge className="w-4 h-4 text-emerald-400" />
                <span>Merge Application Names (Aliases)</span>
              </h3>
              <p className="text-slate-400 text-xs">
                Automatically rename or merge an existing project name into a unified project name.
              </p>
            </div>

            {/* Active Aliases List */}
            {projectAliases.length > 0 && (
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 space-y-2">
                <span className="text-[11px] font-semibold text-slate-400 uppercase">Active Merges / Aliases:</span>
                <div className="space-y-1.5">
                  {projectAliases.map(alias => (
                    <div
                      key={alias.from}
                      className="flex items-center justify-between p-2 rounded-lg bg-slate-900 border border-slate-800 text-xs"
                    >
                      <div className="flex items-center space-x-2">
                        <span className="text-slate-400">"{alias.from}"</span>
                        <span className="text-emerald-400">&rarr; Merges into</span>
                        <span className="font-bold text-white">"{alias.to}"</span>
                      </div>
                      <button
                        onClick={() => onRemoveAlias(alias.from)}
                        className="text-slate-500 hover:text-red-400 p-1"
                        title="Remove merge rule"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Add New Merge Rule Form */}
            <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3.5 space-y-3">
              <span className="text-[11px] font-semibold text-slate-400">Add New Project Merge Rule:</span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-400 text-[11px] mb-1">Source Application Name</label>
                  <input
                    type="text"
                    placeholder="e.g. Mobile App - Android"
                    value={aliasFrom}
                    onChange={e => setAliasFrom(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-slate-200 text-xs focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 text-[11px] mb-1">Merge Target Name</label>
                  <input
                    type="text"
                    placeholder="e.g. Mobile Banking App"
                    value={aliasTo}
                    onChange={e => setAliasTo(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-slate-200 text-xs focus:border-blue-500 focus:outline-none"
                  />
                </div>
              </div>
              <button
                type="button"
                onClick={handleCreateAlias}
                disabled={!aliasFrom.trim() || !aliasTo.trim()}
                className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Apply Merge Rule</span>
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-900 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
