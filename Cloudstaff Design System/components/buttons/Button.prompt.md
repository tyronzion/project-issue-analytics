**Button** — the standard action control; use for any clickable action and pick the variant by emphasis (one `primary` per view).

```jsx
<Button variant="primary" leadingIcon="fa-plus">Bulk approve</Button>
<Button variant="secondary">Save draft</Button>
<Button variant="tertiary">Cancel</Button>
<IconButton icon="fa-gear" label="Settings" />
```

Variants: `primary` (solid brand-blue), `secondary` (bordered neutral), `tertiary` (transparent), `danger`, `success`. Sizes: `sm` / `md` / `lg` (height only — label size is constant). `loading` swaps the label for a spinner; `block` stretches full-width. Labels use sentence case ("Bulk approve", not "Bulk Approve"). Icons are Font Awesome Free class names.
