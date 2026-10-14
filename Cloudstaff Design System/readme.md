# Cloudstaff Design System

A token-driven, partner-rebrandable design system for **Cloudstaff** — a Philippines-based offshore staffing and outsourcing company ("the #1 Workplace"). It powers Cloudstaff's product surfaces: the **staff/HR portal** (timesheets, leave, documents, team management), **hiring/recruiting** views, an embedded **AI assistant** (Cloudstaff AI), and **marketing landers**.

This project is a faithful re-packaging of the upstream **Cloudstaff Design System v2.10.2** bundle for use as a Claude design system: the real tokens, self-hosted fonts, brand SVGs, and component CSS are shipped verbatim, wrapped in thin React component primitives and demonstrated through specimen cards and interactive UI kits.

> **The whole system rebrands from one variable.** Setting `--color-brand-primary` on `:root` cascades through every brand-derived token via `color-mix(in oklch, …)` — buttons, links, focus rings, badges, gradients, and 200+ component states follow.

## Sources

- **Codebase:** `design-system-v2.10.2/` (Cloudstaff Design System v2.10.2) — a pure-CSS, framework-agnostic system. Read-only, mounted locally. Key files consumed: `src/tokens.css`, `src/base.css`, `src/components.css`, `src/utilities.css`, `src/fonts/`, `src/assets/logos/` (78 brand SVGs), `src/icons.svg`, and the docs `AGENTS.md` / `COMPONENTS.md` / `AI-USAGE.md`.
- The upstream system is documented as `@cloudstaff/design-system`, v1.5.0 → v2.10.2, neutral class names (no `csl-`/`cs-`/`cloudstaff-` prefixes), cascade-layered, light + dark mode, en-AU + locale-aware.

No Figma file or live URL was provided. If you have either, share them and they'll be cross-referenced.

---

## CONTENT FUNDAMENTALS

How Cloudstaff writes copy — follow this in every label, heading, and message.

- **Sentence case everywhere.** Buttons, headings, menu items, table headers: "Bulk approve", "This week's submissions", "Sign in" — *not* Title Case. Title Case is reserved for product names (Cloudstaff, Cloudstaff AI) and marketing headlines. ALL CAPS only for acronyms (API, URL, SSO, OTP).
- **Australian / British English in UI strings.** Customise, organise, authorise, colour, centre, licence, behaviour. (Exception: code identifiers and token names stay en-US — `--color-brand-primary`, never `--colour-…`.)
- **Voice: "you" / "your team".** Speaks to the manager about their staff — "Build your global team", "who still has pending timesheets". Warm, supportive, plain. Never corporate-jargon-heavy.
- **Concise and useful.** Messages are short and action-oriented. One clear action per message. Example alert: *"Job Fair — Manila, 24 April. Registration is open until Friday."*
- **Calm by default — notifications are a hierarchy, not a free-for-all.** Awareness → dashboard tile/card. Important but non-blocking → banner/alert. Time-sensitive → push. Needed later → email. Urgent → SMS. Blocking/critical only → modal. "If users feel the system is talking *at* them, reduce notifications." Never use a modal for a routine confirmation (just save; offer undo).
- **No emoji in product chrome.** The brand is professional; emoji are not part of the visual language. Icons are Font Awesome (see Iconography).
- **Numbers, dates, money are locale-aware.** The upstream system routes currency/dates/times/numbers/lists through `window.ds.i18n.*`. In static artifacts, format for en-AU + the relevant timezone (₱ for PHP, "Wk 17 · Apr 21–27", 24-hour or AM/PM as the locale dictates) and use Chivo Mono for figures so columns align.

**Example, in-voice:**
> *Good morning, Grace* · "3 timesheets need your review." · "Approved. Janet Cruz's timesheet was approved." [Undo] · "Need an account? Contact your manager."

---

## VISUAL FOUNDATIONS

