import { Clock3 } from 'lucide-react';
import { STATUS } from '../../../pia/shared/rules.js';

// Reassessment status shown on the PIA list and detail.
export function StatusBadge({ app }) {
  if (app.hidden) return <span className="pia-status pia-status--hidden">Hidden</span>;
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
