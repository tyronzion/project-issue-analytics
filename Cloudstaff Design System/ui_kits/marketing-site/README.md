# Marketing site — UI kit

A static recreation of a Cloudstaff marketing landing page, built on the design system's **lander page system** (`.lander` + the five canonical section types).

## Run it

Open `index.html`. It links `../../styles.css` and Font Awesome 6 Free — no JavaScript or bundle required (this surface is pure CSS).

## Structure

A light sticky top nav sits **outside** the `.lander` wrapper (the hero is the page header). Inside `.lander`:

1. `.lander-hero` — eyebrow, title, subtitle, one primary CTA, and a brand-gradient hero graphic.
2. `.lander-tile-row-section` — three `.lander-feature-tile`s previewing the offering (source, timesheets/payroll, compliance).
3. `.lander-section` (image-right) — staff-portal pitch with a checked feature list and a link into the Staff Portal demo.
4. `.lander-section-tinted` (image-left) — "#1 Workplace" proof with headline stats and the tagline badge.
5. `.lander-cta-brand` — closing call to action.

## Conventions followed

- `.lander-content` wraps every band (64rem max, centred).
- Text-first, image-last markup order; `-image-left` only swaps the visual order.
- Alternating tinted / default backgrounds for rhythm; one primary action in the hero.
- All colour comes from tokens — no hardcoded hex.

## Imagery

No fabricated illustrations: hero and section "art" panels use brand gradients/surfaces with real logo + badge SVGs as the focal graphic. Swap these for product screenshots or photography when available.
