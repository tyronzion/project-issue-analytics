import React, { useRef } from 'react';
import { AppSettings, IssueRecord } from '../types';
import { 
  SlidersHorizontal, 
  Save, 
  RotateCcw, 
  Trash2, 
  Download, 
  Upload, 
  X, 
  CheckCircle,
  Database
} from 'lucide-react';
import { DEFAULT_SETTINGS, clearPersistedData } from '../utils/storage';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  issues: IssueRecord[];
  onUpdateSettings: (newSettings: AppSettings) => void;
  onResetDataToSample: () => void;
  onRestoreBackup: (backup: { settings: AppSettings; issues: IssueRecord[] }) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  issues,
  onUpdateSettings,
  onResetDataToSample,
  onRestoreBackup,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleExportBackupJSON = () => {
    const backup = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      settings,
      issues,
    };

    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Project_Analytics_Backup_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportBackupJSON = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const parsed = JSON.parse(text);
        if (parsed.settings && parsed.issues) {
          onRestoreBackup({ settings: parsed.settings, issues: parsed.issues });
          alert('Backup restored successfully!');
          onClose();
        } else {
          alert('Invalid backup file format.');
        }
      } catch (err) {
        alert('Failed to read JSON backup file.');
      }
    };
    reader.readAsText(file);
  };

  const handleClearAll = () => {
    if (window.confirm('Clear all stored datasets and reset settings to default?')) {
      clearPersistedData();
      onUpdateSettings(DEFAULT_SETTINGS);
      onResetDataToSample();
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-900 sticky top-0 z-10">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300">
              <SlidersHorizontal className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Application Settings & Data Persistence</h2>
              <p className="text-xs text-slate-400">
                All formula configurations and project deletions are saved permanently in browser storage.
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

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-xs">
          {/* Storage Status */}
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-2">
            <div className="flex items-center space-x-2 text-emerald-400 font-semibold">
              <CheckCircle className="w-4 h-4" />
              <span>Permanent Local Storage Active</span>
            </div>
            <p className="text-slate-400 leading-relaxed">
              Your customized formulas, status definitions, deleted projects list ({settings.deletedProjects.length} deleted), and merged aliases ({settings.projectAliases.length} rules) persist automatically across browser sessions.
            </p>
          </div>

          {/* Backup & Restore */}
          <div className="space-y-3">
            <span className="font-semibold text-slate-300 text-sm block">Backup & Transfer</span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                onClick={handleExportBackupJSON}
                className="flex items-center justify-center space-x-2 p-3 bg-slate-950 border border-slate-800 hover:border-slate-700 rounded-xl text-slate-200 hover:text-white transition"
              >
                <Download className="w-4 h-4 text-blue-400" />
                <span>Export Backup (JSON)</span>
              </button>

              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json"
                  className="hidden"
                  onChange={e => {
                    if (e.target.files && e.target.files[0]) {
                      handleImportBackupJSON(e.target.files[0]);
                    }
                  }}
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full flex items-center justify-center space-x-2 p-3 bg-slate-950 border border-slate-800 hover:border-slate-700 rounded-xl text-slate-200 hover:text-white transition"
                >
                  <Upload className="w-4 h-4 text-emerald-400" />
                  <span>Restore Backup (JSON)</span>
                </button>
              </div>
            </div>
          </div>

          {/* Sample Data & Reset */}
          <div className="space-y-3 pt-3 border-t border-slate-800">
            <span className="font-semibold text-slate-300 text-sm block">Data Management</span>
            <div className="space-y-2">
              <button
                onClick={() => {
                  onResetDataToSample();
                  alert('Cleared loaded issues dataset.');
                }}
                className="w-full flex items-center justify-between p-3 bg-slate-950 border border-slate-800 hover:border-slate-700 rounded-xl text-slate-300 hover:text-white transition"
              >
                <div className="flex items-center space-x-2">
                  <Database className="w-4 h-4 text-blue-400" />
                  <span>Clear Loaded Issues Dataset</span>
                </div>
                <RotateCcw className="w-3.5 h-3.5" />
              </button>

              <button
                onClick={handleClearAll}
                className="w-full flex items-center justify-between p-3 bg-red-950/20 border border-red-900/40 hover:border-red-800 rounded-xl text-red-400 hover:text-red-300 transition"
              >
                <div className="flex items-center space-x-2">
                  <Trash2 className="w-4 h-4 text-red-400" />
                  <span>Clear All Cache & Reset Everything</span>
                </div>
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
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
