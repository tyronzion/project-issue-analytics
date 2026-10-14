/**
 * Data-display primitives: Badge (status pill), Avatar (initials/photo with
 * optional status dot), AvatarStack, and StatTile (dashboard metric card).
 * All map directly to design-system classes — no hardcoded colour.
 */
export function Badge({ variant = "neutral", size, className = "", children, ...rest }) {
  const cls = ["badge", `badge-${variant}`, size && `badge-${size}`, className].filter(Boolean).join(" ");
  return (
    <span className={cls} {...rest}>
      {children}
    </span>
  );
}

export function Avatar({ size, src, alt = "", initials, status, neutral = false, className = "", ...rest }) {
  const cls = [
    "avatar",
    size && `avatar-${size}`,
    neutral && "avatar-neutral",
    status && "avatar-with-status",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <span className={cls} {...rest}>
      {src ? <img src={src} alt={alt} /> : initials}
      {status && <span className={`avatar-status-dot is-${status}`} />}
    </span>
  );
}

export function AvatarStack({ children, className = "" }) {
  return <div className={`avatar-stack ${className}`.trim()}>{children}</div>;
}

/**
 * StatTile — a single dashboard metric: label, big value, optional trend badge.
 * Pass `delta` + `deltaVariant` to show a trend badge (e.g. "+12%", success).
 */
export function StatTile({ label, value, unit, delta, deltaVariant = "success", icon, className = "" }) {
  return (
    <article className={`stat-tile ${className}`.trim()}>
      {icon && (
        <span className="stat-tile-icon" aria-hidden="true">
          <i className={`fa-solid ${icon}`} />
        </span>
      )}
      <span className="stat-tile-label">{label}</span>
      <span className="stat-tile-value">
        {value}
        {unit && (
          <span style={{ fontSize: "0.5em", color: "var(--color-foreground-muted)", fontWeight: "var(--font-weight-medium)" }}> {unit}</span>
        )}
      </span>
      {delta && <span className={`badge badge-${deltaVariant}`}>{delta}</span>}
    </article>
  );
}
