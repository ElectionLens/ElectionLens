import { useEffect, useRef, useState } from 'react';

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
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [isMobileViewport, setIsMobileViewport] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth <= 768;
  });
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onResize = () => setIsMobileViewport(window.innerWidth <= 768);
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    if (!isMenuOpen) return;
    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      if (!rootRef.current) return;
      const target = event.target as Node | null;
      if (target && !rootRef.current.contains(target)) {
        setIsMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown, { passive: true });
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
    };
  }, [isMenuOpen]);

  if (options.length === 0) {
    return null;
  }

  /** When nothing matches (e.g. stale state), prefer latest year — never default to oldest (2009). */
  const fallbackOption = options[options.length - 1];
  const selectedOption = options.find((option) => option.isActive) ?? fallbackOption ?? options[0];
  if (!selectedOption) {
    return null;
  }

  const selectId = fieldId ?? `year-dropdown-${(className || 'default').replace(/\s+/g, '-')}`;
  const listboxId = `${selectId}-listbox`;

  if (isMobileViewport) {
    return (
      <div
        ref={rootRef}
        className={`year-chip-group ${className} ${isMenuOpen ? 'mobile-dropdown-open' : ''}`.trim()}
        data-variant={variant}
      >
        <label className="year-dropdown-label" htmlFor={selectId}>
          {label}
        </label>
        <button
          id={selectId}
          type="button"
          className="year-dropdown year-dropdown-trigger"
          aria-haspopup="listbox"
          aria-expanded={isMenuOpen}
          aria-controls={listboxId}
          onClick={() => setIsMenuOpen((prev) => !prev)}
        >
          {selectedOption.label}
        </button>
        {/* Hidden native select keeps automation/tooling compatibility in mobile mode. */}
        <select
          id={`${selectId}-proxy`}
          className="year-dropdown year-dropdown-native-proxy"
          value={selectedOption.id}
          onChange={(event) => {
            const option = options.find((item) => item.id === event.target.value);
            option?.onClick();
          }}
          aria-hidden="true"
          tabIndex={-1}
        >
          {options.map((option) => (
            <option key={option.id} value={option.id} title={option.title}>
              {option.label}
            </option>
          ))}
        </select>
        {isMenuOpen && (
          <ul id={listboxId} className="year-dropdown-menu" role="listbox" aria-label={label}>
            {options.map((option) => (
              <li key={option.id} role="option" aria-selected={option.isActive}>
                <button
                  type="button"
                  className={`year-dropdown-option ${option.isActive ? 'active' : ''}`.trim()}
                  onClick={() => {
                    option.onClick();
                    setIsMenuOpen(false);
                  }}
                  title={option.title}
                >
                  {option.label}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

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
