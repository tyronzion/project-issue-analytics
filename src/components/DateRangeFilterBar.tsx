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

const PRESETS: { id: DateFilter['preset']; label: string }[] = [
  { id: 'all', label: 'All Time' },
  { id: 'today', label: 'Today' },
  { id: 'this_week', label: 'This Week' },
  { id: 'this_month', label: 'This Month' },
  { id: 'last_7_days', label: 'Last 7 Days' },
  { id: 'last_30_days', label: 'Last 30 Days' },
  { id: 'last_90_days', label: 'Last 90 Days' },
  { id: 'this_year', label: 'This Year' },
  { id: 'custom', label: 'Custom Range…' },
];

const chipClass =
  'flex items-center gap-1.5 bg-slate-950 px-2.5 py-1.5 rounded-lg border border-slate-800 shadow-sm';

/**
 * The single, global filter bar. Every page (metrics, seal, dashboard, issues, dependabots)
 * reads from these filters, so pages don't repeat them.
 */
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
  const handlePresetSelect = (preset: DateFilter['preset']) => {
    if (preset === 'custom') {
      onChange({ ...dateFilter, preset: 'custom' });
    } else {
      const { startDate, endDate } = getPresetDateRange(preset);
      onChange({ preset, startDate, endDate });
    }
  };

  const isDateFiltering = Boolean(dateFilter.startDate || dateFilter.endDate || dateFilter.preset !== 'all');
  const isFiltering = isDateFiltering || Boolean(selectedProject) || Boolean(selectedSeverity);

  const handleResetAll = () => {
    onChange({ preset: 'all', startDate: '', endDate: '' });
    onProjectChange('');
    onSeverityChange('');
  };

  return (
    <div className="bg-slate-900/90 border-b border-slate-800 backdrop-blur-sm px-4 py-3 sm:px-6">
      <div className="w-full flex flex-wrap items-center gap-2">
        <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 mr-1">
          <Filter className="w-3.5 h-3.5 text-blue-600" />
          Filters
        </span>

        {/* Date range */}
        <label className={chipClass}>
          <Calendar className="w-3 h-3 text-blue-600" />
          <span className="text-xs text-slate-400">Date:</span>
          <select
            id="filter-date-preset"
            value={dateFilter.preset}
            onChange={e => handlePresetSelect(e.target.value as DateFilter['preset'])}
            className="bg-transparent text-xs text-slate-200 focus:outline-none cursor-pointer"
          >
            {PRESETS.map(p => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
          </select>
        </label>

        {dateFilter.preset === 'custom' && (
          <div className={chipClass}>
            <input
              type="date"
              id="filter-start-date"
              aria-label="From date"
              value={dateFilter.startDate}
              onChange={e => onChange({ ...dateFilter, preset: 'custom', startDate: e.target.value })}
              className="bg-transparent text-xs text-slate-200 font-mono focus:outline-none cursor-pointer"
            />
            <span className="text-xs text-slate-500">to</span>
            <input
              type="date"
              id="filter-end-date"
              aria-label="To date"
              value={dateFilter.endDate}
              onChange={e => onChange({ ...dateFilter, preset: 'custom', endDate: e.target.value })}
              className="bg-transparent text-xs text-slate-200 font-mono focus:outline-none cursor-pointer"
            />
          </div>
        )}

        {/* Project: type to search, or pick from the list */}
        <label className={chipClass}>
          <FolderKanban className="w-3 h-3 text-blue-600" />
          <span className="text-xs text-slate-400">Project:</span>
          <input
            id="filter-project"
            list="filter-project-options"
            value={selectedProject}
            onChange={e => onProjectChange(e.target.value)}
            placeholder="All projects (type to search)"
            className="w-48 bg-transparent text-xs text-slate-200 placeholder-slate-500 focus:outline-none"
          />
          {selectedProject && (
            <button
              type="button"
              onClick={() => onProjectChange('')}
              className="text-slate-400 hover:text-slate-100"
              title="Clear project"
              aria-label="Clear project"
            >
              <X className="w-3 h-3" />
            </button>
          )}
          <datalist id="filter-project-options">
            {projectOptions.map(project => (
              <option key={project} value={project} />
            ))}
          </datalist>
        </label>

        {/* Severity */}
        <label className={chipClass}>
          <AlertTriangle className="w-3 h-3 text-blue-600" />
          <span className="text-xs text-slate-400">Severity:</span>
          <select
            id="filter-severity"
            value={selectedSeverity}
            onChange={event => onSeverityChange(event.target.value)}
            className="bg-transparent text-xs text-slate-200 focus:outline-none cursor-pointer"
          >
            <option value="">All</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
            <option value="unclassified">Unclassified</option>
          </select>
        </label>

        {isFiltering && (
          <button
            id="btn-clear-date-filter"
            onClick={handleResetAll}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-amber-700 bg-amber-100 border border-amber-300 rounded-lg hover:bg-amber-200 transition"
            title="Clear date, project and severity filters"
          >
            <X className="w-3 h-3" />
            <span>Reset all</span>
          </button>
        )}

        <div className="ml-auto flex items-center gap-2">
          {isDataLoading && (
            <div className="flex items-center gap-1.5 text-xs font-semibold text-blue-700 bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-200 shadow-sm">
              <LoaderCircle className="w-3.5 h-3.5 animate-spin" />
              <span>Loading data...</span>
            </div>
          )}
          <span className="text-xs text-slate-400">
            Showing <strong className="text-slate-100">{totalFilteredCount}</strong> of {totalAllCount} issues
          </span>
        </div>
      </div>
    </div>
  );
};
