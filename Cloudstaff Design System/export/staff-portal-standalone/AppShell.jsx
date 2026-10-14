(function(){
/* AppShell — sidebar + topbar chrome wrapping the active screen. */
const { IconButton, Avatar } = window.CSDS;

const NAV = [
  { id: "dashboard", icon: "fa-house", label: "Dashboard" },
  { id: "timesheets", icon: "fa-clock", label: "Timesheets" },
  { id: "leave", icon: "fa-calendar", label: "Leave" },
  { id: "documents", icon: "fa-file-lines", label: "Documents" },
  { id: "team", icon: "fa-users", label: "My team" },
];

function AppShell({ active, onNavigate, title, kicker, actions, onOpenAI, children }) {
  return (
    <div className="app-shell">
      <aside className="app-sidebar" aria-label="Primary">
        <header className="app-sidebar-header">
          <a className="brand-lockup" href="#" onClick={(e) => e.preventDefault()}>
            <window.Logo width={138} />
          </a>
        </header>
        <nav className="app-sidebar-nav">
          {NAV.map((n) => (
            <a
              key={n.id}
              href="#"
              className={"sidebar-link" + (active === n.id ? " is-active" : "")}
              aria-current={active === n.id ? "page" : undefined}
              onClick={(e) => { e.preventDefault(); onNavigate(n.id); }}
            >
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
              <button className="button-icon-only" aria-label="Cloudstaff AI assistant" onClick={onOpenAI}>
                <i className="fa-solid fa-robot" aria-hidden="true" />
              </button>
              <button className="button-icon-only" aria-label="Notifications">
                <i className="fa-solid fa-bell" aria-hidden="true" />
              </button>
            </div>
          </div>
        </header>
        {children}
      </main>
    </div>
  );
}

Object.assign(window, { AppShell });

})();
