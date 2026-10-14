/**
 * Form field primitives — wrappers over the design-system `.field` family.
 *
 * Field provides the label / hint / error scaffold; Input, Select, Textarea,
 * Switch and Checkbox are the controls. Validation in this system separates
 * POLICY (when errors show) from DISPLAY — the default policy is
 * "validate-on-submit" (quiet until the form is submitted).
 */
export function Field({ label, hint, error, required, optional, policy = "validate-on-submit", htmlFor, className = "", children }) {
  const invalid = !!error;
  const cls = ["field", policy, invalid && "is-invalid", className].filter(Boolean).join(" ");
  return (
    <div className={cls}>
      {label && (
        <label className="field-label" htmlFor={htmlFor}>
          {label}
          {required && <span className="field-required" aria-hidden="true"> *</span>}
          {optional && <span className="field-optional"> (optional)</span>}
        </label>
      )}
      {children}
      {error ? <span className="field-error">{error}</span> : hint ? <span className="field-hint">{hint}</span> : null}
    </div>
  );
}

export function Input({ size, invalid = false, className = "", ...rest }) {
  const cls = ["input", size && `input-${size}`, invalid && "is-invalid", className].filter(Boolean).join(" ");
  return <input className={cls} {...rest} />;
}

export function Textarea({ invalid = false, className = "", ...rest }) {
  const cls = ["textarea", invalid && "is-invalid", className].filter(Boolean).join(" ");
  return <textarea className={cls} {...rest} />;
}

export function Select({ size, invalid = false, className = "", children, ...rest }) {
  const cls = ["select", size && `select-${size}`, invalid && "is-invalid", className].filter(Boolean).join(" ");
  return (
    <select className={cls} {...rest}>
      {children}
    </select>
  );
}

export function Switch({ label, className = "", ...rest }) {
  return (
    <label className={`switch ${className}`.trim()}>
      <input type="checkbox" {...rest} />
      <span className="switch-track" />
      {label}
    </label>
  );
}

export function Checkbox({ label, className = "", ...rest }) {
  return (
    <label className={`check ${className}`.trim()}>
      <input type="checkbox" {...rest} />
      {label}
    </label>
  );
}

export function SearchInput({ placeholder = "Search", className = "", ...rest }) {
  return (
    <div className={`search-input-wrap ${className}`.trim()}>
      <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
      <input className="input" type="search" placeholder={placeholder} {...rest} />
    </div>
  );
}
