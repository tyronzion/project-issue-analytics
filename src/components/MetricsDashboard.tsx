import React, { useState, useMemo } from 'react';
import {
  ProjectSummary,
  FormulaConfig,
  DateFilter,
  IssueRecord,
  ProjectAlias,
  SeverityBreakdown,
} from '../types';
import {
  Search,
  Trash2,
  ExternalLink,
  Smartphone,
  Apple,
  ArrowUpDown,
  Calculator,
  GitMerge,
  CheckSquare,
  Layers,
  XCircle,
  Unlink,
  CheckCircle2,
  ClipboardList,
  Target,
  Globe,
  ChevronDown,
  ChevronUp,
  SlidersHorizontal,
} from 'lucide-react';
import { MergeProjectsModal } from './MergeProjectsModal';

interface MetricsDashboardProps {
  summaries: ProjectSummary[];
  allFilteredIssues: IssueRecord[];
  formulaConfig: FormulaConfig;
  dateFilter: DateFilter;
  projectAliases: ProjectAlias[];
  customProjectList?: string[];
  useCustomProjectListOnly?: boolean;
  onDeleteProject: (projectName: string) => void;
  onDrilldownProject: (projectName: string, filterPlatform?: string) => void;
  onOpenFormulas: () => void;
  onOpenProjects: () => void;
  onOpenTargetList?: () => void;
  onOpenClearData?: () => void;
  onOpenImport?: () => void;
  onMergeProjects: (sourceProjects: string[], targetName: string) => void;
  onUnmergeProjects: (projectNames: string[]) => void;
}

type SortField =
  | 'projectName'
  | 'totalFound'
  | 'foundLow'
  | 'foundMedium'
  | 'foundHigh'
  | 'foundCritical'
  | 'resolved'
  | 'resolvedLow'
  | 'resolvedMedium'
  | 'resolvedHigh'
  | 'resolvedCritical'
  | 'outstanding'
  | 'outstandingLow'
  | 'outstandingMedium'
  | 'outstandingHigh'
  | 'outstandingCritical'
  | 'riskAccepted'
  | 'securityOverdue'
  | 'resolutionRate'
  | 'totalAllTime';

type DensityMode = 'comfortable' | 'compact';

interface DashboardViewPrefs {
  showAllTime: boolean;
  showInlineSeverity: boolean;
  showPlatformBadge: boolean;
  showActions: boolean;
  showCardSeverity: boolean;
  density: DensityMode;
}

const DASHBOARD_PREFS_KEY = 'metrics_dashboard_view_prefs_v1';

const DEFAULT_VIEW_PREFS: DashboardViewPrefs = {
  showAllTime: false,
  showInlineSeverity: true,
  showPlatformBadge: true,
  showActions: true,
  showCardSeverity: false,
  density: 'comfortable',
};

