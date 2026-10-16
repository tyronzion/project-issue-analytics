import { ActiveTab } from '../types';

export const TAB_ROUTES: { tab: ActiveTab; path: string; title: string }[] = [
  { tab: 'dashboard', path: '/', title: 'Project Metrics' },
  { tab: 'charts', path: '/charts', title: 'Dashboard' },
  { tab: 'seal', path: '/security-seal', title: 'Security Seal' },
  { tab: 'dependabots', path: '/dependabots', title: 'Dependabots Issues' },
  { tab: 'jira', path: '/settings/jira', title: 'Jira Integration' },
  { tab: 'issues', path: '/issues', title: 'All Issues' },
  { tab: 'projects', path: '/projects', title: 'Projects & Aliases' },
  { tab: 'formulas', path: '/settings/formulas', title: 'Formula Rules' },
  { tab: 'dpsa', path: '/dpsa', title: 'DPSA Monitoring' },
  { tab: 'full-assessment', path: '/full-assessment', title: 'Full Assessment' },
  { tab: 'roe', path: '/rules-of-engagement', title: 'Rules of Engagement' },
  { tab: 'tracker', path: '/assessment-tracker', title: 'Assessment Tracker' },
  { tab: 'tracker-assessment', path: '/assessment-tracker/assessments', title: 'Assessment List' },
  { tab: 'tracker-time', path: '/assessment-tracker/time-report', title: 'Time Spent Report' },
  { tab: 'tracker-comparison', path: '/assessment-tracker/period-comparison', title: 'Period Comparison' },
  { tab: 'tracker-checklist', path: '/assessment-tracker/checklist', title: 'Assessment Checklist' },
  { tab: 'tracker-decommissioned', path: '/assessment-tracker/decommissioned', title: 'Decommissioned Apps' },
  { tab: 'tracker-sync', path: '/settings/uberticket-sync', title: 'UberTicket Sync' },
  { tab: 'tracker-import', path: '/settings/import-excel', title: 'Import Assessment Excel' },
  { tab: 'users', path: '/settings/users', title: 'Users & Roles' },
  { tab: 'settings', path: '/settings', title: 'Settings' },
  { tab: 'settings-targets', path: '/settings/target-projects', title: 'Target Project List' },
  { tab: 'settings-merge', path: '/settings/merge-data', title: 'Merge Data' },
  { tab: 'settings-danger', path: '/settings/danger-zone', title: 'Danger Zone' },
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
  // Old paths of pages that moved into Settings.
  '/jira': 'jira',
  '/formulas': 'formulas',
  '/users': 'users',
  '/assessment-tracker/uberticket-sync': 'tracker-sync',
  '/assessment-tracker/import': 'tracker-import',
};

function normalizePath(pathname: string): string {
  const trimmed = pathname.replace(/\/+$/, '').toLowerCase();
  return trimmed || '/';
}

// Pages only admins can open (the server enforces the matching actions as well).
export const ADMIN_TABS: ActiveTab[] = ['jira', 'tracker-sync', 'tracker-import', 'users', 'settings-merge', 'settings-danger'];

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
