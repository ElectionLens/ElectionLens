import { useRef, type JSX, type KeyboardEvent } from 'react';

export interface TabItem {
  id: string;
  label: string;
  title?: string | undefined;
}

export interface PanelTabsProps {
  tabs: TabItem[];
  activeId: string;
  onSelect: (id: string) => void;
  /** Id of the element the tabs control, for `aria-controls`. */
  panelId: string;
  label: string;
}

/**
 * A real tab bar (UI revamp S5).
 *
 * Replaces a `<select>` that hid its sibling options behind a click. Follows
 * the APG tabs pattern: arrow keys move between tabs, Home/End jump to the
 * ends, and only the active tab is in the page tab order so a keyboard user
 * tabs *past* the bar rather than through every option.
 *
 * Activation follows focus, which is the recommended behaviour when switching
 * panels is cheap - all four views render from data already in memory.
 */
export function PanelTabs({
  tabs,
  activeId,
  onSelect,
  panelId,
  label,
}: PanelTabsProps): JSX.Element | null {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});

  if (tabs.length === 0) return null;

  const focusTab = (id: string): void => {
    onSelect(id);
    // Focus after selection so the newly active tab keeps keyboard focus as
    // the roving tabindex moves to it.
    requestAnimationFrame(() => refs.current[id]?.focus());
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>): void => {
    const index = tabs.findIndex((tab) => tab.id === activeId);
    if (index === -1) return;

    const moves: Record<string, number | 'first' | 'last'> = {
      ArrowRight: 1,
      ArrowLeft: -1,
      Home: 'first',
      End: 'last',
    };
    const move = moves[event.key];
    if (move === undefined) return;

    event.preventDefault();
    let next: number;
    if (move === 'first') next = 0;
    else if (move === 'last') next = tabs.length - 1;
    // Wrap, so ArrowRight on the last tab returns to the first.
    else next = (index + move + tabs.length) % tabs.length;

    const target = tabs[next];
    if (target) focusTab(target.id);
  };

  return (
    <div className="panel-tabs" role="tablist" aria-label={label}>
      {tabs.map((tab) => {
        const isActive = tab.id === activeId;
        return (
          <button
            key={tab.id}
            ref={(node) => {
              refs.current[tab.id] = node;
            }}
            type="button"
            role="tab"
            id={`${panelId}-tab-${tab.id}`}
            aria-selected={isActive}
            aria-controls={panelId}
            // Roving tabindex: only the active tab is reachable by Tab.
            tabIndex={isActive ? 0 : -1}
            className={`panel-tab${isActive ? ' panel-tab--active' : ''}`}
            title={tab.title}
            onClick={() => onSelect(tab.id)}
            onKeyDown={onKeyDown}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
