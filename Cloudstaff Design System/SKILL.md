---
name: cloudstaff-design
description: Use this skill to generate well-branded interfaces and assets for Cloudstaff, either for production or throwaway prototypes/mocks/etc. Contains essential design guidelines, colors, type, fonts, assets, and UI kit components for prototyping.
user-invocable: true
---

Read the README.md file within this skill, and explore the other available files.

If creating visual artifacts (slides, mocks, throwaway prototypes, etc), copy assets out and create static HTML files for the user to view. If working on production code, you can copy assets and read the rules here to become an expert in designing with this brand.

If the user invokes this skill without any other guidance, ask them what they want to build or design, ask some questions, and act as an expert designer who outputs HTML artifacts _or_ production code, depending on the need.

## Quick orientation

- **Company:** Cloudstaff — Philippines-based offshore staffing / outsourcing ("the #1 Workplace"). Surfaces: staff/HR portal, hiring, Cloudstaff AI, marketing.
- **Link one stylesheet:** `styles.css` (it `@import`s fonts + tokens + base + components + utilities). Also load Font Awesome 6.5.2 **Free** from cdnjs for icons.
- **Brand colour:** primary `#007aff`, secondary `#00ab9c`. Rebrand by overriding `--color-brand-primary` on `:root`. Dark mode: `data-theme="dark"` on `<html>`.
- **Type:** Poppins (headings), Manrope (body/UI), Chivo Mono (data/code), Pacifico (rare accent).
- **Voice:** sentence case, en-AU spelling, "you/your team", calm, one action per message, no emoji in chrome.

## What's here

- `readme.md` — full design guide: CONTENT FUNDAMENTALS, VISUAL FOUNDATIONS, ICONOGRAPHY, and a file index. **Read this first.**
- `css/` — `tokens.css` (642 tokens), `base.css`, `components.css` (81 components), `utilities.css`.
- `fonts/` — self-hosted woff2 + `fonts.css`.
- `assets/logos/` — brand SVGs; `assets/icons.svg` — dynamic logo sprite.
- `components/<group>/` — React wrappers (`Button`, `Field`, `Card`, `Badge`, `StatTile`, `PersonCard`, `Alert`, …) over the CSS classes. Each has a `.prompt.md` with usage.
- `guidelines/*.card.html` — foundation specimens (colour, type, spacing, brand).
- `ui_kits/staff-portal/` — interactive portal recreation (React). `ui_kits/marketing-site/` — static lander.

## Rules that matter

- Use existing classes and tokens; **never hardcode hex, px, or font names** — read `var(--…)`. Class names are neutral (no `csl-`/`cs-`/`cloudstaff-` prefixes).
- Container padding comes from `--component-{pane,card,tile}-padding`, never raw `--space-*`.
- Labelled sub-sections use `.pane` — don't invent wrappers.
- Notifications follow the hierarchy (tile → banner → push → email → SMS → modal); modals are the last resort.
- Font Awesome **Free** only (`fa-sparkles` is Pro → use `fa-robot`).
- For static artifacts (slides/mocks): copy the assets you reference into your output folder and link a relative `styles.css`; don't depend on the compiled `_ds_bundle.js` unless you're mounting the React components.
