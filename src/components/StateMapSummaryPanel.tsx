/**
 * Aggregate party seats + vote share when viewing full state assembly or parliament map (no constituency selected).
 */
import { PieChart } from 'lucide-react';
import { getPartyColor, getPartyShortName } from '../utils/partyData';
import type { PartySeatRow, PartyVoteRow } from '../utils/aggregateStateMapElectionStats';

export interface StateMapSummaryPanelProps {
  variant: 'assembly' | 'parliament';
  /** Normalized display title (state name) */
  stateDisplayName: string;
  subtitle: string;
  seatRows: PartySeatRow[];
  voteRows: PartyVoteRow[] | null;
  totalValidVotes: number;
  constituenciesCounted: number;
  seatUnitLabel: string;
  /** When set, replaces seat listing and warns on vote section (pre-poll / announced-only bundles). */
  suppressSummaryMessage?: string | null;
}

function formatIn(num: number): string {
  if (!Number.isFinite(num)) return '—';
  return Math.round(num).toLocaleString('en-IN');
}

export function StateMapSummaryPanel({
  variant,
  stateDisplayName,
  subtitle,
  seatRows,
  voteRows,
  totalValidVotes,
  constituenciesCounted,
  seatUnitLabel,
  suppressSummaryMessage,
}: StateMapSummaryPanelProps): JSX.Element {
  const title =
    variant === 'assembly' ? `Assembly • ${stateDisplayName}` : `Lok Sabha • ${stateDisplayName}`;

  return (
    <div className={`election-panel state-map-summary-panel state-map-summary-${variant}`}>
      <div className="election-panel-header">
        <div className="election-panel-title">
          <h3>
            <PieChart
              size={22}
              style={{ verticalAlign: 'middle', marginRight: 8, opacity: 0.85 }}
            />
            {title}
          </h3>
          <span className={`constituency-type type-gen`}>{subtitle}</span>
        </div>
      </div>

      <div className="state-map-summary-section">
        <h4 className="state-map-summary-heading">Seats won ({seatUnitLabel})</h4>
        {suppressSummaryMessage ? (
          <p className="state-map-summary-muted">{suppressSummaryMessage}</p>
        ) : seatRows.length === 0 ? (
          <p className="state-map-summary-muted">No seat data mapped yet.</p>
        ) : (
          <ul className="state-map-summary-list">
            {seatRows.map((row) => {
              const col = getPartyColor(row.party);
              const label = getPartyShortName(row.party);
              return (
                <li key={row.party} className="state-map-summary-row">
                  <span
                    className="state-map-summary-swatch"
                    style={{
                      backgroundColor: col,
                      boxShadow: `0 0 0 1px ${col}40`,
                    }}
                  />
                  <span className="state-map-summary-party" title={row.party}>
                    {label}
                  </span>
                  <span className="state-map-summary-value">{row.seats}</span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="state-map-summary-section">
        <h4 className="state-map-summary-heading">
          Vote share ({variant === 'parliament' ? 'state' : 'statewide'})
        </h4>
        {!voteRows?.length ? (
          <p className="state-map-summary-muted">
            {suppressSummaryMessage
              ? suppressSummaryMessage
              : 'Loading or no result file matched to the map.'}
          </p>
        ) : (
          <ul className="state-map-summary-list">
            {voteRows.map((row) => {
              const col = getPartyColor(row.party);
              const label = getPartyShortName(row.party);
              return (
                <li key={row.party} className="state-map-summary-row">
                  <span
                    className="state-map-summary-swatch"
                    style={{
                      backgroundColor: col,
                      boxShadow: `0 0 0 1px ${col}40`,
                    }}
                  />
                  <span className="state-map-summary-party" title={row.party}>
                    {label}
                  </span>
                  <span className="state-map-summary-votepct">
                    {row.pct.toFixed(1)}%
                    <span className="state-map-summary-voteabs"> ({formatIn(row.votes)})</span>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="share-bar state-map-summary-footer">
        <div className="share-bar-info">
          <span className="district-label">
            {constituenciesCounted} {seatUnitLabel} counted
            {totalValidVotes > 0 ? ` · ${formatIn(totalValidVotes)} valid votes` : ''}
          </span>
        </div>
      </div>
    </div>
  );
}
