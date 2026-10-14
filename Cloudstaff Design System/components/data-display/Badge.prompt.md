**Badge / Avatar / StatTile** — status, identity, and metric display primitives.

```jsx
<Badge variant="success">Approved</Badge>
<Badge variant="warning">Pending</Badge>

<Avatar initials="JC" />
<Avatar size="lg" initials="MR" status="busy" />

<StatTile label="Approved this week" value="42" delta="+12%" deltaVariant="success" />
<StatTile label="Avg approval time" value="4.2" unit="hrs" delta="−18%" />
```

Badge variants follow the semantic feedback palette (`success`/`warning`/`danger`/`info`/`brand`/`neutral`). Avatars show initials or a photo (`src`) with an optional presence dot (`online`/`busy`/`away`/`offline`). StatTile is the canonical dashboard metric — keep labels short and put the trend in the `delta` badge.
