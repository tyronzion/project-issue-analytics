**Card / Pane** — the core container and the labelled-sub-section wrapper.

```jsx
<Card>
  <CardHeader title="This week's submissions" subtitle="Wk 17 · Apr 21–27"
    tools={<IconButton icon="fa-ellipsis" label="More" />} />
  <p>Body content.</p>
  <CardFooter><span className="text-secondary">Updated 2h ago</span></CardFooter>
</Card>

<Card variant="brand-primary"><h3>Solid brand card</h3></Card>
<Pane first><h3>First sub-section</h3>…</Pane>
```

Cards are resilient by default — equal height in a grid row, long content wraps, content top-aligns. Use `interactive` for clickable cards, `compact` for tighter padding, and a `variant` for tinted/solid backgrounds (brand variants flip text to white). For stacking labelled regions in a long page use `Pane`, not ad-hoc wrappers.
