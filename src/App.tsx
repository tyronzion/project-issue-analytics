import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Layers,
  PieChart,
  ShieldCheck,
  ListFilter,
  FolderKanban,
  Calculator,
  Bot,
  Gauge,
  ScanSearch,
  ClipboardCheck,
  LayoutDashboard,
  Table2,
  ListChecks,
  Archive,
  RefreshCcw,
  FileUp,
  UserCog,
  Fingerprint,
  Link2,
  Timer,
  GitCompareArrows,
  Settings as SettingsIcon,
} from 'lucide-react';
import { 
  IssueRecord, 
  AppSettings, 
  FormulaConfig, 
  DateFilter, 
  ActiveTab, 
  ProjectAlias 
} from './types';
import { 
  loadSettings, 
  saveSettings, 
  loadSavedData, 
  savePersistedData, 
  DEFAULT_SETTINGS,
  loadJiraIntegrationProfile,
  saveJiraIntegrationProfile,
} from './utils/storage';
import { computeProjectSummaries, isDependabotsIssue, getNormalizedSeverity } from './utils/metricsEngine';
import { exportToExcel } from './utils/excelParser';
import { parseExcelOrCsvFile, mapObjectsToIssueRecords } from './utils/excelParser';
import { loadRemoteIssues, saveRemoteIssues } from './utils/remotePersistence';

import { Navbar } from './components/Navbar';
import { DateRangeFilterBar } from './components/DateRangeFilterBar';
import { MetricsDashboard } from './components/MetricsDashboard';
import { ChartsDashboard } from './components/ChartsDashboard';
import { SecuritySealDashboard } from './components/SecuritySealDashboard';
import { IssuesTableView } from './components/IssuesTableView';
import { FormulaEditorModal } from './components/FormulaEditorModal';
import { ProjectManagerModal } from './components/ProjectManagerModal';
import { ImportModal } from './components/ImportModal';
import { DataMergeModal } from './components/DataMergeModal';
import { SettingsModal } from './components/SettingsModal';
import { TargetProjectListModal } from './components/TargetProjectListModal';
import { ClearDataModal } from './components/ClearDataModal';
import { getTabFromPath, getPathForTab, getTitleForTab, ADMIN_TABS } from './utils/routes';
import { UsersPage } from './components/UsersPage';
import { SettingsLayout, SettingsPanel, DangerZone, isSettingsTab } from './components/SettingsPage';
import { JiraIntegrationPage, JiraCredentials } from './components/JiraIntegrationPage';
import { MonitorFrame, isMonitorTab } from './components/MonitorFrame';
import AssessmentTracker from './components/tracker/AssessmentTracker.jsx';
import SizeCalculator from './components/tracker/SizeCalculator.jsx';
import PrivacyImpact from './components/pia/PrivacyImpact.jsx';
import { matchKey } from '../tracker/shared/logic.js';
import { useSharedTargets, saveSharedTargets, appCount } from './utils/sharedTargets';
import { getProjectSecuritySeal } from './utils/securitySeal';
import { reportIssuesOf, ReportIssues } from './utils/reportIssues';
import { useTrackerApps, decommissionedMatcher, setAppDecommissioned, trackerKnows } from './utils/trackerApps';

// Assessment Tracker sidebar entries -> section shown by <AssessmentTracker>.
const TRACKER_TABS = [
  { tab: 'tracker', section: 'monitoring', label: 'Monitoring', Icon: LayoutDashboard },
  { tab: 'tracker-assessment', section: 'assessment', label: 'Assessment List', Icon: Table2 },
  { tab: 'tracker-time', section: 'time', label: 'Time Report', Icon: Timer },
  { tab: 'tracker-comparison', section: 'comparison', label: 'Period Comparison', Icon: GitCompareArrows },
  { tab: 'tracker-checklist', section: 'checklist', label: 'Checklist', Icon: ListChecks },
  { tab: 'tracker-decommissioned', section: 'decommissioned', label: 'Decommissioned', Icon: Archive },
  { tab: 'tracker-size', section: 'size', label: 'Size Calculator', Icon: Calculator },
  { tab: 'tracker-sync', section: 'sync', label: 'UberTicket Sync', Icon: RefreshCcw },
  { tab: 'tracker-import', section: 'import', label: 'Import Excel', Icon: FileUp },
] as const;
const trackerSection = (tab: ActiveTab) => TRACKER_TABS.find(t => t.tab === tab)?.section;
// Tracker pages that read tracker data (the Size Calculator is a stand-alone tool).
const trackerDataSection = (tab: ActiveTab) => { const s = trackerSection(tab); return s === 'size' ? undefined : s; };

// Privacy Impact Assessment sidebar entries -> section shown by <PrivacyImpact>.
const PIA_TABS = [
  { tab: 'pia', section: 'overview', label: 'PIA Overview', Icon: Fingerprint },
  { tab: 'pia-matching', section: 'matching', label: 'PIA Matching', Icon: Link2 },
] as const;
const piaSection = (tab: ActiveTab) => PIA_TABS.find(t => t.tab === tab)?.section;

const AUTO_SYNC_INTERVAL_MS = 15 * 60 * 1000;
const FILTERABLE_TABS: ActiveTab[] = ['dashboard', 'charts', 'seal', 'dependabots', 'issues', 'projects'];

// Global project filter: an exact project name selects just that project; any other text is a
// case-insensitive "contains" search (e.g. "Genesis" matches "Genesis IOS" and "Genesis AOS").
function createProjectMatcher(query: string, knownProjects: string[]): (projectName: string) => boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return () => true;
  const isExact = knownProjects.some(name => name.toLowerCase() === needle);
  return projectName => {
    const name = (projectName || '').toLowerCase();
    return isExact ? name === needle : name.includes(needle);
  };
}

function removeCancelledIssues(rows: IssueRecord[], config: FormulaConfig): IssueRecord[] {
  const cancelledStatuses = new Set(
    config.cancelledStatuses.map(status => status.trim().toLowerCase())
  );
  return rows.filter(issue => !cancelledStatuses.has((issue.status || '').trim().toLowerCase()));
}

