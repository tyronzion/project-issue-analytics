import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchTemplateTickets, fetchTemplatePolicies } from './uberticket.js';

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

test('PIA policies: GET /policies/search for the template, every page, no lookback cutoff', async () => {
  const calls = [];
  const real = globalThis.fetch;
  const old = { id: 'old', created_at: '2019-01-01T00:00:00Z' };
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: new URL(url), method: init.method ?? 'GET' });
    const page = Number(new URL(url).searchParams.get('page'));
    const rows = page === 1 ? Array.from({ length: 10 }, (_, i) => ({ ...old, id: `p${i}` })) : [{ ...old, id: 'last' }];
    return new Response(JSON.stringify({ status: 'success', data: rows, current_page: page, limit: 10, record_count: rows.length }), { status: 200 });
  };
  try {
    const rows = await fetchTemplatePolicies({ api: 'https://x/v1', token: 't', templateIds: [379488], maxPages: 5 });
    assert.equal(rows.length, 11);
    assert.equal(calls.length, 2);
    for (const c of calls) {
      assert.equal(c.method, 'GET');
      assert.equal(c.url.pathname, '/v1/policies/search');
      assert.equal(c.url.searchParams.get('_templates'), '379488');
    }
  } finally { globalThis.fetch = real; }
});
