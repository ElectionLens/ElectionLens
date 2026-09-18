import { useLayoutEffect, useEffect, useRef, useState } from 'react';

import { useMediaQuery } from '../hooks/useMediaQuery';

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
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const isMobileViewport = useMediaQuery('(max-width: 768px)');
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties | undefined>(undefined);

  useLayoutEffect(() => {
    if (!isMenuOpen || !isMobileViewport || !triggerRef.current) return;

    const reposition = (): void => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const preferredHeight = Math.min(260, Math.max(120, options.length * 44 + 8));
      const roomBelow = window.innerHeight - rect.bottom - 12;
      const opensBelow = roomBelow >= preferredHeight;
      const maxHeight = Math.max(120, opensBelow ? roomBelow : rect.top - 12);
      const visibleHeight = Math.min(preferredHeight, maxHeight);
      const top = opensBelow ? rect.bottom + 4 : Math.max(8, rect.top - visibleHeight - 4);
      setMenuStyle({
        position: 'fixed',
        top,
        left: rect.left,
        width: rect.width,
        maxHeight,
        zIndex: 2000,
      });
    };

    reposition();
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    return () => {
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [isMenuOpen, isMobileViewport, options.length]);

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
          ref={triggerRef}
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
          <ul
            id={listboxId}
            className="year-dropdown-menu"
            style={menuStyle}
            role="listbox"
            aria-label={label}
          >
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
