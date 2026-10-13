import { ActiveTab } from '../types';

export const TAB_ROUTES: { tab: ActiveTab; path: string; title: string }[] = [
  { tab: 'dashboard', path: '/', title: 'Project Metrics' },
  { tab: 'charts', path: '/charts', title: 'Dashboard' },
  { tab: 'seal', path: '/security-seal', title: 'Security Seal' },
  { tab: 'dependabots', path: '/dependabots', title: 'Dependabots Issues' },
  { tab: 'jira', path: '/jira', title: 'Jira Integration' },
  { tab: 'issues', path: '/issues', title: 'All Issues' },
  { tab: 'projects', path: '/projects', title: 'Projects & Aliases' },
  { tab: 'formulas', path: '/formulas', title: 'Formulas' },
  { tab: 'dpsa', path: '/dpsa', title: 'DPSA Monitoring' },
  { tab: 'full-assessment', path: '/full-assessment', title: 'Full Assessment' },
  { tab: 'roe', path: '/rules-of-engagement', title: 'Rules of Engagement' },
  { tab: 'tracker', path: '/assessment-tracker', title: 'Assessment Tracker' },
  { tab: 'tracker-assessment', path: '/assessment-tracker/assessments', title: 'Assessment List' },
  { tab: 'tracker-checklist', path: '/assessment-tracker/checklist', title: 'Assessment Checklist' },
  { tab: 'tracker-decommissioned', path: '/assessment-tracker/decommissioned', title: 'Decommissioned Apps' },
  { tab: 'tracker-sync', path: '/assessment-tracker/uberticket-sync', title: 'UberTicket Sync' },
  { tab: 'tracker-import', path: '/assessment-tracker/import', title: 'Import Assessment Excel' },
];

// Extra paths that should open an existing tab.
const PATH_ALIASES: Record<string, ActiveTab> = {
  '/dashboard': 'dashboard',
  '/metrics': 'dashboard',
  '/seal': 'seal',
  '/all-issues': 'issues',
  '/fullassessment': 'full-assessment',
  '/rulesofengagement': 'roe',
  '/roe': 'roe',
  '/tracker': 'tracker',
  '/assessment-tracker/monitoring': 'tracker',
};

function normalizePath(pathname: string): string {
  const trimmed = pathname.replace(/\/+$/, '').toLowerCase();
  return trimmed || '/';
}

export function getTabFromPath(pathname: string): ActiveTab | undefined {
  const path = normalizePath(pathname);
  return TAB_ROUTES.find(route => route.path === path)?.tab ?? PATH_ALIASES[path];
}

export function getPathForTab(tab: ActiveTab): string {
  return TAB_ROUTES.find(route => route.tab === tab)?.path ?? '/';
}

export function getTitleForTab(tab: ActiveTab): string {
  return TAB_ROUTES.find(route => route.tab === tab)?.title ?? 'Project Metrics';
}
