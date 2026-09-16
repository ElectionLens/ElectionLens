import { describe, it, expect } from 'vitest';
import { toStateSummaryPanelData, type LayerMapSummary } from './stateSummaryPanelData';

const summary: LayerMapSummary = {
  seats: [{ party: 'DMK', seats: 133 }],
  voteRows: [{ party: 'DMK', votes: 100, pct: 45 }],
  totalValidVotes: 220,
  voteUnits: 234,
  subtitle: 'Assembly 2021',
};

const asAssembly = {
  variant: 'assembly' as const,
  stateDisplayName: 'Tamil Nadu',
  seatUnitLabel: 'ACs',
};

describe('toStateSummaryPanelData', () => {
  it('maps the summary fields onto the panel payload', () => {
    expect(toStateSummaryPanelData(summary, asAssembly)).toEqual({
      variant: 'assembly',
      stateDisplayName: 'Tamil Nadu',
      subtitle: 'Assembly 2021',
      seatRows: summary.seats,
      voteRows: summary.voteRows,
      totalValidVotes: 220,
      constituenciesCounted: 234,
      seatUnitLabel: 'ACs',
      suppressSummaryMessage: null,
    });
  });

  it('renames voteUnits to constituenciesCounted', () => {
    // the two names are the easiest field to mis-wire between branches
    const out = toStateSummaryPanelData({ ...summary, voteUnits: 39 }, asAssembly);
    expect(out.constituenciesCounted).toBe(39);
  });

  it('carries the variant and seat unit label from the caller', () => {
    const out = toStateSummaryPanelData(summary, {
      variant: 'parliament',
      stateDisplayName: 'Kerala',
      seatUnitLabel: 'PCs',
    });
    expect(out.variant).toBe('parliament');
    expect(out.seatUnitLabel).toBe('PCs');
    expect(out.stateDisplayName).toBe('Kerala');
  });

  describe('partyCandidateRowsByParty', () => {
    it('is omitted entirely when absent, not set to undefined', () => {
      // exactOptionalPropertyTypes rejects an explicit undefined here
      expect('partyCandidateRowsByParty' in toStateSummaryPanelData(summary, asAssembly)).toBe(
        false
      );
    });

    it('is included when present', () => {
      const rows = { DMK: [] };
      const out = toStateSummaryPanelData(
        { ...summary, partyCandidateRowsByParty: rows },
        asAssembly
      );
      expect(out.partyCandidateRowsByParty).toBe(rows);
    });
  });

  describe('suppressSummaryMessage', () => {
    it('passes an assembly provisional-data warning through', () => {
      const out = toStateSummaryPanelData({ ...summary, suppressMsg: 'Pre-poll' }, asAssembly);
      expect(out.suppressSummaryMessage).toBe('Pre-poll');
    });

    it('normalises a missing warning to null, as the parliament branch always was', () => {
      expect(toStateSummaryPanelData(summary, asAssembly).suppressSummaryMessage).toBeNull();
    });
  });
});
