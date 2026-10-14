(function(){
/* Cloudstaff AI — floating assistant panel. Canned conversation. */
const { IconButton, Button } = window.CSDS;

const SEED = [
  { from: "ai", text: "Hi Grace — I'm Cloudstaff AI. I can summarise timesheets, draft replies, or check leave balances. What do you need?" },
  { from: "user", text: "Who still has pending timesheets this week?" },
  { from: "ai", text: "Two people: Janet Cruz (38.5 hrs) and Anna Lim (37.0 hrs). Diane Mendez's was returned for a missing day. Want me to send a reminder?" },
];

function AIPanel({ open, onClose }) {
  const [msgs, setMsgs] = React.useState(SEED);
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
          <img src={window.__resources.aiEmblem} width="28" height="28" alt="" />
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

Object.assign(window, { AIPanel });

})();
