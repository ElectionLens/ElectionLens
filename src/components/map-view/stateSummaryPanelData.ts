/**
 * Turns a computed layer summary into the panel payload MapView hands
 * upward via onStateSummaryDataChange.
 *
 * The assembly and parliament branches of that effect were the same
 * eleven-field mapping twice over, differing only in the variant name,
 * the seat unit label, and whether a provisional-data warning applies.
 * Spelling it out per branch is how a field gets added to one and
 * forgotten in the other.
 */
import type { PartyCandidateRow, StateSummaryPanelData } from '../../types';
import type { PartyVoteRow } from '../../utils/aggregateStateMapElectionStats';

/** The shape both layer-summary memos produce. */
export interface LayerMapSummary {
  seats: Array<{ party: string; seats: number }>;
  voteRows: PartyVoteRow[] | null;
  totalValidVotes: number;
  voteUnits: number;
  subtitle: string;
  partyCandidateRowsByParty?: Record<string, PartyCandidateRow[]> | undefined;
  /** Only the assembly layer can be showing provisional pre-poll data. */
  suppressMsg?: string | null;
}

export function toStateSummaryPanelData(
  summary: LayerMapSummary,
  options: {
    variant: StateSummaryPanelData['variant'];
    stateDisplayName: string;
    /** 'ACs' or 'PCs' - what the seat counts are counting. */
    seatUnitLabel: string;
  }
): StateSummaryPanelData {
  return {
    variant: options.variant,
    stateDisplayName: options.stateDisplayName,
    subtitle: summary.subtitle,
    seatRows: summary.seats,
    voteRows: summary.voteRows,
    // Omitted rather than set to undefined: the panel type declares this
    // optional, and exactOptionalPropertyTypes rejects an explicit undefined.
    ...(summary.partyCandidateRowsByParty
      ? { partyCandidateRowsByParty: summary.partyCandidateRowsByParty }
      : {}),
    totalValidVotes: summary.totalValidVotes,
    constituenciesCounted: summary.voteUnits,
    seatUnitLabel: options.seatUnitLabel,
    suppressSummaryMessage: summary.suppressMsg ?? null,
  };
}
