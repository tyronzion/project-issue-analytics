import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import express from 'express';
import { createMonitor } from './monitor.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const listen = async (app) => { const s = app.listen(0, '127.0.0.1'); await new Promise((r) => s.once('listening', r)); return s; };

// Fake UberTicket: 3 pages of 10 tickets per template list, slow activity logs.
function fakeUberTicket() {
  const app = express();
  app.get('/v1/tickets', (req, res) => {
    const page = Number(req.query.page), tpl = String(req.query._templates);
    const rows = page <= 3 ? Array.from({ length: 10 }, (_, i) => ({
      id: `${tpl}-${page}-${i}`, serial: page * 100 + i, template_id: Number(tpl.split(',')[0]), status: 'resolved',
      created_at: new Date(Date.now() - 86_400_000).toISOString(), updated_at: 'u1', data: {},
    })) : [];
    setTimeout(() => res.json({ status: 'success', data: rows, current_page: page, limit: 10, record_count: rows.length }), 15);
  });
  app.get('/v1/tickets/:id/activities', (_req, res) => setTimeout(() => res.json({ data: { activities: [] } }), 5));
  return app;
}

test('refresh reports increasing progress through lists and activity logs, then 100%', async () => {
  const api = await listen(fakeUberTicket());
  const root = await mkdtemp(path.join(tmpdir(), 'mon-'));
  const monitor = await createMonitor({
    root, log: () => {},
    env: { UBERTICKET_API: `http://127.0.0.1:${api.address().port}/v1`, UBERTICKET_TOKEN: 'a.b.c', PH_HOLIDAYS: '0' },
  });
  const server = await listen(monitor.app);
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const started = await fetch(`${base}/api/refresh`, { method: 'POST' });
    assert.equal(started.status, 202);
    const seen = [];
    for (let i = 0; i < 400; i++) {
      const p = await (await fetch(`${base}/api/progress`)).json();
      seen.push(p);
      if (!p.running) break;
      await sleep(10);
    }
    const last = seen.at(-1);
    assert.equal(last.ok, true, last.error);
    assert.equal(last.percent, 100);
    assert.equal(last.tickets, 90); // 3 lists × 30
    const pct = seen.filter((p) => p.running).map((p) => p.percent);
    assert.ok(pct.every((v, i) => i === 0 || v >= pct[i - 1]), `percent went backwards: ${pct}`);
    assert.ok(seen.some((p) => /page \d/.test(p.step)), 'shows list pages');
    assert.ok(seen.some((p) => /Reading activity logs · \d+ \/ 90/.test(p.step)), 'shows activity-log count');
    // A second click while idle starts a new run; clicking twice during a run joins it.
    await fetch(`${base}/api/refresh`, { method: 'POST' });
    const again = await (await fetch(`${base}/api/refresh`, { method: 'POST' })).json();
    assert.equal(again.running, true);
  } finally {
    monitor.stop(); server.close(); api.close();
  }
});
