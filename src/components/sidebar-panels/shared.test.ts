import { describe, it, expect, vi } from 'vitest';
import { sidebarListRowKeyDown, partyCandidateOutcomeLabel, formatIn } from './shared';
import type { PartyCandidateRow } from '../../types';

function makeRow(overrides: Partial<PartyCandidateRow> = {}): PartyCandidateRow {
  return {
    party: 'DMK',
    candidateName: 'A. Candidate',
    constituencyName: 'Some AC',
    votes: 1000,
    voteShare: 50,
    position: 1,
    ...overrides,
  } as PartyCandidateRow;
}

describe('sidebarListRowKeyDown', () => {
  it('invokes action and prevents default on Enter', () => {
    const action = vi.fn();
    const preventDefault = vi.fn();
    sidebarListRowKeyDown(
      { key: 'Enter', preventDefault } as unknown as React.KeyboardEvent,
      action
    );
    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(action).toHaveBeenCalledTimes(1);
  });

  it('invokes action on Space', () => {
    const action = vi.fn();
    const preventDefault = vi.fn();
    sidebarListRowKeyDown({ key: ' ', preventDefault } as unknown as React.KeyboardEvent, action);
    expect(action).toHaveBeenCalledTimes(1);
  });

  it('ignores every other key', () => {
    const action = vi.fn();
    const preventDefault = vi.fn();
    sidebarListRowKeyDown({ key: 'Tab', preventDefault } as unknown as React.KeyboardEvent, action);
    expect(preventDefault).not.toHaveBeenCalled();
    expect(action).not.toHaveBeenCalled();
  });
});

describe('partyCandidateOutcomeLabel', () => {
  it('returns "Won" for position 1', () => {
    expect(partyCandidateOutcomeLabel(makeRow({ position: 1 }))).toBe('Won');
  });

  it('returns an ordinal "Lost" label for position > 1', () => {
    expect(partyCandidateOutcomeLabel(makeRow({ position: 2 }))).toBe('Lost (2nd)');
    expect(partyCandidateOutcomeLabel(makeRow({ position: 3 }))).toBe('Lost (3rd)');
    expect(partyCandidateOutcomeLabel(makeRow({ position: 11 }))).toBe('Lost (11th)');
  });

  it('returns an em dash when position is missing or invalid', () => {
    expect(partyCandidateOutcomeLabel(makeRow({ position: undefined as unknown as number }))).toBe(
      '—'
    );
    expect(partyCandidateOutcomeLabel(makeRow({ position: 0 }))).toBe('—');
  });
});

describe('formatIn', () => {
  it('formats with Indian digit grouping', () => {
    expect(formatIn(232630)).toBe('2,32,630');
  });

  it('rounds non-integer input', () => {
    expect(formatIn(1234.6)).toBe('1,235');
  });

  it('returns an em dash for non-finite input', () => {
    expect(formatIn(NaN)).toBe('—');
    expect(formatIn(Infinity)).toBe('—');
  });
});
