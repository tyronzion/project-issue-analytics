import React, { useMemo, useState } from 'react';
import { Search, ShieldCheck } from 'lucide-react';
import { ProjectSummary, SecuritySeal } from '../types';
import { getProjectSecuritySeal, SECURITY_SEAL_ORDER } from '../utils/securitySeal';

interface SecuritySealDashboardProps {
  summaries: ProjectSummary[];
}

const sealStyles: Record<SecuritySeal, { bg: string; border: string; text: string }> = {
  Secure: { bg: '#2563eb', border: '#60a5fa', text: '#ffffff' },
  Protected: { bg: '#6366f1', border: '#a5b4fc', text: '#ffffff' },
  Defended: { bg: '#0d9488', border: '#5eead4', text: '#ffffff' },
  Vulnerable: { bg: '#f59e0b', border: '#fcd34d', text: '#0f172a' },
  Exposed: { bg: '#ea580c', border: '#fb923c', text: '#ffffff' },
  Compromised: { bg: '#b91c1c', border: '#f87171', text: '#ffffff' },
};

const matrixRows: Array<{ seal: SecuritySeal; critical: string; high: string; medium: string; low: string }> = [
  { seal: 'Secure', critical: '0', high: '0', medium: '1-15', low: '1-15' },
  { seal: 'Protected', critical: '0', high: '0', medium: '16-30', low: '16-30' },
  { seal: 'Defended', critical: '0', high: '1-30', medium: '31-50', low: '31-50' },
  { seal: 'Vulnerable', critical: '0', high: '31-50', medium: '51+', low: '51+' },
  { seal: 'Exposed', critical: '1-50', high: '1-50', medium: '1-50', low: '1-50' },
  { seal: 'Compromised', critical: '51+', high: '51+', medium: '51+', low: '51+' },
];

export const SecuritySealDashboard: React.FC<SecuritySealDashboardProps> = ({ summaries }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const groupedProjects = useMemo(() => {
    const groups = new Map<SecuritySeal, ProjectSummary[]>();
    SECURITY_SEAL_ORDER.forEach(seal => groups.set(seal, []));

    summaries.forEach(summary => {
      groups.get(getProjectSecuritySeal(summary).seal)!.push(summary);
    });

    const query = searchQuery.trim().toLowerCase();
    groups.forEach(projects => {
      projects.sort((left, right) => left.projectName.localeCompare(right.projectName));
      if (query) {
        const matching = projects.filter(project => project.projectName.toLowerCase().includes(query));
        projects.splice(0, projects.length, ...matching);
      }
    });

    return groups;
  }, [searchQuery, summaries]);

  return (
    <div className="space-y-6">
      <section className="bg-slate-900 border border-slate-800 rounded-xl p-4 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-500/15 border border-blue-500/30 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Scope Inventory by Security Seal</h2>
              <p className="text-xs text-slate-400 mt-1">Seal is calculated from each project's outstanding severity backlog.</p>
            </div>
          </div>
          <label className="relative block w-full lg:w-80">
            <Search className="absolute left-3 top-1/2 w-4 h-4 -translate-y-1/2 text-slate-500" />
            <input
              value={searchQuery}
              onChange={event => setSearchQuery(event.target.value)}
              placeholder="Search by project name"
              className="w-full bg-slate-950 border border-slate-700 rounded-lg py-2 pl-9 pr-3 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
            />
          </label>
        </div>

        <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {SECURITY_SEAL_ORDER.map(seal => {
            const projects = groupedProjects.get(seal) || [];
            return (
              <div key={seal} className="min-h-44 bg-slate-950/70 border border-slate-800 rounded-lg overflow-hidden">
                <div
                  className="security-seal-tone px-3 py-2 border-b font-semibold text-sm"
                  style={{
                    ['--seal-bg' as const]: sealStyles[seal].bg,
                    ['--seal-border' as const]: sealStyles[seal].border,
                    ['--seal-text' as const]: sealStyles[seal].text,
                  }}
                >
                  {seal} ({projects.length})
                </div>
                <div className="p-2 space-y-1.5 max-h-60 overflow-y-auto">
                  {projects.length ? projects.map(project => {
                    const severity = getProjectSecuritySeal(project).severity;
                    return (
                      <div key={project.projectName} className="bg-slate-800 border border-slate-700 rounded-md px-2.5 py-2">
                        <p className="truncate text-xs font-semibold text-slate-100" title={project.projectName}>{project.projectName}</p>
                        <p className="mt-1 text-[10px] text-slate-400">C {severity.critical} / H {severity.high} / M {severity.medium} / L {severity.low}</p>
                      </div>
                    );
                  }) : <p className="py-8 text-center text-xs italic text-slate-500">No projects</p>}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-800">
          <h3 className="text-sm font-semibold text-white">Security Seal Matrix</h3>
          <p className="mt-1 text-xs text-slate-400">Outstanding Low, Medium, High, and Critical findings are evaluated against this matrix.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-xs text-center">
            <thead className="bg-slate-950 text-slate-300 uppercase tracking-wider text-[10px]">
              <tr>
                <th className="px-3 py-2 text-left">Seal</th>
                <th className="px-3 py-2">Critical</th>
                <th className="px-3 py-2">High</th>
                <th className="px-3 py-2">Medium</th>
                <th className="px-3 py-2">Low</th>
              </tr>
            </thead>
            <tbody>
              {matrixRows.map(row => (
                <tr key={row.seal} className="border-t border-slate-800 text-slate-300">
                  <td className="px-3 py-2 text-left">
                    <span
                      className="security-seal-tone inline-block min-w-24 rounded px-2 py-1 font-semibold border"
                      style={{
                        ['--seal-bg' as const]: sealStyles[row.seal].bg,
                        ['--seal-border' as const]: sealStyles[row.seal].border,
                        ['--seal-text' as const]: sealStyles[row.seal].text,
                      }}
                    >
                      {row.seal}
                    </span>
                  </td>
                  <td className="px-3 py-2">{row.critical}</td>
                  <td className="px-3 py-2">{row.high}</td>
                  <td className="px-3 py-2">{row.medium}</td>
                  <td className="px-3 py-2">{row.low}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};