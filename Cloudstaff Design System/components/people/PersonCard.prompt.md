**PersonCard** — the recruiting / team domain pattern. Use in candidate grids, team directories, and hiring shortlists.

```jsx
<PersonCard
  person={{ initials: "JC", name: "Janet Cruz", role: "Senior Frontend Engineer",
    status: "Available", location: "Manila, PH", rating: "4.9", rate: 24 }}
  onView={() => {}}
  onHire={() => {}}
/>
```

Shows avatar, name, role, an availability badge (Available → green, Busy → amber), location + rating meta, hourly rate, and two actions. "Hire" is disabled unless the person is `Available`. Densely packed (tile tier) so several fit in a grid row.
