import { useEffect, useState } from 'react';
import { Github, KeyRound, PlugZap } from 'lucide-react';
import { piaApi } from './api.js';

// GitHub access for the PIA repository scan (admins). A GitHub App with read-only Contents + Metadata access,
// installed on the Cloudstaff org for selected repositories. The private key is write-only here: it is stored
// encrypted on the server and never shown again.
export default function GithubSettings() {
  const [info, setInfo] = useState(null);
  const [form, setForm] = useState({ appId: '', orgs: '', privateKey: '' });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  const load = () => piaApi.github().then((d) => { setInfo(d); setForm({ appId: d.appId || '', orgs: d.orgs.join(', '), privateKey: '' }); }).catch((e) => setMsg({ kind: 'error', text: e.message }));
  useEffect(() => { load(); }, []);

  async function run(fn, ok) {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fn();
      if (r && 'configured' in r) { setInfo(r); setForm((f) => ({ ...f, privateKey: '' })); }
      setMsg(ok(r));
    } catch (e) {
      setMsg({ kind: 'error', text: e.message });
    } finally {
      setBusy(false);
    }
  }

  function save(e) {
    e.preventDefault();
    const body = { appId: form.appId.trim(), orgs: form.orgs.split(/[\s,]+/).filter(Boolean) };
    if (form.privateKey.trim()) body.privateKey = form.privateKey;
    run(() => piaApi.saveGithub(body), () => ({ kind: 'info', text: 'Saved.' }));
  }

  return (
    <section className="at-card space-y-3 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Github className="w-4 h-4" aria-hidden />
        <h2 className="text-base font-bold">GitHub access (repository scan)</h2>
        <span className={`ml-auto pia-status pia-status--${info?.configured ? 'current' : 'never'}`}>{info?.configured ? 'Set up' : 'Not set up'}</span>
      </div>
      <p className="text-sm at-muted">
        The PIA scan reads repositories through a <b>GitHub App</b> with read-only <b>Contents</b> and <b>Metadata</b> permissions, installed on the
        organisation for selected repositories. An org owner creates it (Organisation settings → Developer settings → GitHub Apps), generates a private key,
        and installs it. Only repositories of the organisations listed here can be scanned. Nothing is written to GitHub.
      </p>
      {info?.demo && <div className="at-alert at-alert--info">Demo mode: scans read synthetic repositories ({info.demoRepos.join(', ')}), not GitHub.</div>}
      <form onSubmit={save} className="grid gap-3 md:grid-cols-2">
        <label><span className="at-label">App ID</span>
          <input value={form.appId} onChange={(e) => setForm({ ...form, appId: e.target.value })} inputMode="numeric" pattern="\d{1,12}" required className="at-input w-full" />
        </label>
        <label><span className="at-label">Allowed organisations</span>
          <input value={form.orgs} onChange={(e) => setForm({ ...form, orgs: e.target.value })} required placeholder="e.g. cloudstaff" className="at-input w-full" />
        </label>
        <label className="md:col-span-2"><span className="at-label">Private key (.pem) {info?.keySet ? `· saved ${info.keySavedAt ? new Date(info.keySavedAt).toLocaleString() : ''}; paste a new one to replace it` : ''}</span>
          <textarea rows={3} value={form.privateKey} onChange={(e) => setForm({ ...form, privateKey: e.target.value })} required={!info?.keySet} autoComplete="off" spellCheck={false}
            placeholder={info?.keySet ? 'Stored encrypted. Leave empty to keep it.' : '-----BEGIN RSA PRIVATE KEY-----'} className="at-input w-full font-mono text-xs" />
        </label>
        <div className="flex flex-wrap gap-2 md:col-span-2">
          <button type="submit" className="at-btn" disabled={busy}><KeyRound className="w-3.5 h-3.5" aria-hidden /> Save</button>
          <button type="button" className="at-btn-ghost" disabled={busy || !info?.configured} onClick={() => run(piaApi.testGithub, (r) => ({ kind: r.results.every((x) => x.ok) ? 'info' : 'error', text: r.results.map((x) => `${x.org}: ${x.ok ? 'connected' : x.error}`).join(' · ') }))}>
            <PlugZap className="w-3.5 h-3.5" aria-hidden /> Test connection
          </button>
          {info?.keySet && (
            <button type="button" className="at-btn-ghost" disabled={busy} onClick={() => window.confirm('Remove the stored GitHub App key? Scans stop until a new key is saved.') && run(piaApi.clearGithubKey, () => ({ kind: 'info', text: 'Key removed.' }))}>Remove key</button>
          )}
        </div>
      </form>
      {msg && <div className={`at-alert at-alert--${msg.kind}`}>{msg.text}</div>}
    </section>
  );
}
