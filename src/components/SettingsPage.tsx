import React from 'react';
import {
  SlidersHorizontal,
  Calculator,
  ClipboardList,
  Bot,
  GitMerge,
  FileUp,
  RefreshCcw,
  UserCog,
  TriangleAlert,
  Trash2,
  LucideIcon,
} from 'lucide-react';
import { ActiveTab } from '../types';
import { ADMIN_TABS } from '../utils/routes';

interface SettingsSection {
  tab: ActiveTab;
  label: string;
  Icon: LucideIcon;
  group: 'General' | 'Data' | 'Access' | 'Danger';
}

// Every setup / admin area in one place. Admin-only sections are the ones in ADMIN_TABS.
export const SETTINGS_SECTIONS: SettingsSection[] = [
  { tab: 'settings', label: 'Application Settings', Icon: SlidersHorizontal, group: 'General' },
  { tab: 'formulas', label: 'Formula Rules', Icon: Calculator, group: 'General' },
  { tab: 'settings-targets', label: 'Target Project List', Icon: ClipboardList, group: 'General' },
  { tab: 'jira', label: 'Jira Integration', Icon: Bot, group: 'Data' },
  { tab: 'settings-merge', label: 'Merge Data', Icon: GitMerge, group: 'Data' },
  { tab: 'tracker-import', label: 'Import Excel', Icon: FileUp, group: 'Data' },
  { tab: 'tracker-sync', label: 'UberTicket Sync', Icon: RefreshCcw, group: 'Data' },
  { tab: 'users', label: 'Users & Roles', Icon: UserCog, group: 'Access' },
  { tab: 'settings-danger', label: 'Danger Zone', Icon: TriangleAlert, group: 'Danger' },
];

export const isSettingsTab = (tab: ActiveTab) => SETTINGS_SECTIONS.some(s => s.tab === tab);

// Settings shell: section list on the left, the chosen section on the right.
export const SettingsLayout: React.FC<{
  activeTab: ActiveTab;
  onSelect: (tab: ActiveTab) => void;
  isAdmin: boolean;
  children: React.ReactNode;
}> = ({ activeTab, onSelect, isAdmin, children }) => {
  const visible = SETTINGS_SECTIONS.filter(s => isAdmin || !ADMIN_TABS.includes(s.tab));
  const groups = [...new Set(visible.map(s => s.group))];
  return (
    <div className="settings-page">
      <header className="settings-header">
        <h1>Settings</h1>
        <p>Data sources, formulas, access and other setup. Choose a section.</p>
      </header>
      <div className="settings-body">
        <nav className="settings-nav" aria-label="Settings sections">
          {groups.map(group => (
            <div key={group}>
              {group !== 'Danger' && <p className="settings-nav-group">{group}</p>}
              {visible.filter(s => s.group === group).map(({ tab, label, Icon }) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => onSelect(tab)}
                  aria-current={activeTab === tab ? 'page' : undefined}
                  className={`settings-nav-item${tab === 'settings-danger' ? ' settings-nav-item--danger' : ''}`}
                >
                  <Icon className="w-4 h-4" aria-hidden />
                  <span>{label}</span>
                </button>
              ))}
            </div>
          ))}
        </nav>
        <section className="settings-content">{children}</section>
      </div>
    </div>
  );
};

// A setting that is edited in a dialog: what it is, a few facts, and one button.
export const SettingsPanel: React.FC<{
  title: string;
  description: string;
  facts?: [string, React.ReactNode][];
  actionLabel: string;
  onAction: () => void;
}> = ({ title, description, facts = [], actionLabel, onAction }) => (
  <div className="settings-panel">
    <h2>{title}</h2>
    <p>{description}</p>
    {facts.length > 0 && (
      <dl>
        {facts.map(([k, v]) => (
          <div key={k}><dt>{k}</dt><dd>{v}</dd></div>
        ))}
      </dl>
    )}
    <button type="button" onClick={onAction} className="settings-btn">{actionLabel}</button>
  </div>
);

// Destructive actions live only here, behind a confirmation dialog.
export const DangerZone: React.FC<{
  issuesCount: number;
  targetListCount: number;
  aliasesCount: number;
  onDeleteAll: () => void;
}> = ({ issuesCount, targetListCount, aliasesCount, onDeleteAll }) => (
  <div className="settings-danger">
    <h2><TriangleAlert className="w-5 h-5" aria-hidden /> Danger Zone</h2>
    <p>These actions can’t be undone. Export or back up first (Application Settings → backup).</p>
    <div className="settings-danger-row">
      <div>
        <strong>Delete all data</strong>
        <p>
          Removes all {issuesCount} loaded issues. The next step asks whether to also clear the target project list ({targetListCount}) and merge rules ({aliasesCount}).
          The Assessment Tracker and UberTicket monitors are not affected.
        </p>
      </div>
      <button type="button" onClick={onDeleteAll} disabled={issuesCount + targetListCount + aliasesCount === 0} className="settings-btn settings-btn--danger">
        <Trash2 className="w-4 h-4" aria-hidden /> Delete all data…
      </button>
    </div>
  </div>
);
