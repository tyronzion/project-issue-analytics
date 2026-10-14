/* Cloudstaff Staff Portal — single-file template component.
   Mounted by the DC runtime via <x-import>. `React` is injected by the host
   (same instance as window.React); design-system components are read from the
   compiled bundle on window at render time. Exports { Portal }. */

const DS = () => window.CloudstaffDesignSystem_e09b25;

const TEAM = [
  { initials: "JC", name: "Janet Cruz", role: "Senior Frontend Engineer", status: "Available", location: "Manila, PH", rating: "4.9", rate: 24 },
  { initials: "MR", name: "Marco Reyes", role: "DevOps Lead", status: "Busy", location: "Cebu, PH", rating: "4.8", rate: 32 },
  { initials: "DM", name: "Diane Mendez", role: "QA Analyst", status: "Available", location: "Davao, PH", rating: "4.7", rate: 19 },
  { initials: "PT", name: "Paolo Tan", role: "Backend Engineer", status: "Available", location: "Manila, PH", rating: "4.9", rate: 27 },
];

const TIMESHEETS = [
  { id: 1, initials: "JC", name: "Janet Cruz", period: "Wk 17 · Apr 21–27", hours: "38.5", status: "Pending", variant: "warning" },
  { id: 2, initials: "MR", name: "Marco Reyes", period: "Wk 17 · Apr 21–27", hours: "40.0", status: "Approved", variant: "success" },
  { id: 3, initials: "DM", name: "Diane Mendez", period: "Wk 17 · Apr 21–27", hours: "32.0", status: "Returned", variant: "danger" },
  { id: 4, initials: "PT", name: "Paolo Tan", period: "Wk 17 · Apr 21–27", hours: "40.0", status: "In progress", variant: "info" },
  { id: 5, initials: "AL", name: "Anna Lim", period: "Wk 17 · Apr 21–27", hours: "37.0", status: "Pending", variant: "warning" },
];

function Logo({ reversed = false, width = 150 }) {
  const file = reversed ? "cloudstaff-logo-landscape-reversed.svg" : "cloudstaff-logo-landscape.svg";
  return <img src={`../../assets/logos/${file}`} width={width} alt="Cloudstaff" style={{ display: "block" }} />;
}

/* ── Login ─────────────────────────────────────────────────────────────── */
function LoginScreen({ onSignIn }) {
  const { Field, Input, Button, Checkbox } = DS();
  const [email, setEmail] = React.useState("grace.manalo@cloudstaff.com");
  const [pw, setPw] = React.useState("••••••••••");
  return (
    <div style={{ minHeight: "100vh", display: "grid", gridTemplateColumns: "1fr 1fr" }}>
      <div className="bg-gradient-brand" style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "var(--space-5xl)" }}>
        <Logo reversed width={170} />
        <div className="stack-md" style={{ maxWidth: "30rem" }}>
          <h2 style={{ color: "#fff", margin: 0 }}>Your global team, in one workspace.</h2>
          <p style={{ color: "rgba(255,255,255,0.85)", fontSize: "var(--font-size-lg)" }}>
            Timesheets, leave, documents and payroll for your dedicated offshore staff — managed end to end.
          </p>
        </div>
        <p className="font-mono text-xs" style={{ color: "rgba(255,255,255,0.7)", margin: 0 }}>#1 Workplace · Manila · Cebu · Davao</p>
      </div>
      <div style={{ display: "grid", placeItems: "center", padding: "var(--space-2xl)" }}>
        <form className="stack-xl" style={{ width: "min(24rem, 100%)" }} onSubmit={(e) => { e.preventDefault(); onSignIn(); }}>
          <div className="stack-xs">
            <h3 style={{ margin: 0 }}>Sign in</h3>
            <p className="text-secondary" style={{ margin: 0 }}>Welcome back. Use your Cloudstaff account.</p>
          </div>
          <Field label="Work email" htmlFor="email">
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field label="Password" htmlFor="pw">
            <Input id="pw" type="password" value={pw} onChange={(e) => setPw(e.target.value)} />
          </Field>
          <div className="cluster justify-between">
            <Checkbox label="Keep me signed in" defaultChecked />
            <a href="#" className="text-brand text-sm weight-semibold" onClick={(e) => e.preventDefault()}>Forgot password?</a>
          </div>
          <Button variant="primary" block type="submit">Sign in</Button>
          <p className="text-muted text-sm text-center" style={{ margin: 0 }}>
            Need an account? <a href="#" className="text-brand weight-semibold" onClick={(e) => e.preventDefault()}>Contact your manager</a>
          </p>
        </form>
      </div>
    </div>
  );
}

