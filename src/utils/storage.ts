import { AppSettings, FormulaConfig, DateFilter } from '../types';

export const DEFAULT_FORMULA_CONFIG: FormulaConfig = {
  foundIssuesFormulaName: 'Created Date in Range',
  foundIssuesDescription: 'Count rows where the "Created" date falls within the selected date filter range.',
  
  resolvedIssuesFormulaName: 'Status Changed in Range & Status is Done',
  resolvedIssuesDescription: 'Count rows where "Status Category change" date is in range AND "Status" matches a Done status.',
  doneStatuses: ['Done', 'Closed', 'Resolved', 'Complete', 'Completed', 'Verified'],
  
  outstandingFormulaName: 'Status Not Done & Not Cancelled',
  outstandingDescription: 'Count rows where "Status" is NOT in Done, Cancelled, or Risk Accepted statuses.',
  cancelledStatuses: ['Cancelled', 'Canceled', "Won't Do", "Won't Fix", 'Invalid', 'Duplicate', 'Rejected', 'Discarded'],
  riskAcceptedStatuses: ['Risk Accepted'],
  
  securityOverdueFormulaName: 'Security Due Date Past Present Date',
  securityOverdueDescription: 'Count rows where "Security Due Date" is before today AND Status is NOT Done AND NOT Cancelled.',

  iosKeyword: '[IOS]',
  aosKeyword: '[AOS]',
  additionalKeywords: [],
  caseSensitiveKeywords: false,

  splitProjectsByPlatform: true,
  platformNamingPattern: '{project} {platform}',

  columnMapping: {
    projectColumn: 'Project',
    summaryColumn: 'Summary',
    createdColumn: 'Created',
    statusChangeColumn: 'Status Category change',
    statusColumn: 'Status',
    keyColumn: 'Issue key',
    issueTypeColumn: 'Issue Type',
    priorityColumn: 'Priority',
    severityColumn: 'Severity',
    assigneeColumn: 'Assignee',
    securityDueDateColumn: 'Security Due Date',
  }
};

export const DEFAULT_DATE_FILTER: DateFilter = {
  preset: 'all',
  startDate: '',
  endDate: '',
};

export const DEFAULT_TARGET_PROJECT_LIST: string[] = [
  'StaffCentral',
  'MyStaff',
  'Payroll',
  'Uberticket',
  'Jobs 3.0',
  'Buzz',
  'Workbench',
  'Nexus',
  'Corporate',
  'Pact-X',
  'Billzilla',
  'FlightDeck',
  'Tap Frontend',
  'Tap Admin',
  'Floors',
  'Bizscrum',
  'CSOSH',
  'BadgepackClassic',
  'Radio',
  'Boardroom',
  'Doorspace',
  'Lloyde.com',
  'NHI',
  'Notification Manager',
  'Appstore',
  'Gisengine',
  'Bidhero',
  'LDAP',
  'My task',
  'Ncentral',
  'Rewards',
  'Security Tips',
  'CS Ring',
  'Kuma',
  'DAM',
  'Quekod',
  'Halo-Halo',
  'StaffCentral AOS',
  'Radio AOS',
  'Rewards AOS',
  'Tap AOS',
  'Doorspace AOS',
  'Boardroom AOS',
  'Cloudstaff AOS',
  'StaffCentral iOS',
  'Tap iOS',
  'Radio iOS',
  'Rewards iOS',
  'Print Out iOS',
  'Cloudstaff Mobile iOS',
  'WorkbenchMicroservice',
  'Client Microservice',
  'IdentityServ',
  'redbeanusermicroservice',
  'Redbeanclientmicroservice',
  'hubspotmicroservice',
  'Suiteview 2',
  'Users Microservice',
  'Botley 2',
  'Managed Webhook',
  'nextgeneration employee operation',
  'Phoenix',
  'Sonic',
  'Techbot',
  'PlayerOne v2',
  'Optibpo',
  'Phoenix-admin',
  'CS Event',
  'Payrollmicroservice',
  'Devops flow',
  'ShiftSync',
  'Central.tech',
  'M365 Viewer',
  'Maestro secure',
  'maestro',
  'Snapshot',
  'Planet YUM',
  'CS Gems',
  'NEO Flow',
  'Strapi',
  'CustomerX Flow',
  'AllChat Mobile AOS',
  'AllChat Mobile IOS',
  'Voltron',
  'Staffx Flow',
  'Snapshot Admin',
  'Era Calculator',
  'UberticketFlow',
  'Zero Client Research',
  'Success Pilot Tracker',
  'Payroll Flow',
  'Bizscrum ai',
  'RRP Quick Quote Calculator',
  'UberticketPromax',
  'Rewards App',
  'Voice Agent',
  'Ai Policy Builder',
  'Payroll Document',
  'User Guide',
  'CS Launchpad',
  'CLR Batch Audit',
  'CS Scorecard',
  'Voice Manager',
  'CS Checkup',
  
];

