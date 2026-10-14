/**
 * PersonCard — the recruiting/team domain pattern. Shows a candidate or staff
 * member with avatar, name, role, availability, key meta, hourly rate, and
 * two actions. Composes the design-system `.person-card` (tile-tier density).
 */
export function PersonCard({ person, onView, onHire, className = "" }) {
  const {
    initials,
    name,
    role,
    status = "Available",
    location,
    rating,
    rate,
    currency = "$",
  } = person;
  const statusVariant = status === "Available" ? "success" : status === "Busy" ? "warning" : "neutral";
  return (
    <div className={`person-card ${className}`.trim()}>
      <div className="person-card-header">
        <span className="avatar avatar-lg">{initials}</span>
        <div className="person-card-identity">
          <h4 className="person-card-name">{name}</h4>
          <span className="person-card-role">{role}</span>
        </div>
        <span className={`badge badge-${statusVariant}`}>{status}</span>
      </div>
      <div className="person-card-meta">
        {location && (
          <span className="person-card-meta-item">
            <i className="fa-solid fa-location-dot" aria-hidden="true" />
            <span>{location}</span>
          </span>
        )}
        {rating && (
          <span className="person-card-meta-item">
            <i className="fa-solid fa-star" aria-hidden="true" />
            <span>{rating}</span>
          </span>
        )}
      </div>
      {rate != null && (
        <div className="person-card-rate">
          <span className="person-card-rate-amount">
            {currency}
            {rate}
          </span>
          <span className="person-card-rate-period">/ hour</span>
        </div>
      )}
      <div className="person-card-actions">
        <button className="button button-secondary button-sm" onClick={onView}>
          View profile
        </button>
        <button className="button button-primary button-sm" onClick={onHire} disabled={status !== "Available"}>
          Hire
        </button>
      </div>
    </div>
  );
}
