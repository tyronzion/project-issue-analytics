**Form fields** — `Field` is the label/hint/error scaffold; wrap `Input`, `Select`, `Textarea`, `Switch`, or `Checkbox` inside it. Use sentence-case labels and keep requirements in a hint, not an always-on error.

```jsx
<Field label="Full name" hint="As it appears on your contract." htmlFor="name" required>
  <Input id="name" type="text" />
</Field>

<Field label="Team" htmlFor="team">
  <Select id="team"><option>Operations</option><option>Engineering</option></Select>
</Field>

<Switch label="Email notifications" defaultChecked />
<SearchInput placeholder="Search timesheets…" />
```

Validation separates *policy* (when errors show) from *display*. Default policy `validate-on-submit` stays quiet until submit — never use `validate-eager` for ordinary forms. Pass `error` to surface a message and flip the invalid state.
