import { Clock3 } from 'lucide-react';
import { STATUS } from '../../../pia/shared/rules.js';

// Reassessment status shown on the PIA list and detail.
export function StatusBadge({ app }) {
  if (app.hidden) return <span className="pia-status pia-status--hidden">Hidden</span>;
  if (app.coverage?.status === 'covered' || app.coverage?.status === 'not_required') return null; // CoverageBadge says it
  return <span className={`pia-status pia-status--${app.status}`}>{STATUS[app.status]?.label ?? app.status}</span>;
}

export function InProgressBadge({ app }) {
  if (!app.inProgress || !['overdue', 'due-soon'].includes(app.status)) return null;
  return <span className="pia-badge" title="A newer PIA policy was submitted after the last assessment and is still under review"><Clock3 className="w-3 h-3" aria-hidden /> In progress</span>;
}

export function DaysLeft({ app }) {
  if (app.daysLeft == null) return <span className="at-soft">—</span>;
  if (app.daysLeft < 0) return <span className="pia-days--late">{-app.daysLeft} days overdue</span>;
  if (app.daysLeft === 0) return <span className="pia-days--soon">Due today</span>;
  return <span className={app.status === 'due-soon' ? 'pia-days--soon' : 'at-muted'}>in {app.daysLeft} days</span>;
}

const COVERAGE = { own: 'Own PIA', covered: 'Covered', not_required: 'No PIA needed' };

// The admin's "does this app need its own PIA?" decision.
export function CoverageBadge({ coverage }) {
  if (!coverage) return null;
  const label = coverage.status === 'covered' && coverage.parentName ? `Covered by ${coverage.parentName}` : COVERAGE[coverage.status];
  return (
    <span className={`pia-badge pia-badge--${coverage.status}`} title={coverage.needsReview ? 'A later scan found changes: review this decision' : undefined}>
      {label}{coverage.needsReview ? ' · review' : ''}
    </span>
  );
}

export const RECOMMENDATION = {
  own: { label: 'PIA needed', tone: 'danger' },
  covered: { label: 'No PIA needed: covered by a parent app', tone: 'success' },
  not_required: { label: 'No PIA needed', tone: 'success' },
  undecided: { label: 'Needs review', tone: 'warning' },
};
