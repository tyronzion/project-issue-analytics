// Usage: node tracker/server/cli-import.js <workbook.xlsx>
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from './db.js';
import { parseWorkbook, previewOf, importCycles } from './importer.js';

const file = process.argv[2];
if (!file) {
  console.error('Usage: node tracker/server/cli-import.js <workbook.xlsx>');
  process.exit(1);
}
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const db = await openDb(process.env.TRACKER_DB_PATH || path.join(root, 'data', 'tracker.db'));
const parsed = parseWorkbook(fs.readFileSync(file));
for (const c of previewOf(parsed)) console.log(`${c.sheet.trim()}: ${c.rows} apps`, c.byPeriod);
console.log(importCycles(db, parsed, null, 'CLI import'));
