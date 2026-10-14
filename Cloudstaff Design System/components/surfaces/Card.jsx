/**
 * Surfaces: Card (the core container) and its header/footer parts.
 * Card maps to the design-system `.card` with all its resilience baked in
 * (equal-height rows, content wrapping, top-aligned content). Choose a
 * variant for tinted or solid-brand backgrounds.
 */
export function Card({ variant, interactive = false, compact = false, className = "", children, ...rest }) {
  const cls = [
    "card",
    compact && "card-compact",
    interactive && "card-interactive",
    variant && `card-${variant}`,
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <article className={cls} {...rest}>
      {children}
    </article>
  );
}

export function CardHeader({ title, subtitle, tools, className = "" }) {
  return (
    <header className={`card-header ${className}`.trim()}>
      <div className="card-header-titles">
        {title && <h3 className="card-header-title">{title}</h3>}
        {subtitle && <p className="card-header-subtitle">{subtitle}</p>}
      </div>
      {tools && <div className="card-header-tools">{tools}</div>}
    </header>
  );
}

export function CardFooter({ className = "", children }) {
  return <footer className={`card-footer ${className}`.trim()}>{children}</footer>;
}

/** Pane — the canonical labelled sub-section wrapper for long pages. */
export function Pane({ first = false, className = "", children }) {
  const cls = ["pane", first && "pane-first", className].filter(Boolean).join(" ");
  return <div className={cls}>{children}</div>;
}
