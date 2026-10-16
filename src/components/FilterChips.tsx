import React from 'react';
import { Search, X, LucideIcon } from 'lucide-react';

// The app's one filter look (same as the global filter bar): a rounded chip with an icon,
// a "Label:" and the value. Styles are .cs-filter-* in index.css (design-system tokens only).

type Option = string | { value: string; label: string };

export const FilterSelect: React.FC<{
  icon: LucideIcon;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly Option[];
  // Text of the "no filter" option (value ''); omit when every option is a real choice.
  allLabel?: string;
}> = ({ icon: Icon, label, value, onChange, options, allLabel }) => (
  <label className="cs-filter-chip">
    <Icon className="cs-filter-icon" aria-hidden />
    <span className="cs-filter-label">{label}:</span>
    <select value={value} onChange={e => onChange(e.target.value)} aria-label={label}>
      {allLabel !== undefined && <option value="">{allLabel}</option>}
      {options.map(o => (typeof o === 'string'
        ? <option key={o} value={o}>{o}</option>
        : <option key={o.value} value={o.value}>{o.label}</option>))}
    </select>
  </label>
);

export const FilterSearch: React.FC<{
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  wide?: boolean;
}> = ({ value, onChange, placeholder, wide }) => (
  <label className={`cs-filter-chip${wide ? ' cs-filter-chip--wide' : ''}`}>
    <Search className="cs-filter-icon" aria-hidden />
    <input type="search" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder} />
    {value && (
      <button type="button" onClick={() => onChange('')} className="cs-filter-clear" aria-label="Clear search">
        <X className="w-3 h-3" aria-hidden />
      </button>
    )}
  </label>
);

export const FilterReset: React.FC<{ onClick: () => void }> = ({ onClick }) => (
  <button type="button" onClick={onClick} className="cs-filter-reset">
    <X className="w-3 h-3" aria-hidden /> Clear filters
  </button>
);
