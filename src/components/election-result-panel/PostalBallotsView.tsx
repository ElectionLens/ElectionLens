import { Mail, AlertTriangle } from 'lucide-react';
import { useMemo } from 'react';
import type { PostalData } from '../../hooks/useBoothData';
import { getPartyColor, getPartyFullName, getPartyShortName } from '../../utils/partyData';
import { type UnmappedData } from '../../utils/boothDataQuality';
import { embeddedPartyChipStyle, solidPartyChipStyle, formatNumber } from './shared';

interface PostalBallotsViewProps {
  postal: PostalData;
  unmapped?: UnmappedData | undefined;
  showUnmapped?: boolean;
  partyShortNames?: boolean;
  embeddedPanel?: boolean;
}

export function PostalBallotsView({
  postal,
  unmapped,
  showUnmapped = true,
  partyShortNames = false,
  embeddedPanel = false,
}: PostalBallotsViewProps): JSX.Element {
  // Sort postal candidates by postal votes descending
  const sortedCandidates = useMemo(() => {
    return [...postal.candidates]
      .filter((c) => c.party !== 'NOTA' && c.name !== 'NOTA')
      .sort((a, b) => b.postal - a.postal);
  }, [postal.candidates]);

  const totalPostal = useMemo(() => {
    return postal.candidates
      .filter((c) => c.party !== 'NOTA' && c.name !== 'NOTA')
      .reduce((sum, c) => sum + c.postal, 0);
  }, [postal.candidates]);

  const totalUnmapped = useMemo(() => {
    return (unmapped?.candidates ?? [])
      .filter((c) => c.party !== 'NOTA' && c.name !== 'NOTA')
      .reduce((sum, c) => sum + c.unmapped, 0);
  }, [unmapped?.candidates]);

  const officialTotal = useMemo(() => {
    if (unmapped?.candidates?.length) {
      return unmapped.candidates.reduce((sum, c) => sum + c.total, 0);
    }
    return postal.candidates.reduce((sum, c) => sum + c.booth + c.postal, 0);
  }, [postal.candidates, unmapped?.candidates]);

  const postalPercent = useMemo(() => {
    const base =
      officialTotal > 0 ? officialTotal : postal.candidates.reduce((s, c) => s + c.total, 0);
    return base > 0 ? (totalPostal / base) * 100 : 0;
  }, [totalPostal, officialTotal, postal.candidates]);

  const unmappedPercent = useMemo(() => {
    const base = officialTotal > 0 ? officialTotal : 1;
    return (totalUnmapped / base) * 100;
  }, [totalUnmapped, officialTotal]);

  return (
    <div className="postal-ballots-view">
      {/* Summary */}
      <div className="postal-summary">
        <div className="postal-summary-header">
          <Mail size={18} />
          <h3>Postal Ballot Summary</h3>
        </div>
        <div className="postal-stats">
          <div className="postal-stat">
            <span className="stat-value">{formatNumber(totalPostal)}</span>
            <span className="stat-label">Postal Votes (Form20)</span>
          </div>
          <div className="postal-stat">
            <span className="stat-value">{postalPercent.toFixed(1)}%</span>
            <span className="stat-label">Postal share</span>
          </div>
          {showUnmapped && totalUnmapped > 0 && (
            <div className="postal-stat unmapped-stat">
              <span className="stat-value">{formatNumber(totalUnmapped)}</span>
              <span className="stat-label">Unmapped ({unmappedPercent.toFixed(1)}%)</span>
            </div>
          )}
        </div>
      </div>

      {/* Candidate-wise postal votes */}
      <div className="postal-candidates">
        <div className="postal-candidates-header">
          <span className="col-rank">#</span>
          <span className="col-party">Party</span>
          <span className="col-postal">Postal</span>
          <span className="col-booth">Booth</span>
          <span className="col-total">Total</span>
        </div>
        <div className="postal-candidates-list">
          {sortedCandidates.map((candidate, idx) => {
            const unmappedRow = unmapped?.candidates?.find(
              (u) => u.name === candidate.name && u.party === candidate.party
            );
            const candOfficial = unmappedRow?.total ?? candidate.booth + candidate.postal;
            const postalShare = candOfficial > 0 ? (candidate.postal / candOfficial) * 100 : 0;

            return (
              <div
                key={`${candidate.name}-${candidate.party}`}
                className={`postal-candidate-row data-row ${idx === 0 ? 'winner' : ''}`}
              >
                <span className="col-rank">{idx + 1}</span>
                <span
                  className="col-party"
                  style={
                    embeddedPanel
                      ? embeddedPartyChipStyle(getPartyColor(candidate.party))
                      : solidPartyChipStyle(getPartyColor(candidate.party))
                  }
                  title={`${candidate.name} (${getPartyFullName(candidate.party)})`}
                >
                  {partyShortNames ? getPartyShortName(candidate.party) : candidate.party}
                </span>
                <span className="col-postal">
                  {formatNumber(candidate.postal)}
                  <small className="postal-pct">({postalShare.toFixed(1)}%)</small>
                </span>
                <span className="col-booth">{formatNumber(candidate.booth)}</span>
                <span className="col-total">
                  {formatNumber(candidate.booth + candidate.postal)}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {showUnmapped && totalUnmapped > 0 && unmapped?.candidates && (
        <div className="unmapped-votes-section">
          <h4>Unmapped votes (not postal)</h4>
          <p className="unmapped-note">{unmapped.note}</p>
          <div className="postal-candidates-list">
            {unmapped.candidates
              .filter((c) => c.party !== 'NOTA' && c.name !== 'NOTA' && c.unmapped > 0)
              .sort((a, b) => b.unmapped - a.unmapped)
              .map((candidate) => (
                <div
                  key={`u-${candidate.name}-${candidate.party}`}
                  className="postal-candidate-row data-row"
                >
                  <span
                    className="col-party"
                    style={
                      embeddedPanel
                        ? embeddedPartyChipStyle(getPartyColor(candidate.party))
                        : solidPartyChipStyle(getPartyColor(candidate.party))
                    }
                  >
                    {partyShortNames ? getPartyShortName(candidate.party) : candidate.party}
                  </span>
                  <span className="col-postal">{formatNumber(candidate.unmapped)}</span>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Note about postal ballots */}
      <div className="postal-note">
        <AlertTriangle size={14} />
        <span>
          {showUnmapped
            ? 'Postal counts come from the Form20 summary row only (typically 2–8% of votes). Unmapped votes are booth-level totals not yet extracted — not postal ballots.'
            : 'Postal counts come from the Form20 summary row. Constituency totals match official results.'}
        </span>
      </div>
    </div>
  );
}
