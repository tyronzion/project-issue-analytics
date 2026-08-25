import React, { useState, useMemo } from 'react';
import { IssueRecord, FormulaConfig, DateFilter } from '../types';
import { 
  Search, 
  Filter, 
  Apple, 
  Smartphone, 
  Monitor, 
  Calendar, 
  CheckCircle, 
  Clock, 
  XCircle, 
  Tag, 
  Download,
  AlertTriangle,
  Trash2
} from 'lucide-react';
import { isIssueSecurityOverdue } from '../utils/metricsEngine';

interface IssuesTableViewProps {
  issues: IssueRecord[];
  formulaConfig: FormulaConfig;
  dateFilter: DateFilter;
  selectedProject?: string;
  selectedPlatform?: string;
  onClearProjectFilter: () => void;
  onExportCsv: () => void;
  onOpenClearData?: () => void;
}

export const IssuesTableView: React.FC<IssuesTableViewProps> = ({
  issues,
  formulaConfig,
  dateFilter,
  selectedProject = '',
  selectedPlatform = 'ALL',
  onClearProjectFilter,
  onExportCsv,
  onOpenClearData,
}) => {
  const [search, setSearch] = useState('');
  const [projectFilter, setProjectFilter] = useState(selectedProject);
  const [platformFilter, setPlatformFilter] = useState(selectedPlatform);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const getStatusCategory = (status: string): 'DONE' | 'CANCELLED' | 'RISK_ACCEPTED' | 'OUTSTANDING' => {
    const normalized = (status || '').trim().toLowerCase();
    if (formulaConfig.doneStatuses.some(d => d.toLowerCase() === normalized)) return 'DONE';
    if (formulaConfig.cancelledStatuses.some(c => c.toLowerCase() === normalized)) return 'CANCELLED';
    if ((formulaConfig.riskAcceptedStatuses || ['Risk Accepted']).some(r => r.toLowerCase() === normalized)) return 'RISK_ACCEPTED';
    return 'OUTSTANDING';
  };

  // Sync incoming props if changed
  React.useEffect(() => {
    if (selectedProject) setProjectFilter(selectedProject);
  }, [selectedProject]);

  React.useEffect(() => {
    if (selectedPlatform) setPlatformFilter(selectedPlatform);
  }, [selectedPlatform]);

  // Extract distinct projects and statuses
  const distinctProjects = useMemo(() => {
    const set = new Set<string>();
    issues.forEach(i => {
      if (i.project) set.add(i.project);
    });
    if (projectFilter && projectFilter !== 'ALL') {
      set.add(projectFilter);
    }
    return Array.from(set).sort();
  }, [issues, projectFilter]);

  // Filter issues
  const filtered = useMemo(() => {
    return issues.filter(issue => {
      // Search
      if (search) {
        const q = search.toLowerCase();
        const match = 
          issue.id.toLowerCase().includes(q) ||
          issue.summary.toLowerCase().includes(q) ||
          issue.project.toLowerCase().includes(q) ||
          (issue.assignee && issue.assignee.toLowerCase().includes(q));
        if (!match) return false;
      }

      // Project
      if (projectFilter && projectFilter !== 'ALL' && issue.project !== projectFilter) {
        return false;
      }

      // Platform tag
      if (platformFilter !== 'ALL') {
        if (platformFilter === 'IOS' && issue.platformTag !== 'IOS') return false;
        if (platformFilter === 'AOS' && issue.platformTag !== 'AOS') return false;
        if (platformFilter === 'GENERAL' && issue.platformTag !== 'GENERAL') return false;
      }

      // Status
      if (statusFilter === 'SECURITY_OVERDUE') {
        if (!isIssueSecurityOverdue(issue, formulaConfig, dateFilter)) return false;
      } else if (statusFilter !== 'ALL' && getStatusCategory(issue.status) !== statusFilter) {
        return false;
      }

      return true;
    });
  }, [issues, search, projectFilter, platformFilter, statusFilter, formulaConfig, dateFilter]);

  const totalPages = Math.ceil(filtered.length / pageSize) || 1;
  const paginatedIssues = filtered.slice((page - 1) * pageSize, page * pageSize);
  const kpiTotals = useMemo(() => {
    const resolved = filtered.filter(issue => getStatusCategory(issue.status) === 'DONE').length;
    const outstanding = filtered.filter(issue => getStatusCategory(issue.status) === 'OUTSTANDING').length;
    const riskAccepted = filtered.filter(issue => getStatusCategory(issue.status) === 'RISK_ACCEPTED').length;
    const securityOverdue = filtered.filter(issue => isIssueSecurityOverdue(issue, formulaConfig, dateFilter)).length;

    return {
      total: filtered.length,
      resolved,
      outstanding,
      riskAccepted,
      securityOverdue,
    };
  }, [filtered, formulaConfig, dateFilter]);

  const getStatusBadge = (status: string) => {
    const category = getStatusCategory(status);
    if (category === 'DONE') {
      return (
        <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-950/60 text-emerald-400 border border-emerald-800/60">
          <CheckCircle className="w-3 h-3" />
          <span>{status}</span>
        </span>
      );
    }
    if (category === 'CANCELLED') {
      return (
        <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[11px] font-medium bg-red-950/60 text-red-400 border border-red-800/60">
          <XCircle className="w-3 h-3" />
          <span>{status}</span>
        </span>
      );
    }
    if (category === 'RISK_ACCEPTED') {
      return (
        <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[11px] font-medium bg-indigo-950/60 text-indigo-300 border border-indigo-800/60">
          <AlertTriangle className="w-3 h-3" />
          <span>{status}</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[11px] font-medium bg-amber-950/60 text-amber-400 border border-amber-800/60">
        <Clock className="w-3 h-3" />
        <span>{status}</span>
      </span>
    );
  };

  const getPlatformBadge = (tag: string | undefined) => {
    if (tag === 'IOS') {
      return (
        <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-sky-950/80 text-sky-300 border border-sky-800">
          <Apple className="w-3 h-3 text-sky-400" />
          <span>[IOS]</span>
        </span>
      );
    }
    if (tag === 'AOS') {
      return (
        <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-950/80 text-emerald-300 border border-emerald-800">
          <Smartphone className="w-3 h-3 text-emerald-400" />
          <span>[AOS]</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[11px] font-normal bg-slate-800 text-slate-400 border border-slate-700">
        <Monitor className="w-3 h-3" />
        <span>General</span>
      </span>
    );
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl shadow-sm overflow-hidden space-y-4">
      <section className="issues-kpi-grid px-4 pt-4" aria-label="All issues KPI scorecards">
        <article className="issues-kpi-card">
          <div>
            <span>Total Issues</span>
            <small>Current filtered records</small>
          </div>
          <strong>{kpiTotals.total}</strong>
        </article>
        <article className="issues-kpi-card">
          <div>
            <span>Resolved Issues</span>
            <small>Done status</small>
          </div>
          <strong>{kpiTotals.resolved}</strong>
        </article>
        <article className="issues-kpi-card">
          <div>
            <span>Outstanding Issues</span>
            <small>Not done, cancelled, or risk accepted</small>
          </div>
          <strong>{kpiTotals.outstanding}</strong>
        </article>
        <article className="issues-kpi-card">
          <div>
            <span>Risk Accepted</span>
            <small>Excluded from backlog</small>
          </div>
          <strong>{kpiTotals.riskAccepted}</strong>
        </article>
        <article className="issues-kpi-card">
          <div>
            <span>Overdue Issues</span>
            <small>Due date before today</small>
          </div>
          <strong>{kpiTotals.securityOverdue}</strong>
        </article>
      </section>

      {/* Header & Filter Controls Bar */}
      <div className="p-4 border-b border-slate-800 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center space-x-2">
            <h2 className="font-semibold text-base text-white">All Filtered Issues & Backlog Records</h2>
            <span className="text-xs text-slate-400">
              ({filtered.length} of {issues.length} matching)
            </span>
          </div>

          <div className="flex items-center space-x-2">
            {onOpenClearData && issues.length > 0 && (
              <button
                onClick={onOpenClearData}
                className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-medium text-red-300 hover:text-white bg-red-950/40 hover:bg-red-900/70 rounded-lg border border-red-800/60 transition"
                title="Delete all issues to start fresh before new import"
              >
                <Trash2 className="w-3.5 h-3.5 text-red-400" />
                <span>Delete All Data</span>
              </button>
            )}

            <button
              onClick={onExportCsv}
              className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-lg border border-slate-700 transition"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export CSV</span>
            </button>
          </div>
        </div>

        {/* Filter Toolbar */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2 pt-2">
          {/* Search Box */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search key, summary, assignee..."
              value={search}
              onChange={e => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* Project Filter */}
          <select
            value={projectFilter}
            onChange={e => {
              setProjectFilter(e.target.value);
              setPage(1);
            }}
            className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
          >
            <option value="ALL">All Projects / Applications</option>
            {distinctProjects.map(p => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>

          {/* Platform Tag Filter */}
          <select
            value={platformFilter}
            onChange={e => {
              setPlatformFilter(e.target.value);
              setPage(1);
            }}
            className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
          >
            <option value="ALL">All Platforms (iOS / AOS / General)</option>
            <option value="IOS">Apple [IOS] Keyword Only</option>
            <option value="AOS">Android [AOS] Keyword Only</option>
            <option value="GENERAL">General / Non-Mobile Tagged</option>
          </select>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={e => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
          >
            <option value="ALL">All Statuses</option>
            <option value="DONE">Done</option>
            <option value="CANCELLED">Cancelled</option>
            <option value="RISK_ACCEPTED">Risk Accepted</option>
            <option value="OUTSTANDING">Outstanding</option>
            <option value="SECURITY_OVERDUE">Overdue Issues</option>
          </select>
        </div>
      </div>

      {/* Issues Table */}
      <div className="overflow-x-auto cs-table-shell">
        <table className="w-full text-left border-collapse cs-data-table">
          <thead>
            <tr className="bg-slate-950/70 border-b border-slate-800 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              <th className="py-3 px-4 w-28">Issue Key</th>
              <th className="py-3 px-4 w-44">Project</th>
              <th className="py-3 px-4">Summary</th>
              <th className="py-3 px-4 w-28 text-center">Platform Tag</th>
              <th className="py-3 px-4 w-28">Created Date</th>
              <th className="py-3 px-4 w-32">Status Changed</th>
              <th className="py-3 px-4 w-28 text-center">Status</th>
              <th className="py-3 px-4 w-28">Assignee</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800 text-xs">
            {paginatedIssues.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-10 text-center text-slate-500">
                  No issues found matching the active filters.
                </td>
              </tr>
            ) : (
              paginatedIssues.map(issue => {
                return (
                  <tr key={issue.id} className="hover:bg-slate-800/30 transition-colors">
                    {/* Key */}
                    <td className="py-3 px-4 font-mono font-medium text-blue-400">
                      {issue.id}
                    </td>

                    {/* Project */}
                    <td className="py-3 px-4 text-slate-300 font-medium truncate max-w-[180px]">
                      {issue.project}
                    </td>

                    {/* Summary */}
                    <td className="py-3 px-4 text-slate-200">
                      <span className="font-normal">{issue.summary}</span>
                    </td>

                    {/* Platform Tag */}
                    <td className="py-3 px-4 text-center">
                      {getPlatformBadge(issue.platformTag)}
                    </td>

                    {/* Created Date */}
                    <td className="py-3 px-4 font-mono text-slate-400 whitespace-nowrap">
                      {issue.created || issue.createdRaw || '—'}
                    </td>

                    {/* Status Category change Date */}
                    <td className="py-3 px-4 font-mono text-slate-400 whitespace-nowrap">
                      {issue.statusCategoryChange || issue.statusCategoryChangeRaw || '—'}
                    </td>

                    {/* Status */}
                    <td className="py-3 px-4 text-center">
                      {getStatusBadge(issue.status)}
                    </td>

                    {/* Assignee */}
                    <td className="py-3 px-4 text-slate-400 truncate max-w-[120px]">
                      {issue.assignee || 'Unassigned'}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      {filtered.length > pageSize && (
        <div className="p-4 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
          <div>
            Showing {(page - 1) * pageSize + 1} - {Math.min(page * pageSize, filtered.length)} of {filtered.length} issues
          </div>
          <div className="flex items-center space-x-1">
            <button
              disabled={page === 1}
              onClick={() => setPage(p => Math.max(1, p - 1))}
              className="px-2.5 py-1 rounded bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <span className="px-2">
              Page {page} of {totalPages}
            </span>
            <button
              disabled={page === totalPages}
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              className="px-2.5 py-1 rounded bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
