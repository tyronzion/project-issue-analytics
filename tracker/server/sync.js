import { matchKey, periodForQuarter, normalizePriority } from '../shared/logic.js';

// UberTicket -> Assessment Tracker. UberTicket is the source of truth for:
//   status          ticket open = In Progress, resolved = Done (stored as ticket_state)
//   tester          assignee, frozen once the ticket is resolved
//   dates           Actual Start = submitted, Actual End = resolved (activity log)
//   time spent      Rules of Engagement "Time Spent (MM)"
//   classification  Rules of Engagement ticket = New app, Security Full Assessment ticket = Old app
// A Rules of Engagement ticket for an app that isn't in the tracker yet creates that app.
// Seals are captured separately when a ticket resolves (POST /assessments/:id/seal).
// A rejected or deleted ticket in the current quarter, with no other ticket for the app's period, puts the
// app back to Not Started (checklist, deliverables and actual dates cleared, once per ticket).

const SYNC_USER = 'UberTicket sync';

const dayOf = (ms, offsetHours) => (ms == null ? null : new Date(ms + offsetHours * 3_600_000).toISOString().slice(0, 10));

function quarterOf(ticket) {
  const q = Number(String(ticket.quarter ?? '').match(/[1-4]/)?.[0]);
  const y = Number(String(ticket.year ?? '').match(/\d{4}/)?.[0]);
  return q && y ? { quarter: q, year: y } : null;
}

const hasProduct = (t) => t.product && t.product !== 'Unspecified product';

