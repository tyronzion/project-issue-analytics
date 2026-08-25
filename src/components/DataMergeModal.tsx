import React, { useState, useRef } from 'react';
import { FormulaConfig, IssueRecord } from '../types';
import { parseExcelOrCsvFile, mergeIssueDatasets } from '../utils/excelParser';
import { 
  GitMerge, 
  Upload, 
  FileSpreadsheet, 
  CheckCircle, 
  AlertCircle, 
  X, 
  ArrowRight,
  Database,
  Layers
} from 'lucide-react';

interface DataMergeModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentIssues: IssueRecord[];
  formulaConfig: FormulaConfig;
  onMergeComplete: (merged: IssueRecord[]) => void;
}

export const DataMergeModal: React.FC<DataMergeModalProps> = ({
  isOpen,
  onClose,
  currentIssues,
  formulaConfig,
  onMergeComplete,
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [incomingRows, setIncomingRows] = useState<IssueRecord[] | null>(null);
  const [incomingFileName, setIncomingFileName] = useState('');
  const [strategy, setStrategy] = useState<'deduplicate' | 'append'>('deduplicate');
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFile = async (file: File) => {
    setError(null);
    setLoading(true);
    try {
      const result = await parseExcelOrCsvFile(file, formulaConfig);
      if (result.rows.length === 0) {
        throw new Error('Selected file contains no data rows to merge.');
      }
      setIncomingRows(result.rows);
      setIncomingFileName(file.name);
    } catch (err: any) {
      console.error('Merge file error:', err);
      setError(err?.message || 'Failed to read dataset for merge.');
    } finally {
      setLoading(false);
    }
  };

  // Compute conflict & merge statistics
  const currentKeySet = new Set(currentIssues.map(i => i.id));
  const incomingMatches = incomingRows ? incomingRows.filter(r => currentKeySet.has(r.id)).length : 0;
  const incomingNew = incomingRows ? incomingRows.length - incomingMatches : 0;

  const handleExecuteMerge = () => {
    if (!incomingRows) return;
    const { merged } = mergeIssueDatasets(currentIssues, incomingRows, strategy);
    onMergeComplete(merged);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-900 sticky top-0 z-10">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-lg bg-emerald-600/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <GitMerge className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Merge Additional Dataset</h2>
              <p className="text-xs text-slate-400">
                Combine secondary Excel / CSV files with current {currentIssues.length} records.
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
          {!incomingRows ? (
            <div className="space-y-4">
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-slate-700 bg-slate-950/60 hover:border-emerald-500 hover:bg-slate-950 rounded-2xl p-8 text-center cursor-pointer transition-all flex flex-col items-center justify-center space-y-3"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx, .xls, .csv"
                  className="hidden"
                  onChange={e => {
                    if (e.target.files && e.target.files[0]) {
                      handleFile(e.target.files[0]);
                    }
                  }}
                />

                <div className="w-12 h-12 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                  <FileSpreadsheet className="w-6 h-6" />
                </div>

                <div>
                  <p className="font-semibold text-slate-200 text-sm">
                    {loading ? 'Reading File...' : 'Select secondary file to merge'}
                  </p>
                  <p className="text-slate-400 text-xs mt-1">
                    Upload another Jira export, sprint backlog, or partner dataset
                  </p>
                </div>
              </div>

              {error && (
                <div className="p-3 bg-red-950/60 border border-red-800 rounded-xl text-red-300 text-xs flex items-center space-x-2">
                  <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                  <span>{error}</span>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {/* File Info */}
              <div className="flex items-center justify-between p-3.5 bg-emerald-950/40 border border-emerald-800/60 rounded-xl text-emerald-300">
                <div className="flex items-center space-x-2">
                  <CheckCircle className="w-4 h-4 text-emerald-400" />
                  <span className="font-semibold">Ready to Merge: {incomingFileName}</span>
                  <span>({incomingRows.length} rows)</span>
                </div>
                <button
                  onClick={() => setIncomingRows(null)}
                  className="text-xs text-emerald-400 hover:text-white underline"
                >
                  Change file
                </button>
              </div>

              {/* Merge Comparison Metrics */}
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 text-center">
                  <span className="text-[10px] text-slate-400 uppercase font-semibold">Current Dataset</span>
                  <p className="text-lg font-bold text-slate-200 mt-1">{currentIssues.length}</p>
                </div>
                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 text-center">
                  <span className="text-[10px] text-sky-400 uppercase font-semibold">Overlapping / Updates</span>
                  <p className="text-lg font-bold text-sky-300 mt-1">{incomingMatches}</p>
                </div>
                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 text-center">
                  <span className="text-[10px] text-emerald-400 uppercase font-semibold">New Net Records</span>
                  <p className="text-lg font-bold text-emerald-400 mt-1">+{incomingNew}</p>
                </div>
              </div>

              {/* Strategy Selection */}
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-2">
                <span className="font-semibold text-slate-300">Merge Strategy:</span>
                <div className="space-y-2 pt-1">
                  <label
                    className={`flex items-start p-3 rounded-lg border cursor-pointer transition ${
                      strategy === 'deduplicate'
                        ? 'bg-emerald-950/40 border-emerald-600 text-white'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:bg-slate-850'
                    }`}
                  >
                    <input
                      type="radio"
                      name="mergeStrategy"
                      checked={strategy === 'deduplicate'}
                      onChange={() => setStrategy('deduplicate')}
                      className="mt-0.5 mr-2"
                    />
                    <div>
                      <span className="font-bold text-xs block text-slate-200">
                        Smart Key Deduplication (Recommended)
                      </span>
                      <span className="text-[11px] text-slate-400">
                        Matches by Issue Key (e.g. PROJ-101). Existing tickets are updated with newest status and resolution dates; new tickets are added.
                      </span>
                    </div>
                  </label>

                  <label
                    className={`flex items-start p-3 rounded-lg border cursor-pointer transition ${
                      strategy === 'append'
                        ? 'bg-emerald-950/40 border-emerald-600 text-white'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:bg-slate-850'
                    }`}
                  >
                    <input
                      type="radio"
                      name="mergeStrategy"
                      checked={strategy === 'append'}
                      onChange={() => setStrategy('append')}
                      className="mt-0.5 mr-2"
                    />
                    <div>
                      <span className="font-bold text-xs block text-slate-200">Force Append All Rows</span>
                      <span className="text-[11px] text-slate-400">
                        Appends all rows without deduplication (allows duplicate keys if distinct exports are used).
                      </span>
                    </div>
                  </label>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-900 flex justify-end space-x-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-slate-300 hover:text-white rounded-lg hover:bg-slate-800 transition"
          >
            Cancel
          </button>
          {incomingRows && (
            <button
              onClick={handleExecuteMerge}
              className="flex items-center space-x-1.5 px-4 py-2 text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg transition shadow-md shadow-emerald-900/30"
            >
              <GitMerge className="w-3.5 h-3.5" />
              <span>Execute Merge</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
