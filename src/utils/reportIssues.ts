import { FormulaConfig, IssueRecord, ProjectSummary } from '../types';
import { getNormalizedSeverity, isIssueOutstanding } from './metricsEngine';
import { parseDateToISO } from './dateUtils';

// One unresolved issue as the assessment report shows it (tracker/shared/report.js buildReport input).
export interface ReportIssue {
  key: string;
  summary: string;
  created: string;
  dueDate: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'informational' | null;
}

// What the report knows about an app's issues. matched=false: no project in the analytics data matched the
// app's name, so "no issues" may only mean "no data".
export interface ReportIssues {
  matched: boolean;
  issues: ReportIssue[];
}

const isoDay = (value?: string, raw?: string): string => {
  if (value && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  return parseDateToISO(raw || value || '') || '';
};

function severityOf(issue: IssueRecord): ReportIssue['severity'] {
  const level = getNormalizedSeverity(issue);
  if (level) return level;
  const raw = String(issue.severity || issue.raw?.severity || issue.raw?.Severity || issue.priority || '').trim().toLowerCase();
  return raw.startsWith('info') ? 'informational' : null;
}

// The unresolved issues of one project: the same set the Security Seal counts (outstanding = not done,
// cancelled or risk accepted). With asOf (YYYY-MM-DD), the issues that were unresolved on that day instead:
// created by then, and either still open or closed after it (by their status-change date).
export function reportIssuesOf(summary: ProjectSummary, config: FormulaConfig, asOf?: string): ReportIssue[] {
  return (summary.issues || [])
    .filter(issue => {
      const open = isIssueOutstanding(issue, config);
      if (!asOf) return open;
      const created = isoDay(issue.created, issue.createdRaw);
      if (!created || created > asOf) return false;
      if (open) return true;
      const closed = isoDay(issue.statusCategoryChange, issue.statusCategoryChangeRaw);
      return !!closed && closed > asOf;
    })
    .map(issue => ({
      key: issue.id,
      summary: issue.summary || '',
      created: isoDay(issue.created, issue.createdRaw),
      dueDate: isoDay(issue.securityDueDate, issue.securityDueDateRaw),
      severity: severityOf(issue),
    }));
}
