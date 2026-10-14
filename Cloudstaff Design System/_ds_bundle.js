/* @ds-bundle: {"format":4,"namespace":"CloudstaffDesignSystem_e09b25","components":[{"name":"Button","sourcePath":"components/buttons/Button.jsx"},{"name":"IconButton","sourcePath":"components/buttons/Button.jsx"},{"name":"Badge","sourcePath":"components/data-display/Badge.jsx"},{"name":"Avatar","sourcePath":"components/data-display/Badge.jsx"},{"name":"AvatarStack","sourcePath":"components/data-display/Badge.jsx"},{"name":"StatTile","sourcePath":"components/data-display/Badge.jsx"},{"name":"Alert","sourcePath":"components/feedback/Alert.jsx"},{"name":"EmptyState","sourcePath":"components/feedback/Alert.jsx"},{"name":"Field","sourcePath":"components/forms/Field.jsx"},{"name":"Input","sourcePath":"components/forms/Field.jsx"},{"name":"Textarea","sourcePath":"components/forms/Field.jsx"},{"name":"Select","sourcePath":"components/forms/Field.jsx"},{"name":"Switch","sourcePath":"components/forms/Field.jsx"},{"name":"Checkbox","sourcePath":"components/forms/Field.jsx"},{"name":"SearchInput","sourcePath":"components/forms/Field.jsx"},{"name":"PersonCard","sourcePath":"components/people/PersonCard.jsx"},{"name":"Card","sourcePath":"components/surfaces/Card.jsx"},{"name":"CardHeader","sourcePath":"components/surfaces/Card.jsx"},{"name":"CardFooter","sourcePath":"components/surfaces/Card.jsx"},{"name":"Pane","sourcePath":"components/surfaces/Card.jsx"}],"sourceHashes":{"components/buttons/Button.jsx":"d3b059bb8b61","components/data-display/Badge.jsx":"cdc254c59a8b","components/feedback/Alert.jsx":"a5662f8ed7a0","components/forms/Field.jsx":"6765225a050a","components/people/PersonCard.jsx":"9e7b884ae99e","components/surfaces/Card.jsx":"cc8670abe45e","ui_kits/staff-portal/AIPanel.jsx":"82872109936d","ui_kits/staff-portal/App.jsx":"a87c37c94d55","ui_kits/staff-portal/AppShell.jsx":"aa8511dfed36","ui_kits/staff-portal/DashboardScreen.jsx":"f67bca089879","ui_kits/staff-portal/LoginScreen.jsx":"858b792dead5","ui_kits/staff-portal/TimesheetsScreen.jsx":"3803560ed2f6","ui_kits/staff-portal/data.jsx":"6df688871732"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {

const __ds_ns = (window.CloudstaffDesignSystem_e09b25 = window.CloudstaffDesignSystem_e09b25 || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// components/buttons/Button.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Button — the Cloudstaff primary action control.
 *
 * Thin wrapper over the design-system `.button` classes. Renders a real
 * <button> and composes variant/size/state classes. Icons are Font Awesome
 * Free <i> elements passed via `leadingIcon` / `trailingIcon` (icon class name).
 */
function Button({
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
  const cls = ["button", `button-${variant}`, size && `button-${size}`, block && "button-block", loading && "is-loading", className].filter(Boolean).join(" ");
  return /*#__PURE__*/React.createElement("button", _extends({
    className: cls,
    disabled: disabled || loading,
    "aria-busy": loading || undefined
  }, rest), leadingIcon && /*#__PURE__*/React.createElement("i", {
    className: `fa-solid ${leadingIcon}`,
    "aria-hidden": "true"
  }), children && /*#__PURE__*/React.createElement("span", null, children), trailingIcon && /*#__PURE__*/React.createElement("i", {
    className: `fa-solid ${trailingIcon}`,
    "aria-hidden": "true"
  }));
}

/**
 * IconButton — a square/circular icon-only action (e.g. toolbar controls).
 * Always pass an accessible `label`.
 */
function IconButton({
  icon,
  label,
  size,
  className = "",
  ...rest
}) {
  const cls = ["button-icon-only", size && `button-${size}`, className].filter(Boolean).join(" ");
  return /*#__PURE__*/React.createElement("button", _extends({
    className: cls,
    "aria-label": label
  }, rest), /*#__PURE__*/React.createElement("i", {
    className: `fa-solid ${icon}`,
    "aria-hidden": "true"
  }));
}
Object.assign(__ds_scope, { Button, IconButton });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/buttons/Button.jsx", error: String((e && e.message) || e) }); }

// components/data-display/Badge.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Data-display primitives: Badge (status pill), Avatar (initials/photo with
 * optional status dot), AvatarStack, and StatTile (dashboard metric card).
 * All map directly to design-system classes — no hardcoded colour.
 */
function Badge({
  variant = "neutral",
  size,
  className = "",
  children,
  ...rest
}) {
  const cls = ["badge", `badge-${variant}`, size && `badge-${size}`, className].filter(Boolean).join(" ");
  return /*#__PURE__*/React.createElement("span", _extends({
    className: cls
  }, rest), children);
}
function Avatar({
  size,
  src,
  alt = "",
  initials,
  status,
  neutral = false,
  className = "",
  ...rest
}) {
  const cls = ["avatar", size && `avatar-${size}`, neutral && "avatar-neutral", status && "avatar-with-status", className].filter(Boolean).join(" ");
  return /*#__PURE__*/React.createElement("span", _extends({
    className: cls
  }, rest), src ? /*#__PURE__*/React.createElement("img", {
    src: src,
    alt: alt
  }) : initials, status && /*#__PURE__*/React.createElement("span", {
    className: `avatar-status-dot is-${status}`
  }));
}
function AvatarStack({
  children,
  className = ""
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: `avatar-stack ${className}`.trim()
  }, children);
}

/**
 * StatTile — a single dashboard metric: label, big value, optional trend badge.
 * Pass `delta` + `deltaVariant` to show a trend badge (e.g. "+12%", success).
 */
