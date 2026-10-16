import React, { useState, useMemo } from 'react';
import { IssueRecord, FormulaConfig, DateFilter } from '../types';
import { 
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
  Trash2,
  CircleDot,
  Bot
} from 'lucide-react';
import { isIssueSecurityOverdue, getNormalizedSeverity, isDependabotsIssue } from '../utils/metricsEngine';
import { exportRowsToCsv } from '../utils/excelParser';
import { SeverityLevel } from '../types';
import { FilterSelect, FilterSearch, FilterReset } from './FilterChips';

const SEVERITY_LEVELS: {
  key: SeverityLevel;
  label: string;
  weight: number;
  definition: string;
  accent: string;
}[] = [
  {
    key: 'critical',
    label: 'Critical',
    weight: 10,
    definition: 'Severe impact or exploitable flaw; blocks release. Matches Critical, Blocker, Urgent, Sev1/S1, P0.',
    accent: '#b91c1c',
  },
  {
    key: 'high',
    label: 'High',
    weight: 5,
    definition: 'Major function broken or significant risk; fix next. Matches High, Major, Sev2/S2, P1.',
    accent: '#ea580c',
  },
  {
    key: 'medium',
    label: 'Medium',
    weight: 2,
    definition: 'Partial impact with a workaround available. Matches Medium, Moderate, Normal, Sev3/S3, P2.',
    accent: '#ca8a04',
  },
  {
    key: 'low',
    label: 'Low',
    weight: 1,
    definition: 'Minor or cosmetic; little to no risk. Matches Low, Minor, Trivial, Sev4/S4, P3, P4.',
    accent: '#2563eb',
  },
];

const SEVERITY_WEIGHT_MAX = 10;

interface IssuesTableViewProps {
  issues: IssueRecord[];
  formulaConfig: FormulaConfig;
  dateFilter: DateFilter;
  selectedPlatform?: string;
  /** Hide the Dependabots source filter on pages that already show only Dependabots issues. */
  hideSourceFilter?: boolean;
  onOpenClearData?: () => void;
}

