import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Layers,
  PieChart,
  ShieldCheck,
  ListFilter,
  FolderKanban,
  Calculator,
  Bot,
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
import { computeProjectSummaries } from './utils/metricsEngine';
import { exportToExcel } from './utils/excelParser';
import { parseExcelOrCsvFile, mapObjectsToIssueRecords } from './utils/excelParser';

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
import { LoginScreen } from './components/LoginScreen';
import { JiraIntegrationPage, JiraCredentials } from './components/JiraIntegrationPage';

const AUTH_SESSION_KEY = 'project_issue_analytics_authenticated_v1';
const AUTO_SYNC_INTERVAL_MS = 15 * 60 * 1000;

function hasAuthenticationSession(): boolean {
  try {
    return localStorage.getItem(AUTH_SESSION_KEY) === 'true' || sessionStorage.getItem(AUTH_SESSION_KEY) === 'true';
  } catch {
    return false;
  }
}

function removeCancelledIssues(rows: IssueRecord[], config: FormulaConfig): IssueRecord[] {
  const cancelledStatuses = new Set(
    config.cancelledStatuses.map(status => status.trim().toLowerCase())
  );
  return rows.filter(issue => !cancelledStatuses.has((issue.status || '').trim().toLowerCase()));
}

export default function App() {
  // 1. Permanent State & Data Initialization
  const [isAuthenticated, setIsAuthenticated] = useState(hasAuthenticationSession);
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings());
  const [issues, setIssues] = useState<IssueRecord[]>(() => {
    const saved = loadSavedData();
    if (saved && Array.isArray(saved) && saved.length > 0) {
      return saved;
    }
    return [];
  });

  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');
  const [drilldownProject, setDrilldownProject] = useState<string>('');
  const [drilldownPlatform, setDrilldownPlatform] = useState<string>('ALL');
  const [selectedProjectFilter, setSelectedProjectFilter] = useState<string>('');
  const [selectedSeverityFilter, setSelectedSeverityFilter] = useState<string>('');
  const [isDataLoading, setIsDataLoading] = useState(false);
  const [isJiraSyncing, setIsJiraSyncing] = useState(false);

  // Modal visibility states
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isMergeOpen, setIsMergeOpen] = useState(false);
  const [isFormulasOpen, setIsFormulasOpen] = useState(false);
  const [isProjectsOpen, setIsProjectsOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isTargetListOpen, setIsTargetListOpen] = useState(false);
  const [isClearDataOpen, setIsClearDataOpen] = useState(false);

  // 2. Persist settings on changes
  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  // 3. Persist dataset on changes if autoSaveData is enabled
  useEffect(() => {
    if (settings.autoSaveData) {
      savePersistedData(issues);
    }
  }, [issues, settings.autoSaveData]);

  // Cancelled records are excluded from the permanent local dataset.
  useEffect(() => {
    setIssues(currentIssues => {
      const activeIssues = removeCancelledIssues(currentIssues, settings.formulaConfig);
      return activeIssues.length === currentIssues.length ? currentIssues : activeIssues;
    });
  }, [settings.formulaConfig.cancelledStatuses]);

  // 3.1 Bootstrap permanent default dataset from bundled workbook when storage is empty.
  useEffect(() => {
    let isCancelled = false;

    const bootstrapDefaultData = async () => {
      if (issues.length > 0) return;
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
              const activeRows = removeCancelledIssues(rows, settings.formulaConfig);
              setIssues(activeRows);
              savePersistedData(activeRows);
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
          const activeRows = removeCancelledIssues(rows, settings.formulaConfig);
          setIssues(activeRows);
          savePersistedData(activeRows);
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

    return issues.filter(issue => {
      const severityValue = String(
        issue.severity || issue.raw?.severity || issue.raw?.Severity || issue.raw?.SEVERITY || issue.priority || ''
      ).trim().toLowerCase();
      const normalizedSeverity = ['critical', 'sev1', 's1', 'p0', 'blocker', 'urgent'].includes(severityValue) ? 'critical'
        : ['high', 'sev2', 's2', 'p1', 'major'].includes(severityValue) ? 'high'
        : ['medium', 'med', 'moderate', 'sev3', 's3', 'p2', 'normal'].includes(severityValue) ? 'medium'
        : ['low', 'minor', 'trivial', 'sev4', 's4', 'p3', 'p4'].includes(severityValue) ? 'low'
        : 'unclassified';
      return normalizedSeverity === selectedSeverityFilter;
    });
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
      settings.useCustomProjectListOnly
    );
  }, [
    severityFilteredIssues,
    settings.formulaConfig, 
    settings.dateFilter, 
    settings.deletedProjects, 
    settings.projectAliases,
    settings.customProjectList,
    settings.useCustomProjectListOnly
  ]);

  const dashboardIssues = useMemo(() => {
    if (!selectedProjectFilter) return filteredIssues;
    return filteredIssues.filter(issue => issue.project === selectedProjectFilter);
  }, [filteredIssues, selectedProjectFilter]);

  const projectFilterOptions = useMemo(
    () => summaries.map(summary => summary.projectName),
    [summaries]
  );

  // Dependabots-only view: reuse all formulas but only include issues tagged [github-dependabots]
  const dependabotsSourceIssues = useMemo(() => {
    return severityFilteredIssues.filter(issue => (issue.summary || '').toLowerCase().includes('[github-dependabots]'));
  }, [severityFilteredIssues]);

  const { summaries: dependabotsSummaries, filteredIssues: dependabotsFilteredIssues } = useMemo(() => {
    return computeProjectSummaries(
      dependabotsSourceIssues,
      settings.formulaConfig,
      settings.dateFilter,
      settings.deletedProjects,
      settings.projectAliases,
      settings.customProjectList,
      settings.useCustomProjectListOnly
    );
  }, [
    dependabotsSourceIssues,
    settings.formulaConfig,
    settings.dateFilter,
    settings.deletedProjects,
    settings.projectAliases,
    settings.customProjectList,
    settings.useCustomProjectListOnly
  ]);

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

  // Handler: Save Target Project Watchlist (automatically un-blacklists any project present in target list)
  const handleSaveTargetList = (list: string[], useOnly: boolean) => {
    setSettings(prev => {
      const listLower = new Set(list.map(p => p.trim().toLowerCase()));
      return {
        ...prev,
        customProjectList: list,
        useCustomProjectListOnly: useOnly,
        // Un-blacklist any project that is in the target list
        deletedProjects: prev.deletedProjects.filter(p => !listLower.has(p.trim().toLowerCase())),
      };
    });
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
    const activeImportedRows = removeCancelledIssues(importedRows, settings.formulaConfig);
    if (mode === 'replace') {
      setIssues(activeImportedRows);
    } else if (mode === 'append') {
      setIssues(prev => [...prev, ...activeImportedRows]);
    } else {
      // Deduplicate
      const map = new Map<string, IssueRecord>();
      issues.forEach(i => map.set(i.id, i));
      activeImportedRows.forEach(i => map.set(i.id, i));
      setIssues(Array.from(map.values()));
    }
  };

  // Handler: Data Merge Complete
  const handleMergeComplete = (mergedRows: IssueRecord[]) => {
    setIssues(removeCancelledIssues(mergedRows, settings.formulaConfig));
  };

  // Handler: Drilldown into specific project or platform
  const handleDrilldown = (projectName: string, platformTag?: string) => {
    setDrilldownProject(projectName);
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
      summaries,
      filteredIssues,
      dateRangeText,
      `Project_Issues_Metrics_${new Date().toISOString().split('T')[0]}.xlsx`,
      includeSeverity
    );
  };

  // Handler: Export CSV
  const handleExportCsv = () => {
    const includeSeverity = window.confirm(
      'Export CSV with severity columns?\n\nClick OK for WITH severity (Low/Medium/High/Critical).\nClick Cancel for TOTALS only.'
    );

    let dateRangeText = 'All Time';
    if (settings.dateFilter.startDate || settings.dateFilter.endDate) {
      dateRangeText = `${settings.dateFilter.startDate || 'Beginning'} to ${settings.dateFilter.endDate || 'Present'}`;
    }
    exportToExcel(
      summaries,
      filteredIssues,
      dateRangeText,
      `Project_Issues_Filtered_${new Date().toISOString().split('T')[0]}.csv`,
      includeSeverity
    );
  };

  // Handler: Reset Data to Empty Dataset
  const handleResetDataToSample = () => {
    setIssues([]);
    savePersistedData([]);
    setDrilldownProject('');
    setDrilldownPlatform('ALL');
  };

  // Handler: Delete All Workspace Data permanently
  const handleClearAllData = (options: { clearTargetList: boolean; clearAliases: boolean }) => {
    setIssues([]);
    savePersistedData([]);
    if (options.clearTargetList) {
      setSettings(prev => ({
        ...prev,
        customProjectList: [],
      }));
    }
    if (options.clearAliases) {
      setSettings(prev => ({
        ...prev,
        projectAliases: [],
      }));
    }
    setDrilldownProject('');
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
      setIssues(activeRows);
      savePersistedData(activeRows);
      saveJiraIntegrationProfile({
        ...loadJiraIntegrationProfile(),
        ...credentials,
        autoSyncEnabled: credentials.autoSyncEnabled !== undefined
          ? Boolean(credentials.autoSyncEnabled)
          : loadJiraIntegrationProfile().autoSyncEnabled,
        lastSyncedAt: new Date().toISOString(),
      });
      setDrilldownProject('');
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
      if (isCancelled) return;
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
  }, [handleSyncFromJira]);

  // Handler: Restore Full Backup
  const handleRestoreBackup = (backup: { settings: AppSettings; issues: IssueRecord[] }) => {
    setSettings(backup.settings);
    setIssues(removeCancelledIssues(backup.issues, backup.settings.formulaConfig));
  };

  const handleAuthenticated = () => {
    try {
      localStorage.setItem(AUTH_SESSION_KEY, 'true');
      sessionStorage.setItem(AUTH_SESSION_KEY, 'true');
    } catch (error) {
      console.warn('Could not persist authentication session:', error);
    }
    setIsAuthenticated(true);
  };

  const handleSignOut = () => {
    try {
      localStorage.removeItem(AUTH_SESSION_KEY);
      sessionStorage.removeItem(AUTH_SESSION_KEY);
    } catch (error) {
      console.warn('Could not clear authentication session:', error);
    }
    setIsAuthenticated(false);
  };

  if (!isAuthenticated) {
    return <LoginScreen onAuthenticated={handleAuthenticated} />;
  }

  return (
    <div className="cloudstaff-theme min-h-screen bg-white text-slate-100 flex flex-col selection:bg-blue-600 selection:text-white">
      {/* Top Navigation */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onOpenImport={() => setIsImportOpen(true)}
        onOpenMerge={() => setIsMergeOpen(true)}
        onExportExcel={handleExportExcel}
        onOpenFormulas={() => setIsFormulasOpen(true)}
        onOpenProjects={() => setIsProjectsOpen(true)}
        onOpenTargetList={() => setIsTargetListOpen(true)}
        onOpenClearData={() => setIsClearDataOpen(true)}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onSignOut={handleSignOut}
        totalIssuesCount={issues.length}
        activeProjectsCount={summaries.length}
        customProjectListCount={settings.customProjectList?.length || 0}
      />

      {/* Date Range Filter Bar */}
      <DateRangeFilterBar
        dateFilter={settings.dateFilter}
        onChange={handleDateFilterChange}
        projectOptions={projectFilterOptions}
        selectedProject={selectedProjectFilter}
        onProjectChange={setSelectedProjectFilter}
        selectedSeverity={selectedSeverityFilter}
        onSeverityChange={setSelectedSeverityFilter}
        isDataLoading={isDataLoading}
        totalFilteredCount={filteredIssues.length}
        totalAllCount={severityFilteredIssues.length}
      />

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
                id="tab-jira-btn"
                onClick={() => setActiveTab('jira')}
                className={`w-full flex items-center space-x-2 px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
                  activeTab === 'jira'
                    ? 'bg-blue-600 text-white shadow-sm shadow-blue-900/20'
                    : 'text-slate-400 hover:text-slate-100 hover:bg-slate-700/50'
                }`}
              >
                <Bot className="w-4 h-4" />
                <span>Jira Integration</span>
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

              <button
                id="tab-formulas-btn"
                onClick={() => setActiveTab('formulas')}
                className={`w-full flex items-center space-x-2 px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
                  activeTab === 'formulas'
                    ? 'bg-blue-600 text-white shadow-sm shadow-blue-900/20'
                    : 'text-slate-400 hover:text-slate-100 hover:bg-slate-700/50'
                }`}
              >
                <Calculator className="w-4 h-4" />
                <span>Formula Rules</span>
              </button>

            </div>
          </aside>

          <main className="flex-1 min-w-0">
        {activeTab === 'dashboard' && (
          <MetricsDashboard
            summaries={summaries}
            allFilteredIssues={filteredIssues}
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
            onOpenClearData={() => setIsClearDataOpen(true)}
            onOpenImport={() => setIsImportOpen(true)}
            onMergeProjects={handleBatchMergeProjects}
            onUnmergeProjects={handleBatchUnmergeProjects}
          />
        )}

        {activeTab === 'seal' && (
          <SecuritySealDashboard summaries={summaries} />
        )}

        {activeTab === 'charts' && (
          <ChartsDashboard
            issues={dashboardIssues}
            formulaConfig={settings.formulaConfig}
          />
        )}

        {activeTab === 'issues' && (
          <IssuesTableView
            issues={filteredIssues}
            formulaConfig={settings.formulaConfig}
            dateFilter={settings.dateFilter}
            selectedProject={drilldownProject}
            selectedPlatform={drilldownPlatform}
            onClearProjectFilter={() => {
              setDrilldownProject('');
              setDrilldownPlatform('ALL');
            }}
            onExportCsv={handleExportCsv}
            onOpenClearData={() => setIsClearDataOpen(true)}
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
                  Target Project List ({settings.customProjectList?.length || 0})
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
                  Active Applications ({summaries.length})
                </span>
                {settings.deletedProjects.length > 0 && (
                  <span className="text-xs text-amber-700 bg-amber-100 border border-amber-300 px-2 py-0.5 rounded">
                    {settings.deletedProjects.length} Applications Deleted / Excluded
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {summaries.map(p => (
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
          </div>
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
              summaries={dependabotsSummaries}
              allFilteredIssues={dependabotsFilteredIssues}
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
              onOpenClearData={() => setIsClearDataOpen(true)}
              onOpenImport={() => setIsImportOpen(true)}
              onMergeProjects={handleBatchMergeProjects}
              onUnmergeProjects={handleBatchUnmergeProjects}
            />

            <IssuesTableView
              issues={dependabotsFilteredIssues}
              formulaConfig={settings.formulaConfig}
              dateFilter={settings.dateFilter}
              selectedProject={drilldownProject}
              selectedPlatform={drilldownPlatform}
              onClearProjectFilter={() => {
                setDrilldownProject('');
                setDrilldownPlatform('ALL');
              }}
              onExportCsv={handleExportCsv}
              onOpenClearData={() => setIsClearDataOpen(true)}
            />
          </div>
        )}

        {activeTab === 'jira' && (
          <JiraIntegrationPage
            onSync={handleSyncFromJira}
            isSyncing={isJiraSyncing}
          />
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
        currentIssues={issues}
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
        issues={issues}
        onUpdateSettings={setSettings}
        onResetDataToSample={handleResetDataToSample}
        onRestoreBackup={handleRestoreBackup}
      />
    </div>
  );
}