/* ── Shell ─────────────────────────────────────────────────────────────── */
const NAV = [
  { id: "dashboard", icon: "fa-house", label: "Dashboard" },
  { id: "timesheets", icon: "fa-clock", label: "Timesheets" },
  { id: "leave", icon: "fa-calendar", label: "Leave" },
  { id: "documents", icon: "fa-file-lines", label: "Documents" },
  { id: "team", icon: "fa-users", label: "My team" },
];

function AppShell({ active, onNavigate, title, kicker, actions, onOpenAI, children }) {
  const { Avatar } = DS();
  return (
    <div className="app-shell">
      <aside className="app-sidebar" aria-label="Primary">
        <header className="app-sidebar-header">
          <a className="brand-lockup" href="#" onClick={(e) => e.preventDefault()}><Logo width={138} /></a>
        </header>
        <nav className="app-sidebar-nav">
          {NAV.map((n) => (
            <a key={n.id} href="#" className={"sidebar-link" + (active === n.id ? " is-active" : "")}
              aria-current={active === n.id ? "page" : undefined}
              onClick={(e) => { e.preventDefault(); onNavigate(n.id); }}>
              <i className={`fa-solid ${n.icon} fa-fw`} aria-hidden="true" />
              <span className="app-sidebar-label">{n.label}</span>
            </a>
          ))}
          <div style={{ height: 1, background: "var(--color-divider)", margin: "var(--space-md) var(--space-sm)" }} />
          <p className="font-mono text-xs text-muted" style={{ textTransform: "uppercase", letterSpacing: "0.08em", padding: "0 var(--space-md)", margin: "var(--space-xs) 0" }}>Workspace</p>
          <a href="#" className="sidebar-link" onClick={(e) => e.preventDefault()}>
            <i className="fa-solid fa-gear fa-fw" aria-hidden="true" /><span className="app-sidebar-label">Settings</span>
          </a>
          <a href="#" className="sidebar-link" onClick={(e) => e.preventDefault()}>
            <i className="fa-solid fa-arrow-right-from-bracket fa-fw" aria-hidden="true" /><span className="app-sidebar-label">Sign out</span>
          </a>
        </nav>
        <footer className="app-sidebar-footer">
          <div className="cluster" style={{ gap: "var(--space-sm)", flexWrap: "nowrap" }}>
            <Avatar initials="GM" status="online" />
            <div style={{ minWidth: 0 }}>
              <div className="weight-semibold text-sm truncate">Grace Manalo</div>
              <div className="text-muted text-xs truncate">Operations manager</div>
            </div>
          </div>
        </footer>
      </aside>
      <main className="app-main">
        <header className="topbar" style={{ marginInline: "calc(var(--space-2xl) * -1)", marginTop: "calc(var(--space-2xl) * -1)", marginBottom: "var(--space-2xl)", paddingInline: "var(--space-2xl)" }}>
          <div className="topbar-brand">
            <div className="stack-2xs">
              {kicker && <span className="font-mono text-xs text-muted" style={{ textTransform: "uppercase", letterSpacing: "0.08em" }}>{kicker}</span>}
              <h1 style={{ margin: 0, fontSize: "var(--font-size-2xl)" }}>{title}</h1>
            </div>
          </div>
          <div className="topbar-nav-wrap">
            {actions}
            <span className="topbar-divider" />
            <div className="icon-group">
              <button className="button-icon-only" aria-label="Cloudstaff AI assistant" onClick={onOpenAI}><i className="fa-solid fa-robot" aria-hidden="true" /></button>
              <button className="button-icon-only" aria-label="Notifications"><i className="fa-solid fa-bell" aria-hidden="true" /></button>
            </div>
          </div>
        </header>
        {children}
      </main>
    </div>
  );
}

