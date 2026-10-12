// Shared by /DPSA and /FullAssessment. Classic script: pages define `data`, `ui`, `load()` and `render()`.

// ?embed=1: shown inside another app (e.g. Security Issues Analytics), which provides the brand bar and navigation.
const EMBED = new URLSearchParams(location.search).has('embed');
if (EMBED) document.documentElement.classList.add('embed');

document.body.insertAdjacentHTML('afterbegin', `<svg width="0" height="0" style="position:absolute" aria-hidden="true">
  <symbol id="i-cal" viewBox="0 0 24 24"><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></symbol>
  <symbol id="i-refresh" viewBox="0 0 24 24"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></symbol>
  <symbol id="i-layers" viewBox="0 0 24 24"><path d="M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65"/><path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"/></symbol>
  <symbol id="i-alert" viewBox="0 0 24 24"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4M12 17h.01"/></symbol>
  <symbol id="i-clock" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></symbol>
  <symbol id="i-chart" viewBox="0 0 24 24"><path d="M3 3v18h18"/><path d="M7 16v-5M12 16V8M17 16v-9"/></symbol>
  <symbol id="i-users" viewBox="0 0 24 24"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></symbol>
  <symbol id="i-app" viewBox="0 0 24 24"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M2 8h20M6 6h.01M9 6h.01"/></symbol>
  <symbol id="i-list" viewBox="0 0 24 24"><path d="M3 6h18M7 12h10M10 18h4"/></symbol>
  <symbol id="i-shield" viewBox="0 0 24 24"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/></symbol>
  <symbol id="i-back" viewBox="0 0 24 24"><path d="m12 19-7-7 7-7M19 12H5"/></symbol>
  <symbol id="i-user" viewBox="0 0 24 24"><circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 0 0-16 0"/></symbol>
  <symbol id="i-funnel" viewBox="0 0 24 24"><path d="M10 20a1 1 0 0 0 .553.895l2 1A1 1 0 0 0 14 21v-7a2 2 0 0 1 .517-1.341L21.74 4.67A1 1 0 0 0 21 3H3a1 1 0 0 0-.742 1.67l7.225 7.989A2 2 0 0 1 10 14z"/></symbol>
  <symbol id="i-search" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></symbol>
  <symbol id="i-info" viewBox="0 0 24 24"><rect width="16" height="20" x="4" y="2" rx="2"/><path d="M8 6h8M8 10h8M8 14h5"/></symbol>
  <symbol id="i-gear" viewBox="0 0 24 24"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></symbol>
  <symbol id="i-repeat" viewBox="0 0 24 24"><path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/></symbol>
  <symbol id="i-flag" viewBox="0 0 24 24"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><path d="M4 22v-7"/></symbol>
  <symbol id="i-calcheck" viewBox="0 0 24 24"><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M16 2v4M8 2v4M3 10h18M9 16l2 2 4-4"/></symbol>
  <symbol id="i-scan" viewBox="0 0 24 24"><path d="m8 11 2 2 4-4"/><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></symbol>
</svg>`);

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------- formatting ----------
const offsetMs = () => (data?.business.offsetHours ?? 8) * 3600e3;
const fmtDate = (t) => { if (!t) return '—'; const d = new Date(t + offsetMs()); return d.toLocaleDateString('en-AU', { day: '2-digit', month: 'short', timeZone: 'UTC' }) + ' ' + d.toISOString().slice(11, 16); };
const fmtDay = (t) => t == null ? '—' : new Date(t + offsetMs()).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
const fmtDays = (d) => d == null ? '—' : d < 1 ? `${(d * data.business.hoursPerDay).toFixed(1)} h` : `${d.toFixed(1)} d`;
const pct = (n, d) => d ? Math.round((n / d) * 1000) / 10 : null;
const avg = (a) => a.length ? a.reduce((s, x) => s + x, 0) / a.length : null;
const median = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const status = (kind, label) => {
  const icon = { good: '✓', warning: '!', serious: '!', critical: '×', none: '–' }[kind];
  return `<span class="status st-${kind}"><span class="dot" aria-hidden="true">${icon}</span>${esc(label)}</span>`;
};
// ---------- date range (calendar days in business-timezone local time) ----------
const DAY = 86400e3;
const localMidnight = (t) => { const d = new Date(t + offsetMs()); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - offsetMs(); };
const dayToMs = (ymd) => ymd ? Date.parse(ymd + 'T00:00:00Z') - offsetMs() : null;
const msToDay = (t) => new Date(t + offsetMs()).toISOString().slice(0, 10);

