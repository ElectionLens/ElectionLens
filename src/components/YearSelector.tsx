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
}

export function YearSelector({ options, className = '' }: YearSelectorProps): JSX.Element | null {
  if (options.length === 0) {
    return null;
  }

  /** When nothing matches (e.g. stale state), prefer latest year — never default to oldest (2009). */
  const selectedOption =
    options.find((option) => option.isActive) ?? options[options.length - 1] ?? options[0]!;

  return (
    <div className={`year-chip-group ${className}`.trim()}>
      <label className="year-dropdown-label" htmlFor={`year-dropdown-${className || 'default'}`}>
        Year
      </label>
      <select
        id={`year-dropdown-${className || 'default'}`}
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
