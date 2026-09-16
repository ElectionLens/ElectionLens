import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Breadcrumb, type BreadcrumbProps } from './Breadcrumb';

function baseProps(overrides: Partial<BreadcrumbProps> = {}): BreadcrumbProps {
  return {
    currentState: null,
    currentPC: null,
    currentDistrict: null,
    displayState: null,
    selectedAssembly: null,
    electionResult: null,
    onReset: vi.fn(),
    onGoBackToState: vi.fn(),
    ...overrides,
  };
}

function renderCrumbs(props: BreadcrumbProps) {
  return render(<div>{Breadcrumb(props)}</div>);
}

describe('Breadcrumb', () => {
  it('shows just "India" at the top level', () => {
    renderCrumbs(baseProps());
    expect(screen.getByText('India')).toBeInTheDocument();
    expect(screen.queryByText('›')).not.toBeInTheDocument();
  });

  it('clicking India calls onReset', () => {
    const onReset = vi.fn();
    renderCrumbs(baseProps({ onReset }));
    fireEvent.click(screen.getByText('India'));
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it('shows the state name as plain text when no PC/district is selected', () => {
    renderCrumbs(baseProps({ currentState: 'TN', displayState: 'Tamil Nadu' }));
    expect(screen.getByText('Tamil Nadu')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Tamil Nadu' })).not.toBeInTheDocument();
  });

  it('shows the state as a clickable link when a PC is selected, and shows the PC name', () => {
    const onGoBackToState = vi.fn();
    renderCrumbs(
      baseProps({
        currentState: 'TN',
        displayState: 'Tamil Nadu',
        currentPC: 'Chennai North',
        onGoBackToState,
      })
    );
    fireEvent.click(screen.getByText('Tamil Nadu'));
    expect(onGoBackToState).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Chennai North')).toBeInTheDocument();
  });

  it('shows the district name when a district is selected', () => {
    renderCrumbs(
      baseProps({
        currentState: 'TN',
        displayState: 'Tamil Nadu',
        currentDistrict: 'Tiruvallur',
      })
    );
    expect(screen.getByText('Tiruvallur')).toBeInTheDocument();
  });

  it('appends "Assemblies" after a district with no assembly selected yet', () => {
    renderCrumbs(
      baseProps({
        currentState: 'TN',
        displayState: 'Tamil Nadu',
        currentDistrict: 'Tiruvallur',
      })
    );
    expect(screen.getByText('› Assemblies')).toBeInTheDocument();
  });

  it('shows the AC name under a PC using the original constituency name when present', () => {
    renderCrumbs(
      baseProps({
        currentState: 'TN',
        displayState: 'Tamil Nadu',
        currentPC: 'Chennai North',
        selectedAssembly: 'GUMMIDIPOONDI',
        electionResult: { constituencyNameOriginal: 'Gummidipoondi' } as never,
      })
    );
    expect(screen.getByText('Gummidipoondi')).toBeInTheDocument();
  });

  it('falls back to the raw selectedAssembly id when no result name is available', () => {
    renderCrumbs(
      baseProps({
        currentState: 'TN',
        displayState: 'Tamil Nadu',
        currentDistrict: 'Tiruvallur',
        selectedAssembly: 'GUMMIDIPOONDI',
        electionResult: null,
      })
    );
    expect(screen.getByText('GUMMIDIPOONDI')).toBeInTheDocument();
  });
});
