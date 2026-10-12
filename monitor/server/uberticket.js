// Read-only client for the UberTicket API (GET /tickets and GET /tickets/{id}/activities only).

export class AuthError extends Error {}

// includeArchived: also return archived tickets (UberTicket's "Include archived" filter sends _includeArchived=1).
export async function fetchTemplateTickets({ api, token, templateIds, lookbackDays, maxPages, includeArchived = true, log = () => {} }) {
  const cutoff = Date.now() - lookbackDays * 86_400_000;
  const all = [];
  const seen = new Set();

  for (let page = 1; page <= maxPages; page++) {
    const qs = new URLSearchParams({
      page: String(page),
      _keyword: '', _category: '', _assignees: '', _submitters: '', _approvals: '',
      _templates: templateIds.join(','),
      _tags: '', _labels: '', _submittedRange: '', _includeSubject: '', _includeWorkflow: '',
      _includeArchived: includeArchived ? '1' : '', _assignee_me: '', _hasAdvanceFilter: 'true',
    });
    const body = await getJson(`${api}/tickets?${qs}`, token);
    const rows = Array.isArray(body.data) ? body.data : body.data?.data ?? [];
    for (const r of rows) if (!seen.has(r.id)) { seen.add(r.id); all.push(r); }
    log(`page ${page}: ${rows.length} tickets`);

    const limit = Number(body.limit) || rows.length;
    if (rows.length === 0 || rows.length < limit) break;
    if (rows.every((r) => Date.parse(r.created_at) < cutoff)) break;
  }
  return all.filter((r) => Date.parse(r.created_at) >= cutoff);
}

async function getJson(url, token) {
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      Origin: 'https://uberticket.cloudstaff.com',
      Referer: 'https://uberticket.cloudstaff.com/',
    },
  });
  if (res.status === 401 || res.status === 403) throw new AuthError(`UberTicket rejected the token (HTTP ${res.status})`);
  if (!res.ok) throw new Error(`UberTicket API HTTP ${res.status} for ${new URL(url).pathname}`);
  return res.json();
}

// Reads a ticket's activity log, the source of truth for when a ticket was submitted and resolved.
export async function fetchActivitySummary({ api, token, ticketId }) {
  const body = await getJson(`${api}/tickets/${ticketId}/activities`, token);
  return summarizeActivities(body.data?.activities ?? []);
}

const plain = (a) => String(a.activity || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

// From the activity log:
//  - submitted_at: the earliest entry (ticket creation / endorsement)
//  - resolved_at:  the latest "Status: Resolved" entry (so a reopened-then-resolved ticket counts its final resolution);
//                  "Status: Closed" is used only if there is no Resolved entry
export function summarizeActivities(activities) {
  let submitted = null, resolved = null, closed = null;
  for (const a of activities) {
    const at = Date.parse(a.created_at);
    if (Number.isNaN(at)) continue;
    const text = plain(a);
    if (submitted == null || at < submitted) submitted = at;
    if (/Status:\s*Resolved\b/i.test(text) && (resolved == null || at > resolved)) resolved = at;
    if (/Status:\s*Closed\b|automatically closed/i.test(text) && (closed == null || at > closed)) closed = at;
  }
  const iso = (t) => (t == null ? null : new Date(t).toISOString());
  return {
    activity_submitted_at: iso(submitted),
    activity_resolved_at: iso(resolved ?? closed),
  };
}

// Runs fn over items with at most `limit` in flight.
export async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); }
  }));
  return out;
}
