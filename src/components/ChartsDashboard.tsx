import React, { useMemo } from 'react';
import { CheckCircle2, CircleAlert, Search, LucideIcon } from 'lucide-react';
import { IssueRecord, FormulaConfig } from '../types';

interface ChartsDashboardProps {
  issues: IssueRecord[];
  formulaConfig: FormulaConfig;
}

interface IssueTotals {
  found: number;
  outstanding: number;
  resolved: number;
  // Last 12 months, oldest first: found and resolved per month, outstanding at each month's end.
  trend: { months: string[]; found: number[]; outstanding: number[]; resolved: number[] };
}

const MONTHS = 12;

// "YYYY-MM" keys for the last 12 months, ending with the current month.
function lastMonths(now = new Date()): string[] {
  return Array.from({ length: MONTHS }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (MONTHS - 1 - i), 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
}

function isGitHubIssue(issue: IssueRecord): boolean {
  return /\[\s*github(?:[-\s\]]|$)/i.test(issue.summary || '');
}

function buildTotals(issues: IssueRecord[], formulaConfig: FormulaConfig): IssueTotals {
  const doneStatuses = new Set(
    formulaConfig.doneStatuses.map(status => status.trim().toLowerCase())
  );
  const isDone = (issue: IssueRecord) => doneStatuses.has((issue.status || '').trim().toLowerCase());
  const resolved = issues.filter(isDone).length;

  const months = lastMonths();
  const month = (iso: string) => (iso || '').slice(0, 7);
  const found = months.map(m => issues.filter(i => month(i.created) === m).length);
  const resolvedPer = months.map(m => issues.filter(i => isDone(i) && month(i.statusCategoryChange) === m).length);
  // Open at the end of a month = created by then, minus resolved by then.
  const outstanding = months.map(m => issues.filter(i => i.created && month(i.created) <= m).length
    - issues.filter(i => isDone(i) && i.statusCategoryChange && month(i.statusCategoryChange) <= m).length);

  return {
    found: issues.length,
    resolved,
    outstanding: issues.length - resolved,
    trend: { months, found, outstanding, resolved: resolvedPer },
  };
}

type Kind = 'found' | 'outstanding' | 'resolved';

// Colour, icon and trend wording per kind; colour always comes with an icon and the title.
const KINDS: Record<Kind, { tone: string; Icon: LucideIcon; caption: (series: number[]) => string }> = {
  found: { tone: 'info', Icon: Search, caption: s => `${s[s.length - 1]} found this month` },
  outstanding: {
    tone: 'warning',
    Icon: CircleAlert,
    caption: s => {
      const d = s[s.length - 1] - s[0];
      return d === 0 ? 'Same as 12 months ago' : `${d > 0 ? '+' : '−'}${Math.abs(d)} vs 12 months ago`;
    },
  },
  resolved: { tone: 'success', Icon: CheckCircle2, caption: s => `${s[s.length - 1]} resolved this month` },
};

const monthLabel = (key: string) => new Date(`${key}-01T00:00:00`).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });

// Area sparkline drawn behind the number (decorative; the title attribute and caption carry the data).
const Sparkline: React.FC<{ series: number[] }> = ({ series }) => {
  const max = Math.max(1, ...series);
  const pts = series.map((v, i) => [(i / (series.length - 1)) * 100, 38 - (v / max) * 34]);
  const line = pts.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ');
  return (
    <svg className="dashboard-sparkline" viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden>
      <polygon points={`0,40 ${line} 100,40`} />
      <polyline points={line} vectorEffect="non-scaling-stroke" />
    </svg>
  );
};

const MetricCard: React.FC<{ title: string; value: number; kind: Kind; series: number[]; months: string[] }> = ({ title, value, kind, series, months }) => {
  const { tone, Icon, caption } = KINDS[kind];
  const tip = series.map((v, i) => `${monthLabel(months[i])}: ${v}`).join('\n');
  return (
    <article className={`dashboard-total-card dashboard-total-card--${tone}`} title={`Last 12 months${kind === 'outstanding' ? ' (open at month end)' : ''}\n${tip}`}>
      <Sparkline series={series} />
      <h2>
        <span className="dashboard-total-icon"><Icon className="w-4 h-4" aria-hidden /></span>
        {title}
      </h2>
      <strong>{value}</strong>
      <small>{caption(series)}</small>
    </article>
  );
};

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
        <MetricCard title="Total Issues Found" value={totals.all.found} kind="found" series={totals.all.trend.found} months={totals.all.trend.months} />
        <MetricCard title="Total Outstanding Issues" value={totals.all.outstanding} kind="outstanding" series={totals.all.trend.outstanding} months={totals.all.trend.months} />
        <MetricCard title="Total Resolved Issues" value={totals.all.resolved} kind="resolved" series={totals.all.trend.resolved} months={totals.all.trend.months} />

        <MetricCard title="Total Issues Found (Without GitHub Issues)" value={totals.nonGitHub.found} kind="found" series={totals.nonGitHub.trend.found} months={totals.nonGitHub.trend.months} />
        <MetricCard title="Total Outstanding Issues (Without GitHub Issues)" value={totals.nonGitHub.outstanding} kind="outstanding" series={totals.nonGitHub.trend.outstanding} months={totals.nonGitHub.trend.months} />
        <MetricCard title="Total Resolved Issues (Without GitHub Issues)" value={totals.nonGitHub.resolved} kind="resolved" series={totals.nonGitHub.trend.resolved} months={totals.nonGitHub.trend.months} />

        <MetricCard title="Total Issues Found (GitHub Issues Only)" value={totals.github.found} kind="found" series={totals.github.trend.found} months={totals.github.trend.months} />
        <MetricCard title="Total Outstanding Issues (GitHub Issues Only)" value={totals.github.outstanding} kind="outstanding" series={totals.github.trend.outstanding} months={totals.github.trend.months} />
        <MetricCard title="Total Resolved Issues (GitHub Issues Only)" value={totals.github.resolved} kind="resolved" series={totals.github.trend.resolved} months={totals.github.trend.months} />
      </section>
    </div>
  );
};