- **Colour.** Brand **primary `#007aff`** (a confident blue) and **secondary `#00ab9c`** (teal). A 10-step **feature palette** (teal, gold, pink, indigo, violet, red, orange, cyan, green, slate) for charts, tags, and illustration accents. Semantic: success = teal `#00ab9c`, warning = gold `#ffc426`, danger = red `#f22c46`, info = brand blue, muted = `#99a1b3`. Every tint is generated with `color-mix(in oklch, …)` so steps are perceptually even and rebrands cascade. AA-safe `…-strong` brand variants exist for solid-fill text contexts.
- **Surfaces.** Cool, near-white greys: page `#f3f5f8`, canvas `#ffffff`, secondary `#eef2f7`, tertiary `#e3e8f0`, inverse `#1f2430`. Full first-class **dark mode** via `html[data-theme="dark"]`.
- **Type.** Headings in **Poppins** (300–700; tight tracking, bold display sizes, clamp-fluid h1/h2). Body & UI in **Manrope** (variable 200–800). Data/code/timestamps in **Chivo Mono** (variable). **Pacifico** is a rare decorative script accent only. h1 `clamp(2.5–4.5rem)`, modular scale to `--font-size-2xs` (0.6875rem); UI text rarely below `--font-size-sm` (0.875rem).
- **Spacing.** A `0.125rem`-based step scale (`--space-2xs` → `--space-6xl`). Container components read padding from **three tiers** only — pane (32px), card (24px), tile (16px) — never raw `--space-*`.
- **Corners.** Soft but not pill-everything: inputs/cards use `--radius-lg`/`--radius-xl` (0.75–0.875rem), modals `--radius-2xl`, **buttons, badges and pills are fully `--radius-pill`**, avatars round.
- **Borders.** Hairline `1px` (`--border-width-xs`) in cool greys (`#dce3ee` default, `#c9d2e1` strong, near-invisible subtle). Borders define structure; colour is used sparingly.
- **Shadows / elevation.** Soft, low-opacity, blue-black (`rgba(16,24,40,…)`): `--shadow-xs` (hairline) → `--shadow-xl` → `--shadow-overlay` for modals. Cards default to `--shadow-sm`. Dark mode deepens them.
- **Cards.** White surface, hairline subtle border, `--shadow-sm`, `--radius-xl`, 24px padding, content **top-aligned**, equal-height in grid rows, long content wraps — resilience is baked in (see AGENTS.md "Rows, columns, and card resilience"). No coloured-left-border accent cards.
- **Backgrounds.** Mostly flat surfaces. Five canonical **gradients** (`--gradient-brand` blue→violet, `vibrant`, `warm`, `cool`, `subtle`) for hero panels, CTA bands, and gradient text — used deliberately, not everywhere. No noise, grain, or photographic textures in the system itself.
- **Motion.** Quick and purposeful: durations `--duration-instant` (80ms) → `--duration-slower` (480ms); standard easing `cubic-bezier(0.2,0,0.2,1)`, plus enter/exit/emphasis curves. Respects `prefers-reduced-motion`. No bounces or decorative looping animation.
- **Interaction states.** Hover = subtle brand-tinted background (`--color-brand-primary-hover`) or a step-darker fill; primary button **press** nudges down `translateY(1px)` and darkens. Focus is shown by a brand-coloured ring (`--shadow-focus`) on most controls, and by **border-colour only** on text inputs (no ring). Selection rows use soft → medium → strong brand tints (hover < selected < active).
- **Transparency & blur.** Used for chrome: sticky topbars and the marketing nav use `backdrop-filter: blur` over a translucent surface; overlays use a dark scrim (`rgba(9,13,22,0.72)`). `--blur-sm/md/lg` tokens.
- **Imagery vibe.** Brand-forward and clean — cool blues/teal, white space, the cloud emblem. No fabricated illustrations in this kit; placeholders use brand gradients/surfaces with the real logo/badge as the focal graphic. Swap for real product screenshots or photography when available.
- **Layout.** Mobile-first responsive grids (`.grid-2/3/4/12`, `.auto-grid`), `minmax(0,1fr)` columns to prevent blowout, an `.app-shell` sidebar+main with off-canvas drawer under 768px, fixed sticky topbars, and a bottom tab bar for mobile. `.pane` is the one canonical labelled-sub-section wrapper.

---

## ICONOGRAPHY

- **Primary icon set: Font Awesome 6.5.2 — Free distribution only.** Loaded from cdnjs by each page (`font-awesome/6.5.2/css/all.min.css`). Solid style is the default (`fa-solid`), regular (`fa-regular`) for a few outline glyphs (e.g. `fa-file-lines`, `fa-bell`). Icons inherit `currentColor` and size ~`1rem` (`--icon-size-*` tokens). **Pro-only icons render as empty boxes** — never use `fa-sparkles` (use `fa-robot` for AI or `fa-wand-magic-sparkles`), `fa-bolt-lightning` (`fa-bolt`), `fa-badge-check` (`fa-circle-check`).
  - Common set in use: `fa-house`, `fa-clock`, `fa-calendar`, `fa-users`, `fa-file-lines`, `fa-gear`, `fa-bell`, `fa-magnifying-glass`, `fa-plus`, `fa-filter`, `fa-location-dot`, `fa-star`, `fa-robot`, `fa-circle-check`, `fa-triangle-exclamation`, `fa-paper-plane`, `fa-ellipsis`, `fa-arrow-right-from-bracket`, `fa-cloud-arrow-up`.
