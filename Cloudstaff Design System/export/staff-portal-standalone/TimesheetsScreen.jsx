(function(){
/* Timesheets screen — filterable list + slide-in review panel. */
const { Card, Badge, Button, SearchInput, IconButton } = window.CSDS;

const FILTERS = ["All", "Pending", "Approved", "Returned"];

function ReviewPanel({ sheet, onClose, onApprove, onReturn }) {
  if (!sheet) return null;
  const days = [["Mon", "8.0"], ["Tue", "8.0"], ["Wed", "7.5"], ["Thu", "8.0"], ["Fri", "7.0"]];
  return (
    <>
      <div className="page-overlay-backdrop" style={{ position: "fixed", inset: 0, background: "var(--color-overlay-scrim)", zIndex: 800 }} onClick={onClose} />
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

Object.assign(window, { TimesheetsScreen, ReviewPanel });

})();
