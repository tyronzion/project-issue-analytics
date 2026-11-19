import fs from 'node:fs';
import path from 'node:path';
import { openSqlite } from '../../tracker/server/sqlite.js';

// PIA storage: its own SQLite file (pia/data/pia.db), opened with the tracker's node:sqlite / sql.js adapter.
// Synced from UberTicket (rebuilt every sync): pia_policies, and the in_tracker / from_pia / decommissioned flags on apps.
// Entered by admins (never overwritten by the sync): manual apps, hidden apps, reassessments, pia_links, settings,
// GitHub repos, coverage decisions (+ coverage_history), scans and reassessment checks (D15).
// Scans keep paths, line numbers, identifier names and labels only: never repository file contents.
// Policy questionnaire answers are never stored (D10).
export async function openPiaDb(dbPath, options) {
  if (dbPath !== ':memory:') fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const { db, engine } = await openSqlite(dbPath, options);
  db.engine = engine;
  if (engine === 'node:sqlite') db.exec('PRAGMA journal_mode = WAL;');
  db.exec(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS apps (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      match_key TEXT NOT NULL UNIQUE,     -- matchKey(name), shared with the tracker
      in_tracker INTEGER NOT NULL DEFAULT 0,
      from_pia INTEGER NOT NULL DEFAULT 0,
      manual INTEGER NOT NULL DEFAULT 0,  -- added by an admin
      decommissioned INTEGER NOT NULL DEFAULT 0,
      repositories TEXT,
      hidden INTEGER NOT NULL DEFAULT 0,  -- an admin took it off the PIA list
      hidden_reason TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_by TEXT
    );

    -- Cache of the [PIA01] policies from the last UberTicket refresh (only the fields the PIA pages show).
    CREATE TABLE IF NOT EXISTS pia_policies (
      id TEXT PRIMARY KEY,                -- UberTicket policy uuid
      app_id INTEGER REFERENCES apps(id) ON DELETE SET NULL,
      serial INTEGER,
      url TEXT,
      product TEXT NOT NULL,
      product_key TEXT NOT NULL,
      status TEXT,
      state TEXT NOT NULL,                -- 'approved' | 'open' | 'rejected'
      version TEXT,
      risk_rating REAL,
      risk_label TEXT,
      submitter TEXT,
      approved_by TEXT,
      submitted_at INTEGER,               -- ms since epoch
      approved_at INTEGER,
      updated_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_pia_policies_app ON pia_policies(app_id);

    -- Reassessments recorded by an admin (today they are a message + report on the existing policy).
    CREATE TABLE IF NOT EXISTS reassessments (
      id INTEGER PRIMARY KEY,
      app_id INTEGER NOT NULL REFERENCES apps(id),
      assessed_on TEXT NOT NULL,          -- YYYY-MM-DD
      report_url TEXT NOT NULL,
      notes TEXT,
      recorded_by TEXT,
      recorded_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_reassessments_app ON reassessments(app_id, assessed_on);

    -- Manual links for PIA products whose names don't match an app automatically.
    CREATE TABLE IF NOT EXISTS pia_links (
      product_key TEXT PRIMARY KEY,
      product TEXT NOT NULL,
      app_id INTEGER NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
      linked_by TEXT,
      linked_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS history (
      id INTEGER PRIMARY KEY,
      app_id INTEGER NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
      field TEXT NOT NULL,
      old_value TEXT,
      new_value TEXT,
      changed_by TEXT,
      changed_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_pia_history_app ON history(app_id, changed_at);

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    -- Repository scans (one row per repo per run). summary: the scanner's JSON summary without fields.
    CREATE TABLE IF NOT EXISTS scans (
      id INTEGER PRIMARY KEY,
      app_id INTEGER NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
      repo TEXT NOT NULL,
      branch TEXT,
      commit_sha TEXT,
      ruleset_version TEXT,
      status TEXT NOT NULL,               -- 'ok' | 'truncated' | 'error'
      files_considered INTEGER,
      files_read INTEGER,
      summary TEXT,
      error TEXT,
      scanned_by TEXT,
      scanned_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_scans_app ON scans(app_id, repo, id);

    CREATE TABLE IF NOT EXISTS scan_findings (
      id INTEGER PRIMARY KEY,
      scan_id INTEGER NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
      path TEXT NOT NULL,
      line INTEGER,
      framework TEXT,
      identifier TEXT NOT NULL,
      category TEXT NOT NULL,
      sensitivity TEXT NOT NULL,          -- 'personal' | 'sensitive' | 'credential'
      confidence TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_findings_scan ON scan_findings(scan_id);

    -- "Does this app need its own PIA?" decided by an admin (the scan only recommends).
    CREATE TABLE IF NOT EXISTS coverage (
      app_id INTEGER PRIMARY KEY REFERENCES apps(id) ON DELETE CASCADE,
      status TEXT NOT NULL,               -- 'own' | 'covered' | 'not_required'
      parent_app_id INTEGER REFERENCES apps(id) ON DELETE SET NULL,
      parent_policy_id TEXT,
      reason TEXT NOT NULL,
      recommendation TEXT,                -- what the scan recommended when this was decided
      evidence_scan_ids TEXT,             -- JSON [scan id, …]
      needs_review INTEGER NOT NULL DEFAULT 0,
      review_note TEXT,
      decided_by TEXT,
      decided_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Append-only trail of coverage decisions.
    CREATE TABLE IF NOT EXISTS coverage_history (
      id INTEGER PRIMARY KEY,
      app_id INTEGER NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
      old_status TEXT,
      new_status TEXT,
      old_parent TEXT,
      new_parent TEXT,
      reason TEXT,
      evidence TEXT,
      changed_by TEXT,
      changed_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Yearly reassessment checks: what changed in the repos since the last assessment (JSON, no file contents).
    CREATE TABLE IF NOT EXISTS reassessment_checks (
      id INTEGER PRIMARY KEY,
      app_id INTEGER NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
      since TEXT,
      result TEXT NOT NULL,
      checked_by TEXT,
      checked_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  // Added 2026-10-30: GitHub repositories an admin linked to the app (JSON ["owner/repo", …]).
  const cols = db.prepare('PRAGMA table_info(apps)').all().map((c) => c.name);
  if (!cols.includes('github_repos')) db.exec('ALTER TABLE apps ADD COLUMN github_repos TEXT');
  return db;
}

export const parseJson = (s, fallback) => {
  try {
    return s ? JSON.parse(s) : fallback;
  } catch {
    return fallback;
  }
};

export const appToApi = (r) => ({
  id: r.id,
  name: r.name,
  matchKey: r.match_key,
  inTracker: !!r.in_tracker,
  fromPia: !!r.from_pia,
  manual: !!r.manual,
  decommissioned: !!r.decommissioned,
  repositories: r.repositories || '',
  githubRepos: parseJson(r.github_repos, []),
  hidden: !!r.hidden,
  hiddenReason: r.hidden_reason || '',
  updatedAt: r.updated_at,
  updatedBy: r.updated_by,
});

export const policyToApi = (r) => ({
  id: r.id,
  appId: r.app_id,
  serial: r.serial,
  url: r.url,
  product: r.product,
  productKey: r.product_key,
  status: r.status,
  state: r.state,
  version: r.version,
  riskRating: r.risk_rating,
  riskLabel: r.risk_label,
  submitter: r.submitter,
  approvedBy: r.approved_by,
  submittedAt: r.submitted_at,
  approvedAt: r.approved_at,
  updatedAt: r.updated_at,
});

export const reassessmentToApi = (r) => ({
  id: r.id,
  appId: r.app_id,
  assessedOn: r.assessed_on,
  reportUrl: r.report_url,
  notes: r.notes || '',
  recordedBy: r.recorded_by,
  recordedAt: r.recorded_at,
});

export const scanToApi = (r, fields = []) => ({
  id: r.id,
  appId: r.app_id,
  repo: r.repo,
  branch: r.branch,
  sha: r.commit_sha,
  rulesetVersion: r.ruleset_version,
  status: r.status,
  filesConsidered: r.files_considered,
  filesRead: r.files_read,
  summary: parseJson(r.summary, {}),
  error: r.error || '',
  scannedBy: r.scanned_by,
  scannedAt: r.scanned_at,
  fields,
});

export const findingToApi = (r) => ({ path: r.path, line: r.line, framework: r.framework, identifier: r.identifier, category: r.category, sensitivity: r.sensitivity, confidence: r.confidence });

export const coverageToApi = (r) => (r ? {
  status: r.status,
  parentAppId: r.parent_app_id,
  parentPolicyId: r.parent_policy_id || null,
  reason: r.reason,
  recommendation: r.recommendation || null,
  evidenceScanIds: parseJson(r.evidence_scan_ids, []),
  needsReview: !!r.needs_review,
  reviewNote: r.review_note || '',
  decidedBy: r.decided_by,
  decidedAt: r.decided_at,
} : null);
