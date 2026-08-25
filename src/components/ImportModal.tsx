import React, { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import { FormulaConfig, ColumnMapping, IssueRecord } from '../types';
import { parseExcelOrCsvFile } from '../utils/excelParser';
import { 
  Upload, 
  FileSpreadsheet, 
  CheckCircle, 
  AlertCircle, 
  X, 
  Download, 
  ArrowRight, 
  Sparkles,
  RefreshCw,
  Trash2
} from 'lucide-react';

interface ImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  formulaConfig: FormulaConfig;
  onImportComplete: (rows: IssueRecord[], mode: 'replace' | 'append' | 'deduplicate') => void;
  existingIssuesCount?: number;
  onClearCurrentData?: () => void;
}

export const ImportModal: React.FC<ImportModalProps> = ({
  isOpen,
  onClose,
  formulaConfig,
  onImportComplete,
  existingIssuesCount = 0,
  onClearCurrentData,
}) => {
  const [dragActive, setDragActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [parsedData, setParsedData] = useState<{
    rows: IssueRecord[];
    headers: string[];
    mapping: ColumnMapping;
    fileName: string;
  } | null>(null);
  const [importMode, setImportMode] = useState<'replace' | 'deduplicate' | 'append'>('replace');

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFile = async (file: File) => {
    setError(null);
    setLoading(true);
    try {
      const result = await parseExcelOrCsvFile(file, formulaConfig);
      if (result.rows.length === 0) {
        throw new Error('The selected file has no data rows.');
      }
      setParsedData({
        rows: result.rows,
        headers: result.detectedHeaders,
        mapping: result.autoMapping,
        fileName: file.name,
      });
    } catch (err: any) {
      console.error('File parse error:', err);
      setError(err?.message || 'Failed to parse Excel/CSV file. Please check file format.');
    } finally {
      setLoading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleDownloadSample = () => {
    const sampleHeaders = [
      'Issue key',
      'Project',
      'Summary',
      'Created',
      'Status Category change',
      'Status',
      'Issue Type',
      'Priority',
      'Assignee'
    ];
    const sampleRows = [
      ['PROJ-101', 'Mobile App', '[IOS] FaceID login fails on iOS 18', '2026-08-01', '2026-08-05', 'Done', 'Bug', 'High', 'Sarah'],
      ['PROJ-102', 'Mobile App', '[AOS] Push notification silent on Android 14', '2026-08-03', '2026-08-08', 'Done', 'Bug', 'Medium', 'Alex'],
      ['PROJ-103', 'Mobile App', '[IOS] Bluetooth accessory disconnect', '2026-08-10', '', 'In Progress', 'Bug', 'High', 'Sarah'],
      ['PROJ-104', 'E-Commerce', 'Checkout coupon discount calculation error', '2026-08-02', '2026-08-04', 'Done', 'Bug', 'Critical', 'Elena'],
      ['PROJ-105', 'E-Commerce', '[AOS] Google Pay button clipped', '2026-08-12', '', 'Open', 'Bug', 'Medium', 'Marcus'],
      ['PROJ-106', 'E-Commerce', 'Retired old gift card promotional endpoint', '2026-07-25', '2026-08-01', 'Cancelled', 'Task', 'Low', 'David'],
    ];

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([sampleHeaders, ...sampleRows]);
    XLSX.utils.book_append_sheet(wb, ws, 'Sample_Issues');
    XLSX.writeFile(wb, 'Sample_Project_Issues_Template.xlsx');
  };

  const handleConfirmImport = () => {
    if (!parsedData) return;
    onImportComplete(parsedData.rows, importMode);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-900 sticky top-0 z-10">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-lg bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400">
              <Upload className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Import Issue Data</h2>
              <p className="text-xs text-slate-400">
                Upload Excel (.xlsx, .xls) or CSV exports from Jira, GitHub, or any tracker.
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
          {!parsedData ? (
            <div className="space-y-4">
              {/* Dropzone */}
              <div
                onDragOver={e => {
                  e.preventDefault();
                  setDragActive(true);
                }}
                onDragLeave={() => setDragActive(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all flex flex-col items-center justify-center space-y-3 ${
                  dragActive
                    ? 'border-blue-500 bg-blue-500/10'
                    : 'border-slate-700 bg-slate-950/60 hover:border-slate-600 hover:bg-slate-950'
                }`}
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

                <div className="w-12 h-12 rounded-xl bg-blue-500/20 border border-blue-500/30 flex items-center justify-center text-blue-400 shadow-inner">
                  {loading ? (
                    <RefreshCw className="w-6 h-6 animate-spin text-blue-400" />
                  ) : (
                    <FileSpreadsheet className="w-6 h-6" />
                  )}
                </div>

                <div>
                  <p className="font-semibold text-slate-200 text-sm">
                    {loading ? 'Processing Excel File...' : 'Click to browse or drag & drop file here'}
                  </p>
                  <p className="text-slate-400 text-xs mt-1">
                    Supports Microsoft Excel (.xlsx, .xls) and Comma-Separated Values (.csv)
                  </p>
                </div>
              </div>

              {error && (
                <div className="p-3 bg-red-950/60 border border-red-800 rounded-xl text-red-300 text-xs flex items-center space-x-2">
                  <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {/* Existing Data Banner */}
              {existingIssuesCount > 0 && onClearCurrentData && (
                <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl flex items-center justify-between gap-3 text-xs">
                  <div className="flex items-center space-x-2 text-slate-300">
                    <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
                    <span>
                      Workspace currently holds <strong>{existingIssuesCount} issue records</strong>. Importing in <em>"Replace Dataset"</em> mode will overwrite them so numbers do not add up.
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={onClearCurrentData}
                    className="flex items-center space-x-1 px-2.5 py-1 text-[11px] font-medium text-red-300 hover:text-white bg-red-950/40 hover:bg-red-900/60 border border-red-800/60 rounded-lg transition shrink-0"
                  >
                    <Trash2 className="w-3 h-3 text-red-400" />
                    <span>Delete All Existing Data Now</span>
                  </button>
                </div>
              )}

              {/* Sample Template Download */}
              <div className="flex items-center justify-between p-3.5 bg-slate-950 border border-slate-800 rounded-xl">
                <div className="flex items-center space-x-2 text-slate-300">
                  <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                  <span>Need a formatted Excel template with [IOS] / [AOS] keywords and date columns?</span>
                </div>
                <button
                  type="button"
                  onClick={handleDownloadSample}
                  className="flex items-center space-x-1 px-3 py-1.5 text-xs font-medium text-emerald-400 bg-emerald-950/60 border border-emerald-800/80 rounded-lg hover:bg-emerald-900/60 transition"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download Sample .xlsx</span>
                </button>
              </div>
            </div>
          ) : (
            /* Parsed File Preview */
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3.5 bg-emerald-950/40 border border-emerald-800/60 rounded-xl text-emerald-300">
                <div className="flex items-center space-x-2">
                  <CheckCircle className="w-4 h-4 text-emerald-400" />
                  <span className="font-semibold">Successfully Parsed: {parsedData.fileName}</span>
                  <span className="text-emerald-400/80">({parsedData.rows.length} rows detected)</span>
                </div>
                <button
                  onClick={() => setParsedData(null)}
                  className="text-xs text-emerald-400 hover:text-white underline"
                >
                  Choose different file
                </button>
              </div>

              {/* Detected Column Mappings */}
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-2">
                <span className="font-semibold text-slate-300">Detected Column Mappings:</span>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs pt-1">
                  <div className="bg-slate-900 p-2 rounded border border-slate-800">
                    <span className="text-slate-500 block text-[10px]">Project Column</span>
                    <span className="font-bold text-slate-200">{parsedData.mapping.projectColumn || 'Not mapped'}</span>
                  </div>
                  <div className="bg-slate-900 p-2 rounded border border-slate-800">
                    <span className="text-slate-500 block text-[10px]">Summary Column</span>
                    <span className="font-bold text-slate-200">{parsedData.mapping.summaryColumn || 'Not mapped'}</span>
                  </div>
                  <div className="bg-slate-900 p-2 rounded border border-slate-800">
                    <span className="text-slate-500 block text-[10px]">Created Date Column</span>
                    <span className="font-bold text-slate-200">{parsedData.mapping.createdColumn || 'Not mapped'}</span>
                  </div>
                  <div className="bg-slate-900 p-2 rounded border border-slate-800">
                    <span className="text-slate-500 block text-[10px]">Status Category Change</span>
                    <span className="font-bold text-slate-200">{parsedData.mapping.statusChangeColumn || 'Not mapped'}</span>
                  </div>
                  <div className="bg-slate-900 p-2 rounded border border-slate-800">
                    <span className="text-slate-500 block text-[10px]">Status Column</span>
                    <span className="font-bold text-slate-200">{parsedData.mapping.statusColumn || 'Not mapped'}</span>
                  </div>
                  <div className="bg-slate-900 p-2 rounded border border-slate-800">
                    <span className="text-slate-500 block text-[10px]">Issue Key Column</span>
                    <span className="font-bold text-slate-200">{parsedData.mapping.keyColumn || 'Not mapped'}</span>
                  </div>
                </div>
              </div>

              {/* Import Mode Options */}
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-2">
                <span className="font-semibold text-slate-300">Choose Import Action:</span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
                  <label
                    className={`flex items-start p-3 rounded-lg border cursor-pointer transition ${
                      importMode === 'replace'
                        ? 'bg-blue-950/40 border-blue-600 text-white'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:bg-slate-850'
                    }`}
                  >
                    <input
                      type="radio"
                      name="importMode"
                      checked={importMode === 'replace'}
                      onChange={() => setImportMode('replace')}
                      className="mt-0.5 mr-2"
                    />
                    <div>
                      <span className="font-bold text-xs block text-slate-200">Replace Dataset</span>
                      <span className="text-[11px] text-slate-400">Clear existing data and load this new file.</span>
                    </div>
                  </label>

                  <label
                    className={`flex items-start p-3 rounded-lg border cursor-pointer transition ${
                      importMode === 'deduplicate'
                        ? 'bg-blue-950/40 border-blue-600 text-white'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:bg-slate-850'
                    }`}
                  >
                    <input
                      type="radio"
                      name="importMode"
                      checked={importMode === 'deduplicate'}
                      onChange={() => setImportMode('deduplicate')}
                      className="mt-0.5 mr-2"
                    />
                    <div>
                      <span className="font-bold text-xs block text-slate-200">Merge & Deduplicate</span>
                      <span className="text-[11px] text-slate-400">Match by Issue Key, update existing, add new.</span>
                    </div>
                  </label>

                  <label
                    className={`flex items-start p-3 rounded-lg border cursor-pointer transition ${
                      importMode === 'append'
                        ? 'bg-blue-950/40 border-blue-600 text-white'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:bg-slate-850'
                    }`}
                  >
                    <input
                      type="radio"
                      name="importMode"
                      checked={importMode === 'append'}
                      onChange={() => setImportMode('append')}
                      className="mt-0.5 mr-2"
                    />
                    <div>
                      <span className="font-bold text-xs block text-slate-200">Append All</span>
                      <span className="text-[11px] text-slate-400">Add all rows to existing dataset.</span>
                    </div>
                  </label>
                </div>
              </div>

              {/* Sample Rows Preview */}
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 overflow-x-auto">
                <span className="text-[11px] font-semibold text-slate-400 mb-2 block">First 3 Rows Preview:</span>
                <table className="w-full text-left text-[11px] divide-y divide-slate-800">
                  <thead>
                    <tr className="text-slate-500">
                      <th className="p-1.5">Key</th>
                      <th className="p-1.5">Project</th>
                      <th className="p-1.5">Summary</th>
                      <th className="p-1.5">Tag</th>
                      <th className="p-1.5">Created</th>
                      <th className="p-1.5">Status Change</th>
                      <th className="p-1.5">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-850">
                    {parsedData.rows.slice(0, 3).map((r, i) => (
                      <tr key={i} className="text-slate-300">
                        <td className="p-1.5 font-mono text-blue-400">{r.id}</td>
                        <td className="p-1.5 font-medium">{r.project}</td>
                        <td className="p-1.5 truncate max-w-[200px]">{r.summary}</td>
                        <td className="p-1.5 font-bold text-sky-400">{r.platformTag}</td>
                        <td className="p-1.5 font-mono">{r.created || '—'}</td>
                        <td className="p-1.5 font-mono">{r.statusCategoryChange || '—'}</td>
                        <td className="p-1.5">{r.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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
          {parsedData && (
            <button
              onClick={handleConfirmImport}
              className="flex items-center space-x-1.5 px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition shadow-md shadow-blue-900/30"
            >
              <span>Confirm & Load {parsedData.rows.length} Records</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