// Returns [from, to): `to` is exclusive; null means unbounded.
function presetRange(p, now = Date.now()) {
  const today = localMidnight(now), end = today + DAY;
  const d = new Date(now + offsetMs()), y = d.getUTCFullYear(), m = d.getUTCMonth();
  switch (p) {
    case 'all': return [null, null];
    case 'today': return [today, end];
    case 'week': return [today - ((d.getUTCDay() + 6) % 7) * DAY, end]; // Monday start
    case 'mtd': return [Date.UTC(y, m, 1) - offsetMs(), end];
    case 'year': return [Date.UTC(y, 0, 1) - offsetMs(), end];
    case '7': case '30': case '90': return [today - (Number(p) - 1) * DAY, end];
  }
  return null;
}
function currentRange() {
  if (ui.period !== 'custom') return presetRange(ui.period);
  let from = dayToMs(ui.from), to = ui.to ? dayToMs(ui.to) + DAY : null;
  if (from != null && to != null && to <= from) [from, to] = [to - DAY, from + DAY]; // dates entered backwards
  return [from, to];
}
// Keep the From/To boxes showing whatever range is active.
function syncRangeInputs() {
  if (ui.period === 'custom') return;
  const [from, to] = currentRange();
  $('#dateFrom').value = from == null ? '' : msToDay(from);
  $('#dateTo').value = to == null ? '' : msToDay(to - DAY);
}
const rangeLabel = () => {
  const [from, to] = currentRange();
  if (from == null && to == null) return 'all time';
  const f = (t) => new Date(t + offsetMs()).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  return `${from == null ? 'start' : f(from)} – ${to == null ? 'today' : f(to - DAY)}`;
};

function filterByRange(tickets) {
  const [from, to] = currentRange();
  return tickets.filter((t) => (from == null || t.createdAt >= from) && (to == null || t.createdAt < to));
}

const press = (seg, b) => seg.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));

// ---------- charts ----------
function niceTicks(max) {
  const step = [1, 2, 5, 10, 20, 25, 50, 100, 200, 500].find((s) => max / s <= 5) || Math.ceil(max / 5);
  const out = []; for (let v = 0; v <= max + step - 1 && out.length < 8; v += step) out.push(v);
  if (out[out.length - 1] < max) out.push(out[out.length - 1] + step);
  return out;
}
function roundTop(x, y, w, h, r) { return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`; }
function hover(el, html) {
  const tip = el.querySelector('.tip');
  el.querySelectorAll('.hit').forEach((h) => {
    h.addEventListener('mouseenter', () => { tip.innerHTML = html(+h.dataset.i); tip.style.display = 'block'; h.setAttribute('fill', 'var(--grid)'); h.setAttribute('fill-opacity', '0.35'); h.parentNode.insertBefore(h, h.parentNode.firstChild.nextSibling); });
    h.addEventListener('mousemove', (e) => { const b = el.getBoundingClientRect(); const x = e.clientX - b.left, yy = e.clientY - b.top; tip.style.left = Math.min(x + 12, b.width - tip.offsetWidth - 4) + 'px'; tip.style.top = Math.max(0, yy - tip.offsetHeight - 8) + 'px'; });
    h.addEventListener('mouseleave', () => { tip.style.display = 'none'; h.setAttribute('fill', 'transparent'); });
  });
}

// ---------- wiring ----------
// Date range: presets fill the From/To boxes; editing a box (or "Custom") switches to a custom range.
function wireDateRange(storageKey, onChange) {
  const save = () => { try { localStorage.setItem(storageKey, JSON.stringify({ period: ui.period, from: ui.from, to: ui.to })); } catch {} };
  const setPeriod = (p) => { ui.period = p; press($('#period'), $(`#period button[data-v="${p}"]`)); save(); onChange(); };
  $('#period').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.v === 'custom') { ui.from = $('#dateFrom').value; ui.to = $('#dateTo').value; $('#dateFrom').focus(); }
    setPeriod(b.dataset.v);
  });
  for (const id of ['dateFrom', 'dateTo']) $('#' + id).addEventListener('change', () => { ui.from = $('#dateFrom').value; ui.to = $('#dateTo').value; setPeriod('custom'); });
  try { Object.assign(ui, JSON.parse(localStorage.getItem(storageKey)) || {}); } catch {}
  if (!$(`#period button[data-v="${ui.period}"]`)) ui.period = '90';
  if (ui.period === 'custom') { $('#dateFrom').value = ui.from; $('#dateTo').value = ui.to; }
  press($('#period'), $(`#period button[data-v="${ui.period}"]`));
}