/* ── Dashboard ─────────────────────────────────────────────────────────── */
function DashboardScreen({ onReview, onSeeAll }) {
  const { StatTile, Card, CardHeader, Badge, Button, Alert, IconButton } = DS();
  return (
    <div className="stack-2xl">
      <Alert variant="info" title="Job Fair — Manila, 24 April.">
        Registration is open until Friday. <a href="#" className="text-brand weight-semibold" onClick={(e) => e.preventDefault()}>Register your team →</a>
      </Alert>
      <section className="grid grid-4">
        <StatTile label="Pending review" value="3" delta="Steady" deltaVariant="info" icon="fa-clock" />
        <StatTile label="Approved this week" value="42" delta="+12%" deltaVariant="success" icon="fa-circle-check" />
        <StatTile label="Hours logged" value="187" delta="+4.2%" deltaVariant="success" icon="fa-chart-column" />
        <StatTile label="On leave today" value="2" icon="fa-umbrella-beach" />
      </section>
      <div className="grid" style={{ gridTemplateColumns: "1.6fr 1fr", gap: "var(--space-xl)", alignItems: "start" }}>
        <Card>
          <CardHeader title="This week's submissions" subtitle="Wk 17 · Apr 21–27"
            tools={<Button variant="tertiary" size="sm" onClick={onSeeAll}>See all</Button>} />
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Employee</th><th>Period</th><th>Hours</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {TIMESHEETS.slice(0, 4).map((t) => (
                  <tr key={t.id}>
                    <td><span className="cluster" style={{ gap: "var(--space-sm)", flexWrap: "nowrap" }}><span className="avatar avatar-sm">{t.initials}</span> {t.name}</span></td>
                    <td className="font-mono text-sm">{t.period}</td>
                    <td className="font-mono text-sm">{t.hours}</td>
                    <td><Badge variant={t.variant}>{t.status}</Badge></td>
                    <td><button className="button button-tertiary button-sm" onClick={() => onReview(t)}>Review</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <Card>
          <CardHeader title="Team availability" tools={<IconButton icon="fa-ellipsis" label="More" />} />
          <div className="stack-sm">
            {TEAM.map((p) => (
              <div key={p.name} className="cluster justify-between" style={{ flexWrap: "nowrap", gap: "var(--space-sm)" }}>
                <span className="cluster" style={{ gap: "var(--space-sm)", flexWrap: "nowrap", minWidth: 0 }}>
                  <span className="avatar avatar-sm">{p.initials}</span>
                  <span style={{ minWidth: 0 }}>
                    <span className="weight-semibold text-sm truncate" style={{ display: "block" }}>{p.name}</span>
                    <span className="text-muted text-xs truncate" style={{ display: "block" }}>{p.role}</span>
                  </span>
                </span>
                <Badge variant={p.status === "Available" ? "success" : "warning"}>{p.status}</Badge>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

/* ── Timesheets + review drawer ────────────────────────────────────────── */
const FILTERS = ["All", "Pending", "Approved", "Returned"];

function ReviewPanel({ sheet, onClose, onApprove, onReturn }) {
  const { Badge, Button, IconButton } = DS();
  if (!sheet) return null;
  const days = [["Mon", "8.0"], ["Tue", "8.0"], ["Wed", "7.5"], ["Thu", "8.0"], ["Fri", "7.0"]];
  return (
    <>
      <div style={{ position: "fixed", inset: 0, background: "var(--color-overlay-scrim)", zIndex: 800 }} onClick={onClose} />
      <aside className="drawer is-floating" style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: "min(26rem, 92vw)", zIndex: 801, background: "var(--color-background-canvas)", boxShadow: "var(--shadow-overlay)", display: "flex", flexDirection: "column", margin: "var(--space-md)", borderRadius: "var(--radius-2xl)" }}>
        <header className="cluster justify-between" style={{ padding: "var(--space-xl)", borderBottom: "1px solid var(--color-divider)", flexWrap: "nowrap" }}>
          <span className="cluster" style={{ gap: "var(--space-md)", flexWrap: "nowrap" }}>
            <span className="avatar avatar-lg">{sheet.initials}</span>
            <span><span className="weight-bold" style={{ display: "block" }}>{sheet.name}</span><span className="text-muted text-sm font-mono">{sheet.period}</span></span>
          </span>
          <IconButton icon="fa-xmark" label="Close" onClick={onClose} />
        </header>
        <div className="stack-lg" style={{ padding: "var(--space-xl)", overflow: "auto", flex: 1 }}>
          <div className="cluster justify-between">
            <span className="text-secondary">Status</span>
            <Badge variant={sheet.variant}>{sheet.status}</Badge>
          </div>
          <div className="table-wrap">
            <table className="table table-compact">
              <thead><tr><th>Day</th><th>Hours</th></tr></thead>
              <tbody>{days.map(([d, h]) => <tr key={d}><td>{d}</td><td className="font-mono">{h}</td></tr>)}
                <tr><td className="weight-bold">Total</td><td className="font-mono weight-bold">{sheet.hours}</td></tr>
              </tbody>
            </table>
          </div>
        </div>
        <footer className="cluster justify-between" style={{ padding: "var(--space-lg) var(--space-xl)", borderTop: "1px solid var(--color-divider)" }}>
          <Button variant="tertiary" onClick={() => onReturn(sheet)}>Return</Button>
          <Button variant="primary" leadingIcon="fa-check" onClick={() => onApprove(sheet)}>Approve</Button>
        </footer>
      </aside>
    </>
  );
}

function TimesheetsScreen({ sheets, onReview }) {
  const { Card, Badge, SearchInput } = DS();
  const [filter, setFilter] = React.useState("All");
  const rows = sheets.filter((t) => filter === "All" || t.status === filter);
  return (
    <Card>
      <div className="cluster justify-between" style={{ marginBottom: "var(--space-md)" }}>
        <div className="segmented" role="radiogroup">
          {FILTERS.map((f) => (
            <label className="segmented-option" key={f}>
              <input type="radio" name="ts-filter" checked={filter === f} onChange={() => setFilter(f)} />
              <span>{f}</span>
            </label>
          ))}
        </div>
        <SearchInput placeholder="Search timesheets…" />
      </div>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>Employee</th><th>Period</th><th>Hours</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.id}>
                <td><span className="cluster" style={{ gap: "var(--space-sm)", flexWrap: "nowrap" }}><span className="avatar avatar-sm">{t.initials}</span> {t.name}</span></td>
                <td className="font-mono text-sm">{t.period}</td>
                <td className="font-mono text-sm">{t.hours}</td>
                <td><Badge variant={t.variant}>{t.status}</Badge></td>
                <td><button className="button button-tertiary button-sm" onClick={() => onReview(t)}>Review</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/* ── AI panel ──────────────────────────────────────────────────────────── */
const AI_SEED = [
  { from: "ai", text: "Hi Grace — I'm Cloudstaff AI. I can summarise timesheets, draft replies, or check leave balances. What do you need?" },
  { from: "user", text: "Who still has pending timesheets this week?" },
  { from: "ai", text: "Two people: Janet Cruz (38.5 hrs) and Anna Lim (37.0 hrs). Diane Mendez's was returned for a missing day. Want me to send a reminder?" },
];

function AIPanel({ open, onClose }) {
  const { IconButton } = DS();
  const [msgs, setMsgs] = React.useState(AI_SEED);
  const [draft, setDraft] = React.useState("");
  if (!open) return null;
  function send() {
    if (!draft.trim()) return;
    setMsgs((m) => [...m, { from: "user", text: draft }, { from: "ai", text: "Done — I've queued a friendly reminder to both. They'll get it as a dashboard tile, not a push." }]);
    setDraft("");
  }
  return (
    <aside style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: "min(24rem, 94vw)", zIndex: 1100, background: "var(--color-background-canvas)", boxShadow: "var(--shadow-overlay)", display: "flex", flexDirection: "column" }}>
      <header className="cluster justify-between" style={{ padding: "var(--space-lg) var(--space-xl)", borderBottom: "1px solid var(--color-divider)", flexWrap: "nowrap" }}>
        <span className="cluster" style={{ gap: "var(--space-sm)", flexWrap: "nowrap" }}>
          <img src="../../assets/logos/cloudstaff-ai-logo-emblem.svg" width="28" height="28" alt="" />
          <strong style={{ fontFamily: "var(--font-family-heading)" }}>Cloudstaff AI</strong>
        </span>
        <IconButton icon="fa-xmark" label="Close assistant" onClick={onClose} />
      </header>
      <div className="stack-md" style={{ padding: "var(--space-xl)", overflow: "auto", flex: 1 }}>
        {msgs.map((m, i) => (
          <div key={i} style={{ display: "flex", justifyContent: m.from === "user" ? "flex-end" : "flex-start" }}>
            <div style={{
              maxWidth: "85%", padding: "var(--space-sm) var(--space-md)", borderRadius: "var(--radius-xl)",
              background: m.from === "user" ? "var(--color-brand-primary-strong)" : "var(--color-background-secondary)",
              color: m.from === "user" ? "var(--color-brand-primary-contrast)" : "var(--color-foreground-primary)",
              fontSize: "var(--font-size-sm)", lineHeight: 1.5,
            }}>{m.text}</div>
          </div>
        ))}
      </div>
      <footer style={{ padding: "var(--space-md) var(--space-lg)", borderTop: "1px solid var(--color-divider)" }}>
        <div className="cluster" style={{ gap: "var(--space-sm)", flexWrap: "nowrap" }}>
          <input className="input" placeholder="Ask Cloudstaff AI…" value={draft}
            onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} />
          <IconButton icon="fa-paper-plane" label="Send" onClick={send} />
        </div>
      </footer>
    </aside>
  );
}

/* ── Root orchestrator ─────────────────────────────────────────────────── */
const TITLES = {
  dashboard: { kicker: "Operations", title: "Good morning, Grace" },
  timesheets: { kicker: "Operations", title: "Timesheet approvals" },
  leave: { kicker: "People", title: "Leave" },
  documents: { kicker: "People", title: "Documents" },
  team: { kicker: "People", title: "My team" },
};

function Toast({ toast, onUndo }) {
  if (!toast) return null;
  return (
    <div className="toast-stack" style={{ position: "fixed", bottom: "var(--space-xl)", left: "50%", transform: "translateX(-50%)", zIndex: 1100 }}>
      <div className={`toast is-${toast.variant}`}>
        <strong>{toast.title}</strong>
        <span>{toast.body}</span>
        {toast.undo && <button className="button button-tertiary button-sm" onClick={onUndo}>Undo</button>}
      </div>
    </div>
  );
}

function Portal() {
  const { Button, EmptyState } = DS();
  const [screen, setScreen] = React.useState("login");
  const [sheets, setSheets] = React.useState(TIMESHEETS);
  const [review, setReview] = React.useState(null);
  const [aiOpen, setAIOpen] = React.useState(false);
  const [toast, setToast] = React.useState(null);

  function flash(t) { setToast(t); window.clearTimeout(flash._t); flash._t = window.setTimeout(() => setToast(null), 3200); }
  function setStatus(sheet, status, variant) {
    setSheets((prev) => prev.map((s) => (s.id === sheet.id ? { ...s, status, variant } : s)));
    setReview(null);
  }
  function approve(s) { setStatus(s, "Approved", "success"); flash({ variant: "success", title: "Approved.", body: `${s.name}'s timesheet was approved.`, undo: true }); }
  function returnSheet(s) { setStatus(s, "Returned", "danger"); flash({ variant: "warning", title: "Returned.", body: `${s.name} will be asked to correct it.` }); }

  if (screen === "login") return <LoginScreen onSignIn={() => setScreen("dashboard")} />;

  const meta = TITLES[screen] || TITLES.dashboard;
  const actions = screen === "timesheets"
    ? <Button variant="primary" size="sm" leadingIcon="fa-check-double">Bulk approve</Button>
    : <Button variant="secondary" size="sm" leadingIcon="fa-filter">Filters</Button>;

  return (
    <>
      <AppShell active={screen} onNavigate={setScreen} kicker={meta.kicker} title={meta.title} actions={actions} onOpenAI={() => setAIOpen(true)}>
        {screen === "dashboard" && (
          <DashboardScreen onReview={(t) => { setScreen("timesheets"); setReview(t); }} onSeeAll={() => setScreen("timesheets")} />
        )}
        {screen === "timesheets" && <TimesheetsScreen sheets={sheets} onReview={setReview} />}
        {["leave", "documents", "team"].includes(screen) && (
          <div className="card">
            <EmptyState
              icon={screen === "leave" ? "fa-calendar" : screen === "documents" ? "fa-file-lines" : "fa-users"}
              title={`${meta.title} is a demo stub`}
              description="This template focuses on the dashboard and timesheet-approval flows. The other areas reuse the same shell, tables, and cards."
              action={<Button variant="secondary" onClick={() => setScreen("dashboard")}>Back to dashboard</Button>}
            />
          </div>
        )}
      </AppShell>
      <ReviewPanel sheet={review} onClose={() => setReview(null)} onApprove={approve} onReturn={returnSheet} />
      <AIPanel open={aiOpen} onClose={() => setAIOpen(false)} />
      <Toast toast={toast} onUndo={() => setToast(null)} />
    </>
  );
}

module.exports = { Portal };
