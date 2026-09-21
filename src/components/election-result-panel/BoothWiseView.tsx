import { ChevronDown, MapPin, AlertTriangle } from 'lucide-react';
import type { BoothResults, BoothWithResult } from '../../hooks/useBoothData';
import { getPartyColor, getPartyShortName } from '../../utils/partyData';
import { BoothDataQualityBanner, BoothSourceBadge } from '../BoothDataQualityBanner';
import { embeddedPartyChipStyle, solidPartyChipStyle, formatNumber } from './shared';

interface BoothWiseViewProps {
  boothResults: BoothResults | null | undefined;
  boothsWithResults: BoothWithResult[];
  selectedBoothId: string | null;
  onBoothSelect: (boothId: string | null) => void;
  selectedBooth: BoothWithResult | null;
  partyShortNames?: boolean;
  embeddedPanel?: boolean;
}

export function BoothWiseView({
  boothResults,
  boothsWithResults,
  selectedBoothId,
  onBoothSelect,
  selectedBooth,
  partyShortNames = false,
  embeddedPanel = false,
}: BoothWiseViewProps): JSX.Element {
  const pl = (p: string) => (partyShortNames ? getPartyShortName(p) : p);
  const quality = boothResults?.dataQuality;
  const acComplete = Boolean(quality?.acTotalsReconciled && quality.estimatedBooths === 0);
  const verifiedBooths = acComplete
    ? boothsWithResults.length
    : (quality?.form20ParsedBooths ??
      boothsWithResults.filter((b) => b.voteSource === 'form20').length);
  const verifiedBoothLabel = acComplete ? 'Polling booths' : 'Form20 Booths';
  return (
    <div className="booth-wise-view">
      {quality && <BoothDataQualityBanner quality={quality} compact />}
      {/* Booth selector dropdown */}
      <div className="booth-selector">
        <label>Select Booth:</label>
        <div className="booth-dropdown-wrapper">
          <select
            value={selectedBoothId ?? ''}
            onChange={(e) => onBoothSelect(e.target.value || null)}
            className="booth-dropdown"
            aria-label="Select booth"
            title="Select booth"
          >
            <option value="">-- Select a booth --</option>
            {boothsWithResults.map((booth) => (
              <option key={booth.id} value={booth.id}>
                {booth.boothNo} - {booth.name.slice(0, 40)}
                {booth.name.length > 40 ? '...' : ''}
                {booth.type === 'women' ? ' \u{1F469}' : ''}
                {booth.voteSource === 'missing' && !acComplete ? ' · no data' : ''}
              </option>
            ))}
          </select>
          <ChevronDown size={16} className="dropdown-icon" />
        </div>
      </div>

      {/* Summary stats */}
      <div className="booth-stats-summary">
        <div className="stat-item">
          <span className="stat-label">Total Booths</span>
          <span className="stat-value">{boothsWithResults.length}</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">{verifiedBoothLabel}</span>
          <span className="stat-value">{verifiedBooths}</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">Women Booths</span>
          <span className="stat-value">
            {boothsWithResults.filter((b) => b.type === 'women').length}
          </span>
        </div>
        {boothResults && (
          <div className="stat-item">
            <span className="stat-label">Total Votes</span>
            <span className="stat-value">
              {formatNumber(
                Object.values(boothResults.results).reduce((sum, r) => sum + r.total, 0)
              )}
            </span>
          </div>
        )}
      </div>

      {/* Selected booth details */}
      {selectedBooth ? (
        <div className="selected-booth-details">
          <div className="booth-header">
            <h3>
              Booth {selectedBooth.boothNo}
              {selectedBooth.type === 'women' && (
                <span className="women-badge">{'\u{1F469}'} Women</span>
              )}
              {selectedBooth.voteSource && <BoothSourceBadge source={selectedBooth.voteSource} />}
            </h3>
          </div>

          <div className="booth-address">
            <MapPin size={14} />
            <div>
              <div className="address-name">{selectedBooth.name}</div>
              {/* Only show address if different from name */}
              {selectedBooth.address && selectedBooth.address !== selectedBooth.name && (
                <div className="address-area">{selectedBooth.address}</div>
              )}
              {/* Only show area if not empty */}
              {selectedBooth.area && selectedBooth.area.trim() && (
                <div className="address-locality">{selectedBooth.area}</div>
              )}
            </div>
          </div>

          {selectedBooth.voteSource === 'missing' && !acComplete ? (
            <div className="booth-no-data-notice">
              <AlertTriangle size={16} aria-hidden />
              <p>
                No booth-level votes from Form20 for this polling station. Remaining votes are
                listed under <strong>Unmapped</strong> on the Postal tab (not postal ballots).
              </p>
            </div>
          ) : selectedBooth.result && boothResults && boothResults.candidates ? (
            <>
              <div className="booth-vote-summary">
                <div className="vote-stat">
                  <span className="label">Total Votes</span>
                  <span className="value">{formatNumber(selectedBooth.result.total)}</span>
                </div>
                {(selectedBooth.result.rejected ?? 0) > 0 && (
                  <div className="vote-stat">
                    <span className="label">Rejected</span>
                    <span className="value">{selectedBooth.result.rejected ?? 0}</span>
                  </div>
                )}
                {selectedBooth.winner && (
                  <div className="vote-stat winner">
                    <span className="label">Winner</span>
                    <span
                      className="value party-badge"
                      style={
                        embeddedPanel
                          ? embeddedPartyChipStyle(getPartyColor(selectedBooth.winner.party))
                          : solidPartyChipStyle(getPartyColor(selectedBooth.winner.party))
                      }
                    >
                      {pl(selectedBooth.winner.party)} ({selectedBooth.winner.percent.toFixed(1)}%)
                    </span>
                  </div>
                )}
              </div>

              {/* Candidate-wise votes for this booth */}
              <div className="booth-candidates">
                <h5>Candidate-wise Votes</h5>
                <div className="booth-candidates-scroll">
                  {boothResults.candidates
                    .map((candidate, idx) => ({
                      candidate,
                      idx,
                      votes: selectedBooth.result?.votes[idx] ?? 0,
                    }))
                    .sort((a, b) => b.votes - a.votes)
                    .map(({ candidate, votes, idx }) => {
                      const percent = selectedBooth.result?.total
                        ? (votes / selectedBooth.result.total) * 100
                        : 0;
                      const partyColor = getPartyColor(candidate.party);
                      const isWinner = selectedBooth.winner?.party === candidate.party;

                      return (
                        <div
                          key={candidate.slNo ?? idx}
                          className={`booth-candidate-row data-row ${isWinner ? 'winner' : ''}`}
                        >
                          <div className="candidate-info">
                            <span
                              className="party-tag"
                              style={
                                embeddedPanel
                                  ? embeddedPartyChipStyle(partyColor)
                                  : solidPartyChipStyle(partyColor)
                              }
                            >
                              {pl(candidate.party)}
                            </span>
                            <span className="candidate-name">{candidate.name}</span>
                          </div>
                          <div className="candidate-votes">
                            <span className="votes">{formatNumber(votes)}</span>
                            <span className="percent">{percent.toFixed(1)}%</span>
                          </div>
                          <div className="vote-bar-bg">
                            <div
                              className="vote-bar-fill"
                              style={{
                                width: `${Math.min(percent, 100)}%`,
                                backgroundColor: partyColor,
                              }}
                            />
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            </>
          ) : null}
        </div>
      ) : (
        <div className="no-booth-selected">
          <MapPin size={24} />
          <p>Select a booth from the dropdown to view detailed results</p>
        </div>
      )}
    </div>
  );
}
