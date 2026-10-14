/* Dashboard screen — greeting, stat tiles, this week's timesheets, team. */
const { StatTile, Card, CardHeader, Badge, Button, Alert, PersonCard, IconButton } = window.CSDS;

function DashboardScreen({ onReview, onSeeAll }) {
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
              <thead>
                <tr><th>Employee</th><th>Period</th><th>Hours</th><th>Status</th><th></th></tr>
              </thead>
              <tbody>
                {window.TIMESHEETS.slice(0, 4).map((t) => (
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
          <CardHeader title="Team availability"
            tools={<IconButton icon="fa-ellipsis" label="More" />} />
          <div className="stack-sm">
            {window.TEAM.map((p) => (
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

Object.assign(window, { DashboardScreen });
