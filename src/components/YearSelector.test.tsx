import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { YearSelector, type YearOption } from './YearSelector';

function setInnerWidth(w: number): void {
  Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: w });
}

describe('YearSelector', () => {
  const baseOptions: YearOption[] = [
    { id: 'a', label: '2009', isActive: false, onClick: vi.fn() },
    { id: 'b', label: '2021', isActive: true, onClick: vi.fn() },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    setInnerWidth(1200);
  });

  afterEach(() => {
    setInnerWidth(1200);
  });

  it('returns null when options is empty', () => {
    const { container } = render(<YearSelector options={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders desktop native select when viewport is wide', () => {
    setInnerWidth(1200);
    render(<YearSelector options={baseOptions} fieldId="test-year" label="Year" />);
    const sel = screen.getByLabelText('Year') as HTMLSelectElement;
    expect(sel.tagName).toBe('SELECT');
    expect(sel).toHaveValue('b');
  });

  it('falls back to last option when none is active', () => {
    const opts: YearOption[] = [
      { id: 'x', label: 'A', isActive: false, onClick: vi.fn() },
      { id: 'y', label: 'B', isActive: false, onClick: vi.fn() },
    ];
    render(<YearSelector options={opts} fieldId="fb-year" />);
    expect((screen.getByLabelText('Year') as HTMLSelectElement).value).toBe('y');
  });

  it('calls onYearChange when desktop select changes', () => {
    const onA = vi.fn();
    const onB = vi.fn();
    render(
      <YearSelector
        options={[
          { id: 'a', label: 'A', isActive: true, onClick: onA },
          { id: 'b', label: 'B', isActive: false, onClick: onB },
        ]}
        fieldId="chg-year"
      />
    );
    fireEvent.change(screen.getByLabelText('Year'), { target: { value: 'b' } });
    expect(onB).toHaveBeenCalledTimes(1);
    expect(onA).not.toHaveBeenCalled();
  });

  it('renders mobile trigger and opens listbox; option click fires onClick', () => {
    setInnerWidth(400);
    const onPick = vi.fn();
    render(
      <YearSelector
        options={[{ id: 'm1', label: '2024', isActive: true, onClick: onPick }]}
        fieldId="mob-year"
        label="Year"
        variant="stacked"
      />
    );

    const btn = screen.getByRole('button', { name: 'Year' });
    expect(btn).toHaveClass('year-dropdown-trigger');
    fireEvent.click(btn);
    expect(screen.getByRole('listbox')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '2024' }));
    expect(onPick).toHaveBeenCalled();
  });

  it('closes mobile menu on outside mousedown', () => {
    setInnerWidth(390);
    render(
      <YearSelector
        options={[
          { id: 'p', label: 'P', isActive: true, onClick: vi.fn() },
          { id: 'q', label: 'Q', isActive: false, onClick: vi.fn() },
        ]}
        fieldId="out-year"
      />
    );
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByRole('listbox')).toBeInTheDocument();

    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('proxy select on mobile invokes option handler', () => {
    setInnerWidth(500);
    const onProxy = vi.fn();
    render(
      <YearSelector
        options={[
          { id: 'px1', label: 'One', isActive: true, onClick: vi.fn() },
          { id: 'px2', label: 'Two', isActive: false, onClick: onProxy },
        ]}
        fieldId="proxy-year"
      />
    );

    const proxy = document.getElementById('proxy-year-proxy') as HTMLSelectElement;
    expect(proxy).toBeTruthy();
    fireEvent.change(proxy, { target: { value: 'px2' } });
    expect(onProxy).toHaveBeenCalled();
  });
});
