import { matchKey, periodForQuarter } from '../shared/logic.js';

// UberTicket -> Assessment Tracker. UberTicket is the source of truth for:
//   status      ticket open = In Progress, resolved = Done (stored as ticket_state)
//   tester      assignee, frozen once the ticket is resolved
//   dates       Actual Start = submitted, Actual End = resolved (activity log)
//   time spent  Rules of Engagement "Time Spent (MM)"
// Seals are captured separately when a ticket resolves (POST /assessments/:id/seal).

const SYNC_USER = 'UberTicket sync';

const dayOf = (ms, offsetHours) => (ms == null ? null : new Date(ms + offsetHours * 3_600_000).toISOString().slice(0, 10));

function quarterOf(ticket) {
  const q = Number(String(ticket.quarter ?? '').match(/[1-4]/)?.[0]);
  const y = Number(String(ticket.year ?? '').match(/\d{4}/)?.[0]);
  return q && y ? { quarter: q, year: y } : null;
}

// tickets: { full: [...], roe: [...] } as returned by the monitor's normalizeFull().
export function syncTickets(db, tickets, { offsetHours = 8 } = {}) {
  const links = new Map(db.prepare('SELECT product_key, project FROM ticket_links').all().map((l) => [l.product_key, matchKey(l.project)]));
  const rows = db.prepare('SELECT a.*, c.track, c.year FROM assessments a JOIN cycles c ON c.id = a.cycle_id').all();
  const byKey = new Map();
  for (const r of rows) {
    const k = `${r.track}|${r.year}|${r.period}|${matchKey(r.project)}`;
    byKey.set(k, [...(byKey.get(k) || []), r]);
  }

  const chosen = new Map(); // assessment id -> { ticket, source }
  const unmatched = [];
  let considered = 0;
  for (const source of ['full', 'roe']) {
    for (const t of tickets[source] || []) {
      if (t.state === 'rejected') continue;
      considered++;
      const when = quarterOf(t);
      const productKey = matchKey(t.product);
      const key = links.get(productKey) ?? productKey;
      const base = { key: t.key, url: t.url, source, product: t.product, productKey, state: t.state, assignee: t.assignee, quarter: when ? `Q${when.quarter}` : t.quarter, year: when?.year ?? t.year };
      if (!when) {
        unmatched.push({ ...base, reason: 'Ticket has no quarter / year' });
        continue;
      }
      const find = (track) => byKey.get(`${track}|${when.year}|${periodForQuarter(track, when.quarter)}|${key}`) || [];
      // Quarterly apps are tested every quarter; otherwise the bi-annual list.
      let targets = find('quarterly');
      if (!targets.length) targets = find('biannual');
      if (!targets.length) {
        unmatched.push({ ...base, reason: `No "${t.product}" app in the ${when.year} tracker for Q${when.quarter}` });
        continue;
      }
      // Several tests of one app in a period: the most recent ticket wins.
      for (const r of targets) {
        const cur = chosen.get(r.id);
        if (!cur || (t.createdAt ?? 0) > (cur.ticket.createdAt ?? 0)) chosen.set(r.id, { ticket: t, source });
      }
    }
  }

  const rowById = new Map(rows.map((r) => [r.id, r]));
  const logChange = db.prepare('INSERT INTO history (assessment_id, field, old_value, new_value, changed_by) VALUES (?, ?, ?, ?, ?)');
  const touch = db.prepare("UPDATE assessments SET ticket_synced_at = datetime('now') WHERE id = ?");
  let updated = 0;

  db.exec('BEGIN');
  try {
    for (const [id, { ticket: t, source }] of chosen) {
      const r = rowById.get(id);
      const resolved = t.state === 'resolved';
      const sameTicket = r.ticket_key === t.key;
      const next = {
        ticket_key: t.key,
        ticket_url: t.url,
        ticket_source: source,
        ticket_state: t.state,
        actual_start: dayOf(t.createdAt, offsetHours),
        actual_end: resolved ? dayOf(t.resolvedAt, offsetHours) : null,
      };
      // Tester = assignee; kept as it was at resolution (a later reassignment doesn't change it).
      if (!(sameTicket && r.tester_frozen)) {
        if (t.assignee && t.assignee !== 'Unassigned') next.security_tester = t.assignee;
        next.tester_frozen = resolved ? 1 : 0;
      }
      const minutes = Number(String(t.timeSpent ?? '').replace(/[^\d.]/g, ''));
      if (source === 'roe' && minutes > 0) next.time_spent = Math.round(minutes);
      // A seal already recorded (Excel / by hand) belongs to this resolved test.
      if (resolved && r.seal && !r.seal_ticket_key && r.seal_source !== 'auto') next.seal_ticket_key = t.key;

      const changes = Object.entries(next).filter(([col, v]) => String(r[col] ?? '') !== String(v ?? ''));
      if (changes.length) {
        updated++;
        db.prepare(`UPDATE assessments SET ${changes.map(([c]) => `${c} = ?`).join(', ')}, updated_at = datetime('now'), updated_by = ? WHERE id = ?`)
          .run(...changes.map(([, v]) => v), SYNC_USER, id);
        for (const [col, v] of changes) {
          if (['ticket_url', 'ticket_source', 'tester_frozen', 'seal_ticket_key'].includes(col)) continue;
          logChange.run(id, col, r[col] == null ? null : String(r[col]), v == null ? null : String(v), SYNC_USER);
        }
      }
      touch.run(id);
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  return {
    at: new Date().toISOString(),
    tickets: considered,
    matchedApps: chosen.size,
    updated,
    unmatched: unmatched.sort((a, b) => String(b.year).localeCompare(String(a.year)) || a.product.localeCompare(b.product)),
  };
}
