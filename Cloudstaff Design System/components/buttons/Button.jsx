/**
 * Button — the Cloudstaff primary action control.
 *
 * Thin wrapper over the design-system `.button` classes. Renders a real
 * <button> and composes variant/size/state classes. Icons are Font Awesome
 * Free <i> elements passed via `leadingIcon` / `trailingIcon` (icon class name).
 */
export function Button({
  variant = "primary",
  size,
  block = false,
  loading = false,
  disabled = false,
  leadingIcon,
  trailingIcon,
  className = "",
  children,
  ...rest
}) {
  const cls = [
    "button",
    `button-${variant}`,
    size && `button-${size}`,
    block && "button-block",
    loading && "is-loading",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button className={cls} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {leadingIcon && <i className={`fa-solid ${leadingIcon}`} aria-hidden="true" />}
      {children && <span>{children}</span>}
      {trailingIcon && <i className={`fa-solid ${trailingIcon}`} aria-hidden="true" />}
    </button>
  );
}

/**
 * IconButton — a square/circular icon-only action (e.g. toolbar controls).
 * Always pass an accessible `label`.
 */
export function IconButton({ icon, label, size, className = "", ...rest }) {
  const cls = ["button-icon-only", size && `button-${size}`, className].filter(Boolean).join(" ");
  return (
    <button className={cls} aria-label={label} {...rest}>
      <i className={`fa-solid ${icon}`} aria-hidden="true" />
    </button>
  );
}
