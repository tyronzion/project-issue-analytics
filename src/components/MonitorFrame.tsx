import React from 'react';

// UberTicket monitoring pages are served by the monitor plugin at /monitor/* (see vite.config.ts).
// They are shown here in embed mode, which drops their own brand bar and sidebar.
export const MONITOR_PAGES = {
  dpsa: { path: 'DPSA', title: 'DPSA Monitoring' },
  'full-assessment': { path: 'FullAssessment', title: 'Full Assessment' },
  roe: { path: 'RulesOfEngagement', title: 'Rules of Engagement' },
} as const;

export type MonitorTab = keyof typeof MONITOR_PAGES;

export const isMonitorTab = (tab: string): tab is MonitorTab => tab in MONITOR_PAGES;

export const MonitorFrame: React.FC<{ tab: MonitorTab }> = ({ tab }) => {
  const page = MONITOR_PAGES[tab];
  return (
    <div className="cs-table-shell overflow-hidden" style={{ height: 'calc(100vh - 7.5rem)', minHeight: 560 }}>
      <iframe
        key={tab}
        src={`/monitor/${page.path}?embed=1`}
        title={page.title}
        className="w-full h-full block"
        style={{ border: 0 }}
      />
    </div>
  );
};
