**Alert / EmptyState** — non-blocking feedback surfaces.

```jsx
<Alert variant="info" title="Heads up.">Your timesheet is due Friday.</Alert>
<Alert variant="success" title="Saved.">All changes were stored.</Alert>
<Alert variant="warning" inline>3 timesheets need your review.</Alert>

<EmptyState icon="fa-inbox" title="Nothing here yet"
  description="Submitted timesheets will appear here."
  action={<Button variant="primary">Submit timesheet</Button>} />
```

Alert is tier 2 of the notification hierarchy (important, non-blocking, contextual). Don't escalate to a modal for awareness — use a tile or banner. EmptyState gets exactly one action and a calm, helpful message in sentence case.