export default function App() {
  // 1. Permanent State & Data Initialization
  // Sign-in is handled by the server (Microsoft, auth/auth.js); this page only loads for a signed-in user.
  // The role decides what is shown; the server enforces the same rules on every admin-only action.
  const [currentUser, setCurrentUser] = useState<{ name: string; email: string; role: 'admin' | 'user' } | null>(null);
  const isAdmin = currentUser?.role === 'admin';
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings());
  // The shared Target Project List (server); it replaces this browser's own copy once it is set up.
  const sharedTargets = useSharedTargets();
  // Apps decommissioned in the Assessment Tracker are left out of every analytics page (shared for everyone).
  const trackerApps = useTrackerApps();
  const isDecommissionedApp = useMemo(() => decommissionedMatcher(trackerApps), [trackerApps]);
  // The full dataset, cancelled issues included: they are kept (and saved) so an assessment report can count
  // an issue that was still open on its resolution date and cancelled later. Every analytics page reads
  // `issues`, which leaves cancelled issues out, as before.
  const [allIssues, setIssues] = useState<IssueRecord[]>(() => {
    const saved = loadSavedData();
    if (saved && Array.isArray(saved) && saved.length > 0) {
      return saved;
    }
    return [];
  });
  const issues = useMemo(
    () => removeCancelledIssues(allIssues, settings.formulaConfig),
    [allIssues, settings.formulaConfig]
  );

  const [activeTab, setActiveTab] = useState<ActiveTab>(
    () => getTabFromPath(window.location.pathname) ?? 'dashboard'
  );
  const [drilldownPlatform, setDrilldownPlatform] = useState<string>('ALL');
  const [selectedProjectFilter, setSelectedProjectFilter] = useState<string>('');
  const [selectedSeverityFilter, setSelectedSeverityFilter] = useState<string>('');
  const [isDataLoading, setIsDataLoading] = useState(false);
  const [isJiraSyncing, setIsJiraSyncing] = useState(false);
  const [isRemoteHydrated, setIsRemoteHydrated] = useState(false);
  const [isRemotePersistenceConfigured, setIsRemotePersistenceConfigured] = useState(false);
  const remoteSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Modal visibility states
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isMergeOpen, setIsMergeOpen] = useState(false);
  const [isFormulasOpen, setIsFormulasOpen] = useState(false);
  const [isProjectsOpen, setIsProjectsOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isTargetListOpen, setIsTargetListOpen] = useState(false);
  const [isClearDataOpen, setIsClearDataOpen] = useState(false);

  // 1.1 Keep the URL in sync with the active tab so each page has its own link.
  useEffect(() => {
    const currentTab = getTabFromPath(window.location.pathname);
    const targetPath = getPathForTab(activeTab);
    if (currentTab === undefined) {
      // Unknown path: show the default page under its canonical URL.
      window.history.replaceState(null, '', targetPath + window.location.search);
    } else if (currentTab !== activeTab) {
      window.history.pushState(null, '', targetPath);
    }
    document.title = `${getTitleForTab(activeTab)} · Security Issues Analytics`;
  }, [activeTab]);

  useEffect(() => {
    const handlePopState = () => {
      setActiveTab(getTabFromPath(window.location.pathname) ?? 'dashboard');
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // 2. Persist settings on changes
  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  // 2.1 Load remotely persisted issues from Postgres, then allow fallback bootstrap.
  useEffect(() => {
    let isCancelled = false;

    const hydrateRemoteIssues = async () => {
      try {
        const { issues: remoteIssues, configured } = await loadRemoteIssues();
        if (isCancelled) return;
        setIsRemotePersistenceConfigured(configured);

        if (configured && Array.isArray(remoteIssues) && remoteIssues.length > 0) {
          setIssues(remoteIssues);
        }
      } catch (error) {
        console.warn('Remote database is unavailable. Falling back to local storage/data bootstrap.', error);
      } finally {
        if (!isCancelled) {
          setIsRemoteHydrated(true);
        }
      }
    };

    hydrateRemoteIssues();

    return () => {
      isCancelled = true;
    };
  }, []);

  // 3. Persist dataset on changes if autoSaveData is enabled
  useEffect(() => {
    if (!settings.autoSaveData) return;

    savePersistedData(allIssues);

    // Only admins change the shared dataset; a user's changes stay in their own browser.
    if (!isAdmin || !isRemoteHydrated || !isRemotePersistenceConfigured) return;

    if (remoteSaveTimeoutRef.current) {
      clearTimeout(remoteSaveTimeoutRef.current);
    }

    remoteSaveTimeoutRef.current = setTimeout(() => {
      saveRemoteIssues(allIssues).catch(error => {
        console.warn('Failed to persist issues to remote database:', error);
      });
    }, 600);

    return () => {
      if (remoteSaveTimeoutRef.current) {
        clearTimeout(remoteSaveTimeoutRef.current);
        remoteSaveTimeoutRef.current = null;
      }
    };
  }, [allIssues, settings.autoSaveData, isRemoteHydrated, isRemotePersistenceConfigured, isAdmin]);

  // 3.1 Bootstrap permanent default dataset from bundled workbook when storage is empty.
  useEffect(() => {
    let isCancelled = false;

    const bootstrapDefaultData = async () => {
      if (!isRemoteHydrated) return;
      if (allIssues.length > 0) return;
      setIsDataLoading(true);
      try {
        // Try Jira-backed datasource first so users don't need manual imports.
        const jiraResponse = await fetch('/api/jira/issues');
        if (jiraResponse.ok) {
          const jiraPayload = await jiraResponse.json();
          const jiraRows = Array.isArray(jiraPayload?.rows) ? jiraPayload.rows : [];
          if (jiraRows.length > 0) {
            const { rows } = mapObjectsToIssueRecords(jiraRows, settings.formulaConfig);
            if (!isCancelled && rows.length > 0) {
              setIssues(rows);
              savePersistedData(rows);
              return;
            }
          }
        }

        // Prefer the new datasource filename and gracefully fallback for backward compatibility.
        const candidateSources = ['/All Issues.xlsx', '/All-Issues.xlsx'];
        let response: Response | null = null;
        let sourceName = 'All Issues.xlsx';

        for (const source of candidateSources) {
          const nextResponse = await fetch(source);
          if (nextResponse.ok) {
            response = nextResponse;
            sourceName = source.split('/').pop() || 'All Issues.xlsx';
            break;
          }
        }

        if (!response) return;

        const blob = await response.blob();
        const file = new File(
          [blob],
          sourceName,
          { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }
        );

        const { rows } = await parseExcelOrCsvFile(file, settings.formulaConfig);
        if (!isCancelled && rows.length > 0) {
          setIssues(rows);
          savePersistedData(rows);
        }
      } catch (err) {
        console.error('Failed to bootstrap default workbook data:', err);
      } finally {
        if (!isCancelled) setIsDataLoading(false);
      }
    };

    bootstrapDefaultData();
    return () => {
      isCancelled = true;
    };
  }, [issues.length, settings.formulaConfig]);

  const severityFilteredIssues = useMemo(() => {
    if (!selectedSeverityFilter) return issues;

    return issues.filter(issue => (getNormalizedSeverity(issue) || 'unclassified') === selectedSeverityFilter);
  }, [issues, selectedSeverityFilter]);

  // 4. Compute Project Metrics & Filtered Data with Custom Target Watchlist
  const { summaries, filteredIssues } = useMemo(() => {
    return computeProjectSummaries(
      severityFilteredIssues,
      settings.formulaConfig,
      settings.dateFilter,
      settings.deletedProjects,
      settings.projectAliases,
      settings.customProjectList,
      settings.useCustomProjectListOnly,
      isDecommissionedApp
    );
  }, [
    isDecommissionedApp,
    severityFilteredIssues,
    settings.formulaConfig, 
    settings.dateFilter, 
    settings.deletedProjects, 
    settings.projectAliases,
    settings.customProjectList,
    settings.useCustomProjectListOnly
  ]);

  const projectFilterOptions = useMemo(
    () => summaries.map(summary => summary.projectName).sort((a, b) => a.localeCompare(b)),
    [summaries]
  );

  const matchesProject = useMemo(
    () => createProjectMatcher(selectedProjectFilter, projectFilterOptions),
    [selectedProjectFilter, projectFilterOptions]
  );

  // Everything below the global filter bar reads these project-scoped lists.
  // Assessment Tracker: each app's current Security Seal (all issues, every severity), used to
  // snapshot the seal when its UberTicket resolves. Null while issues load or off the tracker pages.
  const isTrackerPage = Boolean(trackerDataSection(activeTab));
  const trackerSummaries = useMemo(() => {
    if (!isTrackerPage || isDataLoading || issues.length === 0) return null;
    // All issues, cancelled ones included: a report counts an issue cancelled after its resolution date.
    // The seal snapshot is unaffected (cancelled issues are never outstanding).
    return computeProjectSummaries(
      allIssues,
      settings.formulaConfig,
      settings.dateFilter,
      settings.deletedProjects,
      settings.projectAliases,
      settings.customProjectList,
      settings.useCustomProjectListOnly
    ).summaries;
  }, [isTrackerPage, isDataLoading, issues, allIssues, settings]);
  const sealByProject = useMemo(() => {
    if (!trackerSummaries) return null;
    const map = new Map<string, string>();
    trackerSummaries.forEach(summary => map.set(matchKey(summary.projectName), getProjectSecuritySeal(summary).seal));
    return map;
  }, [trackerSummaries]);
  // Assessment report: an app's unresolved issues, now or as of a date (null while issues load).
  const reportIssuesFor = useCallback(
    (name: string, asOf?: string): ReportIssues | null => {
      if (!trackerSummaries) return !isDataLoading && issues.length === 0 ? { matched: false, issues: [] } : null;
      const summary = trackerSummaries.find(s => matchKey(s.projectName) === matchKey(name));
      return summary
        ? { matched: true, issues: reportIssuesOf(summary, settings.formulaConfig, asOf) }
        : { matched: false, issues: [] };
    },
    [trackerSummaries, settings.formulaConfig, isDataLoading, issues.length]
  );
  const sealForProject = useMemo(
    () => (sealByProject ? (name: string) => sealByProject.get(matchKey(name)) ?? null : null),
    [sealByProject]
  );

  const scopedSummaries = useMemo(
    () => summaries.filter(summary => matchesProject(summary.projectName)),
    [summaries, matchesProject]
  );
  const scopedIssues = useMemo(
    () => filteredIssues.filter(issue => matchesProject(issue.project)),
    [filteredIssues, matchesProject]
  );

  // Dependabots-only view: reuse all formulas but only include issues tagged [github-dependabots]
  const dependabotsSourceIssues = useMemo(() => {
    return severityFilteredIssues.filter(isDependabotsIssue);
  }, [severityFilteredIssues]);

  const { summaries: dependabotsSummaries, filteredIssues: dependabotsFilteredIssues } = useMemo(() => {
    return computeProjectSummaries(
      dependabotsSourceIssues,
      settings.formulaConfig,
      settings.dateFilter,
      settings.deletedProjects,
      settings.projectAliases,
      settings.customProjectList,
      settings.useCustomProjectListOnly,
      isDecommissionedApp
    );
  }, [
    isDecommissionedApp,
    dependabotsSourceIssues,
    settings.formulaConfig,
    settings.dateFilter,
    settings.deletedProjects,
    settings.projectAliases,
    settings.customProjectList,
    settings.useCustomProjectListOnly
  ]);

  const scopedDependabotsSummaries = useMemo(
    () => dependabotsSummaries.filter(summary => matchesProject(summary.projectName)),
    [dependabotsSummaries, matchesProject]
  );
  const scopedDependabotsIssues = useMemo(
    () => dependabotsFilteredIssues.filter(issue => matchesProject(issue.project)),
    [dependabotsFilteredIssues, matchesProject]
  );

  // 5. Extract all unique project names ever detected in dataset
  const allDetectedProjects = useMemo(() => {
    const set = new Set<string>();
    summaries.forEach(s => set.add(s.projectName));
    issues.forEach(i => {
      if (i.project) set.add(i.project);
      if (i.baseProject) set.add(i.baseProject);
    });
    return Array.from(set).sort();
  }, [issues, summaries]);

  // Handler: Update Date Filter
  const handleDateFilterChange = (newFilter: DateFilter) => {
    setSettings(prev => ({
      ...prev,
      dateFilter: newFilter,
    }));
  };

  // Handler: Delete Project (soft delete saved permanently in settings)
  const handleDeleteProject = (projectName: string) => {
    setSettings(prev => ({
      ...prev,
      deletedProjects: Array.from(new Set([...prev.deletedProjects, projectName])),
    }));
  };

  // Handler: Decommission / restore an app in the Assessment Tracker (applies to everyone's analytics pages).
  const [decommissionError, setDecommissionError] = useState('');
  const handleSetDecommissioned = async (projectName: string, decommissioned: boolean) => {
    let reason = '';
    if (decommissioned) {
      const answer = window.prompt(`Decommission ${projectName}? It leaves Active Applications and every metrics page for everyone, and is marked Decommissioned in the Assessment Tracker. You can restore it later.\n\nReason (optional):`, '');
      if (answer === null) return;
      reason = answer;
    } else if (!window.confirm(`Restore ${projectName}? It comes back to the metrics pages and the Assessment Tracker.`)) {
      return;
    }
    setDecommissionError('');
    try {
      await setAppDecommissioned(projectName, decommissioned, reason);
    } catch (error: any) {
      setDecommissionError(String(error?.message || error));
    }
  };

  // Handler: Toggle Delete / Restore Project
  const handleToggleDeleteProject = (projectName: string) => {
    setSettings(prev => {
      const isAlreadyDeleted = prev.deletedProjects.some(p => p.toLowerCase() === projectName.toLowerCase());
      if (isAlreadyDeleted) {
        return {
          ...prev,
          deletedProjects: prev.deletedProjects.filter(p => p.toLowerCase() !== projectName.toLowerCase()),
        };
      } else {
        return {
          ...prev,
          deletedProjects: [...prev.deletedProjects, projectName],
        };
      }
    });
  };

  // Handler: Restore All Deleted Projects
  const handleRestoreAllProjects = () => {
    setSettings(prev => ({
      ...prev,
      deletedProjects: [],
    }));
  };

  // Handler: Add Project Alias / Merge
  const handleAddAlias = (from: string, to: string) => {
    setSettings(prev => ({
      ...prev,
      projectAliases: [
        ...prev.projectAliases.filter(a => a.from.toLowerCase() !== from.toLowerCase()),
        { from, to }
      ]
    }));
  };

  // Handler: Remove Project Alias
  const handleRemoveAlias = (from: string) => {
    setSettings(prev => ({
      ...prev,
      projectAliases: prev.projectAliases.filter(a => a.from.toLowerCase() !== from.toLowerCase())
    }));
  };

  // Handler: Batch Merge Multiple Projects
  const handleBatchMergeProjects = (sourceProjects: string[], targetName: string) => {
    setSettings(prev => {
      const sourceLower = new Set(sourceProjects.map(s => s.trim().toLowerCase()));
      const targetClean = targetName.trim();

      // Remove any existing aliases for these sources or targets to prevent loops
      const cleanedAliases = prev.projectAliases.filter(
        a => !sourceLower.has(a.from.trim().toLowerCase())
      );

      const newAliases: ProjectAlias[] = [];
      sourceProjects.forEach(src => {
        const srcClean = src.trim();
        if (srcClean.toLowerCase() !== targetClean.toLowerCase()) {
          newAliases.push({ from: srcClean, to: targetClean });
        }
      });

      return {
        ...prev,
        projectAliases: [...cleanedAliases, ...newAliases],
      };
    });
  };

  // Handler: Batch Unmerge Projects (remove from merge)
  const handleBatchUnmergeProjects = (projectNames: string[]) => {
    setSettings(prev => {
      const namesLower = new Set(projectNames.map(p => p.trim().toLowerCase()));
      // Filter out any alias where either `from` or `to` matches the unmerged projects
      const updatedAliases = prev.projectAliases.filter(
        a => !namesLower.has(a.from.trim().toLowerCase()) && !namesLower.has(a.to.trim().toLowerCase())
      );

      return {
        ...prev,
        projectAliases: updatedAliases,
      };
    });
  };

  // Handler: Save Target Project Watchlist (admins; saved on the server for everyone). Also un-blacklists any
  // project present in the target list.
  const handleSaveTargetList = (list: string[], useOnly: boolean) => {
    if (!isAdmin) return;
    saveSharedTargets({ names: list, targetOnly: useOnly })
      .then(saved => {
        const listLower = new Set(saved.names.map(p => p.trim().toLowerCase()));
        setSettings(prev => ({
          ...prev,
          deletedProjects: prev.deletedProjects.filter(p => !listLower.has(p.trim().toLowerCase())),
        }));
      })
      .catch(err => window.alert(err.message));
  };

  // Handler: Save Formula Configuration Permanently
  const handleSaveFormulaConfig = (newConfig: FormulaConfig) => {
    setSettings(prev => ({
      ...prev,
      formulaConfig: newConfig,
    }));
  };

  // Handler: Import Complete
  const handleImportComplete = (importedRows: IssueRecord[], mode: 'replace' | 'append' | 'deduplicate') => {
    // Cancelled rows are kept (hidden from the analytics pages; used by assessment reports).
    if (mode === 'replace') {
      setIssues(importedRows);
    } else if (mode === 'append') {
      setIssues(prev => [...prev, ...importedRows]);
    } else {
      // Deduplicate
      const map = new Map<string, IssueRecord>();
      allIssues.forEach(i => map.set(i.id, i));
      importedRows.forEach(i => map.set(i.id, i));
      setIssues(Array.from(map.values()));
    }
  };

  // Handler: Data Merge Complete
  const handleMergeComplete = (mergedRows: IssueRecord[]) => {
    setIssues(mergedRows);
  };

  // Handler: Drilldown into specific project or platform
  const handleDrilldown = (projectName: string, platformTag?: string) => {
    setSelectedProjectFilter(projectName);
    setDrilldownPlatform(platformTag || 'ALL');
    setActiveTab('issues');
  };

  // Handler: Export to Excel (.xlsx)
  const handleExportExcel = () => {
    const includeSeverity = window.confirm(
      'Export with severity columns?\n\nClick OK for WITH severity (Low/Medium/High/Critical).\nClick Cancel for TOTALS only.'
    );

    let dateRangeText = 'All Time';
    if (settings.dateFilter.startDate || settings.dateFilter.endDate) {
      dateRangeText = `${settings.dateFilter.startDate || 'Beginning'} to ${settings.dateFilter.endDate || 'Present'}`;
    }
    exportToExcel(
      scopedSummaries,
      scopedIssues,
      dateRangeText,
      `Project_Issues_Metrics_${new Date().toISOString().split('T')[0]}.xlsx`,
      includeSeverity
    );
  };

  // Handler: Export CSV
  // Handler: Reset Data to Empty Dataset
  const handleResetDataToSample = () => {
    setIssues([]);
    savePersistedData([]);
    setSelectedProjectFilter('');
    setDrilldownPlatform('ALL');
  };

  // Handler: Delete All Workspace Data permanently
  const handleClearAllData = (options: { clearTargetList: boolean; clearAliases: boolean }) => {
    setIssues([]);
    savePersistedData([]);
    if (options.clearTargetList) {
      if (sharedTargets?.seeded) {
        if (isAdmin) saveSharedTargets({ names: [] }).catch(err => window.alert(err.message));
      } else {
        setSettings(prev => ({
          ...prev,
          customProjectList: [],
        }));
      }
    }
    if (options.clearAliases) {
      setSettings(prev => ({
        ...prev,
        projectAliases: [],
      }));
    }
    setSelectedProjectFilter('');
    setDrilldownPlatform('ALL');
  };

  const handleSyncFromJira = useCallback(async (credentials: JiraCredentials): Promise<{ loaded: number; error?: string }> => {
    if (!credentials.baseUrl || !credentials.email || !credentials.apiToken || (!credentials.filterId && !credentials.jql)) {
      return { loaded: 0, error: 'Please fill base URL, email, API token, and either Filter ID or JQL.' };
    }

    setIsJiraSyncing(true);
    setIsDataLoading(true);
    try {
      const response = await fetch('/api/jira/issues', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(credentials),
      });

      const rawPayload = await response.text();
      let payload: any = null;
      try {
        payload = rawPayload ? JSON.parse(rawPayload) : {};
      } catch {
        return {
          loaded: 0,
          error: 'Jira sync endpoint returned non-JSON content. Make sure you are running via npm run dev and use Jira Base URL like https://your-domain.atlassian.net (not /issues links).',
        };
      }

      if (!response.ok) {
        return { loaded: 0, error: String(payload?.error || `Sync failed with status ${response.status}`) };
      }

      const jiraRows = Array.isArray(payload?.rows) ? payload.rows : [];
      if (jiraRows.length === 0) {
        return { loaded: 0, error: 'No issues returned from Jira for the given filter/JQL.' };
      }

      const { rows } = mapObjectsToIssueRecords(jiraRows, settings.formulaConfig);
      const activeRows = removeCancelledIssues(rows, settings.formulaConfig);
      setIssues(rows);
      savePersistedData(rows);
      saveJiraIntegrationProfile({
        ...loadJiraIntegrationProfile(),
        ...credentials,
        autoSyncEnabled: credentials.autoSyncEnabled !== undefined
          ? Boolean(credentials.autoSyncEnabled)
          : loadJiraIntegrationProfile().autoSyncEnabled,
        lastSyncedAt: new Date().toISOString(),
      });
      setSelectedProjectFilter('');
      setDrilldownPlatform('ALL');
      return { loaded: activeRows.length };
    } catch (error: any) {
      return { loaded: 0, error: String(error?.message || error) };
    } finally {
      setIsJiraSyncing(false);
      setIsDataLoading(false);
    }
  }, [settings.formulaConfig]);

  useEffect(() => {
    let isCancelled = false;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const runAutoSync = async () => {
      if (isCancelled || !isAdmin) return;
      const profile = loadJiraIntegrationProfile();
      if (!profile.autoSyncEnabled) return;
      if (!profile.baseUrl || !profile.email || !profile.apiToken || (!profile.filterId && !profile.jql)) return;

      if (!isCancelled) {
        await handleSyncFromJira({
          baseUrl: profile.baseUrl,
          email: profile.email,
          apiToken: profile.apiToken,
          filterId: profile.filterId,
          jql: profile.jql,
          severityField: profile.severityField,
          securityDueDateField: profile.securityDueDateField,
          securityTypeField: profile.securityTypeField,
          autoSyncEnabled: profile.autoSyncEnabled,
        });
      }
    };

    intervalId = setInterval(() => {
      runAutoSync().catch(err => {
        console.error('Auto-sync failed:', err);
      });
    }, AUTO_SYNC_INTERVAL_MS);

    return () => {
      isCancelled = true;
      if (intervalId) clearInterval(intervalId);
    };
  }, [handleSyncFromJira, isAdmin]);

  // Handler: Restore Full Backup
  const handleRestoreBackup = (backup: { settings: AppSettings; issues: IssueRecord[] }) => {
    // A backup doesn't replace the shared Target Project List.
    setSettings(prev => (sharedTargets?.seeded
      ? { ...backup.settings, customProjectList: prev.customProjectList, useCustomProjectListOnly: prev.useCustomProjectListOnly }
      : backup.settings));
    setIssues(backup.issues);
  };

  useEffect(() => {
    fetch('/auth/me')
      .then(response => (response.ok ? response.json() : null))
      .then(user => setCurrentUser(user ? { name: user.name || '', email: user.email || '', role: user.role === 'admin' ? 'admin' : 'user' } : null))
      .catch(() => setCurrentUser(null));
  }, []);

  // Shared Target Project List: use the server's list and switch. If it isn't set up yet, the first admin
  // to open the app sets it up from this browser's list (or the built-in default), with the switch on.
  const seedingTargets = useRef(false);
  useEffect(() => {
    if (!sharedTargets) return;
    if (sharedTargets.seeded) {
      setSettings(prev => ({ ...prev, customProjectList: sharedTargets.names, useCustomProjectListOnly: sharedTargets.targetOnly }));
    } else if (isAdmin && !seedingTargets.current) {
      seedingTargets.current = true;
      const names = settings.customProjectList?.length ? settings.customProjectList : DEFAULT_SETTINGS.customProjectList;
      saveSharedTargets({ names, targetOnly: true, seed: true }).catch(err => console.error(err));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sharedTargets, isAdmin]);

  // Users can't open admin pages (e.g. from a bookmarked URL); wait until the role is known.
  useEffect(() => {
    if (currentUser && !isAdmin && ADMIN_TABS.includes(activeTab)) setActiveTab('dashboard');
  }, [currentUser, isAdmin, activeTab]);

  // Sign out is a POST (a form submit), so another site can't sign people out with a link.
  const handleSignOut = () => {
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = '/auth/logout';
    document.body.appendChild(form);
    form.submit();
  };

  return (
    <div className="cloudstaff-theme min-h-screen bg-white text-slate-100 flex flex-col selection:bg-blue-600 selection:text-white">
      {/* Top Navigation */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onOpenImport={isAdmin ? () => setIsImportOpen(true) : undefined}
        onOpenMerge={isAdmin ? () => setIsMergeOpen(true) : undefined}
        onExportExcel={handleExportExcel}
        onOpenFormulas={() => setIsFormulasOpen(true)}
        onOpenProjects={() => setIsProjectsOpen(true)}
        onOpenTargetList={() => setIsTargetListOpen(true)}
        onOpenSettings={() => setActiveTab('settings')}
        onSignOut={handleSignOut}
        signedInAs={currentUser ? `${currentUser.name || currentUser.email}${isAdmin ? ' · Admin' : ''}` : ''}
        totalIssuesCount={issues.length}
        activeProjectsCount={summaries.length}
        customProjectListCount={settings.customProjectList?.length || 0}
      />

      {/* Global filter bar: shown only on pages whose data it filters (monitoring tabs have their own) */}
      {FILTERABLE_TABS.includes(activeTab) && <DateRangeFilterBar
        dateFilter={settings.dateFilter}
        onChange={handleDateFilterChange}
        projectOptions={projectFilterOptions}
        selectedProject={selectedProjectFilter}
        onProjectChange={setSelectedProjectFilter}
        selectedSeverity={selectedSeverityFilter}
        onSeverityChange={setSelectedSeverityFilter}
        isDataLoading={isDataLoading}
        totalFilteredCount={activeTab === 'dependabots' ? scopedDependabotsIssues.length : scopedIssues.length}
        totalAllCount={activeTab === 'dependabots' ? issues.filter(isDependabotsIssue).length : issues.length}
      />}

      {/* Main Content Workspace */}
      <div className="flex-1 w-full px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <div className="flex items-start gap-4 lg:gap-6">
          <aside className="hidden lg:block w-56 xl:w-64 2xl:w-72 shrink-0 sticky top-28">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-2 space-y-1 shadow-sm">
              <button
                id="tab-dashboard-btn"
                onClick={() => setActiveTab('dashboard')}
                className={`w-full flex items-center space-x-2 px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
                  activeTab === 'dashboard'
                    ? 'bg-blue-600 text-white shadow-sm shadow-blue-900/20'
                    : 'text-slate-400 hover:text-slate-100 hover:bg-slate-700/50'
                }`}
              >
                <Layers className="w-4 h-4" />
                <span>Project Metrics</span>
              </button>

              <button
                id="tab-charts-btn"
                onClick={() => setActiveTab('charts')}
                className={`w-full flex items-center space-x-2 px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
                  activeTab === 'charts'
                    ? 'bg-blue-600 text-white shadow-sm shadow-blue-900/20'
                    : 'text-slate-400 hover:text-slate-100 hover:bg-slate-700/50'
                }`}
              >
                <PieChart className="w-4 h-4" />
                <span>Dashboard</span>
              </button>

              <button
                id="tab-security-seal-btn"
                onClick={() => setActiveTab('seal')}
                className={`w-full flex items-center space-x-2 px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
                  activeTab === 'seal'
                    ? 'bg-blue-600 text-white shadow-sm shadow-blue-900/20'
                    : 'text-slate-400 hover:text-slate-100 hover:bg-slate-700/50'
                }`}
              >
                <ShieldCheck className="w-4 h-4" />
                <span>Security Seal</span>
              </button>

              <button
                id="tab-dependabots-btn"
                onClick={() => setActiveTab('dependabots')}
                className={`w-full flex items-center space-x-2 px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
                  activeTab === 'dependabots'
                    ? 'bg-blue-600 text-white shadow-sm shadow-blue-900/20'
                    : 'text-slate-400 hover:text-slate-100 hover:bg-slate-700/50'
                }`}
              >
                <Bot className="w-4 h-4" />
                <span>Dependabots Issues</span>
              </button>

              <button
                id="tab-issues-btn"
                onClick={() => setActiveTab('issues')}
                className={`w-full flex items-center space-x-2 px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
                  activeTab === 'issues'
                    ? 'bg-blue-600 text-white shadow-sm shadow-blue-900/20'
                    : 'text-slate-400 hover:text-slate-100 hover:bg-slate-700/50'
                }`}
              >
                <ListFilter className="w-4 h-4" />
                <span>All Issues</span>
              </button>

              <button
                id="tab-projects-btn"
                onClick={() => setActiveTab('projects')}
                className={`w-full flex items-center space-x-2 px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
                  activeTab === 'projects'
                    ? 'bg-blue-600 text-white shadow-sm shadow-blue-900/20'
                    : 'text-slate-400 hover:text-slate-100 hover:bg-slate-700/50'
                }`}
              >
                <FolderKanban className="w-4 h-4" />
                <span>Projects & Aliases</span>
              </button>

              <p className="px-3 pt-3 pb-1 text-[10px] font-extrabold uppercase tracking-wider text-slate-500">UberTicket Monitoring</p>
              {([
                ['dpsa', 'DPSA Monitoring', Gauge],
                ['full-assessment', 'Full Assessment', ScanSearch],
                ['roe', 'Rules of Engagement', ClipboardCheck],
              ] as const).map(([tab, label, Icon]) => (
                <button
                  key={tab}
                  id={`tab-${tab}-btn`}
                  onClick={() => setActiveTab(tab)}
                  className={`w-full flex items-center space-x-2 px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
                    activeTab === tab
                      ? 'bg-blue-600 text-white shadow-sm shadow-blue-900/20'
                      : 'text-slate-400 hover:text-slate-100 hover:bg-slate-700/50'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{label}</span>
                </button>
              ))}

              <p className="px-3 pt-3 pb-1 text-[10px] font-extrabold uppercase tracking-wider text-slate-500">Assessment Tracker</p>
              {TRACKER_TABS.filter(({ tab }) => !isSettingsTab(tab)).map(({ tab, label, Icon }) => (
                <button
                  key={tab}
                  id={`tab-${tab}-btn`}
                  onClick={() => setActiveTab(tab)}
                  className={`w-full flex items-center space-x-2 px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
                    activeTab === tab
                      ? 'bg-blue-600 text-white shadow-sm shadow-blue-900/20'
                      : 'text-slate-400 hover:text-slate-100 hover:bg-slate-700/50'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{label}</span>
                </button>
              ))}

              <p className="px-3 pt-3 pb-1 text-[10px] font-extrabold uppercase tracking-wider text-slate-500">Privacy (PIA)</p>
              {PIA_TABS.filter(({ tab }) => isAdmin || !ADMIN_TABS.includes(tab)).map(({ tab, label, Icon }) => (
                <button
                  key={tab}
                  id={`tab-${tab}-btn`}
                  onClick={() => setActiveTab(tab)}
                  className={`w-full flex items-center space-x-2 px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
                    activeTab === tab
                      ? 'bg-blue-600 text-white shadow-sm shadow-blue-900/20'
                      : 'text-slate-400 hover:text-slate-100 hover:bg-slate-700/50'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{label}</span>
                </button>
              ))}

              <div className="pt-2 mt-2" style={{ borderTop: '1px solid var(--cs-border)' }}>
                <button
                  id="tab-settings-btn"
                  onClick={() => setActiveTab('settings')}
                  className={`w-full flex items-center space-x-2 px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
                    isSettingsTab(activeTab)
                      ? 'bg-blue-600 text-white shadow-sm shadow-blue-900/20'
                      : 'text-slate-400 hover:text-slate-100 hover:bg-slate-700/50'
                  }`}
                >
                  <SettingsIcon className="w-4 h-4" />
                  <span>Settings</span>
                </button>
              </div>


            </div>
          </aside>

          <main className="flex-1 min-w-0">
        {activeTab === 'dashboard' && (
          <MetricsDashboard
            summaries={scopedSummaries}
            allFilteredIssues={scopedIssues}
            formulaConfig={settings.formulaConfig}
            dateFilter={settings.dateFilter}
            projectAliases={settings.projectAliases}
            customProjectList={settings.customProjectList}
            useCustomProjectListOnly={settings.useCustomProjectListOnly}
            onDeleteProject={handleDeleteProject}
            onDrilldownProject={handleDrilldown}
            onOpenFormulas={() => setIsFormulasOpen(true)}
            onOpenProjects={() => setIsProjectsOpen(true)}
            onOpenTargetList={() => setIsTargetListOpen(true)}
                onOpenImport={isAdmin ? () => setIsImportOpen(true) : undefined}
            onMergeProjects={handleBatchMergeProjects}
            onUnmergeProjects={handleBatchUnmergeProjects}
          />
        )}

        {activeTab === 'seal' && (
          <SecuritySealDashboard summaries={scopedSummaries} />
        )}

        {activeTab === 'charts' && (
          <ChartsDashboard
            issues={scopedIssues}
            formulaConfig={settings.formulaConfig}
          />
        )}

        {activeTab === 'issues' && (
          <IssuesTableView
            issues={scopedIssues}
            formulaConfig={settings.formulaConfig}
            dateFilter={settings.dateFilter}
            selectedPlatform={drilldownPlatform}
              />
        )}

        {activeTab === 'projects' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold text-white tracking-tight">Application & Project Directory</h2>
                <p className="text-xs text-slate-400">
                  Configure active applications, delete obsolete projects, or merge aliases permanently.
                </p>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setIsTargetListOpen(true)}
                  className="px-3.5 py-1.5 bg-purple-100 hover:bg-purple-200 text-purple-700 border border-purple-300 rounded-lg text-xs font-semibold transition shadow-sm"
                >
                  Target Project List ({settings.customProjectList?.length || 0} entries &middot; {appCount(settings.customProjectList)} apps)
                </button>
                <button
                  onClick={() => setIsProjectsOpen(true)}
                  className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold transition shadow-sm shadow-blue-900/20"
                >
                  Open Project Manager
                </button>
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4 shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <span className="font-semibold text-slate-200 text-sm">
                  Active Applications ({scopedSummaries.length})
                </span>
                {settings.deletedProjects.length > 0 && (
                  <span className="text-xs text-amber-700 bg-amber-100 border border-amber-300 px-2 py-0.5 rounded">
                    {settings.deletedProjects.length} Applications Deleted / Excluded
                  </span>
                )}
              </div>
              {decommissionError && <p className="text-xs text-red-600">{decommissionError}</p>}

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {scopedSummaries.map(p => (
                  <div
                    key={p.projectName}
                    className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl flex items-center justify-between hover:border-blue-300 transition shadow-sm"
                  >
                    <div>
                      <h3 className="font-semibold text-slate-200 text-xs">{p.projectName}</h3>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        {p.totalFound} Found &bull; {p.resolved} Resolved &bull; {p.outstanding} Backlog
                      </p>
                    </div>
                    <div className="flex items-center space-x-1">
                      <button
                        onClick={() => handleDrilldown(p.projectName)}
                        className="p-1.5 text-slate-400 hover:text-blue-400 hover:bg-slate-900 rounded transition text-xs"
                        title="View Tickets"
                      >
                        Inspect
                      </button>
                      {trackerKnows(trackerApps, p.projectName) && (
                        <button
                          onClick={() => handleSetDecommissioned(p.projectName, true)}
                          className="p-1.5 text-slate-500 hover:text-amber-600 hover:bg-amber-50 rounded transition text-xs"
                          title="Decommission: hide from every metrics page for everyone and mark it Decommissioned in the Assessment Tracker"
                        >
                          Decommission
                        </button>
                      )}
                      <button
                        onClick={() => handleDeleteProject(p.projectName)}
                        className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-950/30 rounded transition text-xs"
                        title="Delete App"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {trackerApps && trackerApps.some(a => a.decommissioned) && (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4 shadow-sm">
                <div className="border-b border-slate-800 pb-3">
                  <span className="font-semibold text-slate-200 text-sm">
                    Decommissioned Applications ({trackerApps.filter(a => a.decommissioned).length})
                  </span>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Decommissioned in the Assessment Tracker (here or in the assessment editor). Left out of every metrics page for everyone.
                  </p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {trackerApps.filter(a => a.decommissioned).sort((a, b) => a.name.localeCompare(b.name)).map(a => (
                    <div key={a.name} className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl flex items-center justify-between shadow-sm">
                      <div className="min-w-0">
                        <h3 className="font-semibold text-slate-200 text-xs">{a.name}</h3>
                        <p className="text-[11px] text-slate-400 mt-0.5 truncate" title={a.decommissionReason || undefined}>
                          {a.decommissionedAt ? `Since ${a.decommissionedAt}` : `${a.year} cycle`}{a.decommissionReason ? ` \u2022 ${a.decommissionReason}` : ''}
                        </p>
                      </div>
                      <button
                        onClick={() => handleSetDecommissioned(a.name, false)}
                        className="p-1.5 text-slate-400 hover:text-blue-400 hover:bg-slate-900 rounded transition text-xs"
                        title="Restore: back to the metrics pages and the Assessment Tracker"
                      >
                        Restore
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'dependabots' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-white tracking-tight">Dependabots Issues</h2>
                <p className="text-xs text-slate-400">
                  Counts only records containing <code className="text-blue-500 font-semibold">[github-dependabots]</code> and applies all active formulas.
                </p>
              </div>
            </div>

            <MetricsDashboard
              summaries={scopedDependabotsSummaries}
              allFilteredIssues={scopedDependabotsIssues}
              formulaConfig={settings.formulaConfig}
              dateFilter={settings.dateFilter}
              projectAliases={settings.projectAliases}
              customProjectList={settings.customProjectList}
              useCustomProjectListOnly={settings.useCustomProjectListOnly}
              onDeleteProject={handleDeleteProject}
              onDrilldownProject={handleDrilldown}
              onOpenFormulas={() => setIsFormulasOpen(true)}
              onOpenProjects={() => setIsProjectsOpen(true)}
              onOpenTargetList={() => setIsTargetListOpen(true)}
                    onOpenImport={isAdmin ? () => setIsImportOpen(true) : undefined}
              onMergeProjects={handleBatchMergeProjects}
              onUnmergeProjects={handleBatchUnmergeProjects}
            />

            <IssuesTableView
              issues={scopedDependabotsIssues}
              hideSourceFilter
              formulaConfig={settings.formulaConfig}
              dateFilter={settings.dateFilter}
              selectedPlatform={drilldownPlatform}
                  />
          </div>
        )}

        {isMonitorTab(activeTab) && <MonitorFrame tab={activeTab} />}

        {activeTab === 'tracker-size' && <SizeCalculator />}

        {trackerDataSection(activeTab) && !isSettingsTab(activeTab) && (
          <AssessmentTracker section={trackerDataSection(activeTab)} sealForProject={sealForProject} reportIssuesFor={reportIssuesFor} isAdmin={isAdmin} />
        )}

        {piaSection(activeTab) && (isAdmin || !ADMIN_TABS.includes(activeTab)) && (
          <PrivacyImpact section={piaSection(activeTab)} isAdmin={isAdmin} />
        )}

        {isSettingsTab(activeTab) && (isAdmin || !ADMIN_TABS.includes(activeTab)) && (
          <SettingsLayout activeTab={activeTab} onSelect={setActiveTab} isAdmin={isAdmin}>
            {activeTab === 'settings' && (
              <SettingsPanel
                title="Application Settings & Data Persistence"
                description="Where issue data is saved, the date range defaults, and backup / restore of your configuration."
                facts={[
                  ['Issues loaded', issues.length],
                  ['Merge rules', settings.projectAliases?.length || 0],
                ]}
                actionLabel="Open application settings"
                onAction={() => setIsSettingsOpen(true)}
              />
            )}
            {activeTab === 'formulas' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-white tracking-tight">Active Formula Rules & Logic Setup</h2>
                <p className="text-xs text-slate-400">
                  Review and customize calculation rules, keywords, and status definitions.
                </p>
              </div>
              <button
                onClick={() => setIsFormulasOpen(true)}
                className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold transition shadow-sm shadow-blue-900/20"
              >
                Launch Formula Editor
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-2">
                <span className="text-xs font-semibold text-blue-400 uppercase">Found Issues Formula</span>
                <p className="text-xs text-slate-300 font-mono">
                  COUNT_IF("{settings.formulaConfig.columnMapping.createdColumn}" in DateRange)
                </p>
                <p className="text-[11px] text-slate-400">
                  Separates keyword <code className="text-sky-300 font-bold">{settings.formulaConfig.iosKeyword}</code> and <code className="text-emerald-300 font-bold">{settings.formulaConfig.aosKeyword}</code> in the "{settings.formulaConfig.columnMapping.summaryColumn}" column.
                </p>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-2">
                <span className="text-xs font-semibold text-emerald-400 uppercase">Resolved Issues Formula</span>
                <p className="text-xs text-slate-300 font-mono">
                  COUNT_IF("{settings.formulaConfig.columnMapping.statusChangeColumn}" in DateRange AND Status IN DoneList)
                </p>
                <p className="text-[11px] text-slate-400">
                  Done Statuses: {settings.formulaConfig.doneStatuses.join(', ')}
                </p>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-2">
                <span className="text-xs font-semibold text-amber-400 uppercase">Outstanding / Backlog Formula</span>
                <p className="text-xs text-slate-300 font-mono">
                  COUNT_IF(Status NOT IN DoneList AND Status NOT IN CancelledList)
                </p>
                <p className="text-[11px] text-slate-400">
                  Cancelled Statuses: {settings.formulaConfig.cancelledStatuses.join(', ')}
                </p>
              </div>
            </div>
          </div>
            )}
            {activeTab === 'settings-targets' && (
              <SettingsPanel
                title="Target Project List"
                description="One shared list of the applications you report on. When “show only target projects” is on, the analytics, Assessment Tracker and PIA pages show just these apps, for everyone. New apps from Rules of Engagement tickets are added automatically."
                facts={[
                  ['Apps in list', settings.customProjectList?.length || 0],
                  ['Show only target projects', settings.useCustomProjectListOnly ? 'On' : 'Off'],
                  ['Added from Rules of Engagement', sharedTargets?.entries.filter(e => e.source === 'roe').length ?? 0],
                ]}
                actionLabel={isAdmin ? 'Edit target project list' : 'View target project list'}
                onAction={() => setIsTargetListOpen(true)}
              />
            )}
            {activeTab === 'jira' && (
          <JiraIntegrationPage
            onSync={handleSyncFromJira}
            isSyncing={isJiraSyncing}
          />
            )}
            {activeTab === 'settings-merge' && (
              <SettingsPanel
                title="Merge Data"
                description="Add issues from another Excel or CSV file to the data already loaded, without replacing it."
                facts={[['Issues loaded', issues.length]]}
                actionLabel="Merge a file"
                onAction={() => setIsMergeOpen(true)}
              />
            )}
            {(activeTab === 'tracker-import' || activeTab === 'tracker-sync') && (
              <AssessmentTracker section={trackerSection(activeTab)} sealForProject={sealForProject} reportIssuesFor={reportIssuesFor} isAdmin={isAdmin} />
            )}
            {activeTab === 'users' && <UsersPage />}
            {activeTab === 'settings-danger' && (
              <DangerZone
                issuesCount={issues.length}
                targetListCount={settings.customProjectList?.length || 0}
                aliasesCount={settings.projectAliases?.length || 0}
                onDeleteAll={() => setIsClearDataOpen(true)}
              />
            )}
          </SettingsLayout>
        )}
          </main>
        </div>
      </div>

      {/* Interactive Modals */}
      <TargetProjectListModal
        isOpen={isTargetListOpen}
        onClose={() => setIsTargetListOpen(false)}
        customProjectList={settings.customProjectList || []}
        useCustomProjectListOnly={Boolean(settings.useCustomProjectListOnly)}
        formulaConfig={settings.formulaConfig}
        projectAliases={settings.projectAliases || []}
        issues={issues}
        onSaveTargetList={handleSaveTargetList}
        readOnly={!isAdmin}
      />

      <ImportModal
        isOpen={isImportOpen}
        onClose={() => setIsImportOpen(false)}
        formulaConfig={settings.formulaConfig}
        onImportComplete={handleImportComplete}
        existingIssuesCount={issues.length}
        onClearCurrentData={() => {
          setIsImportOpen(false);
          setIsClearDataOpen(true);
        }}
      />

      <ClearDataModal
        isOpen={isClearDataOpen}
        onClose={() => setIsClearDataOpen(false)}
        onConfirmClear={handleClearAllData}
        totalIssuesCount={issues.length}
        targetListCount={settings.customProjectList?.length || 0}
        aliasesCount={settings.projectAliases?.length || 0}
      />

      <DataMergeModal
        isOpen={isMergeOpen}
        onClose={() => setIsMergeOpen(false)}
        currentIssues={allIssues}
        formulaConfig={settings.formulaConfig}
        onMergeComplete={handleMergeComplete}
      />

      <FormulaEditorModal
        isOpen={isFormulasOpen}
        onClose={() => setIsFormulasOpen(false)}
        config={settings.formulaConfig}
        onSaveConfig={handleSaveFormulaConfig}
        currentIssues={issues}
        dateFilter={settings.dateFilter}
      />

      <ProjectManagerModal
        isOpen={isProjectsOpen}
        onClose={() => setIsProjectsOpen(false)}
        allDetectedProjects={allDetectedProjects}
        deletedProjects={settings.deletedProjects}
        projectAliases={settings.projectAliases}
        onToggleDeleteProject={handleToggleDeleteProject}
        onRestoreAllProjects={handleRestoreAllProjects}
        onAddAlias={handleAddAlias}
        onRemoveAlias={handleRemoveAlias}
        issues={issues}
      />

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        issues={allIssues}
        onUpdateSettings={setSettings}
        onResetDataToSample={isAdmin ? handleResetDataToSample : undefined}
        onRestoreBackup={isAdmin ? handleRestoreBackup : undefined}
      />
    </div>
  );
}
