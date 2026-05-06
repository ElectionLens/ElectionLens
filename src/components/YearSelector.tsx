export interface YearOption {
  id: string;
  label: string;
  title?: string;
  isActive: boolean;
  onClick: () => void;
  tone?: 'default' | 'parliament';
}

interface YearSelectorProps {
  options: YearOption[];
  className?: string;
  /** Visible label beside the select (default: Year — election year picker). */
  label?: string;
  /** Stable id for label/select pairing; avoids collisions when multiple selectors share a className. */
  fieldId?: string;
  /** Visual variant used to keep layer/year/view controls consistent by context. */
  variant?: 'default' | 'stacked';
}

export function YearSelector({
  options,
  className = '',
  label = 'Year',
  fieldId,
  variant = 'default',
}: YearSelectorProps): JSX.Element | null {
  if (options.length === 0) {
    return null;
  }

  /** When nothing matches (e.g. stale state), prefer latest year — never default to oldest (2009). */
  const selectedOption =
    options.find((option) => option.isActive) ?? options[options.length - 1] ?? options[0]!;

  const selectId = fieldId ?? `year-dropdown-${(className || 'default').replace(/\s+/g, '-')}`;

  return (
    <div className={`year-chip-group ${className}`.trim()} data-variant={variant}>
      <label className="year-dropdown-label" htmlFor={selectId}>
        {label}
      </label>
      <select
        id={selectId}
        className="year-dropdown"
        value={selectedOption.id}
        onChange={(event) => {
          const option = options.find((item) => item.id === event.target.value);
          option?.onClick();
        }}
      >
        {options.map((option) => (
          <option key={option.id} value={option.id} title={option.title}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
