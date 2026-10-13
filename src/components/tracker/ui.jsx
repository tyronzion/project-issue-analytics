import { CheckCircle2, CircleDashed, Clock3, MinusCircle, ShieldCheck, ShieldHalf, Shield, ShieldAlert, ShieldX, ShieldOff, Ticket } from 'lucide-react';
import { isTaskDone } from '../../../tracker/shared/logic.js';

export const cx = (...c) => c.filter(Boolean).join(' ');

// Seal colours: same as the Security Seal page.
export const SEAL_STYLE = {
  Secure: { icon: ShieldCheck, bg: '#2563eb', border: '#60a5fa', text: '#ffffff' },
  Protected: { icon: Shield, bg: '#6366f1', border: '#a5b4fc', text: '#ffffff' },
  Defended: { icon: ShieldHalf, bg: '#0d9488', border: '#5eead4', text: '#ffffff' },
  Vulnerable: { icon: ShieldAlert, bg: '#f59e0b', border: '#fcd34d', text: '#0f172a' },
  Exposed: { icon: ShieldOff, bg: '#ea580c', border: '#fb923c', text: '#ffffff' },
  Compromised: { icon: ShieldX, bg: '#b91c1c', border: '#f87171', text: '#ffffff' },
};

// Severity accents: same as the Severity Scorecard.
export const SEVERITY_ACCENT = { Critical: '#b91c1c', High: '#ea580c', Medium: '#ca8a04', Low: '#2563eb' };

export function StatusPill({ value, small }) {
  if (!value) return <span className="at-soft">—</span>;
  const done = value === 'Done' || value === 'Uploaded' || isTaskDone(value);
  const progress = value === 'In Progress';
  const Icon = value === 'Done - N/A' || value === 'No repository' ? MinusCircle : done ? CheckCircle2 : progress ? Clock3 : CircleDashed;
  return (
    <span className={cx('at-pill', done ? 'at-pill--done' : progress ? 'at-pill--progress' : 'at-pill--idle', small && 'at-pill--small')}>
      <Icon className={small ? 'w-3 h-3' : 'w-3.5 h-3.5'} aria-hidden />
      {value}
    </span>
  );
}

export function SealBadge({ value, auto }) {
  if (!value) return <span className="at-soft">—</span>;
  const s = SEAL_STYLE[value] || { icon: Shield, bg: '#eaf1ff', border: '#d5e2fb', text: '#112347' };
  const Icon = s.icon;
  return (
    <span className="at-seal" style={{ '--seal-bg': s.bg, '--seal-border': s.border, '--seal-text': s.text }} title={auto ? 'Captured from the Security Seal when the UberTicket was resolved' : undefined}>
      <Icon className="w-3.5 h-3.5" aria-hidden />
      {value}
      {auto && <span aria-hidden>·auto</span>}
    </span>
  );
}

export function PriorityTag({ value }) {
  if (!value) return <span className="at-soft">—</span>;
  const c = SEVERITY_ACCENT[value] || '#486188';
  return <span className="at-tag" style={{ color: c, borderColor: `${c}55`, background: `${c}0d` }}>{value}</span>;
}

export function TicketLink({ row }) {
  if (!row.ticketKey) return null;
  return (
    <a href={row.ticketUrl} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="at-ticket" title={`UberTicket ${row.ticketKey} (${row.ticketSource === 'roe' ? 'Rules of Engagement' : 'Full Assessment'}) · ${row.ticketState}`}>
      <Ticket className="w-3 h-3" aria-hidden />
      {row.ticketKey}
    </a>
  );
}

export function Progress({ value }) {
  const color = value >= 100 ? 'var(--at-good)' : value > 0 ? 'var(--at-warn)' : 'transparent';
  return (
    <div className="flex items-center gap-2" title={`${value}% complete`}>
      <div className="at-progress">
        <div style={{ width: `${value}%`, background: color }} />
      </div>
      <span className="tabular-nums w-8 text-right text-xs at-muted">{value}%</span>
    </div>
  );
}

export function Select({ value, onChange, options, placeholder, className }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={cx('at-input', className)}>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map((o) => (typeof o === 'string' ? <option key={o} value={o}>{o}</option> : <option key={o.value} value={o.value}>{o.label}</option>))}
    </select>
  );
}

export function Chips({ value, onChange, options }) {
  return (
    <div className="inline-flex flex-wrap gap-1">
      {options.map((o) => {
        const v = typeof o === 'string' ? o : o.value;
        return (
          <button key={v} type="button" onClick={() => onChange(v)} aria-pressed={value === v} className="at-chip">
            {typeof o === 'string' ? o : o.label}
          </button>
        );
      })}
    </div>
  );
}

export const fmtDate = (iso) => {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

export const pct = (x) => `${(x * 100).toFixed(x === 1 || x === 0 ? 0 : 1)}%`;
