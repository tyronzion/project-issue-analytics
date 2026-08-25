import React from 'react';
import { AlertTriangle, Calendar, X, Filter, FolderKanban, LoaderCircle } from 'lucide-react';
import { DateFilter } from '../types';
import { getPresetDateRange } from '../utils/dateUtils';

interface DateRangeFilterBarProps {
  dateFilter: DateFilter;
  onChange: (filter: DateFilter) => void;
  projectOptions: string[];
  selectedProject: string;
  onProjectChange: (project: string) => void;
  selectedSeverity: string;
  onSeverityChange: (severity: string) => void;
  isDataLoading: boolean;
  totalFilteredCount: number;
  totalAllCount: number;
}

export const DateRangeFilterBar: React.FC<DateRangeFilterBarProps> = ({
  dateFilter,
  onChange,
  projectOptions,
  selectedProject,
  onProjectChange,
  selectedSeverity,
  onSeverityChange,
  isDataLoading,
  totalFilteredCount,
  totalAllCount,
}) => {
  const presets: { id: DateFilter['preset']; label: string }[] = [
    { id: 'all', label: 'All Time' },
    { id: 'today', label: 'Today' },
    { id: 'this_week', label: 'This Week' },
    { id: 'this_month', label: 'This Month' },
    { id: 'last_30_days', label: 'Last 30 Days' },
    { id: 'last_90_days', label: 'Last 90 Days' },
    { id: 'this_year', label: 'This Year' },
    { id: 'custom', label: 'Custom' },
  ];

  const handlePresetSelect = (preset: DateFilter['preset']) => {
    if (preset === 'custom') {
      onChange({ ...dateFilter, preset: 'custom' });
    } else {
      const { startDate, endDate } = getPresetDateRange(preset);
      onChange({ preset, startDate, endDate });
    }
  };

  const handleStartDateChange = (val: string) => {
    onChange({
      ...dateFilter,
      preset: 'custom',
      startDate: val,
    });
  };

  const handleEndDateChange = (val: string) => {
    onChange({
      ...dateFilter,
      preset: 'custom',
      endDate: val,
    });
  };

  const handleClear = () => {
    onChange({
      preset: 'all',
      startDate: '',
      endDate: '',
    });
  };

  const isFiltering = Boolean(dateFilter.startDate || dateFilter.endDate || dateFilter.preset !== 'all');

  return (
    <div className="bg-slate-900/90 border-b border-slate-800 backdrop-blur-sm px-4 py-3 sm:px-6">
      <div className="w-full flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        {/* Left: Presets */}
        <div className="flex items-center space-x-2 flex-wrap gap-y-2">
          <div className="flex items-center space-x-1.5 text-xs font-semibold text-slate-400 mr-1">
            <Calendar className="w-3.5 h-3.5 text-blue-600" />
            <span>Date Range:</span>
          </div>

          <div className="flex items-center gap-1 bg-slate-950 p-0.5 rounded-lg border border-slate-800 flex-wrap">
            {presets.map(p => {
              const active = dateFilter.preset === p.id;
              return (
                <button
                  key={p.id}
                  id={`preset-btn-${p.id}`}
                  onClick={() => handlePresetSelect(p.id)}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all ${
                    active
                      ? 'bg-blue-600 text-white shadow-sm shadow-blue-900/20'
                      : 'text-slate-500 hover:text-slate-200 hover:bg-slate-800'
                  }`}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Right: Custom Date Inputs & Filter Status Badge */}
        <div className="flex items-center space-x-3 flex-wrap gap-y-2">
          {isDataLoading && (
            <div className="flex items-center space-x-1.5 text-xs font-semibold text-blue-700 bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-200 shadow-sm">
              <LoaderCircle className="w-3.5 h-3.5 animate-spin" />
              <span>Loading data...</span>
            </div>
          )}

          <label className="flex items-center space-x-1.5 bg-slate-950 px-2.5 py-1 rounded-lg border border-slate-800 shadow-sm">
            <FolderKanban className="w-3 h-3 text-blue-600" />
            <span className="text-xs text-slate-400">Project:</span>
            <select
              id="filter-project"
              value={selectedProject}
              onChange={event => onProjectChange(event.target.value)}
              className="min-w-36 max-w-52 bg-transparent text-xs text-slate-200 focus:outline-none focus:text-blue-600 cursor-pointer"
            >
              <option value="">All Projects</option>
              {projectOptions.map(project => (
                <option key={project} value={project}>{project}</option>
              ))}
            </select>
          </label>

          <label className="flex items-center space-x-1.5 bg-slate-950 px-2.5 py-1 rounded-lg border border-slate-800 shadow-sm">
            <AlertTriangle className="w-3 h-3 text-blue-600" />
            <span className="text-xs text-slate-400">Severity:</span>
            <select
              id="filter-severity"
              value={selectedSeverity}
              onChange={event => onSeverityChange(event.target.value)}
              className="min-w-24 bg-transparent text-xs text-slate-200 focus:outline-none focus:text-blue-600 cursor-pointer"
            >
              <option value="">All Severities</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
              <option value="unclassified">Unclassified</option>
            </select>
          </label>

          <div className="flex items-center space-x-2 bg-slate-950 px-2.5 py-1 rounded-lg border border-slate-800 shadow-sm">
            <span className="text-xs text-slate-400">From:</span>
            <input
              type="date"
              id="filter-start-date"
              value={dateFilter.startDate}
              onChange={e => handleStartDateChange(e.target.value)}
              className="bg-transparent text-xs text-slate-200 font-mono focus:outline-none focus:text-blue-600 cursor-pointer"
            />
            <span className="text-xs text-slate-600">to</span>
            <input
              type="date"
              id="filter-end-date"
              value={dateFilter.endDate}
              onChange={e => handleEndDateChange(e.target.value)}
              className="bg-transparent text-xs text-slate-200 font-mono focus:outline-none focus:text-blue-600 cursor-pointer"
            />
          </div>

          {isFiltering && (
            <button
              id="btn-clear-date-filter"
              onClick={handleClear}
              className="flex items-center space-x-1 px-2 py-1 text-xs font-semibold text-amber-700 bg-amber-100 border border-amber-300 rounded-md hover:bg-amber-200 transition"
              title="Reset date filter"
            >
              <X className="w-3 h-3" />
              <span>Reset</span>
            </button>
          )}

          <div className="flex items-center space-x-1.5 text-xs text-slate-400 bg-slate-800/80 px-2.5 py-1 rounded-lg border border-slate-700/50 shadow-sm">
            <Filter className="w-3 h-3 text-blue-600" />
            <span>
              Matching: <strong className="text-slate-100">{totalFilteredCount}</strong> / {totalAllCount}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