function StatTile({
  label,
  value,
  unit,
  delta,
  deltaVariant = "success",
  icon,
  className = ""
}) {
  return /*#__PURE__*/React.createElement("article", {
    className: `stat-tile ${className}`.trim()
  }, icon && /*#__PURE__*/React.createElement("span", {
    className: "stat-tile-icon",
    "aria-hidden": "true"
  }, /*#__PURE__*/React.createElement("i", {
    className: `fa-solid ${icon}`
  })), /*#__PURE__*/React.createElement("span", {
    className: "stat-tile-label"
  }, label), /*#__PURE__*/React.createElement("span", {
    className: "stat-tile-value"
  }, value, unit && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: "0.5em",
      color: "var(--color-foreground-muted)",
      fontWeight: "var(--font-weight-medium)"
    }
  }, " ", unit)), delta && /*#__PURE__*/React.createElement("span", {
    className: `badge badge-${deltaVariant}`
  }, delta));
}
Object.assign(__ds_scope, { Badge, Avatar, AvatarStack, StatTile });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data-display/Badge.jsx", error: String((e && e.message) || e) }); }

// components/feedback/Alert.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Alert / inline banner — a non-blocking contextual notice. Per the system's
 * notification rules, prefer a tile or banner over a modal; reach for a modal
 * only for genuinely blocking events.
 */
const ALERT_ICONS = {
  info: "fa-circle-info",
  success: "fa-circle-check",
  warning: "fa-triangle-exclamation",
  danger: "fa-circle-exclamation"
};
function Alert({
  variant = "info",
  title,
  icon,
  inline = false,
  className = "",
  children,
  ...rest
}) {
  const cls = ["alert", `alert-${variant}`, inline && "banner-inline", className].filter(Boolean).join(" ");
  const iconClass = icon || ALERT_ICONS[variant];
  return /*#__PURE__*/React.createElement("div", _extends({
    className: cls,
    role: variant === "danger" ? "alert" : "status"
  }, rest), iconClass && /*#__PURE__*/React.createElement("i", {
    className: `alert-icon fa-solid ${iconClass}`,
    "aria-hidden": "true"
  }), /*#__PURE__*/React.createElement("div", null, title && /*#__PURE__*/React.createElement("strong", null, title, " "), children && /*#__PURE__*/React.createElement("span", null, children)));
}

/** EmptyState — the canonical "nothing here yet" placeholder with one action. */
function EmptyState({
  icon = "fa-inbox",
  title,
  description,
  action,
  className = ""
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: `empty-state ${className}`.trim()
  }, /*#__PURE__*/React.createElement("span", {
    className: "empty-state-icon",
    "aria-hidden": "true"
  }, /*#__PURE__*/React.createElement("i", {
    className: `fa-solid ${icon}`
  })), title && /*#__PURE__*/React.createElement("h4", null, title), description && /*#__PURE__*/React.createElement("p", null, description), action);
}
Object.assign(__ds_scope, { Alert, EmptyState });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/Alert.jsx", error: String((e && e.message) || e) }); }

// components/forms/Field.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Form field primitives — wrappers over the design-system `.field` family.
 *
 * Field provides the label / hint / error scaffold; Input, Select, Textarea,
 * Switch and Checkbox are the controls. Validation in this system separates
 * POLICY (when errors show) from DISPLAY — the default policy is
 * "validate-on-submit" (quiet until the form is submitted).
 */
function Field({
  label,
  hint,
  error,
  required,
  optional,
  policy = "validate-on-submit",
  htmlFor,
  className = "",
  children
}) {
  const invalid = !!error;
  const cls = ["field", policy, invalid && "is-invalid", className].filter(Boolean).join(" ");
  return /*#__PURE__*/React.createElement("div", {
    className: cls
  }, label && /*#__PURE__*/React.createElement("label", {
    className: "field-label",
    htmlFor: htmlFor
  }, label, required && /*#__PURE__*/React.createElement("span", {
    className: "field-required",
    "aria-hidden": "true"
  }, " *"), optional && /*#__PURE__*/React.createElement("span", {
    className: "field-optional"
  }, " (optional)")), children, error ? /*#__PURE__*/React.createElement("span", {
    className: "field-error"
  }, error) : hint ? /*#__PURE__*/React.createElement("span", {
    className: "field-hint"
  }, hint) : null);
}
function Input({
  size,
  invalid = false,
  className = "",
  ...rest
}) {
  const cls = ["input", size && `input-${size}`, invalid && "is-invalid", className].filter(Boolean).join(" ");
  return /*#__PURE__*/React.createElement("input", _extends({
    className: cls
  }, rest));
}
function Textarea({
  invalid = false,
  className = "",
  ...rest
}) {
  const cls = ["textarea", invalid && "is-invalid", className].filter(Boolean).join(" ");
  return /*#__PURE__*/React.createElement("textarea", _extends({
    className: cls
  }, rest));
}
function Select({
  size,
  invalid = false,
  className = "",
  children,
  ...rest
}) {
  const cls = ["select", size && `select-${size}`, invalid && "is-invalid", className].filter(Boolean).join(" ");
  return /*#__PURE__*/React.createElement("select", _extends({
    className: cls
  }, rest), children);
}
function Switch({
  label,
  className = "",
  ...rest
}) {
  return /*#__PURE__*/React.createElement("label", {
    className: `switch ${className}`.trim()
  }, /*#__PURE__*/React.createElement("input", _extends({
    type: "checkbox"
  }, rest)), /*#__PURE__*/React.createElement("span", {
    className: "switch-track"
  }), label);
}
function Checkbox({
  label,
  className = "",
  ...rest
}) {
  return /*#__PURE__*/React.createElement("label", {
    className: `check ${className}`.trim()
  }, /*#__PURE__*/React.createElement("input", _extends({
    type: "checkbox"
  }, rest)), label);
}
function SearchInput({
  placeholder = "Search",
  className = "",
  ...rest
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: `search-input-wrap ${className}`.trim()
  }, /*#__PURE__*/React.createElement("i", {
    className: "fa-solid fa-magnifying-glass",
    "aria-hidden": "true"
  }), /*#__PURE__*/React.createElement("input", _extends({
    className: "input",
    type: "search",
    placeholder: placeholder
  }, rest)));
}
Object.assign(__ds_scope, { Field, Input, Textarea, Select, Switch, Checkbox, SearchInput });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Field.jsx", error: String((e && e.message) || e) }); }

