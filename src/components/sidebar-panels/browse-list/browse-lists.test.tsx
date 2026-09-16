import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AssemblyBrowseList, isAssemblyData } from './AssemblyBrowseList';
import { StateBrowseList } from './StateBrowseList';
import { DistrictBrowseList } from './DistrictBrowseList';
import { ConstituencyBrowseList } from './ConstituencyBrowseList';
import type { Feature } from '../../../types';

const asFeatures = (features: unknown[]) => features as Feature[];
const emptyContext = null;

describe('AssemblyBrowseList', () => {
  const assemblyFeatures = asFeatures([
    { properties: { AC_NAME: 'Second', AC_NO: '2' } },
    { properties: { AC_NAME: 'First', AC_NO: '1' } },
  ]);

  it('recognizes assembly-shaped data and rejects constituency-shaped data', () => {
    expect(isAssemblyData(assemblyFeatures)).toBe(true);
    expect(isAssemblyData(asFeatures([{ properties: { ls_seat_name: 'PC' } }]))).toBe(false);
    expect(isAssemblyData([])).toBe(false);
  });

  it('shows the caller-provided empty state', () => {
    render(
      <AssemblyBrowseList
        features={[]}
        emptyState={<span>Nothing loaded</span>}
        browseListWinnersContext={emptyContext}
        currentPC={null}
        currentDistrict={null}
        currentState="TN"
      />
    );
    expect(screen.getByText('Nothing loaded')).toBeInTheDocument();
  });

  it('shows a loading state for stale constituency-shaped features', () => {
    render(
      <AssemblyBrowseList
        features={asFeatures([{ properties: { ls_seat_name: 'PC' } }])}
        emptyState={<span>Empty</span>}
        browseListWinnersContext={emptyContext}
        currentPC={null}
        currentDistrict={null}
        currentState="TN"
      />
    );
    expect(screen.getByText('Loading assembly data...')).toBeInTheDocument();
  });

  it('sorts ACs numerically and invokes the click callback and keyboard activation', () => {
    const onAssemblyClick = vi.fn();
    render(
      <AssemblyBrowseList
        features={assemblyFeatures}
        emptyState={<span>Empty</span>}
        browseListWinnersContext={emptyContext}
        currentPC={null}
        currentDistrict={null}
        currentState="TN"
        onAssemblyClick={onAssemblyClick}
      />
    );
    const rows = screen.getAllByRole('button');
    expect(rows[0]).toHaveTextContent('First');
    fireEvent.click(rows[0]);
    fireEvent.keyDown(rows[1], { key: 'Enter' });
    expect(onAssemblyClick).toHaveBeenCalledTimes(2);
  });
});

describe('StateBrowseList', () => {
  it('renders nothing when state data is absent', () => {
    const { container } = render(
      <StateBrowseList
        statesGeoJSON={null}
        browseListWinnersContext={null}
        onStateClick={vi.fn()}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('sorts state names and supports click plus keyboard activation', () => {
    const onStateClick = vi.fn();
    const states = {
      type: 'FeatureCollection',
      features: [{ properties: { shapeName: 'Zeta' } }, { properties: { shapeName: 'Alpha' } }],
    } as never;
    render(
      <StateBrowseList
        statesGeoJSON={states}
        browseListWinnersContext={null}
        onStateClick={onStateClick}
      />
    );
    const rows = screen.getAllByRole('button');
    expect(rows[0]).toHaveTextContent('Alpha');
    fireEvent.click(rows[0]);
    fireEvent.keyDown(rows[1], { key: ' ' });
    expect(onStateClick).toHaveBeenCalledTimes(2);
  });
});

describe('DistrictBrowseList', () => {
  it('shows the empty-state heading', () => {
    render(
      <DistrictBrowseList
        features={[]}
        browseListWinnersContext={null}
        currentState="TN"
        onDistrictClick={vi.fn()}
      />
    );
    expect(screen.getByText('No districts found')).toBeInTheDocument();
  });

  it('sorts districts and calls onDistrictClick', () => {
    const onDistrictClick = vi.fn();
    render(
      <DistrictBrowseList
        features={asFeatures([
          { properties: { district: 'Zed' } },
          { properties: { district: 'Alpha' } },
        ])}
        browseListWinnersContext={null}
        currentState="TN"
        onDistrictClick={onDistrictClick}
      />
    );
    const rows = screen.getAllByRole('button');
    expect(rows[0]).toHaveTextContent('Alpha');
    fireEvent.click(rows[0]);
    expect(onDistrictClick).toHaveBeenCalledWith('Alpha', expect.anything());
  });
});

describe('ConstituencyBrowseList', () => {
  it('shows an empty-state heading', () => {
    render(
      <ConstituencyBrowseList
        features={[]}
        browseListWinnersContext={null}
        onConstituencyClick={vi.fn()}
      />
    );
    expect(screen.getByText('No constituencies found')).toBeInTheDocument();
  });

  it('sorts parliamentary seats by number and invokes the callback', () => {
    const onConstituencyClick = vi.fn();
    render(
      <ConstituencyBrowseList
        features={asFeatures([
          { properties: { ls_seat_name: 'Second', ls_seat_code: '2' } },
          { properties: { ls_seat_name: 'First', ls_seat_code: '1' } },
        ])}
        browseListWinnersContext={null}
        onConstituencyClick={onConstituencyClick}
      />
    );
    const rows = screen.getAllByRole('button');
    expect(rows[0]).toHaveTextContent('First');
    fireEvent.keyDown(rows[0], { key: 'Enter' });
    expect(onConstituencyClick).toHaveBeenCalledTimes(1);
  });
});
