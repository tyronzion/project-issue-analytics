import fs from 'node:fs';
import path from 'node:path';
import { openSqlite } from './sqlite.js';
import { matchKey } from '../shared/logic.js';
import { ensureTargetTables } from './targets.js';

// Assessment Tracker storage: one SQLite file, via node:sqlite (Node 22.13+) or sql.js on older Node.
export async function openDb(dbPath, options) {
  if (dbPath !== ':memory:') fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const { db, engine } = await openSqlite(dbPath, options);
  db.engine = engine;
  // WAL needs a real file handle; sql.js works on an in-memory copy.
  if (engine === 'node:sqlite') db.exec('PRAGMA journal_mode = WAL;');
  db.exec(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS cycles (
      id INTEGER PRIMARY KEY,
      track TEXT NOT NULL,            -- 'biannual' | 'quarterly'
      year INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (track, year)
    );

    CREATE TABLE IF NOT EXISTS assessments (
      id INTEGER PRIMARY KEY,
      cycle_id INTEGER NOT NULL REFERENCES cycles(id) ON DELETE CASCADE,
      period TEXT NOT NULL,           -- '1st Half', '3rd Quarter', ...
      sort_order INTEGER NOT NULL DEFAULT 0,
      project TEXT NOT NULL,
      quarter TEXT,
      is_active TEXT,
      classification TEXT,
      repositories TEXT,
      testing_url TEXT,
      priority TEXT,
      ba_assigned TEXT,
      security_tester TEXT,
      co_tester TEXT,
      checks TEXT NOT NULL DEFAULT '{}',
      mobile_app INTEGER NOT NULL DEFAULT 0,
      dependabots TEXT DEFAULT 'Not Started',
      code_review TEXT DEFAULT 'Not Started',
      report TEXT DEFAULT 'Not Started',
      planned_start TEXT,
      planned_end TEXT,
      actual_start TEXT,
      actual_end TEXT,
      time_spent INTEGER,
      seal TEXT,
      notes TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_by TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_assess_cycle ON assessments(cycle_id, period, sort_order);

    CREATE TABLE IF NOT EXISTS history (
      id INTEGER PRIMARY KEY,
      assessment_id INTEGER NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
      field TEXT NOT NULL,
      old_value TEXT,
      new_value TEXT,
      changed_by TEXT,
      changed_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_history_assess ON history(assessment_id, changed_at);

    -- Manual links for UberTicket products whose names don't match an app automatically.
    CREATE TABLE IF NOT EXISTS ticket_links (
      product_key TEXT PRIMARY KEY,   -- matchKey(ticket product)
      product TEXT NOT NULL,
      project TEXT NOT NULL,          -- tracker project name it belongs to
      linked_by TEXT,
      linked_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Rules of Engagement tickets whose auto-created app was deleted: don't create it again.
    CREATE TABLE IF NOT EXISTS ticket_ignores (
      ticket_key TEXT PRIMARY KEY,
      product TEXT,
      ignored_by TEXT,
      ignored_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Columns added after the first release.
  const existing = new Set(db.prepare('PRAGMA table_info(assessments)').all().map((c) => c.name));
  for (const [col, type] of [
    ['decommissioned_at', 'TEXT'],
    ['decommission_reason', 'TEXT'],
    ['ticket_key', 'TEXT'],          // UB-12345
    ['ticket_url', 'TEXT'],
    ['ticket_source', 'TEXT'],       // 'full' | 'roe'
    ['ticket_state', 'TEXT'],        // 'open' | 'resolved'
    ['ticket_synced_at', 'TEXT'],
    ['tester_frozen', 'INTEGER NOT NULL DEFAULT 0'],
    ['seal_source', 'TEXT'],         // 'excel' | 'manual' | 'auto'
    ['seal_ticket_key', 'TEXT'],     // ticket whose resolution the seal belongs to
    ['seal_at', 'TEXT'],
    ['created_from_ticket', 'TEXT'], // set when the app was created from a Rules of Engagement ticket
    ['report_info', 'TEXT'],         // JSON: assessment report text and links (shared/report.js REPORT_INFO_FIELDS)
    ['report_snapshot', 'TEXT'],     // JSON: frozen report data once the ticket resolved { ticketKey, asOf, issues, capturedAt, capturedBy }
    ['created_from_target', 'INTEGER NOT NULL DEFAULT 0'], // 1 = added for a Target Project List app (targets.js)
  ]) {
    if (!existing.has(col)) db.exec(`ALTER TABLE assessments ADD COLUMN ${col} ${type}`);
  }
  // Seals recorded before seal_source existed came from the Excel workbook.
  db.exec("UPDATE assessments SET seal_source = 'excel' WHERE seal IS NOT NULL AND seal_source IS NULL");
  ensureTargetTables(db);
  return db;
}

// camelCase API field <-> snake_case column (fields editable through PATCH).
export const FIELDS = {
  period: 'period',
  sortOrder: 'sort_order',
  project: 'project',
  quarter: 'quarter',
  isActive: 'is_active',
  classification: 'classification',
  repositories: 'repositories',
  testingUrl: 'testing_url',
  priority: 'priority',
  baAssigned: 'ba_assigned',
  securityTester: 'security_tester',
  coTester: 'co_tester',
  checks: 'checks',
  mobileApp: 'mobile_app',
  dependabots: 'dependabots',
  codeReview: 'code_review',
  report: 'report',
  plannedStart: 'planned_start',
  plannedEnd: 'planned_end',
  actualStart: 'actual_start',
  actualEnd: 'actual_end',
  timeSpent: 'time_spent',
  seal: 'seal',
  notes: 'notes',
  decommissionedAt: 'decommissioned_at',
  decommissionReason: 'decommission_reason',
  reportInfo: 'report_info',
};

// Read-only fields maintained by the UberTicket sync.
const SYNC_FIELDS = {
  ticketKey: 'ticket_key',
  ticketUrl: 'ticket_url',
  ticketSource: 'ticket_source',
  ticketState: 'ticket_state',
  ticketSyncedAt: 'ticket_synced_at',
  sealSource: 'seal_source',
  sealTicketKey: 'seal_ticket_key',
  sealAt: 'seal_at',
  createdFromTicket: 'created_from_ticket',
};

export function toApi(row) {
  const out = { id: row.id, cycleId: row.cycle_id, updatedAt: row.updated_at, updatedBy: row.updated_by };
  for (const [k, col] of Object.entries({ ...FIELDS, ...SYNC_FIELDS })) out[k] = row[col];
  out.checks = JSON.parse(row.checks || '{}');
  out.reportInfo = parseJson(row.report_info);
  out.reportSnapshot = parseJson(row.report_snapshot);
  out.mobileApp = !!row.mobile_app;
  out.testerFrozen = !!row.tester_frozen;
  return out;
}

function parseJson(s) {
  try {
    return s ? JSON.parse(s) : null;
  } catch {
    return null;
  }
}

export function toDb(value, key) {
  if (key === 'checks') return JSON.stringify(value || {});
  if (key === 'reportInfo') return value ? JSON.stringify(value) : null;
  if (key === 'mobileApp') return value ? 1 : 0;
  if (key === 'timeSpent' || key === 'sortOrder') return value === '' || value == null ? null : Number(value);
  return value ?? null;
}

// Every app in the tracker, as of its most recent cycle (read by the PIA module for its app list, and by the
// analytics pages, which hide apps decommissioned here).
export function listApps(db) {
  const rows = db.prepare('SELECT a.project, a.repositories, a.is_active, a.decommissioned_at, a.decommission_reason, c.year FROM assessments a JOIN cycles c ON c.id = a.cycle_id ORDER BY c.year DESC, a.id DESC').all();
  const apps = new Map();
  for (const r of rows) {
    const key = matchKey(r.project);
    if (key && !apps.has(key)) {
      const decommissioned = r.is_active === 'Decommissioned';
      apps.set(key, {
        name: r.project,
        repositories: r.repositories || '',
        decommissioned,
        decommissionedAt: decommissioned ? r.decommissioned_at || null : null,
        decommissionReason: decommissioned ? r.decommission_reason || null : null,
        year: r.year,
      });
    }
  }
  return [...apps.values()];
}
