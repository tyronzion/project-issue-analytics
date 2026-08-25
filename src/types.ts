export interface IssueRecord {
  id: string; // e.g. "PROJ-101" or generated
  project: string; // Dynamic project name e.g. "Genesis IOS" or "Genesis"
  baseProject?: string; // Original project before platform split e.g. "Genesis"
  summary: string;
  created: string; // YYYY-MM-DD or ISO
  createdRaw?: string;
  statusCategoryChange: string; // YYYY-MM-DD or ISO
  statusCategoryChangeRaw?: string;
  status: string;
  issueType?: string;
  priority?: string;
  severity?: string;
  assignee?: string;
  platformTag?: 'IOS' | 'AOS' | 'GENERAL' | string;
  securityDueDate?: string; // YYYY-MM-DD or ISO
  securityDueDateRaw?: string;
  raw: Record<string, any>;
}

export interface ColumnMapping {
  projectColumn: string;
  summaryColumn: string;
  createdColumn: string;
  statusChangeColumn: string;
  statusColumn: string;
  keyColumn: string;
  issueTypeColumn?: string;
  priorityColumn?: string;
  severityColumn?: string;
  assigneeColumn?: string;
  securityDueDateColumn?: string;
}

export interface FormulaConfig {
  foundIssuesFormulaName: string;
  foundIssuesDescription: string;
  
  resolvedIssuesFormulaName: string;
  resolvedIssuesDescription: string;
  doneStatuses: string[];
  
  outstandingFormulaName: string;
  outstandingDescription: string;
  cancelledStatuses: string[];
  riskAcceptedStatuses?: string[];

  securityOverdueFormulaName?: string;
  securityOverdueDescription?: string;
  
  iosKeyword: string;
  aosKeyword: string;
  additionalKeywords: { name: string; tag: string }[];
  caseSensitiveKeywords: boolean;

  // Split project by platform tag (e.g. "Genesis" + [IOS] => "Genesis IOS")
  splitProjectsByPlatform: boolean;
  platformNamingPattern: string; // e.g. "{project} {platform}"

  columnMapping: ColumnMapping;
}

export interface DateFilter {
  preset: 'all' | 'today' | 'this_week' | 'this_month' | 'last_7_days' | 'last_30_days' | 'last_90_days' | 'this_year' | 'custom';
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
}

export interface ProjectSummary {
  projectName: string;
  baseProject?: string;
  platformTag?: string;
  totalFound: number;
  iosFound: number;
  aosFound: number;
  generalFound: number; // Found issues without [IOS] or [AOS] (or other tags)
  resolved: number;
  outstanding: number; // Backlog
  riskAccepted: number; // Issues whose status is classified as risk accepted
  securityOverdue: number; // Issues where Security Due Date is earlier than today & not Done/Cancelled
  resolutionRate: number; // (resolved / totalFound) * 100 or 0
  totalAllTime: number;
  foundBySeverity: SeverityBreakdown;
  resolvedBySeverity: SeverityBreakdown;
  outstandingBySeverity: SeverityBreakdown;
  isDeleted?: boolean;
  isFromCustomList?: boolean;
  matchReason?: string;
}

export type SeverityLevel = 'low' | 'medium' | 'high' | 'critical';

export interface SeverityBreakdown {
  low: number;
  medium: number;
  high: number;
  critical: number;
}

export type SecuritySeal = 'Secure' | 'Protected' | 'Defended' | 'Vulnerable' | 'Exposed' | 'Compromised';

export interface ProjectAlias {
  from: string;
  to: string;
}

export interface AppSettings {
  formulaConfig: FormulaConfig;
  deletedProjects: string[]; // Projects explicitly deleted by user
  projectAliases: ProjectAlias[]; // Merged projects
  dateFilter: DateFilter;
  autoSaveData: boolean;
  customProjectList: string[]; // User-provided list of project names to search and track
  useCustomProjectListOnly: boolean; // When true, only show the projects specified in customProjectList
}

export type ActiveTab = 'dashboard' | 'seal' | 'charts' | 'issues' | 'formulas' | 'projects' | 'dependabots' | 'jira';
