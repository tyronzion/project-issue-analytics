import React, { useCallback, useEffect, useState } from 'react';
import { ShieldCheck, Trash2, UserPlus, Users } from 'lucide-react';

// Users & roles (admins only; the server enforces this too, see auth/users.js).
// Who may sign in at all is controlled in Microsoft Entra, not here.

type Role = 'admin' | 'user';

interface ManagedUser {
  email: string;
  name: string;
  role: Role;
  fromSettings: boolean;
  lastSignIn: string | null;
}

async function request(method: string, url: string, body?: unknown) {
  const response = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error || `Request failed (${response.status})`);
  return payload;
}

const userUrl = (email: string) => `/auth/users/${encodeURIComponent(email)}`;

function formatWhen(value: string | null): string {
  if (!value) return 'Not yet';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Not yet' : date.toLocaleString();
}

export const UsersPage: React.FC = () => {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [me, setMe] = useState('');
  const [readOnly, setReadOnly] = useState(false);
  const [mode, setMode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState<Role>('user');

  const load = useCallback(async () => {
    try {
      const data = await request('GET', '/auth/users');
      setUsers(data.users || []);
      setMe(String(data.me || '').toLowerCase());
      setReadOnly(Boolean(data.readOnly));
      setMode(String(data.mode || ''));
      setError('');
    } catch (err: any) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError('');
    try {
      await action();
      await load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleAdd = (event: React.FormEvent) => {
    event.preventDefault();
    run(async () => {
      await request('POST', '/auth/users', { email: newEmail, role: newRole });
      setNewEmail('');
      setNewRole('user');
    });
  };

  const handleRemove = (user: ManagedUser) => {
    if (!window.confirm(`Remove ${user.email}? They keep access if they're assigned in Microsoft Entra, and become a User the next time they sign in.`)) return;
    run(() => request('DELETE', userUrl(user.email)));
  };

  const adminCount = users.filter(user => user.role === 'admin').length;

  // .at-root: reuses the tracker's input, alert and button styles (tracker.css).
  return (
    <div className="at-root space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-100 flex items-center gap-2">
            <Users className="w-6 h-6 text-blue-400" />
            Users & Roles
          </h1>
          <p className="text-sm text-slate-400 mt-1 max-w-3xl">
            <b>Admins</b> can do everything, including data changes (import, merge, delete, Jira), UberTicket and tracker setup, and managing users.{' '}
            <b>Users</b> can use everything else. Who may sign in at all is controlled in Microsoft Entra.
          </p>
        </div>
        <span className="text-xs text-slate-400">{users.length} people · {adminCount} admin{adminCount === 1 ? '' : 's'}</span>
      </div>

      {error && (
        <div className="at-alert at-alert--error" role="alert">{error}</div>
      )}
      {mode === 'classic' && (
        <div className="at-alert at-alert--info" role="status">
          Microsoft sign-in isn't set up yet, so everyone uses the shared classic login, which is an admin. You can set up
          people and roles here now; they take effect once Microsoft sign-in is configured.
        </div>
      )}
      {readOnly && (
        <div className="at-alert at-alert--warn" role="status">
          The users file on the server could not be read, so roles can't be changed and everyone except the server-set admins is treated as a User. Check the server log.
        </div>
      )}

      <form onSubmit={handleAdd} className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-wrap items-end gap-3 shadow-sm">
        <label className="flex-1 min-w-[240px] text-xs font-semibold text-slate-400 space-y-1">
          <span>Add someone before they sign in</span>
          <input
            type="email"
            required
            value={newEmail}
            onChange={event => setNewEmail(event.target.value)}
            placeholder="name@cloudstaff.com"
            className="w-full at-input"
          />
        </label>
        <label className="text-xs font-semibold text-slate-400 space-y-1">
          <span>Role</span>
          <select value={newRole} onChange={event => setNewRole(event.target.value as Role)} className="at-input block">
            <option value="user">User</option>
            <option value="admin">Admin</option>
          </select>
        </label>
        <button type="submit" disabled={busy || readOnly} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-xs rounded-lg">
          <UserPlus className="w-4 h-4" />
          Add
        </button>
      </form>

      <div className="cs-table-shell overflow-x-auto">
        <table className="cs-data-table w-full text-sm">
          <thead>
            <tr>
              <th className="text-left px-4 py-2">Person</th>
              <th className="text-left px-4 py-2">Role</th>
              <th className="text-left px-4 py-2">Last sign-in</th>
              <th className="px-4 py-2"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {users.map(user => {
              const isMe = user.email === me;
              return (
                <tr key={user.email}>
                  <td className="px-4 py-3">
                    <div className="font-semibold">{user.name || user.email}{isMe && <span className="text-slate-400 font-normal"> (you)</span>}</div>
                    {user.name && <div className="text-xs text-slate-400">{user.email}</div>}
                  </td>
                  <td className="px-4 py-3">
                    {user.fromSettings ? (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold" title="Set in AUTH_ADMIN_EMAILS on the server">
                        <ShieldCheck className="w-4 h-4 text-blue-400" />
                        Admin (set on server)
                      </span>
                    ) : (
                      <select
                        aria-label={`Role for ${user.email}`}
                        value={user.role}
                        disabled={busy || readOnly}
                        onChange={event => run(() => request('PATCH', userUrl(user.email), { role: event.target.value }))}
                        className="at-input"
                      >
                        <option value="user">User</option>
                        <option value="admin">Admin</option>
                      </select>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-400">{formatWhen(user.lastSignIn)}</td>
                  <td className="px-4 py-3 text-right">
                    {!user.fromSettings && !isMe && (
                      <button
                        type="button"
                        onClick={() => handleRemove(user)}
                        disabled={busy || readOnly}
                        className="at-btn-danger"
                        title={`Remove ${user.email}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Remove
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {users.length === 0 && !error && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-slate-400">Nobody has signed in yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
