import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchTemplateTickets } from './uberticket.js';

// Records the query of each GET /tickets call and returns one short page.
function stubFetch(rows) {
  const seen = [];
  const real = globalThis.fetch;
  globalThis.fetch = async (url) => {
    seen.push(new URL(url).searchParams);
    return new Response(JSON.stringify({ status: 'success', data: rows, current_page: 1, limit: 10, record_count: rows.length }), { status: 200 });
  };
  return { seen, restore: () => { globalThis.fetch = real; } };
}
const row = (id, archived) => ({ id, created_at: new Date().toISOString(), is_archived: archived });

test('archived tickets are requested by default (_includeArchived=1) and kept', async () => {
  const s = stubFetch([row('a', false), row('b', true)]);
  try {
    const rows = await fetchTemplateTickets({ api: 'https://x/v1', token: 't', templateIds: [72913], lookbackDays: 30, maxPages: 5 });
    assert.equal(s.seen[0].get('_includeArchived'), '1');
    assert.equal(s.seen[0].get('_templates'), '72913');
    assert.deepEqual(rows.map((r) => r.id), ['a', 'b']);
  } finally { s.restore(); }
});

test('includeArchived: false leaves the filter empty, like UberTicket\'s default', async () => {
  const s = stubFetch([]);
  try {
    await fetchTemplateTickets({ api: 'https://x/v1', token: 't', templateIds: [1], lookbackDays: 30, maxPages: 5, includeArchived: false });
    assert.equal(s.seen[0].get('_includeArchived'), '');
  } finally { s.restore(); }
});