// components/people/PersonCard.jsx
try { (() => {
/**
 * PersonCard — the recruiting/team domain pattern. Shows a candidate or staff
 * member with avatar, name, role, availability, key meta, hourly rate, and
 * two actions. Composes the design-system `.person-card` (tile-tier density).
 */
function PersonCard({
  person,
  onView,
  onHire,
  className = ""
}) {
  const {
    initials,
    name,
    role,
    status = "Available",
    location,
    rating,
    rate,
    currency = "$"
  } = person;
  const statusVariant = status === "Available" ? "success" : status === "Busy" ? "warning" : "neutral";
  return /*#__PURE__*/React.createElement("div", {
    className: `person-card ${className}`.trim()
  }, /*#__PURE__*/React.createElement("div", {
    className: "person-card-header"
  }, /*#__PURE__*/React.createElement("span", {
    className: "avatar avatar-lg"
  }, initials), /*#__PURE__*/React.createElement("div", {
    className: "person-card-identity"
  }, /*#__PURE__*/React.createElement("h4", {
    className: "person-card-name"
  }, name), /*#__PURE__*/React.createElement("span", {
    className: "person-card-role"
  }, role)), /*#__PURE__*/React.createElement("span", {
    className: `badge badge-${statusVariant}`
  }, status)), /*#__PURE__*/React.createElement("div", {
    className: "person-card-meta"
  }, location && /*#__PURE__*/React.createElement("span", {
    className: "person-card-meta-item"
  }, /*#__PURE__*/React.createElement("i", {
    className: "fa-solid fa-location-dot",
    "aria-hidden": "true"
  }), /*#__PURE__*/React.createElement("span", null, location)), rating && /*#__PURE__*/React.createElement("span", {
    className: "person-card-meta-item"
  }, /*#__PURE__*/React.createElement("i", {
    className: "fa-solid fa-star",
    "aria-hidden": "true"
  }), /*#__PURE__*/React.createElement("span", null, rating))), rate != null && /*#__PURE__*/React.createElement("div", {
    className: "person-card-rate"
  }, /*#__PURE__*/React.createElement("span", {
    className: "person-card-rate-amount"
  }, currency, rate), /*#__PURE__*/React.createElement("span", {
    className: "person-card-rate-period"
  }, "/ hour")), /*#__PURE__*/React.createElement("div", {
    className: "person-card-actions"
  }, /*#__PURE__*/React.createElement("button", {
    className: "button button-secondary button-sm",
    onClick: onView
  }, "View profile"), /*#__PURE__*/React.createElement("button", {
    className: "button button-primary button-sm",
    onClick: onHire,
    disabled: status !== "Available"
  }, "Hire")));
}
Object.assign(__ds_scope, { PersonCard });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/people/PersonCard.jsx", error: String((e && e.message) || e) }); }

// components/surfaces/Card.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Surfaces: Card (the core container) and its header/footer parts.
 * Card maps to the design-system `.card` with all its resilience baked in
 * (equal-height rows, content wrapping, top-aligned content). Choose a
 * variant for tinted or solid-brand backgrounds.
 */
function Card({
  variant,
  interactive = false,
  compact = false,
  className = "",
  children,
  ...rest
}) {
  const cls = ["card", compact && "card-compact", interactive && "card-interactive", variant && `card-${variant}`, className].filter(Boolean).join(" ");
  return /*#__PURE__*/React.createElement("article", _extends({
    className: cls
  }, rest), children);
}
function CardHeader({
  title,
  subtitle,
  tools,
  className = ""
}) {
  return /*#__PURE__*/React.createElement("header", {
    className: `card-header ${className}`.trim()
  }, /*#__PURE__*/React.createElement("div", {
    className: "card-header-titles"
  }, title && /*#__PURE__*/React.createElement("h3", {
    className: "card-header-title"
  }, title), subtitle && /*#__PURE__*/React.createElement("p", {
    className: "card-header-subtitle"
  }, subtitle)), tools && /*#__PURE__*/React.createElement("div", {
    className: "card-header-tools"
  }, tools));
}
function CardFooter({
  className = "",
  children
}) {
  return /*#__PURE__*/React.createElement("footer", {
    className: `card-footer ${className}`.trim()
  }, children);
}

/** Pane — the canonical labelled sub-section wrapper for long pages. */
function Pane({
  first = false,
  className = "",
  children
}) {
  const cls = ["pane", first && "pane-first", className].filter(Boolean).join(" ");
  return /*#__PURE__*/React.createElement("div", {
    className: cls
  }, children);
}
Object.assign(__ds_scope, { Card, CardHeader, CardFooter, Pane });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/surfaces/Card.jsx", error: String((e && e.message) || e) }); }

// ui_kits/staff-portal/AIPanel.jsx
try { (() => {
/* Cloudstaff AI — floating assistant panel. Canned conversation. */
const {
  IconButton,
  Button
} = window.CSDS;
const SEED = [{
  from: "ai",
  text: "Hi Grace — I'm Cloudstaff AI. I can summarise timesheets, draft replies, or check leave balances. What do you need?"
}, {
  from: "user",
  text: "Who still has pending timesheets this week?"
}, {
  from: "ai",
  text: "Two people: Janet Cruz (38.5 hrs) and Anna Lim (37.0 hrs). Diane Mendez's was returned for a missing day. Want me to send a reminder?"
}];
function AIPanel({
  open,
  onClose
}) {
  const [msgs, setMsgs] = React.useState(SEED);
  const [draft, setDraft] = React.useState("");
  if (!open) return null;
  function send() {
    if (!draft.trim()) return;
    setMsgs(m => [...m, {
      from: "user",
      text: draft
    }, {
      from: "ai",
      text: "Done — I've queued a friendly reminder to both. They'll get it as a dashboard tile, not a push."
    }]);
    setDraft("");
  }
  return /*#__PURE__*/React.createElement("aside", {
    style: {
      position: "fixed",
      top: 0,
      right: 0,
      bottom: 0,
      width: "min(24rem, 94vw)",
      zIndex: 1100,
      background: "var(--color-background-canvas)",
      boxShadow: "var(--shadow-overlay)",
      display: "flex",
      flexDirection: "column"
    }
  }, /*#__PURE__*/React.createElement("header", {
    className: "cluster justify-between",
    style: {
      padding: "var(--space-lg) var(--space-xl)",
      borderBottom: "1px solid var(--color-divider)",
      flexWrap: "nowrap"
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "cluster",
    style: {
      gap: "var(--space-sm)",
      flexWrap: "nowrap"
    }
  }, /*#__PURE__*/React.createElement("img", {
    src: "../../assets/logos/cloudstaff-ai-logo-emblem.svg",
    width: "28",
    height: "28",
    alt: ""
  }), /*#__PURE__*/React.createElement("strong", {
    style: {
      fontFamily: "var(--font-family-heading)"
    }
  }, "Cloudstaff AI")), /*#__PURE__*/React.createElement(IconButton, {
    icon: "fa-xmark",
    label: "Close assistant",
    onClick: onClose
  })), /*#__PURE__*/React.createElement("div", {
    className: "stack-md",
    style: {
      padding: "var(--space-xl)",
      overflow: "auto",
      flex: 1
    }
  }, msgs.map((m, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      display: "flex",
      justifyContent: m.from === "user" ? "flex-end" : "flex-start"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: "85%",
      padding: "var(--space-sm) var(--space-md)",
      borderRadius: "var(--radius-xl)",
      background: m.from === "user" ? "var(--color-brand-primary-strong)" : "var(--color-background-secondary)",
      color: m.from === "user" ? "var(--color-brand-primary-contrast)" : "var(--color-foreground-primary)",
      fontSize: "var(--font-size-sm)",
      lineHeight: 1.5
    }
  }, m.text)))), /*#__PURE__*/React.createElement("footer", {
    style: {
      padding: "var(--space-md) var(--space-lg)",
      borderTop: "1px solid var(--color-divider)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "cluster",
    style: {
      gap: "var(--space-sm)",
      flexWrap: "nowrap"
    }
  }, /*#__PURE__*/React.createElement("input", {
    className: "input",
    placeholder: "Ask Cloudstaff AI\u2026",
    value: draft,
    onChange: e => setDraft(e.target.value),
    onKeyDown: e => e.key === "Enter" && send()
  }), /*#__PURE__*/React.createElement(IconButton, {
    icon: "fa-paper-plane",
    label: "Send",
    onClick: send
  }))));
}
Object.assign(window, {
  AIPanel
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/staff-portal/AIPanel.jsx", error: String((e && e.message) || e) }); }

// ui_kits/staff-portal/App.jsx
try { (() => {
/* Staff Portal — root orchestrator. Wires login → dashboard → timesheets,
   the review drawer, the AI panel, and an undo-style toast. */
const {
  Button
} = window.CSDS;
const TITLES = {
  dashboard: {
    kicker: "Operations",
    title: "Good morning, Grace"
  },
  timesheets: {
    kicker: "Operations",
    title: "Timesheet approvals"
  },
  leave: {
    kicker: "People",
    title: "Leave"
  },
  documents: {
    kicker: "People",
    title: "Documents"
  },
  team: {
    kicker: "People",
    title: "My team"
  }
};
function Toast({
  toast,
  onUndo
}) {
  if (!toast) return null;
  return /*#__PURE__*/React.createElement("div", {
    className: "toast-stack",
    style: {
      position: "fixed",
      bottom: "var(--space-xl)",
      left: "50%",
      transform: "translateX(-50%)",
      zIndex: 1100
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: `toast is-${toast.variant}`
  }, /*#__PURE__*/React.createElement("strong", null, toast.title), /*#__PURE__*/React.createElement("span", null, toast.body), toast.undo && /*#__PURE__*/React.createElement("button", {
    className: "button button-tertiary button-sm",
    onClick: onUndo
  }, "Undo")));
}
function App() {
  const [screen, setScreen] = React.useState("login");
  const [sheets, setSheets] = React.useState(window.TIMESHEETS);
  const [review, setReview] = React.useState(null);
  const [aiOpen, setAIOpen] = React.useState(false);
  const [toast, setToast] = React.useState(null);
  function flash(t) {
    setToast(t);
    window.clearTimeout(flash._t);
    flash._t = window.setTimeout(() => setToast(null), 3200);
  }
  function setStatus(sheet, status, variant) {
    setSheets(prev => prev.map(s => s.id === sheet.id ? {
      ...s,
      status,
      variant
    } : s));
    setReview(null);
  }
  function approve(s) {
    setStatus(s, "Approved", "success");
    flash({
      variant: "success",
      title: "Approved.",
      body: `${s.name}'s timesheet was approved.`,
      undo: true
    });
  }
  function returnSheet(s) {
    setStatus(s, "Returned", "danger");
    flash({
      variant: "warning",
      title: "Returned.",
      body: `${s.name} will be asked to correct it.`
    });
  }
  if (screen === "login") {
    return /*#__PURE__*/React.createElement(window.LoginScreen, {
      onSignIn: () => setScreen("dashboard")
    });
  }
  const meta = TITLES[screen] || TITLES.dashboard;
  const actions = screen === "timesheets" ? /*#__PURE__*/React.createElement(Button, {
    variant: "primary",
    size: "sm",
    leadingIcon: "fa-check-double"
  }, "Bulk approve") : /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    size: "sm",
    leadingIcon: "fa-filter"
  }, "Filters");
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(window.AppShell, {
    active: screen,
    onNavigate: setScreen,
    kicker: meta.kicker,
    title: meta.title,
    actions: actions,
    onOpenAI: () => setAIOpen(true)
  }, screen === "dashboard" && /*#__PURE__*/React.createElement(window.DashboardScreen, {
    onReview: t => {
      setScreen("timesheets");
      setReview(t);
    },
    onSeeAll: () => setScreen("timesheets")
  }), screen === "timesheets" && /*#__PURE__*/React.createElement(window.TimesheetsScreen, {
    sheets: sheets,
    onReview: setReview
  }), ["leave", "documents", "team"].includes(screen) && /*#__PURE__*/React.createElement("div", {
    className: "card"
  }, /*#__PURE__*/React.createElement(window.CSDS.EmptyState, {
    icon: screen === "leave" ? "fa-calendar" : screen === "documents" ? "fa-file-lines" : "fa-users",
    title: `${meta.title} is a demo stub`,
    description: "This UI kit focuses on the dashboard and timesheet-approval flows. The other areas reuse the same shell, tables, and cards.",
    action: /*#__PURE__*/React.createElement(Button, {
      variant: "secondary",
      onClick: () => setScreen("dashboard")
    }, "Back to dashboard")
  }))), /*#__PURE__*/React.createElement(window.ReviewPanel, {
    sheet: review,
    onClose: () => setReview(null),
    onApprove: approve,
    onReturn: returnSheet
  }), /*#__PURE__*/React.createElement(window.AIPanel, {
    open: aiOpen,
    onClose: () => setAIOpen(false)
  }), /*#__PURE__*/React.createElement(Toast, {
    toast: toast,
    onUndo: () => {
      setToast(null);
    }
  }));
}
ReactDOM.createRoot(document.getElementById("root")).render(/*#__PURE__*/React.createElement(App, null));
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/staff-portal/App.jsx", error: String((e && e.message) || e) }); }

// ui_kits/staff-portal/AppShell.jsx
try { (() => {
/* AppShell — sidebar + topbar chrome wrapping the active screen. */
const {
  IconButton,
  Avatar
} = window.CSDS;
const NAV = [{
  id: "dashboard",
  icon: "fa-house",
  label: "Dashboard"
}, {
  id: "timesheets",
  icon: "fa-clock",
  label: "Timesheets"
}, {
  id: "leave",
  icon: "fa-calendar",
  label: "Leave"
}, {
  id: "documents",
  icon: "fa-file-lines",
  label: "Documents"
}, {
  id: "team",
  icon: "fa-users",
  label: "My team"
}];
function AppShell({
  active,
  onNavigate,
  title,
  kicker,
  actions,
  onOpenAI,
  children
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "app-shell"
  }, /*#__PURE__*/React.createElement("aside", {
    className: "app-sidebar",
    "aria-label": "Primary"
  }, /*#__PURE__*/React.createElement("header", {
    className: "app-sidebar-header"
  }, /*#__PURE__*/React.createElement("a", {
    className: "brand-lockup",
    href: "#",
    onClick: e => e.preventDefault()
  }, /*#__PURE__*/React.createElement(window.Logo, {
    width: 138
  }))), /*#__PURE__*/React.createElement("nav", {
    className: "app-sidebar-nav"
  }, NAV.map(n => /*#__PURE__*/React.createElement("a", {
    key: n.id,
    href: "#",
    className: "sidebar-link" + (active === n.id ? " is-active" : ""),
    "aria-current": active === n.id ? "page" : undefined,
    onClick: e => {
      e.preventDefault();
      onNavigate(n.id);
    }
  }, /*#__PURE__*/React.createElement("i", {
    className: `fa-solid ${n.icon} fa-fw`,
    "aria-hidden": "true"
  }), /*#__PURE__*/React.createElement("span", {
    className: "app-sidebar-label"
  }, n.label))), /*#__PURE__*/React.createElement("div", {
    style: {
      height: 1,
      background: "var(--color-divider)",
      margin: "var(--space-md) var(--space-sm)"
    }
  }), /*#__PURE__*/React.createElement("p", {
    className: "font-mono text-xs text-muted",
    style: {
      textTransform: "uppercase",
      letterSpacing: "0.08em",
      padding: "0 var(--space-md)",
      margin: "var(--space-xs) 0"
    }
  }, "Workspace"), /*#__PURE__*/React.createElement("a", {
    href: "#",
    className: "sidebar-link",
    onClick: e => e.preventDefault()
  }, /*#__PURE__*/React.createElement("i", {
    className: "fa-solid fa-gear fa-fw",
    "aria-hidden": "true"
  }), /*#__PURE__*/React.createElement("span", {
    className: "app-sidebar-label"
  }, "Settings")), /*#__PURE__*/React.createElement("a", {
    href: "#",
    className: "sidebar-link",
    onClick: e => e.preventDefault()
  }, /*#__PURE__*/React.createElement("i", {
    className: "fa-solid fa-arrow-right-from-bracket fa-fw",
    "aria-hidden": "true"
  }), /*#__PURE__*/React.createElement("span", {
    className: "app-sidebar-label"
  }, "Sign out"))), /*#__PURE__*/React.createElement("footer", {
    className: "app-sidebar-footer"
  }, /*#__PURE__*/React.createElement("div", {
    className: "cluster",
    style: {
      gap: "var(--space-sm)",
      flexWrap: "nowrap"
    }
  }, /*#__PURE__*/React.createElement(Avatar, {
    initials: "GM",
    status: "online"
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "weight-semibold text-sm truncate"
  }, "Grace Manalo"), /*#__PURE__*/React.createElement("div", {
    className: "text-muted text-xs truncate"
  }, "Operations manager"))))), /*#__PURE__*/React.createElement("main", {
    className: "app-main"
  }, /*#__PURE__*/React.createElement("header", {
    className: "topbar",
    style: {
      marginInline: "calc(var(--space-2xl) * -1)",
      marginTop: "calc(var(--space-2xl) * -1)",
      marginBottom: "var(--space-2xl)",
      paddingInline: "var(--space-2xl)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "topbar-brand"
  }, /*#__PURE__*/React.createElement("div", {
    className: "stack-2xs"
  }, kicker && /*#__PURE__*/React.createElement("span", {
    className: "font-mono text-xs text-muted",
    style: {
      textTransform: "uppercase",
      letterSpacing: "0.08em"
    }
  }, kicker), /*#__PURE__*/React.createElement("h1", {
    style: {
      margin: 0,
      fontSize: "var(--font-size-2xl)"
    }
  }, title))), /*#__PURE__*/React.createElement("div", {
    className: "topbar-nav-wrap"
  }, actions, /*#__PURE__*/React.createElement("span", {
    className: "topbar-divider"
  }), /*#__PURE__*/React.createElement("div", {
    className: "icon-group"
  }, /*#__PURE__*/React.createElement("button", {
    className: "button-icon-only",
    "aria-label": "Cloudstaff AI assistant",
    onClick: onOpenAI
  }, /*#__PURE__*/React.createElement("i", {
    className: "fa-solid fa-robot",
    "aria-hidden": "true"
  })), /*#__PURE__*/React.createElement("button", {
    className: "button-icon-only",
    "aria-label": "Notifications"
  }, /*#__PURE__*/React.createElement("i", {
    className: "fa-solid fa-bell",
    "aria-hidden": "true"
  }))))), children));
}
Object.assign(window, {
  AppShell
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/staff-portal/AppShell.jsx", error: String((e && e.message) || e) }); }

// ui_kits/staff-portal/DashboardScreen.jsx
try { (() => {
/* Dashboard screen — greeting, stat tiles, this week's timesheets, team. */
const {
  StatTile,
  Card,
  CardHeader,
  Badge,
  Button,
  Alert,
  PersonCard,
  IconButton
} = window.CSDS;
function DashboardScreen({
  onReview,
  onSeeAll
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "stack-2xl"
  }, /*#__PURE__*/React.createElement(Alert, {
    variant: "info",
    title: "Job Fair \u2014 Manila, 24 April."
  }, "Registration is open until Friday. ", /*#__PURE__*/React.createElement("a", {
    href: "#",
    className: "text-brand weight-semibold",
    onClick: e => e.preventDefault()
  }, "Register your team \u2192")), /*#__PURE__*/React.createElement("section", {
    className: "grid grid-4"
  }, /*#__PURE__*/React.createElement(StatTile, {
    label: "Pending review",
    value: "3",
    delta: "Steady",
    deltaVariant: "info",
    icon: "fa-clock"
  }), /*#__PURE__*/React.createElement(StatTile, {
    label: "Approved this week",
    value: "42",
    delta: "+12%",
    deltaVariant: "success",
    icon: "fa-circle-check"
  }), /*#__PURE__*/React.createElement(StatTile, {
    label: "Hours logged",
    value: "187",
    delta: "+4.2%",
    deltaVariant: "success",
    icon: "fa-chart-column"
  }), /*#__PURE__*/React.createElement(StatTile, {
    label: "On leave today",
    value: "2",
    icon: "fa-umbrella-beach"
  })), /*#__PURE__*/React.createElement("div", {
    className: "grid",
    style: {
      gridTemplateColumns: "1.6fr 1fr",
      gap: "var(--space-xl)",
      alignItems: "start"
    }
  }, /*#__PURE__*/React.createElement(Card, null, /*#__PURE__*/React.createElement(CardHeader, {
    title: "This week's submissions",
    subtitle: "Wk 17 \xB7 Apr 21\u201327",
    tools: /*#__PURE__*/React.createElement(Button, {
      variant: "tertiary",
      size: "sm",
      onClick: onSeeAll
    }, "See all")
  }), /*#__PURE__*/React.createElement("div", {
    className: "table-wrap"
  }, /*#__PURE__*/React.createElement("table", {
    className: "table"
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", null, "Employee"), /*#__PURE__*/React.createElement("th", null, "Period"), /*#__PURE__*/React.createElement("th", null, "Hours"), /*#__PURE__*/React.createElement("th", null, "Status"), /*#__PURE__*/React.createElement("th", null))), /*#__PURE__*/React.createElement("tbody", null, window.TIMESHEETS.slice(0, 4).map(t => /*#__PURE__*/React.createElement("tr", {
    key: t.id
  }, /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("span", {
    className: "cluster",
    style: {
      gap: "var(--space-sm)",
      flexWrap: "nowrap"
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "avatar avatar-sm"
  }, t.initials), " ", t.name)), /*#__PURE__*/React.createElement("td", {
    className: "font-mono text-sm"
  }, t.period), /*#__PURE__*/React.createElement("td", {
    className: "font-mono text-sm"
  }, t.hours), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement(Badge, {
    variant: t.variant
  }, t.status)), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("button", {
    className: "button button-tertiary button-sm",
    onClick: () => onReview(t)
  }, "Review")))))))), /*#__PURE__*/React.createElement(Card, null, /*#__PURE__*/React.createElement(CardHeader, {
    title: "Team availability",
    tools: /*#__PURE__*/React.createElement(IconButton, {
      icon: "fa-ellipsis",
      label: "More"
    })
  }), /*#__PURE__*/React.createElement("div", {
    className: "stack-sm"
  }, window.TEAM.map(p => /*#__PURE__*/React.createElement("div", {
    key: p.name,
    className: "cluster justify-between",
    style: {
      flexWrap: "nowrap",
      gap: "var(--space-sm)"
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "cluster",
    style: {
      gap: "var(--space-sm)",
      flexWrap: "nowrap",
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "avatar avatar-sm"
  }, p.initials), /*#__PURE__*/React.createElement("span", {
    style: {
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "weight-semibold text-sm truncate",
    style: {
      display: "block"
    }
  }, p.name), /*#__PURE__*/React.createElement("span", {
    className: "text-muted text-xs truncate",
    style: {
      display: "block"
    }
  }, p.role))), /*#__PURE__*/React.createElement(Badge, {
    variant: p.status === "Available" ? "success" : "warning"
  }, p.status)))))));
}
Object.assign(window, {
  DashboardScreen
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/staff-portal/DashboardScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/staff-portal/LoginScreen.jsx
try { (() => {
/* Login screen — split layout: brand panel + sign-in form. */
const {
  Field,
  Input,
  Button,
  Checkbox
} = window.CSDS;
function LoginScreen({
  onSignIn
}) {
  const [email, setEmail] = React.useState("grace.manalo@cloudstaff.com");
  const [pw, setPw] = React.useState("••••••••••");
  return /*#__PURE__*/React.createElement("div", {
    style: {
      minHeight: "100vh",
      display: "grid",
      gridTemplateColumns: "1fr 1fr"
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "bg-gradient-brand",
    style: {
      display: "flex",
      flexDirection: "column",
      justifyContent: "space-between",
      padding: "var(--space-5xl)"
    }
  }, /*#__PURE__*/React.createElement(window.Logo, {
    reversed: true,
    width: 170
  }), /*#__PURE__*/React.createElement("div", {
    className: "stack-md",
    style: {
      maxWidth: "30rem"
    }
  }, /*#__PURE__*/React.createElement("h2", {
    style: {
      color: "#fff",
      margin: 0
    }
  }, "Your global team, in one workspace."), /*#__PURE__*/React.createElement("p", {
    style: {
      color: "rgba(255,255,255,0.85)",
      fontSize: "var(--font-size-lg)"
    }
  }, "Timesheets, leave, documents and payroll for your dedicated offshore staff \u2014 managed end to end.")), /*#__PURE__*/React.createElement("p", {
    className: "font-mono text-xs",
    style: {
      color: "rgba(255,255,255,0.7)",
      margin: 0
    }
  }, "#1 Workplace \xB7 Manila \xB7 Cebu \xB7 Davao")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      placeItems: "center",
      padding: "var(--space-2xl)"
    }
  }, /*#__PURE__*/React.createElement("form", {
    className: "stack-xl",
    style: {
      width: "min(24rem, 100%)"
    },
    onSubmit: e => {
      e.preventDefault();
      onSignIn();
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "stack-xs"
  }, /*#__PURE__*/React.createElement("h3", {
    style: {
      margin: 0
    }
  }, "Sign in"), /*#__PURE__*/React.createElement("p", {
    className: "text-secondary",
    style: {
      margin: 0
    }
  }, "Welcome back. Use your Cloudstaff account.")), /*#__PURE__*/React.createElement(Field, {
    label: "Work email",
    htmlFor: "email"
  }, /*#__PURE__*/React.createElement(Input, {
    id: "email",
    type: "email",
    value: email,
    onChange: e => setEmail(e.target.value)
  })), /*#__PURE__*/React.createElement(Field, {
    label: "Password",
    htmlFor: "pw"
  }, /*#__PURE__*/React.createElement(Input, {
    id: "pw",
    type: "password",
    value: pw,
    onChange: e => setPw(e.target.value)
  })), /*#__PURE__*/React.createElement("div", {
    className: "cluster justify-between"
  }, /*#__PURE__*/React.createElement(Checkbox, {
    label: "Keep me signed in",
    defaultChecked: true
  }), /*#__PURE__*/React.createElement("a", {
    href: "#",
    className: "text-brand text-sm weight-semibold",
    onClick: e => e.preventDefault()
  }, "Forgot password?")), /*#__PURE__*/React.createElement(Button, {
    variant: "primary",
    block: true,
    type: "submit"
  }, "Sign in"), /*#__PURE__*/React.createElement("p", {
    className: "text-muted text-sm text-center",
    style: {
      margin: 0
    }
  }, "Need an account? ", /*#__PURE__*/React.createElement("a", {
    href: "#",
    className: "text-brand weight-semibold",
    onClick: e => e.preventDefault()
  }, "Contact your manager")))));
}
Object.assign(window, {
  LoginScreen
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/staff-portal/LoginScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/staff-portal/TimesheetsScreen.jsx
try { (() => {
/* Timesheets screen — filterable list + slide-in review panel. */
const {
  Card,
  Badge,
  Button,
  SearchInput,
  IconButton
} = window.CSDS;
const FILTERS = ["All", "Pending", "Approved", "Returned"];
function ReviewPanel({
  sheet,
  onClose,
  onApprove,
  onReturn
}) {
  if (!sheet) return null;
  const days = [["Mon", "8.0"], ["Tue", "8.0"], ["Wed", "7.5"], ["Thu", "8.0"], ["Fri", "7.0"]];
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    className: "page-overlay-backdrop",
    style: {
      position: "fixed",
      inset: 0,
      background: "var(--color-overlay-scrim)",
      zIndex: 800
    },
    onClick: onClose
  }), /*#__PURE__*/React.createElement("aside", {
    className: "drawer is-floating",
    style: {
      position: "fixed",
      top: 0,
      right: 0,
      bottom: 0,
      width: "min(26rem, 92vw)",
      zIndex: 801,
      background: "var(--color-background-canvas)",
      boxShadow: "var(--shadow-overlay)",
      display: "flex",
      flexDirection: "column",
      margin: "var(--space-md)",
      borderRadius: "var(--radius-2xl)"
    }
  }, /*#__PURE__*/React.createElement("header", {
    className: "cluster justify-between",
    style: {
      padding: "var(--space-xl)",
      borderBottom: "1px solid var(--color-divider)",
      flexWrap: "nowrap"
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "cluster",
    style: {
      gap: "var(--space-md)",
      flexWrap: "nowrap"
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "avatar avatar-lg"
  }, sheet.initials), /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement("span", {
    className: "weight-bold",
    style: {
      display: "block"
    }
  }, sheet.name), /*#__PURE__*/React.createElement("span", {
    className: "text-muted text-sm font-mono"
  }, sheet.period))), /*#__PURE__*/React.createElement(IconButton, {
    icon: "fa-xmark",
    label: "Close",
    onClick: onClose
  })), /*#__PURE__*/React.createElement("div", {
    className: "stack-lg",
    style: {
      padding: "var(--space-xl)",
      overflow: "auto",
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "cluster justify-between"
  }, /*#__PURE__*/React.createElement("span", {
    className: "text-secondary"
  }, "Status"), /*#__PURE__*/React.createElement(Badge, {
    variant: sheet.variant
  }, sheet.status)), /*#__PURE__*/React.createElement("div", {
    className: "table-wrap"
  }, /*#__PURE__*/React.createElement("table", {
    className: "table table-compact"
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", null, "Day"), /*#__PURE__*/React.createElement("th", null, "Hours"))), /*#__PURE__*/React.createElement("tbody", null, days.map(([d, h]) => /*#__PURE__*/React.createElement("tr", {
    key: d
  }, /*#__PURE__*/React.createElement("td", null, d), /*#__PURE__*/React.createElement("td", {
    className: "font-mono"
  }, h))), /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", {
    className: "weight-bold"
  }, "Total"), /*#__PURE__*/React.createElement("td", {
    className: "font-mono weight-bold"
  }, sheet.hours)))))), /*#__PURE__*/React.createElement("footer", {
    className: "cluster justify-between",
    style: {
      padding: "var(--space-lg) var(--space-xl)",
      borderTop: "1px solid var(--color-divider)"
    }
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "tertiary",
    onClick: () => onReturn(sheet)
  }, "Return"), /*#__PURE__*/React.createElement(Button, {
    variant: "primary",
    leadingIcon: "fa-check",
    onClick: () => onApprove(sheet)
  }, "Approve"))));
}
function TimesheetsScreen({
  sheets,
  onReview
}) {
  const [filter, setFilter] = React.useState("All");
  const rows = sheets.filter(t => filter === "All" || t.status === filter);
  return /*#__PURE__*/React.createElement(Card, null, /*#__PURE__*/React.createElement("div", {
    className: "cluster justify-between",
    style: {
      marginBottom: "var(--space-md)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "segmented",
    role: "radiogroup"
  }, FILTERS.map(f => /*#__PURE__*/React.createElement("label", {
    className: "segmented-option",
    key: f
  }, /*#__PURE__*/React.createElement("input", {
    type: "radio",
    name: "ts-filter",
    checked: filter === f,
    onChange: () => setFilter(f)
  }), /*#__PURE__*/React.createElement("span", null, f)))), /*#__PURE__*/React.createElement(SearchInput, {
    placeholder: "Search timesheets\u2026"
  })), /*#__PURE__*/React.createElement("div", {
    className: "table-wrap"
  }, /*#__PURE__*/React.createElement("table", {
    className: "table"
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", null, "Employee"), /*#__PURE__*/React.createElement("th", null, "Period"), /*#__PURE__*/React.createElement("th", null, "Hours"), /*#__PURE__*/React.createElement("th", null, "Status"), /*#__PURE__*/React.createElement("th", null))), /*#__PURE__*/React.createElement("tbody", null, rows.map(t => /*#__PURE__*/React.createElement("tr", {
    key: t.id
  }, /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("span", {
    className: "cluster",
    style: {
      gap: "var(--space-sm)",
      flexWrap: "nowrap"
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "avatar avatar-sm"
  }, t.initials), " ", t.name)), /*#__PURE__*/React.createElement("td", {
    className: "font-mono text-sm"
  }, t.period), /*#__PURE__*/React.createElement("td", {
    className: "font-mono text-sm"
  }, t.hours), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement(Badge, {
    variant: t.variant
  }, t.status)), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("button", {
    className: "button button-tertiary button-sm",
    onClick: () => onReview(t)
  }, "Review"))))))));
}
Object.assign(window, {
  TimesheetsScreen,
  ReviewPanel
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/staff-portal/TimesheetsScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/staff-portal/data.jsx
try { (() => {
/* Staff Portal — shared mock data + tiny helpers. Registers globals. */
const CSDS = window.CloudstaffDesignSystem_e09b25;
const TEAM = [{
  initials: "JC",
  name: "Janet Cruz",
  role: "Senior Frontend Engineer",
  status: "Available",
  location: "Manila, PH",
  rating: "4.9",
  rate: 24
}, {
  initials: "MR",
  name: "Marco Reyes",
  role: "DevOps Lead",
  status: "Busy",
  location: "Cebu, PH",
  rating: "4.8",
  rate: 32
}, {
  initials: "DM",
  name: "Diane Mendez",
  role: "QA Analyst",
  status: "Available",
  location: "Davao, PH",
  rating: "4.7",
  rate: 19
}, {
  initials: "PT",
  name: "Paolo Tan",
  role: "Backend Engineer",
  status: "Available",
  location: "Manila, PH",
  rating: "4.9",
  rate: 27
}];
const TIMESHEETS = [{
  id: 1,
  initials: "JC",
  name: "Janet Cruz",
  period: "Wk 17 · Apr 21–27",
  hours: "38.5",
  status: "Pending",
  variant: "warning"
}, {
  id: 2,
  initials: "MR",
  name: "Marco Reyes",
  period: "Wk 17 · Apr 21–27",
  hours: "40.0",
  status: "Approved",
  variant: "success"
}, {
  id: 3,
  initials: "DM",
  name: "Diane Mendez",
  period: "Wk 17 · Apr 21–27",
  hours: "32.0",
  status: "Returned",
  variant: "danger"
}, {
  id: 4,
  initials: "PT",
  name: "Paolo Tan",
  period: "Wk 17 · Apr 21–27",
  hours: "40.0",
  status: "In progress",
  variant: "info"
}, {
  id: 5,
  initials: "AL",
  name: "Anna Lim",
  period: "Wk 17 · Apr 21–27",
  hours: "37.0",
  status: "Pending",
  variant: "warning"
}];
function Logo({
  reversed = false,
  width = 150
}) {
  const file = reversed ? "cloudstaff-logo-landscape-reversed.svg" : "cloudstaff-logo-landscape.svg";
  return /*#__PURE__*/React.createElement("img", {
    src: `../../assets/logos/${file}`,
    width: width,
    alt: "Cloudstaff",
    style: {
      display: "block"
    }
  });
}
Object.assign(window, {
  CSDS,
  TEAM,
  TIMESHEETS,
  Logo
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/staff-portal/data.jsx", error: String((e && e.message) || e) }); }

__ds_ns.Button = __ds_scope.Button;

__ds_ns.IconButton = __ds_scope.IconButton;

__ds_ns.Badge = __ds_scope.Badge;

__ds_ns.Avatar = __ds_scope.Avatar;

__ds_ns.AvatarStack = __ds_scope.AvatarStack;

__ds_ns.StatTile = __ds_scope.StatTile;

__ds_ns.Alert = __ds_scope.Alert;

__ds_ns.EmptyState = __ds_scope.EmptyState;

__ds_ns.Field = __ds_scope.Field;

__ds_ns.Input = __ds_scope.Input;

__ds_ns.Textarea = __ds_scope.Textarea;

__ds_ns.Select = __ds_scope.Select;

__ds_ns.Switch = __ds_scope.Switch;

__ds_ns.Checkbox = __ds_scope.Checkbox;

__ds_ns.SearchInput = __ds_scope.SearchInput;

__ds_ns.PersonCard = __ds_scope.PersonCard;

__ds_ns.Card = __ds_scope.Card;

__ds_ns.CardHeader = __ds_scope.CardHeader;

__ds_ns.CardFooter = __ds_scope.CardFooter;

__ds_ns.Pane = __ds_scope.Pane;

})();