- **Brand logo sprite:** `assets/icons.svg` is an inline SVG sprite with two symbols — `#cloudstaff-landscape` (full lockup) and `#cloudstaff-emblem` (cloud-in-ring mark). Referenced via `<svg class="brand-logo"><use href="…/icons.svg#cloudstaff-landscape"/></svg>`; it re-themes through CSS custom properties (`--logo-emblem-fill`, `--logo-cloud-fill`, …) so it follows light/dark and partner rebrands. Use this dynamic form in product chrome.
- **Static brand SVGs:** `assets/logos/*.svg` (a curated subset of the upstream 78) use inline `fill` attributes so they render anywhere (Figma, email, print, slides). Use these via `<img>` for exports and marketing. Variants cover landscape/portrait/emblem × default/mono/reversed/ring × tagline/#1-workplace.
- **No emoji as icons.** No custom icon font beyond Font Awesome. Avoid hand-drawn SVG icons — reach for a Font Awesome glyph.

---

## Index / manifest

Root-level files and what they contain:

| Path | What |
|---|---|
| `styles.css` | **Global entry point** — consumers link this one file. Declares the cascade-layer order, then `@import`s fonts, tokens, base, components, utilities. |
| `readme.md` | This file — the design guide. |
| `SKILL.md` | Agent-Skill manifest for downloadable / Claude Code use. |
| `fonts/` | Self-hosted woff2 (Poppins, Manrope, Chivo Mono, Pacifico) + `fonts.css` `@font-face` rules. |
| `css/tokens.css` | All design tokens (642): foundation values, light/dark theme, semantic aliases, component knobs, gradients. |
| `css/base.css` | Reset (`@layer reset`). |
| `css/components.css` | Every component's CSS (~12k lines, 81 sections, `@layer components`). |
| `css/utilities.css` | Layout primitives (`.stack-*`, `.cluster`, `.grid-*`, `.app-shell`, `.pane`) + atomic utilities. |
| `assets/logos/` | Curated brand SVGs (landscape, portrait, emblem, mono/reversed/ring, tagline, AI sub-brand, #1-Workplace badge). |
| `assets/icons.svg` | Dynamic logo `<use>` sprite. |

**Components** (`components/<group>/` — thin React wrappers over the DS classes; each has `<Name>.jsx` + `.d.ts` + `.prompt.md` + a `@dsCard` HTML). Imported in card/kit HTML via `const { … } = window.CloudstaffDesignSystem_e09b25`:

| Group | Exports |
|---|---|
| `buttons/` | `Button`, `IconButton` |
| `forms/` | `Field`, `Input`, `Textarea`, `Select`, `Switch`, `Checkbox`, `SearchInput` |
| `data-display/` | `Badge`, `Avatar`, `AvatarStack`, `StatTile` |
| `surfaces/` | `Card`, `CardHeader`, `CardFooter`, `Pane` |
| `feedback/` | `Alert`, `EmptyState` |
| `people/` | `PersonCard` |

**Foundation specimen cards** (`guidelines/*.card.html`) populate the Design System tab — groups: Colors (5), Type (4), Spacing (3), Brand (4).

**UI kits** (`ui_kits/<product>/`):

| Kit | What |
|---|---|
| `staff-portal/` | Interactive: login → dashboard → timesheet approvals (review drawer, undo toasts) + Cloudstaff AI panel. React; reads the bundle. |
| `marketing-site/` | Static marketing lander on the `.lander` system (hero, feature tiles, content sections, CTA). Pure CSS. |

---

## Using it

Link the one stylesheet and Font Awesome, then use the classes or the React component wrappers:

```html
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css">
<link rel="stylesheet" href="styles.css">

<button class="button button-primary">Bulk approve</button>
<article class="card"><h3>Title</h3><p>Body.</p></article>
```

For dark mode, set `data-theme="dark"` on `<html>`. To rebrand for a partner, override `--color-brand-primary` (and optionally `--color-brand-secondary`) on `:root` after `styles.css`.

## Caveats

- **`--font-family-accent: "Google Sans Flex"`** has no bundled font file (it's referenced by the upstream system but not shipped). It falls back to Poppins. Upload the font if you want the exact accent face.
- This is a **recreation for design + prototyping**, faithful to v2.10.2. The full upstream package also ships `ui.js` (interactive behaviour for modals/drawers/etc.), i18n helpers, and 78 logo variants — only the curated subset needed here is included.