export const IssuesTableView: React.FC<IssuesTableViewProps> = ({
  issues,
  formulaConfig,
  dateFilter,
  selectedPlatform = 'ALL',
  hideSourceFilter = false,
  onOpenClearData,
}) => {
  const [search, setSearch] = useState('');
  const [platformFilter, setPlatformFilter] = useState(selectedPlatform);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [sourceFilter, setSourceFilter] = useState<'ALL' | 'DEPENDABOTS' | 'NON_DEPENDABOTS'>('ALL');
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
    if (selectedPlatform) setPlatformFilter(selectedPlatform);
  }, [selectedPlatform]);

  // Reset to the first page whenever the incoming (globally filtered) list changes.
  React.useEffect(() => {
    setPage(1);
  }, [issues]);

  const hasTableFilters = Boolean(search) || platformFilter !== 'ALL' || sourceFilter !== 'ALL' || statusFilter !== 'ALL';

  const clearTableFilters = () => {
    setSearch('');
    setPlatformFilter('ALL');
    setSourceFilter('ALL');
    setStatusFilter('ALL');
    setPage(1);
  };

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

      // Platform tag
      if (platformFilter !== 'ALL') {
        if (platformFilter === 'IOS' && issue.platformTag !== 'IOS') return false;
        if (platformFilter === 'AOS' && issue.platformTag !== 'AOS') return false;
        if (platformFilter === 'GENERAL' && issue.platformTag !== 'GENERAL') return false;
      }

      // Source
      if (sourceFilter === 'DEPENDABOTS' && !isDependabotsIssue(issue)) return false;
      if (sourceFilter === 'NON_DEPENDABOTS' && isDependabotsIssue(issue)) return false;

      // Status
      if (statusFilter === 'SECURITY_OVERDUE') {
        if (!isIssueSecurityOverdue(issue, formulaConfig, dateFilter)) return false;
      } else if (statusFilter !== 'ALL' && getStatusCategory(issue.status) !== statusFilter) {
        return false;
      }

      return true;
    });
  }, [issues, search, platformFilter, sourceFilter, statusFilter, formulaConfig, dateFilter]);

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

  const severityScorecard = useMemo(() => {
    const levels = SEVERITY_LEVELS.map(def => ({ ...def, total: 0, resolved: 0, outstanding: 0 }));
    let unrated = 0;

    filtered.forEach(issue => {
      const level = getNormalizedSeverity(issue);
      const row = levels.find(l => l.key === level);
      if (!row) {
        unrated += 1;
        return;
      }
      row.total += 1;
      const category = getStatusCategory(issue.status);
      if (category === 'DONE') row.resolved += 1;
      if (category === 'OUTSTANDING') row.outstanding += 1;
    });

    // Weighted risk score: open issues weighted by severity, normalised to 0-100
    // against the worst case where every rated open issue is critical.
    const openRated = levels.reduce((sum, l) => sum + l.outstanding, 0);
    const weighted = levels.reduce((sum, l) => sum + l.outstanding * l.weight, 0);
    const riskScore = openRated > 0 ? Math.round((weighted / (openRated * SEVERITY_WEIGHT_MAX)) * 100) : 0;
    const rated = filtered.length - unrated;

    return { levels, unrated, rated, weighted, riskScore };
  }, [filtered, formulaConfig]);

  // Export exactly what the table shows: every row matching the active filters (all pages).
  const handleExportCsv = () => {
    const rows = filtered.map(issue => {
      const severity = getNormalizedSeverity(issue);
      return {
        'Issue Key': issue.id,
        'Project': issue.project,
        'Summary': issue.summary,
        'Platform Tag': issue.platformTag || 'GENERAL',
        'Created Date': issue.created || issue.createdRaw || '',
        'Status Changed': issue.statusCategoryChange || issue.statusCategoryChangeRaw || '',
        'Status': issue.status,
        'Assignee': issue.assignee || 'Unassigned',
        'Severity': severity ? severity.charAt(0).toUpperCase() + severity.slice(1) : 'Unrated',
        'Priority': issue.priority || '',
        'Issue Type': issue.issueType || '',
        'Security Due Date': issue.securityDueDate || issue.securityDueDateRaw || '',
        'Overdue': isIssueSecurityOverdue(issue, formulaConfig, dateFilter) ? 'Yes' : 'No',
        'Dependabots': isDependabotsIssue(issue) ? 'Yes' : 'No',
      };
    });
    exportRowsToCsv(rows, `Issues_Filtered_${new Date().toISOString().split('T')[0]}.csv`);
  };

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

  const getSeverityBadge = (issue: IssueRecord) => {
    const level = SEVERITY_LEVELS.find(l => l.key === getNormalizedSeverity(issue));
    if (!level) {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-normal bg-slate-800 text-slate-400 border border-slate-700">
          Unrated
        </span>
      );
    }
    return (
      <span
        className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold border"
        style={{ color: level.accent, borderColor: level.accent, backgroundColor: `${level.accent}14` }}
        title={level.definition}
      >
        {level.label}
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

      {/* Severity Scorecard */}
      <section className="severity-scorecard mx-4" aria-label="Severity scorecard">
        <header className="severity-scorecard-header">
          <div>
            <h3>Severity Scorecard</h3>
            <p>
              {severityScorecard.rated} of {kpiTotals.total} filtered issues rated
              {severityScorecard.unrated > 0 && ` · ${severityScorecard.unrated} unrated (no severity/priority)`}
            </p>
          </div>
          <div className="severity-risk-score" title="Sum of open issues × weight (Critical 10, High 5, Medium 2, Low 1), divided by the maximum if all were Critical">
            <span>Open Risk Score</span>
            <strong>{severityScorecard.riskScore}<small>/100</small></strong>
            <small>Weighted points: {severityScorecard.weighted}</small>
          </div>
        </header>

        <div className="severity-grid">
          {severityScorecard.levels.map(level => {
            const share = severityScorecard.rated > 0 ? (level.total / severityScorecard.rated) * 100 : 0;
            const resolutionRate = level.total > 0 ? (level.resolved / level.total) * 100 : 0;
            return (
              <article key={level.key} className="severity-card" style={{ borderTopColor: level.accent }}>
                <div className="severity-card-top">
                  <span style={{ color: level.accent }}>{level.label}</span>
                  <em>Weight ×{level.weight}</em>
                </div>
                <strong>{level.total}</strong>
                <p className="severity-definition">{level.definition}</p>
                <div className="severity-bar" aria-hidden="true">
                  <div style={{ width: `${share}%`, background: level.accent }} />
                </div>
                <dl>
                  <div><dt>Share</dt><dd>{share.toFixed(1)}%</dd></div>
                  <div><dt>Outstanding</dt><dd>{level.outstanding}</dd></div>
                  <div><dt>Resolved</dt><dd>{level.resolved}</dd></div>
                  <div><dt>Resolution</dt><dd>{resolutionRate.toFixed(0)}%</dd></div>
                </dl>
              </article>
            );
          })}
        </div>
      </section>

      {/* Header & Filter Controls Bar */}
      <div className="p-4 border-b border-slate-800 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center space-x-2">
            <h2 className="font-semibold text-base text-white">Issues</h2>
            <span className="text-xs text-slate-400">
              {filtered.length === issues.length ? `${issues.length} records` : `${filtered.length} of ${issues.length} records`}
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
              onClick={handleExportCsv}
              disabled={filtered.length === 0}
              title={`Export the ${filtered.length} issues matching the current filters`}
              className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-lg border border-slate-700 transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export CSV ({filtered.length})</span>
            </button>
          </div>
        </div>

        {/* Table-only refinements (date, project and severity live in the global filter bar) */}
        <div className="cs-filter-row pt-1">
          <FilterSearch
            wide
            value={search}
            onChange={v => {
              setSearch(v);
              setPage(1);
            }}
            placeholder="Search key, summary, assignee…"
          />

          <FilterSelect
            icon={CircleDot}
            label="Status"
            value={statusFilter}
            onChange={v => {
              setStatusFilter(v as typeof statusFilter);
              setPage(1);
            }}
            options={[
              { value: 'ALL', label: 'All' },
              { value: 'OUTSTANDING', label: 'Outstanding' },
              { value: 'SECURITY_OVERDUE', label: 'Overdue' },
              { value: 'DONE', label: 'Done' },
              { value: 'RISK_ACCEPTED', label: 'Risk Accepted' },
              { value: 'CANCELLED', label: 'Cancelled' },
            ]}
          />

          <FilterSelect
            icon={Smartphone}
            label="Platform"
            value={platformFilter}
            onChange={v => {
              setPlatformFilter(v as typeof platformFilter);
              setPage(1);
            }}
            options={[
              { value: 'ALL', label: 'All' },
              { value: 'IOS', label: 'iOS' },
              { value: 'AOS', label: 'Android' },
              { value: 'GENERAL', label: 'General' },
            ]}
          />

          {!hideSourceFilter && (
            <FilterSelect
              icon={Bot}
              label="Source"
              value={sourceFilter}
              onChange={v => {
                setSourceFilter(v as typeof sourceFilter);
                setPage(1);
              }}
              options={[
                { value: 'ALL', label: 'All' },
                { value: 'DEPENDABOTS', label: 'Dependabots only' },
                { value: 'NON_DEPENDABOTS', label: 'Exclude Dependabots' },
              ]}
            />
          )}

          {hasTableFilters && (
            <FilterReset onClick={clearTableFilters} />
          )}
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
              <th className="py-3 px-4 w-24 text-center">Severity</th>
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
                <td colSpan={9} className="py-10 text-center text-slate-500">
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

                    {/* Severity */}
                    <td className="py-3 px-4 text-center">
                      {getSeverityBadge(issue)}
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
