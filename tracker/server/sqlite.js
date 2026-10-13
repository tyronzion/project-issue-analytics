import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

// Opens the tracker database with Node's built-in node:sqlite (Node 22.13+), or, on older Node,
// with sql.js (SQLite compiled to WebAssembly). Both read and write the same .db file and expose
// the small DatabaseSync subset the tracker uses: exec(), prepare().get/all/run().
export async function openSqlite(file, { prefer = process.env.TRACKER_SQLITE } = {}) {
  if (prefer !== 'sqljs') {
    try {
      const { DatabaseSync } = await import('node:sqlite');
      return { db: new DatabaseSync(file), engine: 'node:sqlite' };
    } catch {
      // Not available on this Node version: fall back to sql.js.
    }
  }
  const require = createRequire(import.meta.url);
  const initSqlJs = require('sql.js');
  const SQL = await initSqlJs();
  return { db: new SqlJsDatabase(SQL, file), engine: 'sql.js' };
}

const WRITE = /^\s*(INSERT|UPDATE|DELETE|REPLACE|CREATE|ALTER|DROP)\b/i;
const bindable = (params) => params.map((v) => (v === undefined ? null : typeof v === 'boolean' ? Number(v) : v));

// sql.js keeps the database in memory; it is written back to the file after every change
// (or at COMMIT inside a transaction). The tracker database is small, so this is cheap.
class SqlJsDatabase {
  constructor(SQL, file) {
    this.file = file;
    this.memory = file === ':memory:';
    this.inTransaction = false;
    this.db = !this.memory && fs.existsSync(file) ? new SQL.Database(fs.readFileSync(file)) : new SQL.Database();
  }

  exec(sql) {
    this.db.exec(sql);
    if (/^\s*BEGIN\b/i.test(sql)) this.inTransaction = true;
    else if (/^\s*(COMMIT|ROLLBACK|END)\b/i.test(sql)) {
      this.inTransaction = false;
      this.save();
    } else this.save();
  }

  prepare(sql) {
    return new SqlJsStatement(this, sql);
  }

  afterStatement(sql) {
    if (WRITE.test(sql) && !this.inTransaction) this.save();
  }

  save() {
    if (this.memory) return;
    const tmp = `${this.file}.tmp`;
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(tmp, Buffer.from(this.db.export()));
    fs.renameSync(tmp, this.file);
  }
}

class SqlJsStatement {
  constructor(owner, sql) {
    this.owner = owner;
    this.sql = sql;
  }

  rows(params, limit = Infinity) {
    const stmt = this.owner.db.prepare(this.sql);
    try {
      stmt.bind(bindable(params));
      const out = [];
      while (out.length < limit && stmt.step()) out.push(stmt.getAsObject());
      // Finish a write (e.g. INSERT ... RETURNING) even when only the first row is read.
      if (limit !== Infinity && WRITE.test(this.sql)) while (stmt.step());
      return out;
    } finally {
      stmt.free();
      this.owner.afterStatement(this.sql);
    }
  }

  get(...params) {
    return this.rows(params, 1)[0];
  }

  all(...params) {
    return this.rows(params);
  }

  run(...params) {
    this.rows(params);
    return { changes: this.owner.db.getRowsModified() };
  }
}
