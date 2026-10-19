import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openPiaDb } from '../server/db.js';
import { syncPia } from '../server/sync.js';

const policy = (o) => ({ id: `p-${o.product}-${o.version ?? 1}`, serial: 1, url: 'https://uberticket.cloudstaff.com/admin/policies/x/view', status: 'approved', state: 'approved', version: '1', approvedAt: Date.parse('2026-01-10T02:00:00Z'), submittedAt: Date.parse('2025-12-01T02:00:00Z'), ...o });
const tracker = [{ name: 'Cloudstaff Mystaff', repositories: 'github.com/cs/mystaff' }, { name: 'NEO' }, { name: 'Old App', decommissioned: true }];
const app = (db, name) => db.prepare('SELECT * FROM apps WHERE name = ?').get(name);

test('tracker apps and PIA products form one list, matched by name', async () => {
  const db = await openPiaDb(':memory:');
  const r = syncPia(db, { trackerApps: tracker, policies: [policy({ product: 'MyStaff' }), policy({ product: 'neo' }), policy({ product: 'Sales Genie' })] });
  assert.deepEqual(r.created, ['Sales Genie']);
  assert.equal(r.apps, 4);
  const mystaff = app(db, 'Cloudstaff Mystaff');
  assert.equal(mystaff.in_tracker, 1);
  assert.equal(mystaff.from_pia, 1);
  assert.equal(mystaff.repositories, 'github.com/cs/mystaff');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM pia_policies WHERE app_id = ?').get(mystaff.id).n, 1);
  assert.equal(app(db, 'Old App').decommissioned, 1);
  assert.equal(app(db, 'Sales Genie').in_tracker, 0);
});

test('a manual link moves a PIA product onto a tracker app; the orphan PIA-only app is removed', async () => {
  const db = await openPiaDb(':memory:');
  syncPia(db, { trackerApps: tracker, policies: [policy({ product: 'Door Space' })] });
  const orphan = app(db, 'Door Space');
  assert.ok(orphan);
  db.prepare("INSERT INTO pia_links (product_key, product, app_id) VALUES ('doorspace', 'Door Space', ?)").run(app(db, 'NEO').id);
  const r = syncPia(db, { trackerApps: tracker, policies: [policy({ product: 'Door Space' })] });
  assert.deepEqual(r.removed, ['Door Space']);
  assert.equal(app(db, 'Door Space'), undefined);
  assert.equal(db.prepare('SELECT app_id FROM pia_policies').get().app_id, app(db, 'NEO').id);
});

test('the policy cache is rebuilt; admin-entered data survives every sync', async () => {
  const db = await openPiaDb(':memory:');
  syncPia(db, { trackerApps: [], policies: [policy({ product: 'Gone Soon' }), policy({ product: 'Kept' })] });
  const kept = app(db, 'Kept');
  db.prepare("INSERT INTO reassessments (app_id, assessed_on, report_url) VALUES (?, '2026-05-01', 'https://x/report')").run(kept.id);
  db.prepare("INSERT INTO apps (name, match_key, manual) VALUES ('Manual One', 'manualone', 1)").run();
  db.prepare("UPDATE apps SET hidden = 1, hidden_reason = 'internal tool' WHERE name = 'Gone Soon'").run();

  const r = syncPia(db, { trackerApps: [], policies: [] });
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM pia_policies').get().n, 0);
  assert.deepEqual(r.removed, []);
  assert.ok(app(db, 'Kept'), 'has a reassessment');
  assert.ok(app(db, 'Manual One'), 'added by an admin');
  assert.equal(app(db, 'Gone Soon').hidden_reason, 'internal tool');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM reassessments').get().n, 1);
});

test('a tracker app that is removed from the tracker keeps its PIA policies', async () => {
  const db = await openPiaDb(':memory:');
  syncPia(db, { trackerApps: [{ name: 'Jobs' }], policies: [policy({ product: 'Jobs' })] });
  syncPia(db, { trackerApps: [], policies: [policy({ product: 'Jobs' })] });
  const jobs = app(db, 'Jobs');
  assert.equal(jobs.in_tracker, 0);
  assert.equal(jobs.from_pia, 1);
});
