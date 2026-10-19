// PIA reassessment rules, shared by the server and the UI. Pure functions on calendar days ("YYYY-MM-DD",
// Manila time); no business days here: a PIA is due a year after the last one, weekends included.
//
//   last assessed = the latest of: an approved PIA policy (its approval date) and an admin-recorded reassessment
//   due           = last assessed + 12 months (29 Feb -> 28 Feb)
//   status        never        no PIA policy and no reassessment (rejected policies don't count)
//                 initial      a PIA policy was submitted but none is approved yet
//                 current      due in more than dueSoonDays
//                 due-soon     due within dueSoonDays (today included)
//                 overdue      past the due date; stays overdue until a reassessment is recorded
//   inProgress    a policy submitted after the last assessment is still open (a new version under review)

export const DEFAULT_DUE_SOON_DAYS = 30;

export const STATUS = {
  overdue: { label: 'Overdue', order: 0 },
  'due-soon': { label: 'Coming due', order: 1 },
  never: { label: 'Never assessed', order: 2 },
  initial: { label: 'Initial PIA in progress', order: 3 },
  current: { label: 'Current', order: 4 },
};

const DAY = 86_400_000;

// UTC instant -> calendar day in a fixed-offset time zone.
export function dayOf(ms, offsetHours = 8) {
  return ms == null ? null : new Date(ms + offsetHours * 3_600_000).toISOString().slice(0, 10);
}

export const isDay = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')) && dayToUtc(s) != null && new Date(dayToUtc(s)).toISOString().slice(0, 10) === s;

function dayToUtc(day) {
  const [y, m, d] = String(day).split('-').map(Number);
  const t = Date.UTC(y, m - 1, d);
  return Number.isNaN(t) ? null : t;
}

// Same day next year; 29 Feb becomes 28 Feb.
export function addYear(day) {
  const [y, m, d] = day.split('-').map(Number);
  const next = m === 2 && d === 29 ? Date.UTC(y + 1, 1, 28) : Date.UTC(y + 1, m - 1, d);
  return new Date(next).toISOString().slice(0, 10);
}

// Whole days from a to b (negative when b is earlier).
export const daysBetween = (a, b) => Math.round((dayToUtc(b) - dayToUtc(a)) / DAY);

// policies: [{ state: 'approved'|'open'|'rejected', approvedAt, submittedAt }] (ms; from the monitor's normalizePolicy)
// reassessments: [{ assessedOn: 'YYYY-MM-DD' }]
export function piaStatus({ policies = [], reassessments = [], today, dueSoonDays = DEFAULT_DUE_SOON_DAYS, offsetHours = 8 }) {
  const live = policies.filter((p) => p.state !== 'rejected');
  const approvedDays = live.filter((p) => p.state === 'approved' && p.approvedAt != null).map((p) => dayOf(p.approvedAt, offsetHours));
  const recorded = reassessments.map((r) => r.assessedOn).filter(isDay);
  const all = [...approvedDays, ...recorded].sort();
  const lastAssessed = all.at(-1) ?? null;
  const firstApproved = [...approvedDays].sort()[0] ?? null;
  const lastSource = lastAssessed == null ? null : recorded.includes(lastAssessed) ? 'reassessment' : 'policy';

  if (!lastAssessed) {
    return { status: live.length ? 'initial' : 'never', lastAssessed: null, lastSource: null, firstApproved: null, dueOn: null, daysLeft: null, inProgress: live.length > 0 };
  }
  const dueOn = addYear(lastAssessed);
  const daysLeft = daysBetween(today, dueOn);
  const status = daysLeft < 0 ? 'overdue' : daysLeft <= dueSoonDays ? 'due-soon' : 'current';
  const inProgress = live.some((p) => p.state === 'open' && dayOf(p.submittedAt, offsetHours) > lastAssessed);
  return { status, lastAssessed, lastSource, firstApproved, dueOn, daysLeft, inProgress };
}
