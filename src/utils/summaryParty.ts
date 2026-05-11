import type { PartyVoteRow } from './aggregateStateMapElectionStats';

type PartyRow = { party: string };

export function isSummaryPartyPresent(
  party: string | null,
  seats: PartyRow[] | null | undefined,
  voteRows: PartyVoteRow[] | null | undefined
): boolean {
  if (!party) return false;
  const inSeats = (seats ?? []).some((row) => row.party === party);
  if (inSeats) return true;
  return (voteRows ?? []).some((row) => row.party === party);
}
