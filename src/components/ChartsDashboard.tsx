import React, { useMemo } from 'react';
import { IssueRecord, FormulaConfig } from '../types';

interface ChartsDashboardProps {
  issues: IssueRecord[];
  formulaConfig: FormulaConfig;
}

interface IssueTotals {
  found: number;
  outstanding: number;
  resolved: number;
}

function isGitHubIssue(issue: IssueRecord): boolean {
  return /\[\s*github(?:[-\s\]]|$)/i.test(issue.summary || '');
}

function buildTotals(issues: IssueRecord[], formulaConfig: FormulaConfig): IssueTotals {
  const doneStatuses = new Set(
    formulaConfig.doneStatuses.map(status => status.trim().toLowerCase())
  );
  const resolved = issues.filter(issue => doneStatuses.has((issue.status || '').trim().toLowerCase())).length;

  return {
    found: issues.length,
    resolved,
    outstanding: issues.length - resolved,
  };
}

const MetricCard: React.FC<{ title: string; value: number }> = ({ title, value }) => (
  <article className="dashboard-total-card">
    <h2>{title}</h2>
    <strong>{value}</strong>
  </article>
);

export const ChartsDashboard: React.FC<ChartsDashboardProps> = ({ issues, formulaConfig }) => {
  const totals = useMemo(() => {
    const githubIssues = issues.filter(isGitHubIssue);
    const nonGitHubIssues = issues.filter(issue => !isGitHubIssue(issue));

    return {
      all: buildTotals(issues, formulaConfig),
      nonGitHub: buildTotals(nonGitHubIssues, formulaConfig),
      github: buildTotals(githubIssues, formulaConfig),
    };
  }, [issues, formulaConfig]);

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-white tracking-tight">Dashboard</h2>

      <section className="dashboard-totals-grid" aria-label="Issue totals dashboard">
        <MetricCard title="Total Issues Found" value={totals.all.found} />
        <MetricCard title="Total Outstanding Issues" value={totals.all.outstanding} />
        <MetricCard title="Total Resolved Issues" value={totals.all.resolved} />

        <MetricCard title="Total Issues Found (Without GitHub Issues)" value={totals.nonGitHub.found} />
        <MetricCard title="Total Outstanding Issues (Without GitHub Issues)" value={totals.nonGitHub.outstanding} />
        <MetricCard title="Total Resolved Issues (Without GitHub Issues)" value={totals.nonGitHub.resolved} />

        <MetricCard title="Total Issues Found (GitHub Issues Only)" value={totals.github.found} />
        <MetricCard title="Total Outstanding Issues (GitHub Issues Only)" value={totals.github.outstanding} />
        <MetricCard title="Total Resolved Issues (GitHub Issues Only)" value={totals.github.resolved} />
      </section>
    </div>
  );
};