function normalizeTargetList(list: string[]): string[] {
  const output: string[] = [];
  const seen = new Set<string>();

  list.forEach(item => {
    const normalized = String(item || '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!normalized) return;

    const key = normalized.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    output.push(normalized);
  });

  return output;
}

function getWordCount(value: string): number {
  const words = value
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return words.length;
}

function orderTargetListByWordCount(list: string[]): string[] {
  return [...list].sort((left, right) => {
    const wordCountDelta = getWordCount(left) - getWordCount(right);
    if (wordCountDelta !== 0) return wordCountDelta;

    // Keep ordering deterministic within the same word-count group.
    return left.localeCompare(right);
  });
}

export const DEFAULT_SETTINGS: AppSettings = {
  formulaConfig: DEFAULT_FORMULA_CONFIG,
  deletedProjects: [],
  projectAliases: [],
  dateFilter: DEFAULT_DATE_FILTER,
  autoSaveData: true,
  customProjectList: orderTargetListByWordCount(normalizeTargetList(DEFAULT_TARGET_PROJECT_LIST)),
  useCustomProjectListOnly: false,
};

const SETTINGS_KEY = 'project_issue_analytics_settings_v1';
const DATA_KEY = 'project_issue_analytics_data_v1';
const JIRA_PROFILE_KEY = 'project_issue_analytics_jira_profile_v2';

export interface JiraIntegrationProfile {
  baseUrl: string;
  email: string;
  apiToken: string;
  filterId: string;
  jql: string;
  severityField: string;
  securityDueDateField: string;
  securityTypeField: string;
  autoSyncEnabled: boolean;
  lastSyncedAt: string;
}

export const DEFAULT_JIRA_INTEGRATION_PROFILE: JiraIntegrationProfile = {
  baseUrl: '',
  email: '',
  apiToken: '',
  filterId: '',
  jql: '',
  severityField: 'customfield_10072',
  securityDueDateField: 'customfield_10102',
  securityTypeField: 'customfield_10086',
  autoSyncEnabled: true,
  lastSyncedAt: '',
};

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw);
    const savedTargetListRaw = Array.isArray(parsed.customProjectList) ? parsed.customProjectList : [];
    const savedTargetList = normalizeTargetList(savedTargetListRaw);

    // Manual/saved settings always take priority once settings exist.
    const resolvedTargetList = savedTargetList;
    const resolvedStrictMode = Boolean(parsed.useCustomProjectListOnly);

    const nextSettings: AppSettings = {
      ...DEFAULT_SETTINGS,
      ...parsed,
      customProjectList: resolvedTargetList,
      useCustomProjectListOnly: resolvedStrictMode,
      formulaConfig: {
        ...DEFAULT_FORMULA_CONFIG,
        ...(parsed.formulaConfig || {}),
        columnMapping: {
          ...DEFAULT_FORMULA_CONFIG.columnMapping,
          ...(parsed.formulaConfig?.columnMapping || {})
        }
      }
    };

    return nextSettings;
  } catch (err) {
    console.error('Failed to load settings from storage:', err);
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: AppSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch (err) {
    console.error('Failed to save settings to storage:', err);
  }
}

export function loadSavedData(): any[] | null {
  try {
    const raw = localStorage.getItem(DATA_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (err) {
    console.error('Failed to load data from storage:', err);
    return null;
  }
}

export function savePersistedData(data: any[]): void {
  try {
    localStorage.setItem(DATA_KEY, JSON.stringify(data));
  } catch (err) {
    console.error('Failed to persist dataset to storage:', err);
  }
}

export function clearPersistedData(): void {
  try {
    localStorage.removeItem(DATA_KEY);
  } catch (err) {
    console.error('Failed to clear data:', err);
  }
}

export function loadJiraIntegrationProfile(): JiraIntegrationProfile {
  try {
    const raw = localStorage.getItem(JIRA_PROFILE_KEY);
    if (!raw) return DEFAULT_JIRA_INTEGRATION_PROFILE;
    const parsed = JSON.parse(raw);

    return {
      ...DEFAULT_JIRA_INTEGRATION_PROFILE,
      ...parsed,
      baseUrl: String(parsed.baseUrl || ''),
      email: String(parsed.email || ''),
      apiToken: String(parsed.apiToken || ''),
      filterId: String(parsed.filterId || ''),
      jql: String(parsed.jql || ''),
      severityField: String(parsed.severityField || DEFAULT_JIRA_INTEGRATION_PROFILE.severityField),
      securityDueDateField: String(parsed.securityDueDateField || DEFAULT_JIRA_INTEGRATION_PROFILE.securityDueDateField),
      securityTypeField: String(parsed.securityTypeField || DEFAULT_JIRA_INTEGRATION_PROFILE.securityTypeField),
      autoSyncEnabled: parsed.autoSyncEnabled !== undefined ? Boolean(parsed.autoSyncEnabled) : true,
      lastSyncedAt: String(parsed.lastSyncedAt || ''),
    };
  } catch (err) {
    console.error('Failed to load Jira integration profile:', err);
    return DEFAULT_JIRA_INTEGRATION_PROFILE;
  }
}

export function saveJiraIntegrationProfile(profile: JiraIntegrationProfile): void {
  try {
    localStorage.setItem(JIRA_PROFILE_KEY, JSON.stringify(profile));
  } catch (err) {
    console.error('Failed to save Jira integration profile:', err);
  }
}
