import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { ACElectionResult, ElectionResultsByConstituency } from '../types';
import { RankedConstituencyList } from './RankedConstituencyList';

function ac(overrides: Partial<ACElectionResult> = {}): ACElectionResult {
  return {
    year: 2021,
    constituencyNo: 1,
    constituencyName: 'Test AC',
    constituencyNameOriginal: 'Test AC',
    constituencyType: 'GEN',
    districtName: 'Test District',
    validVotes: 1000,
    electors: 1500,
    turnout: 66.7,
    enop: 5,
    totalCandidates: 2,
    candidates: [
      {
        position: 1,
        name: 'Alice',
        party: 'DMK',
        votes: 600,
        voteShare: 60,
        margin: 200,
        marginPct: 20,
        sex: 'F',
        age: null,
        depositLost: false,
      },
      {
        position: 2,
        name: 'Bob',
        party: 'ADMK',
        votes: 400,
        voteShare: 40,
        margin: null,
        marginPct: null,
        sex: 'M',
        age: null,
        depositLost: false,
      },
    ],
    ...overrides,
  };
}

function byId(entries: Record<string, ACElectionResult>): ElectionResultsByConstituency {
  return entries;
}

describe('RankedConstituencyList', () => {
  it('shows an explicit metric label, never a bare "Top N"', () => {
    const results = byId({ 'TN-001': ac() });
    render(
      <RankedConstituencyList
        results={results}
        metric="margin"
        direction="asc"
        onSelect={vi.fn()}
      />
    );
    expect(screen.getByText(/Closest contests - smallest winning margin/)).toBeInTheDocument();
  });

  it('ranks by margin ascending, closest race first', () => {
    const results = byId({
      'TN-001': ac({ constituencyNo: 1, constituencyName: 'Wide Race' }), // margin 200
      'TN-002': ac({
        constituencyNo: 2,
        constituencyName: 'Close Race',
        candidates: [
          {
            position: 1,
            name: 'X',
            party: 'DMK',
            votes: 510,
            voteShare: 51,
            margin: 20,
            marginPct: 2,
            sex: '',
            age: null,
            depositLost: false,
          },
          {
            position: 2,
            name: 'Y',
            party: 'ADMK',
            votes: 490,
            voteShare: 49,
            margin: null,
            marginPct: null,
            sex: '',
            age: null,
            depositLost: false,
          },
        ],
      }),
    });
    render(
      <RankedConstituencyList
        results={results}
        metric="margin"
        direction="asc"
        onSelect={vi.fn()}
      />
    );
    const names = screen.getAllByText(/Race$/).map((el) => el.textContent);
    expect(names).toEqual(['Close Race', 'Wide Race']);
  });

  it('calls onSelect with the AC id and result when a row is activated', () => {
    const onSelect = vi.fn();
    const results = byId({ 'TN-001': ac() });
    render(
      <RankedConstituencyList
        results={results}
        metric="margin"
        direction="asc"
        onSelect={onSelect}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /Test AC/ }));
    expect(onSelect).toHaveBeenCalledWith('TN-001', results['TN-001']);
  });

  it('activates a row via keyboard (Enter), matching the browse-list convention', () => {
    const onSelect = vi.fn();
    const results = byId({ 'TN-001': ac() });
    render(
      <RankedConstituencyList
        results={results}
        metric="margin"
        direction="asc"
        onSelect={onSelect}
      />
    );
    fireEvent.keyDown(screen.getByRole('button', { name: /Test AC/ }), { key: 'Enter' });
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('fires the hover-link callback with a schemaId-carrying feature, not a bare name', () => {
    const onRowEnter = vi.fn();
    const results = byId({ 'TN-001': ac() });
    render(
      <RankedConstituencyList
        results={results}
        metric="margin"
        direction="asc"
        onSelect={vi.fn()}
        onRowEnter={onRowEnter}
      />
    );
    fireEvent.mouseEnter(screen.getByRole('button', { name: /Test AC/ }));
    expect(onRowEnter).toHaveBeenCalledWith(
      expect.objectContaining({ level: 'assemblies', schemaId: 'TN-001', no: 1 })
    );
  });

  it('excludes pending results from the ranking entirely', () => {
    const results = byId({
      'TN-001': ac(),
      'TN-002': ac({ constituencyNo: 2, constituencyName: 'Pending AC', resultsPending: true }),
    });
    render(
      <RankedConstituencyList
        results={results}
        metric="margin"
        direction="asc"
        onSelect={vi.fn()}
      />
    );
    expect(screen.queryByText('Pending AC')).not.toBeInTheDocument();
  });

  it('surfaces a missing-data note rather than silently dropping constituencies with an unknown metric', () => {
    const results = byId({
      'TN-001': ac(),
      'TN-002': ac({
        constituencyNo: 2,
        constituencyName: 'No Turnout AC',
        turnout: 0, // treated as unknown, not a real 0
      }),
    });
    render(
      <RankedConstituencyList
        results={results}
        metric="turnout"
        direction="desc"
        onSelect={vi.fn()}
      />
    );
    expect(screen.getByText('No Turnout AC')).toBeInTheDocument();
    expect(screen.getByText(/missing data for this/)).toBeInTheDocument();
  });

  it('renders an empty state instead of a bare shell when nothing is rankable', () => {
    render(
      <RankedConstituencyList
        results={byId({})}
        metric="margin"
        direction="asc"
        onSelect={vi.fn()}
      />
    );
    expect(screen.getByText(/No constituencies to rank yet/)).toBeInTheDocument();
  });

  it('computes winnerSwing using the full current+prior maps, not a per-row stub', () => {
    const current = byId({ 'TN-001': ac() }); // DMK 60% now
    const prior = byId({
      'TN-001': ac({
        candidates: [
          {
            position: 1,
            name: 'Alice2',
            party: 'DMK',
            votes: 500,
            voteShare: 50,
            margin: null,
            marginPct: null,
            sex: '',
            age: null,
            depositLost: false,
          },
          {
            position: 2,
            name: 'Bob2',
            party: 'ADMK',
            votes: 500,
            voteShare: 50,
            margin: null,
            marginPct: null,
            sex: '',
            age: null,
            depositLost: false,
          },
        ],
      }),
    });
    render(
      <RankedConstituencyList
        results={current}
        priorResults={prior}
        metric="winnerSwing"
        direction="desc"
        onSelect={vi.fn()}
      />
    );
    expect(screen.getByText('+10.0 pp')).toBeInTheDocument();
  });

  it('respects the limit prop', () => {
    const results = byId({
      'TN-001': ac({ constituencyNo: 1, constituencyName: 'AC One' }),
      'TN-002': ac({ constituencyNo: 2, constituencyName: 'AC Two' }),
      'TN-003': ac({ constituencyNo: 3, constituencyName: 'AC Three' }),
    });
    render(
      <RankedConstituencyList
        results={results}
        metric="margin"
        direction="asc"
        limit={2}
        onSelect={vi.fn()}
      />
    );
    expect(screen.getAllByRole('button')).toHaveLength(2);
  });
});
