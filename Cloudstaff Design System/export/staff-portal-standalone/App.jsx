(function(){
/* Staff Portal — root orchestrator. Wires login → dashboard → timesheets,
   the review drawer, the AI panel, and an undo-style toast. */
const { Button } = window.CSDS;

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

function App() {
  const [screen, setScreen] = React.useState("login");
  const [sheets, setSheets] = React.useState(window.TIMESHEETS);
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

  if (screen === "login") {
    return <window.LoginScreen onSignIn={() => setScreen("dashboard")} />;
  }

  const meta = TITLES[screen] || TITLES.dashboard;
  const actions = screen === "timesheets"
    ? <Button variant="primary" size="sm" leadingIcon="fa-check-double">Bulk approve</Button>
    : <Button variant="secondary" size="sm" leadingIcon="fa-filter">Filters</Button>;

  return (
    <>
      <window.AppShell
        active={screen}
        onNavigate={setScreen}
        kicker={meta.kicker}
        title={meta.title}
        actions={actions}
        onOpenAI={() => setAIOpen(true)}
      >
        {screen === "dashboard" && (
          <window.DashboardScreen
            onReview={(t) => { setScreen("timesheets"); setReview(t); }}
            onSeeAll={() => setScreen("timesheets")}
          />
        )}
        {screen === "timesheets" && <window.TimesheetsScreen sheets={sheets} onReview={setReview} />}
        {["leave", "documents", "team"].includes(screen) && (
          <div className="card">
            <window.CSDS.EmptyState
              icon={screen === "leave" ? "fa-calendar" : screen === "documents" ? "fa-file-lines" : "fa-users"}
              title={`${meta.title} is a demo stub`}
              description="This UI kit focuses on the dashboard and timesheet-approval flows. The other areas reuse the same shell, tables, and cards."
              action={<Button variant="secondary" onClick={() => setScreen("dashboard")}>Back to dashboard</Button>}
            />
          </div>
        )}
      </window.AppShell>

      <window.ReviewPanel sheet={review} onClose={() => setReview(null)} onApprove={approve} onReturn={returnSheet} />
      <window.AIPanel open={aiOpen} onClose={() => setAIOpen(false)} />
      <Toast toast={toast} onUndo={() => { setToast(null); }} />
    </>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);

})();
