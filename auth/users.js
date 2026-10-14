// Users and roles. Two roles:
//   admin  everything, including data changes (import/merge/delete/Jira), monitor & tracker setup
//          (UberTicket token, tracker Excel import, UberTicket sync links) and managing users
//   user   everything else
// Who may sign in at all is still decided in Microsoft Entra ("Assignment required"); this only decides
// what a signed-in person may do. Everyone who signs in is recorded here, as "user" unless an admin
// changed them (or added them in advance by email).
//
// AUTH_ADMIN_EMAILS (comma-separated, .env.local) are always admin and can't be changed from the app, so
// there is always a way back in. Stored in auth/data/users.json (git-ignored, never served).

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const ROLES = ['admin', 'user'];
const EMAIL = /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/;

export class UserError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const norm = (email) => String(email || '').trim().toLowerCase();

export async function createUserStore({ file, adminEmails = '', now = () => Date.now(), log = (m) => console.log(`[users] ${m}`) }) {
  const settingsAdmins = new Set(String(adminEmails).split(',').map(norm).filter(Boolean));
  let users = [];
  let readOnly = false;

  try {
    const parsed = JSON.parse(await readFile(file, 'utf8'));
    if (!Array.isArray(parsed?.users)) throw new Error('missing "users" list');
    users = parsed.users.filter((u) => u && EMAIL.test(norm(u.email))).map((u) => ({ ...u, email: norm(u.email), role: ROLES.includes(u.role) ? u.role : 'user' }));
  } catch (err) {
    if (err.code !== 'ENOENT') {
      // Don't overwrite a file we couldn't read; fall back to least privilege until someone fixes it.
      readOnly = true;
      log(`ERROR: could not read ${file} (${err.message}). Everyone except AUTH_ADMIN_EMAILS is treated as "user" and role changes are disabled until the file is fixed.`);
    }
  }
  if (!settingsAdmins.size) log('AUTH_ADMIN_EMAILS is not set; only admins chosen in the app can manage users.');

  let writing = Promise.resolve();
  function save() {
    if (readOnly) throw new UserError(500, 'The users file could not be read, so changes are disabled. Check the server log.');
    const data = JSON.stringify({ users }, null, 2);
    writing = writing.then(async () => {
      await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
      const tmp = `${file}.${process.pid}.tmp`;
      await writeFile(tmp, data, { mode: 0o600 });
      await rename(tmp, file);
    });
    return writing;
  }

  const find = ({ oid, email }) => (oid && users.find((u) => u.oid && u.oid === oid)) || users.find((u) => u.email === norm(email)) || null;
  const isSettingsAdmin = (email) => settingsAdmins.has(norm(email));

  function roleOf(identity) {
    if (!identity) return null;
    if (isSettingsAdmin(identity.email)) return 'admin';
    if (readOnly) return 'user';
    return find(identity)?.role || 'user';
  }

  const adminCount = () => new Set([...settingsAdmins, ...users.filter((u) => u.role === 'admin').map((u) => u.email)]).size;

  function view(u) {
    const fromSettings = isSettingsAdmin(u.email);
    return { email: u.email, name: u.name || '', role: fromSettings ? 'admin' : u.role, fromSettings, lastSignIn: u.lastSignIn || null, addedBy: u.addedBy || null, updatedBy: u.updatedBy || null, updatedAt: u.updatedAt || null };
  }

  return {
    roleOf,
    isReadOnly: () => readOnly,

    // Called after every Microsoft sign-in: records the person (matched by Entra object id, else email).
    async recordSignIn({ oid, email, name }) {
      if (readOnly || !EMAIL.test(norm(email))) return;
      let u = find({ oid, email });
      if (!u) {
        u = { email: norm(email), role: 'user', addedBy: 'first sign-in', addedAt: new Date(now()).toISOString() };
        users.push(u);
        log(`new user ${u.email} (role: ${roleOf({ oid, email })})`);
      }
      Object.assign(u, { oid: oid || u.oid, email: norm(email), name: name || u.name, lastSignIn: new Date(now()).toISOString() });
      await save();
    },

    list() {
      const rows = users.map(view);
      for (const email of settingsAdmins) if (!users.some((u) => u.email === email)) rows.push(view({ email, role: 'admin' }));
      return rows.sort((a, b) => a.email.localeCompare(b.email));
    },

    async add(email, role, actor) {
      const e = norm(email);
      if (!EMAIL.test(e)) throw new UserError(400, 'Enter a valid email address.');
      if (!ROLES.includes(role)) throw new UserError(400, 'Role must be admin or user.');
      if (find({ email: e }) || isSettingsAdmin(e)) throw new UserError(409, 'That person is already in the list.');
      users.push({ email: e, role, addedBy: actor.email, addedAt: new Date(now()).toISOString() });
      await save();
      log(`${actor.email} added ${e} as ${role}`);
      return view(find({ email: e }));
    },

    async setRole(email, role, actor) {
      const u = find({ email });
      if (!ROLES.includes(role)) throw new UserError(400, 'Role must be admin or user.');
      if (isSettingsAdmin(email)) throw new UserError(400, 'This admin is set in AUTH_ADMIN_EMAILS on the server and can only be changed there.');
      if (!u) throw new UserError(404, 'User not found.');
      if (u.role === 'admin' && role !== 'admin' && adminCount() <= 1) throw new UserError(409, 'At least one admin must remain.');
      if (u.role !== role) {
        const before = u.role;
        Object.assign(u, { role, updatedBy: actor.email, updatedAt: new Date(now()).toISOString() });
        await save();
        log(`${actor.email} changed ${u.email} from ${before} to ${role}`);
      }
      return view(u);
    },

    async remove(email, actor) {
      const u = find({ email });
      if (isSettingsAdmin(email)) throw new UserError(400, 'This admin is set in AUTH_ADMIN_EMAILS on the server and can only be changed there.');
      if (!u) throw new UserError(404, 'User not found.');
      if (norm(email) === norm(actor.email)) throw new UserError(400, 'You cannot remove yourself.');
      if (u.role === 'admin' && adminCount() <= 1) throw new UserError(409, 'At least one admin must remain.');
      users = users.filter((x) => x !== u);
      await save();
      log(`${actor.email} removed ${u.email}`);
    },

    flush: () => writing,
  };
}
