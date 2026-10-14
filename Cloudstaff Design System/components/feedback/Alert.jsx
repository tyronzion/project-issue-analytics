/**
 * Alert / inline banner — a non-blocking contextual notice. Per the system's
 * notification rules, prefer a tile or banner over a modal; reach for a modal
 * only for genuinely blocking events.
 */
const ALERT_ICONS = {
  info: "fa-circle-info",
  success: "fa-circle-check",
  warning: "fa-triangle-exclamation",
  danger: "fa-circle-exclamation",
};

export function Alert({ variant = "info", title, icon, inline = false, className = "", children, ...rest }) {
  const cls = ["alert", `alert-${variant}`, inline && "banner-inline", className].filter(Boolean).join(" ");
  const iconClass = icon || ALERT_ICONS[variant];
  return (
    <div className={cls} role={variant === "danger" ? "alert" : "status"} {...rest}>
      {iconClass && <i className={`alert-icon fa-solid ${iconClass}`} aria-hidden="true" />}
      <div>
        {title && <strong>{title} </strong>}
        {children && <span>{children}</span>}
      </div>
    </div>
  );
}

/** EmptyState — the canonical "nothing here yet" placeholder with one action. */
export function EmptyState({ icon = "fa-inbox", title, description, action, className = "" }) {
  return (
    <div className={`empty-state ${className}`.trim()}>
      <span className="empty-state-icon" aria-hidden="true">
        <i className={`fa-solid ${icon}`} />
      </span>
      {title && <h4>{title}</h4>}
      {description && <p>{description}</p>}
      {action}
    </div>
  );
}