export const MetricsDashboard: React.FC<MetricsDashboardProps> = ({
  summaries,
  allFilteredIssues,
  formulaConfig,
  dateFilter,
  projectAliases,
  customProjectList = [],
  useCustomProjectListOnly = false,
  onDeleteProject,
  onDrilldownProject,
  onOpenFormulas,
  onOpenProjects,
  onOpenTargetList,
  onOpenClearData,
  onOpenImport,
  onMergeProjects,
  onUnmergeProjects,
}) => {
  const loadViewPrefs = (): DashboardViewPrefs => {
    try {
      const raw = localStorage.getItem(DASHBOARD_PREFS_KEY);
      if (!raw) return DEFAULT_VIEW_PREFS;
      return { ...DEFAULT_VIEW_PREFS, ...JSON.parse(raw) };
    } catch {
      return DEFAULT_VIEW_PREFS;
    }
  };

  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<SortField>('totalFound');
  const [sortAsc, setSortAsc] = useState(false);
  const [viewPrefs, setViewPrefs] = useState<DashboardViewPrefs>(loadViewPrefs);
  const [isViewMenuOpen, setIsViewMenuOpen] = useState(false);
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());

  // Checkbox selection state
  const [selectedProjects, setSelectedProjects] = useState<Set<string>>(new Set());
  const [isMergeModalOpen, setIsMergeModalOpen] = useState<boolean>(false);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);

  const showNotification = (msg: string) => {
    setFeedbackMessage(msg);
    setTimeout(() => {
      setFeedbackMessage(null);
    }, 4000);
  };

  React.useEffect(() => {
    try {
      localStorage.setItem(DASHBOARD_PREFS_KEY, JSON.stringify(viewPrefs));
    } catch {
      // Ignore preference write failures.
    }
  }, [viewPrefs]);

  const getColumnCount = (): number => {
    let base = 8; // select, project, found total, resolved total, outstanding total, risk accepted, overdue, resolution%
    if (viewPrefs.showInlineSeverity) base += 12; // L/M/H/C for Found, Resolved, Outstanding
    if (viewPrefs.showAllTime) base += 1;
    if (viewPrefs.showActions) base += 1;
    return base;
  };

  // Filter and sort summaries
  const getSortValue = (summary: ProjectSummary, field: SortField): string | number => {
    switch (field) {
      case 'projectName':
        return summary.projectName;
      case 'foundLow':
        return summary.foundBySeverity.low;
      case 'foundMedium':
        return summary.foundBySeverity.medium;
      case 'foundHigh':
        return summary.foundBySeverity.high;
      case 'foundCritical':
        return summary.foundBySeverity.critical;
      case 'resolvedLow':
        return summary.resolvedBySeverity.low;
      case 'resolvedMedium':
        return summary.resolvedBySeverity.medium;
      case 'resolvedHigh':
        return summary.resolvedBySeverity.high;
      case 'resolvedCritical':
        return summary.resolvedBySeverity.critical;
      case 'outstandingLow':
        return summary.outstandingBySeverity.low;
      case 'outstandingMedium':
        return summary.outstandingBySeverity.medium;
      case 'outstandingHigh':
        return summary.outstandingBySeverity.high;
      case 'outstandingCritical':
        return summary.outstandingBySeverity.critical;
      default:
        return summary[field] as string | number;
    }
  };

  const filteredSummaries = useMemo(() => {
    return summaries
      .filter(s => s.projectName.toLowerCase().includes(searchQuery.toLowerCase()))
      .sort((a, b) => {
        const valA = getSortValue(a, sortField);
        const valB = getSortValue(b, sortField);
        if (typeof valA === 'string') {
          return sortAsc
            ? (valA as string).localeCompare(valB as string)
            : (valB as string).localeCompare(valA as string);
        }
        return sortAsc ? (Number(valA) || 0) - (Number(valB) || 0) : (Number(valB) || 0) - (Number(valA) || 0);
      });
  }, [summaries, searchQuery, sortField, sortAsc]);

  // Calculate Aggregates
  const totals = summaries.reduce(
    (acc, curr) => ({
      totalFound: acc.totalFound + curr.totalFound,
      resolved: acc.resolved + curr.resolved,
      outstanding: acc.outstanding + curr.outstanding,
      riskAccepted: acc.riskAccepted + curr.riskAccepted,
      securityOverdue: acc.securityOverdue + curr.securityOverdue,
      allTime: acc.allTime + curr.totalAllTime,
      foundBySeverity: {
        low: acc.foundBySeverity.low + curr.foundBySeverity.low,
        medium: acc.foundBySeverity.medium + curr.foundBySeverity.medium,
        high: acc.foundBySeverity.high + curr.foundBySeverity.high,
        critical: acc.foundBySeverity.critical + curr.foundBySeverity.critical,
      },
      resolvedBySeverity: {
        low: acc.resolvedBySeverity.low + curr.resolvedBySeverity.low,
        medium: acc.resolvedBySeverity.medium + curr.resolvedBySeverity.medium,
        high: acc.resolvedBySeverity.high + curr.resolvedBySeverity.high,
        critical: acc.resolvedBySeverity.critical + curr.resolvedBySeverity.critical,
      },
      outstandingBySeverity: {
        low: acc.outstandingBySeverity.low + curr.outstandingBySeverity.low,
        medium: acc.outstandingBySeverity.medium + curr.outstandingBySeverity.medium,
        high: acc.outstandingBySeverity.high + curr.outstandingBySeverity.high,
        critical: acc.outstandingBySeverity.critical + curr.outstandingBySeverity.critical,
      },
    }),
    {
      totalFound: 0,
      resolved: 0,
      outstanding: 0,
      riskAccepted: 0,
      securityOverdue: 0,
      allTime: 0,
      foundBySeverity: { low: 0, medium: 0, high: 0, critical: 0 },
      resolvedBySeverity: { low: 0, medium: 0, high: 0, critical: 0 },
      outstandingBySeverity: { low: 0, medium: 0, high: 0, critical: 0 },
    }
  );

  const overallResolutionRate = totals.totalFound > 0 ? (totals.resolved / totals.totalFound) * 100 : 0;

  const chipsClass = viewPrefs.density === 'compact' ? 'text-[9px]' : 'text-[10px]';
  const rowPaddingClass = viewPrefs.density === 'compact' ? 'py-2' : 'py-3';

  const renderSeverityBreakdown = (counts: SeverityBreakdown) => {
    return (
      <div className={`flex items-center flex-wrap gap-x-2 gap-y-1 ${chipsClass}`}>
        <span className="px-1.5 py-0.5 rounded border border-slate-700 bg-slate-900 text-slate-300">Low {counts.low}</span>
        <span className="px-1.5 py-0.5 rounded border border-blue-800 bg-blue-950/60 text-blue-300">Medium {counts.medium}</span>
        <span className="px-1.5 py-0.5 rounded border border-amber-800 bg-amber-950/60 text-amber-300">High {counts.high}</span>
        <span className="px-1.5 py-0.5 rounded border border-red-800 bg-red-950/60 text-red-300">Critical {counts.critical}</span>
      </div>
    );
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  };

  const renderSortIndicator = (field: SortField) => {
    if (sortField !== field) {
      return <ArrowUpDown className="w-3 h-3 opacity-70" />;
    }
    return sortAsc ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />;
  };

  const toggleProjectExpanded = (projectName: string) => {
    setExpandedProjects(prev => {
      const next = new Set(prev);
      if (next.has(projectName)) {
        next.delete(projectName);
      } else {
        next.add(projectName);
      }
      return next;
    });
  };

  // Selection handlers
  const handleToggleSelect = (projectName: string) => {
    setSelectedProjects(prev => {
      const next = new Set(prev);
      if (next.has(projectName)) {
        next.delete(projectName);
      } else {
        next.add(projectName);
      }
      return next;
    });
  };

  const handleSelectAllFiltered = () => {
    if (selectedProjects.size === filteredSummaries.length && filteredSummaries.length > 0) {
      setSelectedProjects(new Set());
    } else {
      setSelectedProjects(new Set(filteredSummaries.map(s => s.projectName)));
    }
  };

  const handleClearSelection = () => {
    setSelectedProjects(new Set());
  };

  // Map to find which projects are currently merged targets
  const safeAliases = projectAliases || [];
  const mergedSourceCounts = useMemo(() => {
    const map = new Map<string, string[]>();
    safeAliases.forEach((a: ProjectAlias) => {
      if (a && a.to && a.from) {
        if (!map.has(a.to)) {
          map.set(a.to, []);
        }
        map.get(a.to)!.push(a.from);
      }
    });
    return map;
  }, [safeAliases]);

  // Check if any selected project is currently part of an active merge rule
  const selectedArray: string[] = Array.from(selectedProjects);
  const hasMergedAliasesInSelection = selectedArray.some((pName: string) =>
    safeAliases.some(
      (a: ProjectAlias) =>
        String(a.to || '').toLowerCase() === String(pName).toLowerCase() ||
        String(a.from || '').toLowerCase() === String(pName).toLowerCase()
    )
  );

  // Direct Unmerge Handler (Immediate, non-blocking)
  const handleUnmergeSelected = () => {
    if (selectedArray.length === 0) return;

    const allNamesToUnmerge = new Set<string>(selectedArray);
    selectedArray.forEach(pName => {
      const sources = mergedSourceCounts.get(pName);
      if (sources) {
        sources.forEach(s => allNamesToUnmerge.add(s));
      }
    });

    onUnmergeProjects(Array.from(allNamesToUnmerge));
    setSelectedProjects(new Set());
    showNotification(`Successfully unmerged ${selectedArray.length} application(s). Original project names restored.`);
  };

  // Direct Single Project Unmerge
  const handleSingleProjectUnmerge = (projectName: string, sources?: string[]) => {
    const targets = [projectName, ...(sources || [])];
    onUnmergeProjects(targets);
    setSelectedProjects(prev => {
      const next = new Set(prev);
      next.delete(projectName);
      return next;
    });
    showNotification(`Unmerged "${projectName}". Restored separate sources: ${(sources || []).join(', ') || 'Original projects'}.`);
  };

  // Direct Batch Delete
  const handleBatchDelete = () => {
    if (selectedArray.length === 0) return;
    selectedArray.forEach(p => onDeleteProject(p));
    setSelectedProjects(new Set());
    showNotification(`Deleted ${selectedArray.length} application(s) from view.`);
  };

  return (
    <div className="space-y-6">
      {/* Toast Feedback Notification */}
      {feedbackMessage && (
        <div className="bg-emerald-950/90 border border-emerald-500/50 text-emerald-200 px-4 py-3 rounded-xl flex items-center justify-between text-xs shadow-lg animate-in fade-in slide-in-from-top-2 duration-150">
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{feedbackMessage}</span>
          </div>
          <button onClick={() => setFeedbackMessage(null)} className="text-emerald-400 hover:text-white p-1">
            <XCircle className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Top KPI Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-6 gap-4">
        {/* Card 1: Total Found Issues */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Found Issues</span>
            <span className="text-[10px] bg-blue-500/10 text-blue-400 px-2 py-0.5 rounded border border-blue-500/20">
              Created in Range
            </span>
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-3xl font-bold text-white tracking-tight">{totals.totalFound}</span>
            <span className="text-xs text-slate-400">Total Filtered</span>
          </div>
          <div className="mt-3 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
            <span>Formula: Count in Created range</span>
          </div>
          {viewPrefs.showCardSeverity && <div className="mt-2">{renderSeverityBreakdown(totals.foundBySeverity)}</div>}
        </div>

        {/* Card 2: Resolved Issues */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Resolved Issues</span>
            <span className="text-[10px] bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded border border-emerald-500/20">
              Done & In Range
            </span>
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-3xl font-bold text-emerald-400 tracking-tight">{totals.resolved}</span>
            <span className="text-xs font-medium text-emerald-500">{overallResolutionRate.toFixed(1)}% Velocity</span>
          </div>
          <div className="mt-3 pt-3 border-t border-slate-800/80">
            <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
              <div
                className="bg-emerald-500 h-full rounded-full transition-all duration-500"
                style={{ width: `${Math.min(100, Math.max(0, overallResolutionRate))}%` }}
              />
            </div>
          </div>
          {viewPrefs.showCardSeverity && <div className="mt-2">{renderSeverityBreakdown(totals.resolvedBySeverity)}</div>}
        </div>

        {/* Card 3: Outstanding / Backlog */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Outstanding / Backlogs</span>
            <span className="text-[10px] bg-amber-500/10 text-amber-400 px-2 py-0.5 rounded border border-amber-500/20">
              Not Done / Not Cancelled
            </span>
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-3xl font-bold text-amber-400 tracking-tight">{totals.outstanding}</span>
            <span className="text-xs text-slate-400">Open Workload</span>
          </div>
          <div className="mt-3 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
            <span>Formula: Status ≠ Done & ≠ Cancelled</span>
          </div>
          {viewPrefs.showCardSeverity && <div className="mt-2">{renderSeverityBreakdown(totals.outstandingBySeverity)}</div>}
        </div>

        {/* Card 4: Risk Accepted */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Risk Accepted</span>
            <span className="text-[10px] bg-purple-500/10 text-purple-300 px-2 py-0.5 rounded border border-purple-500/20">
              Accepted Risk
            </span>
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-3xl font-bold text-purple-300 tracking-tight">{totals.riskAccepted}</span>
            <span className="text-xs text-slate-400">Excluded from Backlog</span>
          </div>
          <div className="mt-3 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
            <span>Formula: Status = Risk Accepted</span>
          </div>
        </div>

        {/* Card 5: Security Overdue */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Security Overdue</span>
            <span className="text-[10px] bg-red-500/10 text-red-400 px-2 py-0.5 rounded border border-red-500/20">
              Due Date &lt; Today
            </span>
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-3xl font-bold text-red-400 tracking-tight">{totals.securityOverdue}</span>
            <span className="text-xs text-slate-400">Past Due Security</span>
          </div>
          <div className="mt-3 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
            <span>Formula: Due date &lt; today & not done/cancelled</span>
          </div>
        </div>

        {/* Card 6: Tracked Applications */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Tracked Applications</span>
            <div className="flex items-center space-x-1">
              {onOpenTargetList && (
                <button
                  onClick={onOpenTargetList}
                  className="text-[10px] bg-blue-950/80 hover:bg-blue-900 text-blue-300 px-2 py-0.5 rounded border border-blue-800 transition"
                  title="Manage user-defined target project watchlist"
                >
                  Target List ({customProjectList.length})
                </button>
              )}
              <button
                onClick={onOpenProjects}
                className="text-[10px] bg-slate-800 hover:bg-slate-700 text-slate-300 px-2 py-0.5 rounded border border-slate-700 transition"
              >
                All Apps
              </button>
            </div>
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-3xl font-bold text-white tracking-tight">{summaries.length}</span>
            <span className="text-xs text-slate-400">{useCustomProjectListOnly ? 'Target List Active' : `${totals.allTime} All-Time Records`}</span>
          </div>
          <div className="mt-3 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
            <span>{useCustomProjectListOnly ? 'Showing custom watchlist' : 'Auto-detected & split projects'}</span>
          </div>
        </div>
      </div>

      {/* Applied Formula & Smart Search Banner */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
        <div className="flex items-center space-x-3 flex-wrap gap-y-1">
          <div className="flex items-center space-x-1.5 text-blue-400 font-medium">
            <Calculator className="w-4 h-4" />
            <span>Active Match & Metric Rules:</span>
          </div>
          <span className="text-slate-300">
            <strong>Platform Keywords:</strong> <code className="text-sky-300 font-bold">{formulaConfig.iosKeyword}</code> & <code className="text-emerald-300 font-bold">{formulaConfig.aosKeyword}</code> in Summary split into dedicated project metrics.
          </span>
          <span className="text-slate-500">&bull;</span>
          <span className="text-slate-300">
            <strong>Found:</strong> "{formulaConfig.columnMapping.createdColumn}" in date range.
          </span>
          <span className="text-slate-500">&bull;</span>
          <span className="text-slate-300">
            <strong>Resolved:</strong> Status change in range & Done.
          </span>
          <span className="text-slate-500">&bull;</span>
          <span className="text-slate-300">
            <strong>Overdue:</strong> Security Due Date earlier than today.
          </span>
        </div>

        <div className="flex items-center space-x-2 self-start md:self-auto">
          {onOpenTargetList && (
            <button
              onClick={onOpenTargetList}
              className="flex items-center space-x-1 text-xs text-purple-300 hover:text-white font-medium px-2.5 py-1 rounded-lg bg-purple-950/70 border border-purple-800 hover:bg-purple-900 transition whitespace-nowrap"
              title="Provide your target list of project names to search in the database"
            >
              <ClipboardList className="w-3.5 h-3.5 text-purple-400" />
              <span>Target Project List ({customProjectList.length})</span>
            </button>
          )}

          <button
            onClick={onOpenFormulas}
            className="flex items-center space-x-1 text-xs text-blue-400 hover:text-blue-300 font-medium px-2.5 py-1 rounded-lg bg-blue-500/10 border border-blue-500/20 hover:bg-blue-500/20 transition whitespace-nowrap"
          >
            <span>Edit Formulas</span>
            <ExternalLink className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Target Watchlist Active Notification Banner if enabled */}
      {useCustomProjectListOnly && customProjectList.length > 0 && (
        <div className="bg-blue-950/70 border border-blue-800/80 rounded-xl p-3 flex items-center justify-between text-xs text-blue-200 shadow-sm">
          <div className="flex items-center space-x-2">
            <Target className="w-4 h-4 text-blue-400 shrink-0" />
            <span>
              <strong>Target Watchlist Mode Active:</strong> Dashboard is reporting exactly against your custom list of <strong>{customProjectList.length} application(s)</strong>.
            </span>
          </div>
          {onOpenTargetList && (
            <button onClick={onOpenTargetList} className="text-xs text-blue-300 underline hover:text-white transition">
              Edit Watchlist
            </button>
          )}
        </div>
      )}

      {/* Dynamic Floating Selection Action Bar */}
      {selectedProjects.size > 0 && (
        <div className="bg-purple-950/90 border border-purple-800/80 rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3 text-xs shadow-xl animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex items-center space-x-3">
            <span className="font-bold text-purple-200 flex items-center space-x-1.5">
              <CheckSquare className="w-4 h-4 text-purple-400" />
              <span>{selectedProjects.size} Application(s) Selected</span>
            </span>
            <span className="text-purple-300/70 hidden sm:inline">&bull;</span>
            <span className="text-purple-300/90 text-[11px] hidden sm:inline">Merge 2+ applications together, or unmerge / restore separate applications.</span>
          </div>

          <div className="flex items-center space-x-2 flex-wrap gap-y-1.5">
            {selectedProjects.size >= 2 ? (
              <button
                onClick={() => setIsMergeModalOpen(true)}
                className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white font-medium rounded-lg transition flex items-center space-x-1.5 shadow-md shadow-purple-600/30"
              >
                <GitMerge className="w-3.5 h-3.5" />
                <span>Merge Selected ({selectedProjects.size})</span>
              </button>
            ) : (
              <span className="text-[11px] text-purple-300 bg-purple-900/40 px-2.5 py-1 rounded-md border border-purple-800/50">Check 1 more app to Merge</span>
            )}

            {(hasMergedAliasesInSelection || safeAliases.length > 0) && (
              <button
                onClick={handleUnmergeSelected}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-amber-300 hover:text-amber-200 border border-amber-500/40 rounded-lg transition flex items-center space-x-1.5 shadow-sm"
                title="Remove merge rules for selected applications and restore original names"
              >
                <Unlink className="w-3.5 h-3.5 text-amber-400" />
                <span>Unmerge Selected ({selectedProjects.size})</span>
              </button>
            )}

            <button
              onClick={handleBatchDelete}
              className="px-2.5 py-1.5 bg-red-950/50 hover:bg-red-900/60 text-red-300 border border-red-800/60 rounded-lg transition flex items-center space-x-1"
              title="Delete and exclude selected applications"
            >
              <Trash2 className="w-3.5 h-3.5 text-red-400" />
              <span>Delete ({selectedProjects.size})</span>
            </button>

            <button onClick={handleClearSelection} className="px-2.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-slate-300 rounded-lg transition">
              Deselect All
            </button>
          </div>
        </div>
      )}

      {/* Main Project Metrics Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center space-x-3 flex-wrap gap-y-1">
            <h2 className="font-semibold text-base text-white">Application Metrics by Project</h2>
            <span className="text-xs text-slate-400">({filteredSummaries.length} applications listed)</span>

            {safeAliases.length > 0 && (
              <button
                onClick={() => {
                  onUnmergeProjects(safeAliases.map(a => a.to).concat(safeAliases.map(a => a.from)));
                  showNotification('Unmerged all applications and restored original project names.');
                }}
                className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-purple-950/80 hover:bg-purple-900 text-purple-300 border border-purple-700 transition"
                title="Click to reset and unmerge all applications"
              >
                <GitMerge className="w-3 h-3 text-purple-400" />
                <span>{safeAliases.length} Merge Rule(s) Active &bull; Click to Reset All</span>
              </button>
            )}
          </div>

          <div className="flex items-center space-x-2">
            <div className="relative">
              <button
                onClick={() => setIsViewMenuOpen(prev => !prev)}
                className="flex items-center space-x-1 px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-lg text-xs font-medium transition"
                title="Customize visible columns and density"
              >
                <SlidersHorizontal className="w-3.5 h-3.5 text-slate-400" />
                <span>View</span>
              </button>

              {isViewMenuOpen && (
                <div className="absolute right-0 mt-2 w-72 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl z-20 p-3 space-y-2 text-xs">
                  <p className="text-slate-300 font-semibold">Visible Columns & Layout</p>

                  <label className="flex items-center justify-between text-slate-300">
                    <span>Show All-Time</span>
                    <input
                      type="checkbox"
                      checked={viewPrefs.showAllTime}
                      onChange={e => setViewPrefs(prev => ({ ...prev, showAllTime: e.target.checked }))}
                      className="rounded border-slate-700 text-blue-600"
                    />
                  </label>

                  <label className="flex items-center justify-between text-slate-300">
                    <span>Show severity columns</span>
                    <input
                      type="checkbox"
                      checked={viewPrefs.showInlineSeverity}
                      onChange={e => setViewPrefs(prev => ({ ...prev, showInlineSeverity: e.target.checked }))}
                      className="rounded border-slate-700 text-blue-600"
                    />
                  </label>

                  <label className="flex items-center justify-between text-slate-300">
                    <span>Show platform badge</span>
                    <input
                      type="checkbox"
                      checked={viewPrefs.showPlatformBadge}
                      onChange={e => setViewPrefs(prev => ({ ...prev, showPlatformBadge: e.target.checked }))}
                      className="rounded border-slate-700 text-blue-600"
                    />
                  </label>

                  <label className="flex items-center justify-between text-slate-300">
                    <span>Show actions column</span>
                    <input
                      type="checkbox"
                      checked={viewPrefs.showActions}
                      onChange={e => setViewPrefs(prev => ({ ...prev, showActions: e.target.checked }))}
                      className="rounded border-slate-700 text-blue-600"
                    />
                  </label>

                  <label className="flex items-center justify-between text-slate-300">
                    <span>Show card severity</span>
                    <input
                      type="checkbox"
                      checked={viewPrefs.showCardSeverity}
                      onChange={e => setViewPrefs(prev => ({ ...prev, showCardSeverity: e.target.checked }))}
                      className="rounded border-slate-700 text-blue-600"
                    />
                  </label>

                  <div className="pt-1 border-t border-slate-800">
                    <p className="text-slate-400 mb-1">Density</p>
                    <div className="grid grid-cols-2 gap-1">
                      <button
                        onClick={() => setViewPrefs(prev => ({ ...prev, density: 'comfortable' }))}
                        className={`px-2 py-1 rounded border transition ${
                          viewPrefs.density === 'comfortable'
                            ? 'bg-blue-950/50 text-blue-300 border-blue-700'
                            : 'bg-slate-800 text-slate-300 border-slate-700'
                        }`}
                      >
                        Comfortable
                      </button>
                      <button
                        onClick={() => setViewPrefs(prev => ({ ...prev, density: 'compact' }))}
                        className={`px-2 py-1 rounded border transition ${
                          viewPrefs.density === 'compact'
                            ? 'bg-blue-950/50 text-blue-300 border-blue-700'
                            : 'bg-slate-800 text-slate-300 border-slate-700'
                        }`}
                      >
                        Compact
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {onOpenTargetList && (
              <button
                onClick={onOpenTargetList}
                className="flex items-center space-x-1 px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-blue-300 border border-slate-700 rounded-lg text-xs font-medium transition"
                title="Paste / Manage custom list of project names"
              >
                <ClipboardList className="w-3.5 h-3.5 text-blue-400" />
                <span>Target Project List</span>
              </button>
            )}

            {onOpenClearData && allFilteredIssues.length > 0 && (
              <button
                onClick={onOpenClearData}
                className="flex items-center space-x-1 px-2.5 py-1.5 bg-red-950/40 hover:bg-red-900/70 text-red-300 border border-red-800/60 rounded-lg text-xs font-medium transition"
                title="Delete all issue records to start fresh before new import"
              >
                <Trash2 className="w-3.5 h-3.5 text-red-400" />
                <span>Delete All Data</span>
              </button>
            )}

            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search application name..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 w-56"
              />
            </div>
          </div>
        </div>

        <div className="overflow-x-auto cs-table-shell">
          <table className="w-full text-left border-collapse cs-data-table">
            <thead>
              {viewPrefs.showInlineSeverity ? (
                <>
                  <tr className="bg-slate-950/70 border-b border-slate-800 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    <th className="py-2 px-3 w-10 text-center" rowSpan={2}>
                      <input
                        type="checkbox"
                        checked={filteredSummaries.length > 0 && selectedProjects.size === filteredSummaries.length}
                        onChange={handleSelectAllFiltered}
                        className="rounded border-slate-700 text-purple-600 focus:ring-purple-500 cursor-pointer"
                        title="Select / Deselect all visible applications"
                      />
                    </th>
                    <th className="py-2 px-4" rowSpan={2}>
                      <button onClick={() => handleSort('projectName')} className="flex items-center space-x-1 hover:text-white transition">
                        <span>Project (Application)</span>
                        <ArrowUpDown className="w-3 h-3" />
                      </button>
                    </th>
                    <th className="py-2 px-4 text-center text-slate-200" colSpan={5}>Found Issues</th>
                    <th className="py-2 px-4 text-center text-emerald-400" colSpan={5}>Resolved</th>
                    <th className="py-2 px-4 text-center text-amber-400" colSpan={5}>Outstanding / Backlog</th>
                    <th className="py-2 px-4 text-right text-purple-300" rowSpan={2}>
                      <button
                        onClick={() => handleSort('riskAccepted')}
                        className="flex items-center justify-end space-x-1 hover:text-purple-200 transition w-full"
                        title="Issues whose status is Risk Accepted; excluded from Outstanding and Overdue"
                      >
                        <span>Risk Accepted</span>
                        <ArrowUpDown className="w-3 h-3" />
                      </button>
                    </th>
                    <th className="py-2 px-4 text-right text-red-400" rowSpan={2}>
                      <button
                        onClick={() => handleSort('securityOverdue')}
                        className="flex items-center justify-end space-x-1 hover:text-red-300 transition w-full"
                        title="Security Due Date earlier than today and status is not Done/Cancelled"
                      >
                        <span>Overdue</span>
                        <ArrowUpDown className="w-3 h-3" />
                      </button>
                    </th>
                    <th className="py-2 px-4 text-center" rowSpan={2}>
                      <button
                        onClick={() => handleSort('resolutionRate')}
                        className="flex items-center justify-center space-x-1 hover:text-white transition w-full"
                        title="Resolved / Found * 100"
                      >
                        <span>Resolution %</span>
                        <ArrowUpDown className="w-3 h-3" />
                      </button>
                    </th>
                    {viewPrefs.showAllTime && (
                      <th className="py-2 px-4 text-right text-slate-400" rowSpan={2}>
                        <button
                          onClick={() => handleSort('totalAllTime')}
                          className="flex items-center justify-end space-x-1 hover:text-white transition w-full"
                          title="Total all-time records for this application"
                        >
                          <span>All-Time</span>
                          <ArrowUpDown className="w-3 h-3" />
                        </button>
                      </th>
                    )}
                    {viewPrefs.showActions && <th className="py-2 px-4 text-center" rowSpan={2}>Actions</th>}
                  </tr>
                  <tr className="bg-slate-950/70 border-b border-slate-800 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                    <th className="py-2 px-4 text-right font-bold text-slate-200">
                      <button
                        onClick={() => handleSort('totalFound')}
                        className="flex items-center justify-end space-x-1 hover:text-white transition w-full"
                        title="Issues created within date filter range"
                      >
                        <span>Total</span>
                        <ArrowUpDown className="w-3 h-3" />
                      </button>
                    </th>
                    <th className="py-2 px-2 text-right text-slate-400">
                      <button onClick={() => handleSort('foundLow')} className="w-full inline-flex items-center justify-end gap-1 hover:text-white transition">
                        <span>L</span>
                        {renderSortIndicator('foundLow')}
                      </button>
                    </th>
                    <th className="py-2 px-2 text-right text-blue-300">
                      <button onClick={() => handleSort('foundMedium')} className="w-full inline-flex items-center justify-end gap-1 hover:text-white transition">
                        <span>M</span>
                        {renderSortIndicator('foundMedium')}
                      </button>
                    </th>
                    <th className="py-2 px-2 text-right text-amber-300">
                      <button onClick={() => handleSort('foundHigh')} className="w-full inline-flex items-center justify-end gap-1 hover:text-white transition">
                        <span>H</span>
                        {renderSortIndicator('foundHigh')}
                      </button>
                    </th>
                    <th className="py-2 px-2 text-right text-red-300">
                      <button onClick={() => handleSort('foundCritical')} className="w-full inline-flex items-center justify-end gap-1 hover:text-white transition">
                        <span>C</span>
                        {renderSortIndicator('foundCritical')}
                      </button>
                    </th>

                    <th className="py-2 px-4 text-right text-emerald-400">
                      <button
                        onClick={() => handleSort('resolved')}
                        className="flex items-center justify-end space-x-1 hover:text-emerald-300 transition w-full"
                        title="Issues with status change in range AND status = Done"
                      >
                        <span>Total</span>
                        <ArrowUpDown className="w-3 h-3" />
                      </button>
                    </th>
                    <th className="py-2 px-2 text-right text-slate-400">
                      <button onClick={() => handleSort('resolvedLow')} className="w-full inline-flex items-center justify-end gap-1 hover:text-white transition">
                        <span>L</span>
                        {renderSortIndicator('resolvedLow')}
                      </button>
                    </th>
                    <th className="py-2 px-2 text-right text-blue-300">
                      <button onClick={() => handleSort('resolvedMedium')} className="w-full inline-flex items-center justify-end gap-1 hover:text-white transition">
                        <span>M</span>
                        {renderSortIndicator('resolvedMedium')}
                      </button>
                    </th>
                    <th className="py-2 px-2 text-right text-amber-300">
                      <button onClick={() => handleSort('resolvedHigh')} className="w-full inline-flex items-center justify-end gap-1 hover:text-white transition">
                        <span>H</span>
                        {renderSortIndicator('resolvedHigh')}
                      </button>
                    </th>
                    <th className="py-2 px-2 text-right text-red-300">
                      <button onClick={() => handleSort('resolvedCritical')} className="w-full inline-flex items-center justify-end gap-1 hover:text-white transition">
                        <span>C</span>
                        {renderSortIndicator('resolvedCritical')}
                      </button>
                    </th>

                    <th className="py-2 px-4 text-right text-amber-400">
                      <button
                        onClick={() => handleSort('outstanding')}
                        className="flex items-center justify-end space-x-1 hover:text-amber-300 transition w-full"
                        title="Issues with status not Done and not Cancelled"
                      >
                        <span>Total</span>
                        <ArrowUpDown className="w-3 h-3" />
                      </button>
                    </th>
                    <th className="py-2 px-2 text-right text-slate-400">
                      <button onClick={() => handleSort('outstandingLow')} className="w-full inline-flex items-center justify-end gap-1 hover:text-white transition">
                        <span>L</span>
                        {renderSortIndicator('outstandingLow')}
                      </button>
                    </th>
                    <th className="py-2 px-2 text-right text-blue-300">
                      <button onClick={() => handleSort('outstandingMedium')} className="w-full inline-flex items-center justify-end gap-1 hover:text-white transition">
                        <span>M</span>
                        {renderSortIndicator('outstandingMedium')}
                      </button>
                    </th>
                    <th className="py-2 px-2 text-right text-amber-300">
                      <button onClick={() => handleSort('outstandingHigh')} className="w-full inline-flex items-center justify-end gap-1 hover:text-white transition">
                        <span>H</span>
                        {renderSortIndicator('outstandingHigh')}
                      </button>
                    </th>
                    <th className="py-2 px-2 text-right text-red-300">
                      <button onClick={() => handleSort('outstandingCritical')} className="w-full inline-flex items-center justify-end gap-1 hover:text-white transition">
                        <span>C</span>
                        {renderSortIndicator('outstandingCritical')}
                      </button>
                    </th>
                  </tr>
                </>
              ) : (
                <tr className="bg-slate-950/70 border-b border-slate-800 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  <th className="py-3 px-3 w-10 text-center">
                    <input
                      type="checkbox"
                      checked={filteredSummaries.length > 0 && selectedProjects.size === filteredSummaries.length}
                      onChange={handleSelectAllFiltered}
                      className="rounded border-slate-700 text-purple-600 focus:ring-purple-500 cursor-pointer"
                      title="Select / Deselect all visible applications"
                    />
                  </th>

                  <th className="py-3 px-4">
                    <button onClick={() => handleSort('projectName')} className="flex items-center space-x-1 hover:text-white transition">
                      <span>Project (Application)</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </button>
                  </th>
                  <th className="py-3 px-4 text-right font-bold text-slate-200">
                    <button
                      onClick={() => handleSort('totalFound')}
                      className="flex items-center justify-end space-x-1 hover:text-white transition w-full"
                      title="Issues created within date filter range"
                    >
                      <span>Found Total</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </button>
                  </th>
                  <th className="py-3 px-4 text-right text-emerald-400">
                    <button
                      onClick={() => handleSort('resolved')}
                      className="flex items-center justify-end space-x-1 hover:text-emerald-300 transition w-full"
                      title="Issues with status change in range AND status = Done"
                    >
                      <span>Resolved Total</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </button>
                  </th>
                  <th className="py-3 px-4 text-right text-amber-400">
                    <button
                      onClick={() => handleSort('outstanding')}
                      className="flex items-center justify-end space-x-1 hover:text-amber-300 transition w-full"
                      title="Issues with status not Done and not Cancelled"
                    >
                      <span>Outstanding Total</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </button>
                  </th>
                  <th className="py-3 px-4 text-right text-red-400">
                    <button
                      onClick={() => handleSort('riskAccepted')}
                      className="flex items-center justify-end space-x-1 hover:text-purple-200 transition w-full text-purple-300"
                      title="Issues whose status is Risk Accepted; excluded from Outstanding and Overdue"
                    >
                      <span>Risk Accepted</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </button>
                  </th>
                  <th className="py-3 px-4 text-right text-red-400">
                    <button
                      onClick={() => handleSort('securityOverdue')}
                      className="flex items-center justify-end space-x-1 hover:text-red-300 transition w-full"
                      title="Security Due Date earlier than today and status is not Done/Cancelled"
                    >
                      <span>Overdue</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </button>
                  </th>
                  <th className="py-3 px-4 text-center">
                    <button
                      onClick={() => handleSort('resolutionRate')}
                      className="flex items-center justify-center space-x-1 hover:text-white transition w-full"
                      title="Resolved / Found * 100"
                    >
                      <span>Resolution %</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </button>
                  </th>
                  {viewPrefs.showAllTime && (
                    <th className="py-3 px-4 text-right text-slate-400">
                      <button
                        onClick={() => handleSort('totalAllTime')}
                        className="flex items-center justify-end space-x-1 hover:text-white transition w-full"
                        title="Total all-time records for this application"
                      >
                        <span>All-Time</span>
                        <ArrowUpDown className="w-3 h-3" />
                      </button>
                    </th>
                  )}
                  {viewPrefs.showActions && <th className="py-3 px-4 text-center">Actions</th>}
                </tr>
              )}
            </thead>
            <tbody className="divide-y divide-slate-800 text-xs">
              {filteredSummaries.length === 0 ? (
                <tr>
                  <td colSpan={getColumnCount()} className="py-12 text-center text-slate-400">
                    <div className="flex flex-col items-center justify-center space-y-3">
                      <div className="w-12 h-12 rounded-2xl bg-slate-800/80 border border-slate-700 flex items-center justify-center text-slate-400">
                        <Layers className="w-6 h-6" />
                      </div>
                      <div>
                        <p className="font-semibold text-slate-200 text-sm">
                          {allFilteredIssues.length === 0
                            ? 'No Issue Data in Workspace'
                            : 'No Applications Match Search / Target Watchlist'}
                        </p>
                        <p className="text-slate-500 text-xs mt-1 max-w-md mx-auto">
                          {allFilteredIssues.length === 0
                            ? 'Workspace is clean and ready. Click "Import Data" to upload your new Excel or CSV file without previous numbers adding up.'
                            : 'Check your search query or review your Target Project List.'}
                        </p>
                      </div>
                      {onOpenImport && allFilteredIssues.length === 0 && (
                        <button
                          onClick={onOpenImport}
                          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-xl transition shadow-md shadow-blue-600/20"
                        >
                          Import New Data Now
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                filteredSummaries.map(proj => {
                  const isSelected = selectedProjects.has(proj.projectName);
                  const mergedSources = mergedSourceCounts.get(proj.projectName);
                  const isExpanded = expandedProjects.has(proj.projectName);

                  return (
                    <React.Fragment key={proj.projectName}>
                      <tr
                        className={`transition-colors group ${
                          isSelected ? 'bg-purple-950/20 hover:bg-purple-950/30' : 'hover:bg-slate-800/40'
                        }`}
                      >
                      <td className={`${rowPaddingClass} px-3 text-center`}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleSelect(proj.projectName)}
                          className="rounded border-slate-700 text-purple-600 focus:ring-purple-500 cursor-pointer"
                        />
                      </td>

                      <td className={`${rowPaddingClass} px-4`}>
                        <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                          <button
                            onClick={() => toggleProjectExpanded(proj.projectName)}
                            className="text-slate-500 hover:text-slate-200 transition"
                            title="Show severity breakdown details"
                          >
                            {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                          </button>

                          <button
                            onClick={() => onDrilldownProject(proj.projectName)}
                            className="font-medium text-slate-200 hover:text-blue-400 text-left transition flex items-center space-x-2"
                          >
                            <span>{proj.projectName}</span>
                            {viewPrefs.showPlatformBadge && proj.platformTag === 'IOS' && (
                              <span className="inline-flex items-center space-x-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-sky-950/80 text-sky-300 border border-sky-800">
                                <Apple className="w-3 h-3" />
                                <span>IOS</span>
                              </span>
                            )}
                            {viewPrefs.showPlatformBadge && proj.platformTag === 'AOS' && (
                              <span className="inline-flex items-center space-x-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-950/80 text-emerald-300 border border-emerald-800">
                                <Smartphone className="w-3 h-3" />
                                <span>AOS</span>
                              </span>
                            )}
                            {viewPrefs.showPlatformBadge && (!proj.platformTag || proj.platformTag === 'GENERAL') && (
                              <span className="inline-flex items-center space-x-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-800/80 text-slate-300 border border-slate-700">
                                <Globe className="w-3 h-3 text-blue-400" />
                                <span>Web App</span>
                              </span>
                            )}
                            <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 text-slate-500" />
                          </button>

                          {mergedSources && mergedSources.length > 0 && (
                            <div className="inline-flex items-center space-x-1">
                              <span
                                className="inline-flex items-center space-x-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-purple-950 text-purple-300 border border-purple-800"
                                title={`Merged from: ${mergedSources.join(', ')}`}
                              >
                                <GitMerge className="w-3 h-3 text-purple-400" />
                                <span>Merged ({mergedSources.length + 1} sources)</span>
                              </span>

                              <button
                                onClick={() => handleSingleProjectUnmerge(proj.projectName, mergedSources)}
                                className="inline-flex items-center space-x-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-950/60 hover:bg-amber-900 text-amber-300 border border-amber-800/80 transition"
                                title={`Click to unmerge "${proj.projectName}" and restore (${mergedSources.join(', ')})`}
                              >
                                <Unlink className="w-3 h-3 text-amber-400" />
                                <span>Unmerge</span>
                              </button>
                            </div>
                          )}
                        </div>
                      </td>

                      <td className={`${rowPaddingClass} px-4 text-right`}>
                        <span className="font-mono font-bold text-slate-100">{proj.totalFound}</span>
                      </td>
                      {viewPrefs.showInlineSeverity && (
                        <>
                          <td className={`${rowPaddingClass} px-2 text-right font-mono text-slate-300`}>{proj.foundBySeverity.low}</td>
                          <td className={`${rowPaddingClass} px-2 text-right font-mono text-blue-300`}>{proj.foundBySeverity.medium}</td>
                          <td className={`${rowPaddingClass} px-2 text-right font-mono text-amber-300`}>{proj.foundBySeverity.high}</td>
                          <td className={`${rowPaddingClass} px-2 text-right font-mono text-red-300`}>{proj.foundBySeverity.critical}</td>
                        </>
                      )}

                      <td className={`${rowPaddingClass} px-4 text-right`}>
                        <span className="font-mono font-semibold text-emerald-400">{proj.resolved}</span>
                      </td>
                      {viewPrefs.showInlineSeverity && (
                        <>
                          <td className={`${rowPaddingClass} px-2 text-right font-mono text-slate-300`}>{proj.resolvedBySeverity.low}</td>
                          <td className={`${rowPaddingClass} px-2 text-right font-mono text-blue-300`}>{proj.resolvedBySeverity.medium}</td>
                          <td className={`${rowPaddingClass} px-2 text-right font-mono text-amber-300`}>{proj.resolvedBySeverity.high}</td>
                          <td className={`${rowPaddingClass} px-2 text-right font-mono text-red-300`}>{proj.resolvedBySeverity.critical}</td>
                        </>
                      )}

                      <td className={`${rowPaddingClass} px-4 text-right`}>
                        <span className="font-mono font-semibold text-amber-400">{proj.outstanding}</span>
                      </td>
                      {viewPrefs.showInlineSeverity && (
                        <>
                          <td className={`${rowPaddingClass} px-2 text-right font-mono text-slate-300`}>{proj.outstandingBySeverity.low}</td>
                          <td className={`${rowPaddingClass} px-2 text-right font-mono text-blue-300`}>{proj.outstandingBySeverity.medium}</td>
                          <td className={`${rowPaddingClass} px-2 text-right font-mono text-amber-300`}>{proj.outstandingBySeverity.high}</td>
                          <td className={`${rowPaddingClass} px-2 text-right font-mono text-red-300`}>{proj.outstandingBySeverity.critical}</td>
                        </>
                      )}

                      <td className={`${rowPaddingClass} px-4 text-right font-mono font-semibold text-purple-300`}>{proj.riskAccepted}</td>
                      <td className={`${rowPaddingClass} px-4 text-right font-mono font-semibold text-red-400`}>{proj.securityOverdue}</td>

                      <td className={`${rowPaddingClass} px-4 text-center`}>
                        <span className="font-mono text-[11px] text-slate-300 whitespace-nowrap">Progress {proj.resolutionRate.toFixed(0)}%</span>
                      </td>

                      {viewPrefs.showAllTime && (
                        <td className={`${rowPaddingClass} px-4 text-right font-mono text-slate-400`}>{proj.totalAllTime}</td>
                      )}

                      {viewPrefs.showActions && (
                        <td className={`${rowPaddingClass} px-4 text-center`}>
                          <div className="flex items-center justify-center space-x-1">
                            {mergedSources && mergedSources.length > 0 && (
                              <button
                                onClick={() => handleSingleProjectUnmerge(proj.projectName, mergedSources)}
                                className="p-1.5 text-amber-400 hover:text-amber-200 hover:bg-amber-950/60 rounded transition"
                                title={`Unmerge "${proj.projectName}" and restore separate original projects`}
                              >
                                <Unlink className="w-3.5 h-3.5" />
                              </button>
                            )}

                            <button
                              id={`btn-drilldown-${proj.projectName.replace(/\s+/g, '-')}`}
                              onClick={() => onDrilldownProject(proj.projectName)}
                              className="p-1.5 text-slate-400 hover:text-blue-400 hover:bg-slate-800 rounded transition"
                              title="Inspect issues for this project"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </button>

                            <button
                              id={`btn-delete-proj-${proj.projectName.replace(/\s+/g, '-')}`}
                              onClick={() => {
                                onDeleteProject(proj.projectName);
                                showNotification(`Deleted application "${proj.projectName}".`);
                              }}
                              className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-950/40 rounded transition"
                              title="Delete / Exclude this application (settings persist permanently)"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      )}
                      </tr>

                      {isExpanded && (
                        <tr className="bg-slate-950/60">
                          <td colSpan={getColumnCount()} className="px-6 py-3 border-t border-slate-800">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                              <div className="bg-slate-900/70 border border-slate-800 rounded-lg p-3">
                                <p className="text-slate-400 mb-1">Found Severity</p>
                                {renderSeverityBreakdown(proj.foundBySeverity)}
                              </div>
                              <div className="bg-slate-900/70 border border-slate-800 rounded-lg p-3">
                                <p className="text-slate-400 mb-1">Resolved Severity</p>
                                {renderSeverityBreakdown(proj.resolvedBySeverity)}
                              </div>
                              <div className="bg-slate-900/70 border border-slate-800 rounded-lg p-3">
                                <p className="text-slate-400 mb-1">Outstanding Severity</p>
                                {renderSeverityBreakdown(proj.outstandingBySeverity)}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>

            {filteredSummaries.length > 0 && (
              <tfoot>
                <tr className="bg-slate-950 font-semibold text-xs border-t-2 border-slate-800 text-slate-200">
                  <td className="py-3.5 px-3 text-center text-slate-500"></td>
                  <td className="py-3.5 px-4 text-slate-300">TOTAL / SUMMARY ({filteredSummaries.length} Apps)</td>
                  <td className="py-3.5 px-4 text-right font-mono font-bold text-white">{totals.totalFound}</td>
                  {viewPrefs.showInlineSeverity && (
                    <>
                      <td className="py-3.5 px-2 text-right font-mono text-slate-300">{totals.foundBySeverity.low}</td>
                      <td className="py-3.5 px-2 text-right font-mono text-blue-300">{totals.foundBySeverity.medium}</td>
                      <td className="py-3.5 px-2 text-right font-mono text-amber-300">{totals.foundBySeverity.high}</td>
                      <td className="py-3.5 px-2 text-right font-mono text-red-300">{totals.foundBySeverity.critical}</td>
                    </>
                  )}
                  <td className="py-3.5 px-4 text-right font-mono font-bold text-emerald-400">{totals.resolved}</td>
                  {viewPrefs.showInlineSeverity && (
                    <>
                      <td className="py-3.5 px-2 text-right font-mono text-slate-300">{totals.resolvedBySeverity.low}</td>
                      <td className="py-3.5 px-2 text-right font-mono text-blue-300">{totals.resolvedBySeverity.medium}</td>
                      <td className="py-3.5 px-2 text-right font-mono text-amber-300">{totals.resolvedBySeverity.high}</td>
                      <td className="py-3.5 px-2 text-right font-mono text-red-300">{totals.resolvedBySeverity.critical}</td>
                    </>
                  )}
                  <td className="py-3.5 px-4 text-right font-mono font-bold text-amber-400">{totals.outstanding}</td>
                  {viewPrefs.showInlineSeverity && (
                    <>
                      <td className="py-3.5 px-2 text-right font-mono text-slate-300">{totals.outstandingBySeverity.low}</td>
                      <td className="py-3.5 px-2 text-right font-mono text-blue-300">{totals.outstandingBySeverity.medium}</td>
                      <td className="py-3.5 px-2 text-right font-mono text-amber-300">{totals.outstandingBySeverity.high}</td>
                      <td className="py-3.5 px-2 text-right font-mono text-red-300">{totals.outstandingBySeverity.critical}</td>
                    </>
                  )}
                  <td className="py-3.5 px-4 text-right font-mono font-bold text-purple-300">{totals.riskAccepted}</td>
                  <td className="py-3.5 px-4 text-right font-mono font-bold text-red-400">{totals.securityOverdue}</td>
                  <td className="py-3.5 px-4 text-center">
                    <span className="font-mono text-emerald-400 text-[11px] whitespace-nowrap">Progress {overallResolutionRate.toFixed(1)}%</span>
                  </td>
                  {viewPrefs.showAllTime && <td className="py-3.5 px-4 text-right font-mono text-slate-400">{totals.allTime}</td>}
                  {viewPrefs.showActions && <td className="py-3.5 px-4 text-center text-slate-500">-</td>}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      <MergeProjectsModal
        isOpen={isMergeModalOpen}
        onClose={() => setIsMergeModalOpen(false)}
        selectedProjectNames={selectedArray}
        summaries={summaries}
        onConfirmMerge={(sourceProjects, targetName) => {
          onMergeProjects(sourceProjects, targetName);
          setSelectedProjects(new Set());
          showNotification(`Merged ${sourceProjects.length} applications into "${targetName}".`);
        }}
      />
    </div>
  );
};