// Refresh with live progress. The server reports { running, percent, step, ok, error, … } at api/progress;
// this polls it quickly while a refresh runs (manual or the automatic one) and slowly otherwise.
function wireRefresh(reload) {
  const btn = $('#refreshBtn'), label = btn.innerHTML;
  btn.insertAdjacentHTML('beforebegin', `
    <div id="refreshProgress" class="rprog" hidden>
      <div class="rprog-bar" role="progressbar" aria-label="Refresh progress" aria-valuemin="0" aria-valuemax="100"><i></i></div>
      <span class="rprog-text" aria-live="polite"></span>
    </div>`);
  const box = $('#refreshProgress'), bar = box.querySelector('.rprog-bar'), text = box.querySelector('.rprog-text');
  const dur = (ms) => { const s = Math.max(1, Math.round(ms / 1000)); return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`; };
  let wasRunning = false, timer = null, hideTimer = null;

  function show(p) {
    clearTimeout(hideTimer);
    box.hidden = false;
    box.classList.toggle('done', !p.running && p.ok === true);
    box.classList.toggle('failed', !p.running && p.ok === false);
    bar.firstElementChild.style.width = `${p.percent}%`;
    bar.setAttribute('aria-valuenow', p.percent);
    if (p.running) {
      text.textContent = `${p.percent}% · ${p.step}${p.trigger === 'auto' ? ' (auto refresh)' : ''}`;
      text.title = text.textContent;
      btn.disabled = true;
      btn.textContent = `Refreshing ${p.percent}%`;
    } else {
      btn.disabled = false;
      btn.innerHTML = label;
      if (p.ok) {
        text.textContent = `✓ Refreshed · ${(p.tickets ?? 0).toLocaleString()} tickets in ${dur(p.finishedAt - p.startedAt)}`;
        hideTimer = setTimeout(() => { box.hidden = true; }, 8000);
      } else {
        text.textContent = `✕ Refresh failed: ${p.error}`;
      }
    }
  }

  async function poll() {
    clearTimeout(timer);
    let p = null;
    try { p = await (await fetch('api/progress')).json(); } catch {}
    if (p) {
      if (p.running) show(p);
      else if (wasRunning) { show(p); await reload(); }
      wasRunning = p.running;
    }
    timer = setTimeout(poll, p?.running ? 700 : 4000);
  }

  btn.addEventListener('click', async () => {
    btn.disabled = true; btn.textContent = 'Refreshing 0%';
    try { show(await (await fetch('api/refresh', { method: 'POST' })).json()); } catch {}
    wasRunning = true;
    poll();
  });
  poll();
}

// Highlights the sidebar link of the section in view.
function wireNavSpy() {
  const navLinks = [...document.querySelectorAll('.sidebar a[href^="#"]')];
  const spy = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) navLinks.forEach((a) => a.classList.toggle('active', a.getAttribute('href') === '#' + e.target.id));
  }, { rootMargin: '-120px 0px -60% 0px' });
  navLinks.forEach((a) => { const el = document.querySelector(a.getAttribute('href')); if (el) spy.observe(el); });
}

// Common header bits: last update, back link to Security Issues Analytics.
function renderChrome() {
  const fetched = data.fetchedAt ? new Date(data.fetchedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'never';
  $('#updated').innerHTML = `${data.demo ? '<span class="pill">Demo data</span> ' : ''}${tokenPill(data.token)}Updated ${fetched} · every ${data.refreshMinutes} min`;
  if (data.links?.analytics) $('#analyticsLink').href = data.links.analytics;
  renderBanner();
}

function renderBanner() {
  const el = $('#banner');
  if (data.demo) { el.innerHTML = `<div class="banner demo"><b>Demo mode.</b> These are generated tickets so you can preview the page. Run <code>npm start</code> and set your token in Settings to see real UberTicket data.</div>`; return; }
  if (!data.error) { el.innerHTML = ''; return; }
  const auth = data.errorKind === 'auth';
  el.innerHTML = `<div class="banner"><b>${auth ? 'UberTicket token missing or expired.' : 'Could not load tickets.'}</b> <span class="muted">${esc(data.error)}</span>
    ${auth ? `<div style="margin-top:10px"><button class="btn" type="button" data-open-settings>Open Settings to paste a new token</button></div>` : ''}</div>`;
}

// ---------- settings: UberTicket token ----------
const fmtWhen = (t) => new Date(t).toLocaleString('en-AU', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const fmtLeft = (ms) => { const m = Math.round(Math.abs(ms) / 60000); return m < 60 ? `${m} min` : m < 2880 ? `${Math.round(m / 60)} h` : `${Math.round(m / 1440)} days`; };

// Small top-bar warning when the token is close to expiring (or already has).
function tokenPill(tk) {
  if (!tk?.set || !tk.expiresAt) return '';
  const left = tk.expiresAt - Date.now();
  if (left <= 0) return `<span class="pill pill-bad" data-open-settings>Token expired</span> `;
  if (left < 24 * 3600e3) return `<span class="pill pill-warn" data-open-settings>Token expires in ${fmtLeft(left)}</span> `;
  return '';
}

document.body.insertAdjacentHTML('beforeend', `
<dialog id="settingsDialog" class="settings" aria-labelledby="settingsTitle">
  <form method="dialog" class="settings-head"><h2 id="settingsTitle">Settings</h2><button class="icon-btn" aria-label="Close">✕</button></form>
  <section>
    <h3>UberTicket token</h3>
    <div id="tokenState" class="token-state">Loading…</div>
    <form id="tokenForm" autocomplete="off">
      <div id="pwRow" hidden>
        <div id="userRow" hidden><label for="settingsUser">Username</label>
        <input id="settingsUser" type="text" autocomplete="username" placeholder="Security Issues Analytics username"></div>
        <label for="settingsPw" id="pwLabel">Settings password</label>
        <input id="settingsPw" type="password" placeholder="MONITOR_SETTINGS_PASSWORD on the server">
        <p class="settings-note" id="pwNote"></p>
      </div>
      <label for="tokenInput">New bearer token</label>
      <input id="tokenInput" name="token" type="password" placeholder="Paste the Authorization header value" spellcheck="false" required>
      <div class="settings-actions">
        <button class="btn" type="submit" id="tokenSave"><svg class="i"><use href="#i-shield"/></svg>Save &amp; test</button>
        <button class="btn btn-ghost" type="button" id="tokenToggle">Show</button>
        <button class="btn btn-ghost" type="button" id="tokenClear">Remove saved token</button>
      </div>
      <p class="settings-note">Stored <b>encrypted</b> (AES-256-GCM) in <code>data/token.enc</code> on this computer; the token is never shown again or sent anywhere except UberTicket.</p>
    </form>
    <details class="howto"><summary>How do I get the token?</summary>
      <ol><li>Open <a href="https://uberticket.cloudstaff.com" target="_blank" rel="noopener">UberTicket</a> in Chrome and sign in.</li>
      <li>Press F12 (or ⌥⌘I) → <b>Network</b>, reload, and filter by <code>api-ubertickets</code>.</li>
      <li>Click any request → <b>Headers</b> → copy the <code>Authorization</code> value (with or without "Bearer ").</li></ol>
    </details>
  </section>
</dialog>`);

// Login for Settings, sent as headers (URI-encoded so any characters are allowed).
const authHeaders = () => ({ 'X-Monitor-User': encodeURIComponent($('#settingsUser').value), 'X-Monitor-Password': encodeURIComponent($('#settingsPw').value) });

async function renderTokenState(st) {
  st = st ?? await (await fetch('api/token')).json();
  let html;
  if (!st.set) html = status('critical', 'No token saved');
  else {
    const left = st.expiresAt ? st.expiresAt - Date.now() : null;
    const exp = st.expiresAt == null ? '<span class="muted">expiry unknown</span>'
      : left <= 0 ? `<span class="neg">expired ${fmtLeft(left)} ago (${fmtWhen(st.expiresAt)})</span>`
      : `expires in ${fmtLeft(left)} (${fmtWhen(st.expiresAt)})`;
    const works = st.ok ? status('good', `Working · last loaded ${fmtWhen(st.fetchedAt)}`)
      : st.errorKind === 'auth' ? status('critical', 'Rejected by UberTicket: paste a new one')
      : st.error ? status('warning', st.error) : status('none', 'Not tested yet');
    html = `<div>${works}</div><div class="muted">Saved ${st.savedAt ? fmtWhen(st.savedAt) : ''} · ${exp}</div>`;
  }
  if (st.error && st.needsPassword) html = status('critical', st.error) + html;
  $('#tokenState').innerHTML = html;
  $('#tokenClear').hidden = !st.set;
  // Changing the token from another machine needs the server's settings password.
  if (st.loginRequired) {
    $('#pwRow').hidden = false;
    $('#userRow').hidden = false;
    $('#pwLabel').textContent = 'Password';
    $('#settingsPw').placeholder = 'Security Issues Analytics password';
    $('#pwNote').textContent = 'Use the same login as Security Issues Analytics.';
  } else if (st.passwordRequired !== undefined) {
    $('#pwRow').hidden = !st.passwordRequired;
    $('#pwNote').textContent = st.passwordConfigured ? 'Required because you are not on the server itself.' : 'Not set on the server yet: add MONITOR_SETTINGS_PASSWORD to its .env.local, or change the token on the server itself.';
  }
}

function openSettings() {
  $('#tokenInput').value = '';
  $('#tokenInput').type = 'password'; $('#tokenToggle').textContent = 'Show';
  $('#settingsDialog').showModal();
  renderTokenState();
  $('#tokenInput').focus();
}

document.addEventListener('click', (e) => { if (e.target.closest('[data-open-settings]')) openSettings(); });
$('#settingsDialog').addEventListener('click', (e) => { if (e.target === e.currentTarget) e.currentTarget.close(); }); // backdrop
$('#tokenToggle').addEventListener('click', () => { const i = $('#tokenInput'); i.type = i.type === 'password' ? 'text' : 'password'; $('#tokenToggle').textContent = i.type === 'password' ? 'Show' : 'Hide'; });
$('#tokenForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = $('#tokenSave'), label = btn.innerHTML;
  btn.disabled = true; btn.textContent = 'Saving & testing…';
  try {
    const r = await fetch('api/token', { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: JSON.stringify({ token: $('#tokenInput').value }) });
    const st = await r.json();
    if (r.ok) $('#tokenInput').value = '';
    await renderTokenState(r.ok ? st : { ...(await (await fetch('api/token')).json()), error: st.error, needsPassword: true });
    await load();
  } finally { btn.disabled = false; btn.innerHTML = label; }
});
$('#tokenClear').addEventListener('click', async () => {
  if (!confirm('Remove the saved UberTicket token from this computer?')) return;
  const r = await fetch('api/token', { method: 'DELETE', headers: { ...authHeaders() } });
  const st = await r.json();
  await renderTokenState(r.ok ? st : { ...(await (await fetch('api/token')).json()), error: st.error, needsPassword: true });
  await load();
});

// Settings button next to Refresh on every page.
$('#refreshBtn').insertAdjacentHTML('beforebegin', `<button class="btn btn-ghost" type="button" data-open-settings aria-label="Settings"><svg class="i"><use href="#i-gear"/></svg>Settings</button>`);