// Matches every ticket to tracker apps: { chosen: Map(assessment id -> { ticket, source }), unmatched: [...] }.
function matchTickets(db, tickets) {
  const links = new Map(db.prepare('SELECT product_key, project FROM ticket_links').all().map((l) => [l.product_key, matchKey(l.project)]));
  const rows = db.prepare('SELECT a.*, c.track, c.year FROM assessments a JOIN cycles c ON c.id = a.cycle_id').all();
  const byKey = new Map();
  for (const r of rows) {
    const k = `${r.track}|${r.year}|${r.period}|${matchKey(r.project)}`;
    byKey.set(k, [...(byKey.get(k) || []), r]);
  }

  const chosen = new Map();
  const rejected = new Map(); // assessment id -> latest rejected ticket for that app and period
  const unmatched = [];
  let considered = 0;
  for (const source of ['full', 'roe']) {
    for (const t of tickets[source] || []) {
      const when = quarterOf(t);
      if (t.state === 'rejected') {
        if (!when) continue;
        const key = links.get(matchKey(t.product)) ?? matchKey(t.product);
        const find = (track) => byKey.get(`${track}|${when.year}|${periodForQuarter(track, when.quarter)}|${key}`) || [];
        let targets = find('quarterly');
        if (!targets.length) targets = find('biannual');
        for (const r of targets) {
          const cur = rejected.get(r.id);
          if (!cur || (t.createdAt ?? 0) > (cur.createdAt ?? 0)) rejected.set(r.id, { ...t, when });
        }
        continue;
      }
      considered++;
      const productKey = matchKey(t.product);
      const key = links.get(productKey) ?? productKey;
      const base = { key: t.key, url: t.url, source, product: t.product, productKey, state: t.state, assignee: t.assignee, quarter: when ? `Q${when.quarter}` : t.quarter, year: when?.year ?? t.year, when, ticket: t };
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
  return { rows, chosen, rejected, unmatched, considered };
}

// New apps: a Rules of Engagement ticket for a product the tracker doesn't have yet adds it to the
// Bi-Annual cycle of the ticket's year (created when missing, from the latest existing year onwards).
function createAppsFromRoe(db, unmatched) {
  const ignored = new Set(db.prepare('SELECT ticket_key FROM ticket_ignores').all().map((r) => r.ticket_key));
  const latestYear = db.prepare('SELECT MAX(year) AS y FROM cycles').get().y ?? new Date().getFullYear();
  const cycleIds = new Map(db.prepare("SELECT id, year FROM cycles WHERE track = 'biannual'").all().map((c) => [c.year, c.id]));
  const created = [];
  const seen = new Set();

  for (const u of unmatched) {
    if (u.source !== 'roe' || !u.when || !hasProduct(u.ticket) || ignored.has(u.key)) continue;
    const { year, quarter } = u.when;
    let cycleId = cycleIds.get(year);
    if (!cycleId) {
      if (year < latestYear) continue; // don't backfill old years
      cycleId = db.prepare("INSERT INTO cycles (track, year) VALUES ('biannual', ?) ON CONFLICT(track, year) DO UPDATE SET year = excluded.year RETURNING id").get(year).id;
      cycleIds.set(year, cycleId);
    }
    const period = periodForQuarter('biannual', quarter);
    const dedupe = `${cycleId}|${period}|${u.productKey}`;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);

    const t = u.ticket;
    const order = db.prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM assessments WHERE cycle_id = ? AND period = ?').get(cycleId, period).n;
    const row = db.prepare(`INSERT INTO assessments
        (cycle_id, period, sort_order, project, quarter, is_active, classification, testing_url, priority, security_tester, created_from_ticket, updated_by)
        VALUES (?, ?, ?, ?, ?, 'Active', 'New', ?, ?, ?, ?, ?) RETURNING id`)
      .get(cycleId, period, order, String(t.product).trim(), `Q${quarter}`, t.targetLink || null,
        normalizePriority('rawPriority' in t ? t.rawPriority : t.priority) || 'Medium', t.assignee && t.assignee !== 'Unassigned' ? t.assignee : null, t.key, SYNC_USER);
    db.prepare('INSERT INTO history (assessment_id, field, new_value, changed_by) VALUES (?, ?, ?, ?)')
      .run(row.id, 'created', `${t.product} (from Rules of Engagement ${t.key})`, SYNC_USER);
    created.push({ id: row.id, project: t.product, year, period, ticket: t.key });
  }
  return created;
}

// "Time Spent (MM)" as minutes (0 when empty).
const minutesOf = (t) => Number(String(t.timeSpent ?? '').replace(/[^\d.]/g, '')) || 0;

// Quarter of a moment in local time: { year, quarter }.
function quarterAt(ms, offsetHours) {
  const d = new Date(ms + offsetHours * 3_600_000);
  return { year: d.getUTCFullYear(), quarter: Math.floor(d.getUTCMonth() / 3) + 1 };
}

const PROGRESS_RESET = { checks: '{}', dependabots: 'Not Started', code_review: 'Not Started', report: 'Not Started', actual_start: null, actual_end: null };

// Puts an app back to Not Started after its ticket was rejected or deleted. Done once per ticket (a history
// entry records it), so progress entered by hand afterwards is kept. A recorded finished test is never reset.
function resetProgress(db, id, ticketKey, why) {
  const r = db.prepare('SELECT * FROM assessments WHERE id = ?').get(id);
  if (!r || r.ticket_state || r.actual_end || r.seal_ticket_key) return false;
  const note = `Not Started: ${ticketKey} ${why}`;
  if (db.prepare("SELECT 1 FROM history WHERE assessment_id = ? AND field = 'progress_reset' AND new_value = ?").get(id, note)) return false;
  const changes = Object.entries(PROGRESS_RESET).filter(([col, v]) => String(r[col] ?? '') !== String(v ?? ''));
  const log = db.prepare('INSERT INTO history (assessment_id, field, old_value, new_value, changed_by) VALUES (?, ?, ?, ?, ?)');
  if (changes.length) {
    db.prepare(`UPDATE assessments SET ${changes.map(([c]) => `${c} = ?`).join(', ')}, updated_at = datetime('now'), updated_by = ? WHERE id = ?`)
      .run(...changes.map(([, v]) => v), SYNC_USER, id);
    for (const [col, v] of changes) log.run(id, col, r[col] == null ? null : String(r[col]), v, SYNC_USER);
  }
  log.run(id, 'progress_reset', null, note, SYNC_USER);
  return changes.length > 0;
}

// tickets: { full: [...], roe: [...] } as returned by the monitor's normalizeFull().
// complete: the lists are a successful UberTicket fetch, so a linked ticket missing from them was deleted.
export function syncTickets(db, tickets, { offsetHours = 8, createApps = true, complete = false, now = Date.now() } = {}) {
  let created = [];
  let m = matchTickets(db, tickets);
  if (createApps) {
    db.exec('BEGIN');
    try {
      created = createAppsFromRoe(db, m.unmatched);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
    if (created.length) m = matchTickets(db, tickets);
  }
  const { rows, chosen, rejected: rejectedFor, unmatched, considered } = m;

  const rowById = new Map(rows.map((r) => [r.id, r]));
  const logChange = db.prepare('INSERT INTO history (assessment_id, field, old_value, new_value, changed_by) VALUES (?, ?, ?, ?, ?)');
  const touch = db.prepare("UPDATE assessments SET ticket_synced_at = datetime('now') WHERE id = ?");
  let updated = 0;
  let reset = 0;

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
        // Rules of Engagement = first test of a new app; Full Assessment = retest of an existing one.
        classification: source === 'roe' ? 'New' : 'Old',
      };
      // Tester = assignee; kept as it was at resolution (a later reassignment doesn't change it).
      if (!(sameTicket && r.tester_frozen)) {
        if (t.assignee && t.assignee !== 'Unassigned') next.security_tester = t.assignee;
        next.tester_frozen = resolved ? 1 : 0;
      }
      // Priority follows the ticket's UberTicket priority ("Normal" = Medium). The monitor defaults a ticket
      // without one to medium, so only the raw value counts; no priority on the ticket keeps the tracker's.
      const priority = normalizePriority('rawPriority' in t ? t.rawPriority : t.priority);
      if (priority) next.priority = priority;
      const minutes = minutesOf(t);
      // Time Spent (MM) from either ticket type; an empty field never clears a recorded time.
      if (minutes > 0) next.time_spent = Math.round(minutes);
      if (source === 'roe' && t.targetLink && !r.testing_url) next.testing_url = t.targetLink;
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

    // A linked ticket that was rejected later, or deleted, no longer counts: unlink it and clear what came from
    // it (status, actual dates, and the time spent if it is still the ticket's value).
    const all = [...(tickets.full || []), ...(tickets.roe || [])];
    const byTicketKey = new Map(all.map((t) => [t.key, t]));
    const rejected = new Map(all.filter((t) => t.state === 'rejected').map((t) => [t.key, t]));
    // Deleted = missing from a complete fetch whose oldest ticket is older than the linked one (so a ticket
    // beyond a lookback or page limit is never taken for deleted).
    const oldest = {};
    for (const source of ['full', 'roe']) {
      const times = (tickets[source] || []).map((t) => t.createdAt).filter((x) => x != null);
      oldest[source] = times.length ? dayOf(Math.min(...times), offsetHours) : null;
    }
    const deleted = (r) => complete && r.ticket_key && !byTicketKey.has(r.ticket_key)
      && oldest[r.ticket_source] && r.actual_start && r.actual_start >= oldest[r.ticket_source];
    const gone = []; // [row, ticket key, 'rejected' | 'deleted']
    for (const r of rows) {
      if (chosen.has(r.id) || !r.ticket_key) continue;
      const isDeleted = !rejected.has(r.ticket_key) && deleted(r);
      const t = rejected.get(r.ticket_key) || (isDeleted ? { key: r.ticket_key } : null);
      if (!t) continue;
      gone.push([r, t.key, isDeleted ? 'deleted' : 'rejected']);
      const clear = { ticket_key: null, ticket_url: null, ticket_source: null, ticket_state: null, actual_start: null, actual_end: null, tester_frozen: 0 };
      if (r.time_spent != null && r.time_spent === Math.round(minutesOf(t))) clear.time_spent = null;
      db.prepare(`UPDATE assessments SET ${Object.keys(clear).map((c) => `${c} = ?`).join(', ')}, updated_at = datetime('now'), updated_by = ? WHERE id = ?`)
        .run(...Object.values(clear), SYNC_USER, r.id);
      logChange.run(r.id, 'ticket_key', r.ticket_key, `${r.ticket_key} ${isDeleted ? 'deleted' : 'rejected'}: unlinked`, SYNC_USER);
      for (const col of ['actual_start', 'actual_end', 'time_spent']) {
        if (col in clear && r[col] != null) logChange.run(r.id, col, String(r[col]), null, SYNC_USER);
      }
      updated++;
    }

    // This quarter's test was rejected or deleted and the app has no other ticket for the period: Not Started.
    const cur = quarterAt(now, offsetHours);
    const thisQuarter = (r) => r.year === cur.year && r.period === periodForQuarter(r.track, cur.quarter);
    const resets = new Map();
    for (const [r, key, why] of gone) if (thisQuarter(r)) resets.set(r.id, [key, why]);
    for (const [id, t] of rejectedFor) {
      if (chosen.has(id) || resets.has(id)) continue;
      if (t.when.year === cur.year && t.when.quarter === cur.quarter && thisQuarter(rowById.get(id))) resets.set(id, [t.key, 'rejected']);
    }
    for (const [id, [key, why]] of resets) if (resetProgress(db, id, key, why)) reset++;
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
    reset,
    created,
    unmatched: unmatched
      .map(({ when, ticket, ...u }) => u)
      .sort((a, b) => String(b.year).localeCompare(String(a.year)) || a.product.localeCompare(b.product)),
  };
}
