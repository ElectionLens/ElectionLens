import {
  X,
  Award,
  TrendingUp,
  Vote,
  Link2,
  Check,
  Twitter,
  Users,
  BarChart3,
  Share2,
  MapPin,
  ChevronDown,
} from 'lucide-react';
import { useState, useCallback, memo, useMemo, useEffect } from 'react';
import type { ACElectionResult, ElectionCandidate } from '../types';
import { getPartyColor, getPartyFullName } from '../utils/partyData';
import { trackShare } from '../utils/firebase';
import type { BoothResults, BoothWithResult } from '../hooks/useBoothData';

function formatNumber(num: number): string {
  return num.toLocaleString('en-IN');
}

interface ACParliamentContribution {
  pcName: string;
  year: number;
  candidates: Array<{
    name: string;
    party: string;
    votes: number;
    voteShare: number;
    position: number;
  }>;
  validVotes: number;
}

interface ElectionResultPanelProps {
  result: ACElectionResult;
  onClose: () => void;
  availableYears?: number[] | undefined;
  selectedYear?: number | undefined;
  onYearChange?: ((year: number) => void) | undefined;
  shareUrl?: string | undefined;
  stateName?: string | undefined;
  parliamentContributions?: Record<number, ACParliamentContribution> | undefined;
  availablePCYears?: number[] | undefined;
  selectedPCYear?: number | null | undefined;
  onPCYearChange?: ((year: number | null) => void) | undefined;
  pcContributionShareUrl?: string | undefined;
  /** Booth data for booth-wise view */
  boothResults?: BoothResults | null | undefined;
  boothsWithResults?: BoothWithResult[] | undefined;
}

/** Remove diacritics from text (e.g., Tamil Nādu → Tamil Nadu) */
function normalizeText(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function generateShareText(
  result: ACElectionResult,
  stateName?: string,
  includeAllCandidates = false
): string {
  const winner = result.candidates[0];
  if (!winner) return '';

  const normalizedState = stateName ? normalizeText(stateName) : undefined;
  const location = normalizedState
    ? `${result.constituencyNameOriginal}, ${normalizedState}`
    : result.constituencyNameOriginal;

  let text = `🗳️ ${location} | ${result.year}\n\n`;

  if (includeAllCandidates) {
    const topCandidates = result.candidates.slice(0, 3);
    const medals = ['🥇', '🥈', '🥉'];
    topCandidates.forEach((c, i) => {
      text += `${medals[i]} ${c.name} (${c.party}) - ${c.voteShare.toFixed(1)}%\n`;
    });
    if (result.candidates.length > 3) {
      text += `...+${result.candidates.length - 3} more\n`;
    }
  } else {
    const marginText = winner.margin ? ` by ${formatNumber(winner.margin)} votes` : '';
    text += `🏆 ${winner.name} (${winner.party})${marginText}\n`;
    text += `📊 ${winner.voteShare.toFixed(1)}% vote share\n`;
  }

  return text.trim();
}

type TabType = 'overview' | 'candidates' | 'booths';

export function ElectionResultPanel({
  result,
  onClose,
  availableYears = [],
  selectedYear,
  onYearChange,
  shareUrl,
  stateName,
  parliamentContributions = {},
  availablePCYears = [],
  selectedPCYear: selectedPCYearProp,
  onPCYearChange,
  pcContributionShareUrl,
  boothResults,
  boothsWithResults = [],
}: ElectionResultPanelProps): JSX.Element {
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [selectedBoothId, setSelectedBoothId] = useState<string | null>(null);

  // Check if booth data is available
  const hasBoothData = boothsWithResults.length > 0 && boothResults !== null;

  // Reset to overview tab if booth data becomes unavailable while on booths tab
  useEffect(() => {
    if (!hasBoothData && activeTab === 'booths') {
      setActiveTab('overview');
    }
  }, [hasBoothData, activeTab]);

  // Get selected booth details
  const selectedBooth = useMemo(() => {
    if (!selectedBoothId) return null;
    return boothsWithResults.find((b) => b.id === selectedBoothId) ?? null;
  }, [selectedBoothId, boothsWithResults]);
  const [copied, setCopied] = useState(false);
  const [selectedPCYearInternal, setSelectedPCYearInternal] = useState<number | null>(null);

  // Mobile panel expansion state: 'peek' (minimal), 'half' (default), 'full' (all content)
  const [panelState, setPanelState] = useState<'peek' | 'half' | 'full'>('half');

  // Check if we're on mobile portrait
  const isMobilePortrait =
    typeof window !== 'undefined' &&
    window.innerWidth <= 768 &&
    window.innerHeight > window.innerWidth;

  // Cycle through panel states on drag handle click
  const handleDragHandleClick = useCallback(() => {
    setPanelState((prev) => {
      if (prev === 'peek') return 'half';
      if (prev === 'half') return 'full';
      return 'peek';
    });
  }, []);

  // Use prop if provided (controlled), otherwise use internal state (uncontrolled)
  const selectedPCYear =
    selectedPCYearProp !== undefined ? selectedPCYearProp : selectedPCYearInternal;
  const setSelectedPCYear = useCallback(
    (year: number | null) => {
      if (onPCYearChange) {
        onPCYearChange(year);
      } else {
        setSelectedPCYearInternal(year);
      }
    },
    [onPCYearChange]
  );

  const winner = result.candidates[0];
  const currentPCContribution = selectedPCYear ? parliamentContributions[selectedPCYear] : null;
  const pcWinner = currentPCContribution?.candidates[0];

  // Derive constituency type from name if not provided
  const constituencyType =
    result.constituencyType ??
    (() => {
      const name = result.constituencyNameOriginal ?? result.constituencyName ?? '';
      if (name.includes('(SC)')) return 'SC';
      if (name.includes('(ST)')) return 'ST';
      return 'GEN';
    })();

  // Create combined year items: assembly years and parliament years interleaved by chronological order
  type YearItem = { year: number; type: 'assembly' | 'parliament' };
  const allYearItems: YearItem[] = [
    ...availableYears.map((y) => ({ year: y, type: 'assembly' as const })),
    ...availablePCYears.map((y) => ({ year: y, type: 'parliament' as const })),
  ].sort((a, b) => a.year - b.year);

  const handleCopyLink = useCallback(async () => {
    const url = shareUrl ?? window.location.href;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      trackShare('copy_link', 'assembly');
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }, [shareUrl]);

  const handleCopyPCLink = useCallback(async () => {
    if (!pcContributionShareUrl) return;
    try {
      await navigator.clipboard.writeText(pcContributionShareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      trackShare('copy_link', 'parliament');
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }, [pcContributionShareUrl]);

  const handleShareToX = useCallback(() => {
    const text = generateShareText(result, stateName, true);
    const url = shareUrl ?? window.location.href;
    const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
    window.open(twitterUrl, '_blank', 'width=550,height=420');
    trackShare('twitter', 'assembly');
  }, [result, shareUrl, stateName]);

  return (
    <div className={`election-panel ${isMobilePortrait ? `panel-${panelState}` : ''}`}>
      {/* Mobile drag handle - click to cycle states */}
      {isMobilePortrait && (
        <div
          className="bottom-sheet-handle"
          onClick={handleDragHandleClick}
          role="button"
          aria-label={`Panel is ${panelState}. Click to ${panelState === 'full' ? 'minimize' : 'expand'}`}
        />
      )}

      {/* Header */}
      <div
        className="election-panel-header"
        onClick={() => isMobilePortrait && panelState === 'peek' && setPanelState('half')}
      >
        <div className="election-panel-title">
          <h3>{result.constituencyNameOriginal}</h3>
          {/* Peek mode: show winner inline */}
          {isMobilePortrait && panelState === 'peek' && winner && (
            <span className="peek-winner">
              🏆 {winner.name} ({winner.party}) - {winner.voteShare.toFixed(1)}%
            </span>
          )}
          {(!isMobilePortrait || panelState !== 'peek') && (
            <span className={`constituency-type type-${constituencyType.toLowerCase()}`}>
              {constituencyType}
            </span>
          )}
        </div>
        <div className="election-panel-actions">
          <button
            className="election-panel-btn twitter-btn"
            onClick={handleShareToX}
            title="Share candidates on Twitter"
          >
            <Twitter size={18} />
          </button>
          <button
            className={`election-panel-btn ${copied ? 'copied' : ''}`}
            onClick={handleCopyLink}
            title={copied ? 'Copied!' : 'Copy link'}
          >
            {copied ? <Check size={18} /> : <Link2 size={18} />}
          </button>
          <button className="election-panel-close" onClick={onClose} title="Close">
            <X size={20} />
          </button>
        </div>
      </div>

      {/* Year selector - shows assembly and parliament years interleaved */}
      {allYearItems.length > 0 && (
        <div className="election-year-selector">
          {allYearItems.map((item) =>
            item.type === 'assembly' ? (
              <button
                key={`ac-${item.year}`}
                className={`year-btn ${item.year === selectedYear && !selectedPCYear ? 'active' : ''}`}
                onClick={() => {
                  setSelectedPCYear(null);
                  onYearChange?.(item.year);
                }}
              >
                {item.year}
              </button>
            ) : (
              <button
                key={`pc-${item.year}`}
                className={`year-btn parliament-year ${selectedPCYear === item.year ? 'active' : ''}`}
                onClick={() => setSelectedPCYear(item.year)}
              >
                {item.year}-PC
              </button>
            )
          )}
        </div>
      )}

      {/* Tab switcher */}
      <div className="panel-tabs">
        <button
          className={`panel-tab ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          <Award size={14} />
          Overview
        </button>
        <button
          className={`panel-tab ${activeTab === 'candidates' ? 'active' : ''}`}
          onClick={() => setActiveTab('candidates')}
        >
          <BarChart3 size={14} />
          All{' '}
          {selectedPCYear && currentPCContribution
            ? currentPCContribution.candidates.length
            : result.totalCandidates}{' '}
          Candidates
        </button>
        {hasBoothData && (
          <button
            className={`panel-tab ${activeTab === 'booths' ? 'active' : ''}`}
            onClick={() => setActiveTab('booths')}
          >
            <MapPin size={14} />
            Booths
          </button>
        )}
      </div>

      {/* Tab content */}
      <div className="panel-tab-content">
        {selectedPCYear && currentPCContribution ? (
          /* Parliament view */
          activeTab === 'overview' ? (
            <>
              {/* Parliament Winner card */}
              {pcWinner && (
                <div
                  className="winner-card-compact parliament"
                  style={{ borderColor: getPartyColor(pcWinner.party) }}
                >
                  <div className="winner-main">
                    <div className="winner-badge-small parliament">
                      <Award size={14} />
                      Winner
                    </div>
                    <div className="winner-name">{pcWinner.name}</div>
                    <div
                      className="winner-party"
                      style={{ backgroundColor: getPartyColor(pcWinner.party) }}
                      title={getPartyFullName(pcWinner.party)}
                    >
                      {pcWinner.party}
                    </div>
                  </div>
                  <div className="winner-stats-compact">
                    <div className="stat-compact">
                      <Vote size={12} />
                      <span>{formatNumber(pcWinner.votes)}</span>
                    </div>
                    <div className="stat-compact highlight">
                      <TrendingUp size={12} />
                      <span>{pcWinner.voteShare.toFixed(1)}%</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Parliament stats */}
              <div className="stats-inline">
                <div className="stat-inline highlight">
                  <span className="label">PC</span>
                  <span className="value">{currentPCContribution.pcName}</span>
                </div>
                <div className="stat-inline">
                  <Vote size={12} />
                  <span className="label">Votes</span>
                  <span className="value">{formatNumber(currentPCContribution.validVotes)}</span>
                </div>
                {pcContributionShareUrl && (
                  <button
                    className="stat-inline share-pc-btn"
                    onClick={handleCopyPCLink}
                    title="Copy PC URL"
                  >
                    <Share2 size={12} />
                    <span className="label">{copied ? 'Copied!' : 'Share'}</span>
                  </button>
                )}
              </div>

              {/* Parliament candidates preview */}
              <div className="candidates-preview">
                <h4>Parliament {currentPCContribution.year} - Top Candidates</h4>
                {currentPCContribution.candidates.slice(0, 3).map((c, idx) => (
                  <div key={idx} className={`candidate-row-compact ${idx === 0 ? 'winner' : ''}`}>
                    <span className="pos">{c.position}</span>
                    <span className="name">{c.name}</span>
                    <span
                      className="party"
                      style={{ backgroundColor: getPartyColor(c.party), color: 'white' }}
                    >
                      {c.party}
                    </span>
                    <span className="votes">{formatNumber(c.votes)}</span>
                    <span className="share">{c.voteShare.toFixed(1)}%</span>
                    <div
                      className="bar"
                      style={{
                        width: `${Math.min(c.voteShare, 100)}%`,
                        backgroundColor: getPartyColor(c.party),
                      }}
                    />
                  </div>
                ))}
                {currentPCContribution.candidates.length > 3 && (
                  <button className="view-all-btn" onClick={() => setActiveTab('candidates')}>
                    View all {currentPCContribution.candidates.length} candidates →
                  </button>
                )}
              </div>
            </>
          ) : activeTab === 'booths' ? (
            /* Booth-wise view (Parliament year) */
            <BoothWiseView
              boothResults={boothResults}
              boothsWithResults={boothsWithResults}
              selectedBoothId={selectedBoothId}
              onBoothSelect={setSelectedBoothId}
              selectedBooth={selectedBooth}
            />
          ) : (
            /* Parliament full candidates list */
            <div className="candidates-full">
              <div className="candidates-table-full">
                <div className="candidates-header">
                  <span className="col-pos">#</span>
                  <span className="col-name">Candidate</span>
                  <span className="col-party">Party</span>
                  <span className="col-votes">Votes</span>
                  <span className="col-share">%</span>
                </div>
                <div className="candidates-scroll">
                  {currentPCContribution.candidates.map((c, idx) => (
                    <div
                      key={idx}
                      className={`candidate-row ${idx === 0 ? 'winner' : ''} ${idx === 1 ? 'runner-up' : ''}`}
                    >
                      <span className="col-pos">{c.position}</span>
                      <span className="col-name" title={c.name}>
                        {c.name}
                      </span>
                      <span
                        className="col-party"
                        title={c.party}
                        style={{
                          backgroundColor: `${getPartyColor(c.party)}20`,
                          color: getPartyColor(c.party),
                          borderColor: getPartyColor(c.party),
                        }}
                      >
                        {c.party}
                      </span>
                      <span className="col-votes">{formatNumber(c.votes)}</span>
                      <span className="col-share">{c.voteShare.toFixed(1)}%</span>
                      <div
                        className="vote-bar"
                        style={{
                          width: `${Math.min(c.voteShare, 100)}%`,
                          backgroundColor: getPartyColor(c.party),
                        }}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )
        ) : activeTab === 'overview' ? (
          <>
            {/* Compact Winner card */}
            {winner && (
              <div
                className="winner-card-compact"
                style={{ borderColor: getPartyColor(winner.party) }}
              >
                <div className="winner-main">
                  <div className="winner-badge-small">
                    <Award size={14} />
                    Winner
                  </div>
                  <div className="winner-name">{winner.name}</div>
                  <div
                    className="winner-party"
                    style={{ backgroundColor: getPartyColor(winner.party) }}
                    title={getPartyFullName(winner.party)}
                  >
                    {winner.party}
                  </div>
                </div>
                <div className="winner-stats-compact">
                  <div className="stat-compact">
                    <Vote size={12} />
                    <span>{formatNumber(winner.votes)}</span>
                  </div>
                  <div className="stat-compact highlight">
                    <TrendingUp size={12} />
                    <span>{winner.voteShare.toFixed(1)}%</span>
                  </div>
                  {winner.margin && (
                    <div className="stat-compact margin">
                      <span>+{formatNumber(winner.margin)}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Inline stats */}
            <div className="stats-inline">
              <div className="stat-inline">
                <Users size={12} />
                <span className="label">Voters</span>
                <span className="value">
                  {result.electors > 0 ? formatNumber(result.electors) : '—'}
                </span>
              </div>
              <div className="stat-inline">
                <Vote size={12} />
                <span className="label">Polled</span>
                <span className="value">{formatNumber(result.validVotes)}</span>
              </div>
              <div className="stat-inline highlight">
                <span className="label">Turnout</span>
                <span className="value">
                  {result.turnout > 0 ? `${result.turnout.toFixed(1)}%` : '—'}
                </span>
              </div>
            </div>

            {/* Top 3 candidates preview */}
            <div className="candidates-preview">
              <h4>Top Candidates</h4>
              {result.candidates.slice(0, 3).map((candidate, idx) => (
                <CandidateRowCompact key={idx} candidate={candidate} isWinner={idx === 0} />
              ))}
              {result.candidates.length > 3 && (
                <button className="view-all-btn" onClick={() => setActiveTab('candidates')}>
                  View all {result.candidates.length} candidates →
                </button>
              )}
            </div>
          </>
        ) : activeTab === 'candidates' ? (
          /* Full candidates list */
          <div className="candidates-full">
            <div className="candidates-table-full">
              <div className="candidates-header">
                <span className="col-pos">#</span>
                <span className="col-name">Candidate</span>
                <span className="col-party">Party</span>
                <span className="col-votes">Votes</span>
                <span className="col-share">%</span>
              </div>
              <div className="candidates-scroll">
                {result.candidates.map((candidate, idx) => (
                  <CandidateRow
                    key={idx}
                    candidate={candidate}
                    isWinner={idx === 0}
                    isRunnerUp={idx === 1}
                  />
                ))}
              </div>
            </div>
          </div>
        ) : (
          /* Booth-wise view */
          <BoothWiseView
            boothResults={boothResults}
            boothsWithResults={boothsWithResults}
            selectedBoothId={selectedBoothId}
            onBoothSelect={setSelectedBoothId}
            selectedBooth={selectedBooth}
          />
        )}
      </div>

      {/* Footer */}
      <div className="share-bar">
        <div className="share-bar-info">
          <span className="district-label">District:</span>
          <span className="district-name">{result.districtName}</span>
        </div>
        <div className="share-bar-actions">
          <button className="share-bar-btn share-copy" onClick={handleCopyLink} title="Copy link">
            {copied ? <Check size={14} /> : <Link2 size={14} />}
            <span>{copied ? 'Copied!' : 'Copy'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

// Memoized candidate row for lists - prevents re-render when panel state changes
const CandidateRowCompact = memo(function CandidateRowCompact({
  candidate,
  isWinner,
}: {
  candidate: ElectionCandidate;
  isWinner: boolean;
}): JSX.Element {
  const partyColor = getPartyColor(candidate.party);

  return (
    <div className={`candidate-row-compact ${isWinner ? 'winner' : ''}`}>
      <span className="pos">{candidate.position}</span>
      <span className="name">{candidate.name}</span>
      <span
        className="party"
        style={{ backgroundColor: partyColor, color: 'white' }}
        title={getPartyFullName(candidate.party)}
      >
        {candidate.party}
      </span>
      <span className="votes">{formatNumber(candidate.votes)}</span>
      <span className="share">{candidate.voteShare.toFixed(1)}%</span>
      <div
        className="bar"
        style={{ width: `${Math.min(candidate.voteShare, 100)}%`, backgroundColor: partyColor }}
      />
    </div>
  );
});

// Memoized full candidate row - expensive due to complex styling
const CandidateRow = memo(function CandidateRow({
  candidate,
  isWinner,
  isRunnerUp,
}: {
  candidate: ElectionCandidate;
  isWinner: boolean;
  isRunnerUp: boolean;
}): JSX.Element {
  const partyColor = getPartyColor(candidate.party);

  return (
    <div className={`candidate-row ${isWinner ? 'winner' : ''} ${isRunnerUp ? 'runner-up' : ''}`}>
      <span className="col-pos">{candidate.position}</span>
      <span className="col-name" title={candidate.name}>
        {candidate.name}
        {candidate.sex && <span className="sex-badge">{candidate.sex}</span>}
      </span>
      <span
        className="col-party"
        title={getPartyFullName(candidate.party)}
        style={{
          backgroundColor: `${partyColor}20`,
          color: partyColor,
          borderColor: partyColor,
        }}
      >
        {candidate.party}
      </span>
      <span className="col-votes">{formatNumber(candidate.votes)}</span>
      <span className="col-share">{candidate.voteShare.toFixed(1)}%</span>
      <div
        className="vote-bar"
        style={{
          width: `${Math.min(candidate.voteShare, 100)}%`,
          backgroundColor: partyColor,
        }}
      />
    </div>
  );
});

// Booth-wise view component
interface BoothWiseViewProps {
  boothResults: BoothResults | null | undefined;
  boothsWithResults: BoothWithResult[];
  selectedBoothId: string | null;
  onBoothSelect: (boothId: string | null) => void;
  selectedBooth: BoothWithResult | null;
}

function BoothWiseView({
  boothResults,
  boothsWithResults,
  selectedBoothId,
  onBoothSelect,
  selectedBooth,
}: BoothWiseViewProps): JSX.Element {
  return (
    <div className="booth-wise-view">
      {/* Booth selector dropdown */}
      <div className="booth-selector">
        <label>Select Booth:</label>
        <div className="booth-dropdown-wrapper">
          <select
            value={selectedBoothId ?? ''}
            onChange={(e) => onBoothSelect(e.target.value || null)}
            className="booth-dropdown"
          >
            <option value="">-- Select a booth --</option>
            {boothsWithResults.map((booth) => (
              <option key={booth.id} value={booth.id}>
                {booth.boothNo} - {booth.name.slice(0, 40)}
                {booth.name.length > 40 ? '...' : ''}
                {booth.type === 'women' ? ' 👩' : ''}
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
            <h4>
              Booth {selectedBooth.boothNo}
              {selectedBooth.type === 'women' && <span className="women-badge">👩 Women</span>}
            </h4>
          </div>

          <div className="booth-address">
            <MapPin size={14} />
            <div>
              <div className="address-name">{selectedBooth.name}</div>
              <div className="address-area">{selectedBooth.address}</div>
              <div className="address-locality">{selectedBooth.area}</div>
            </div>
          </div>

          {selectedBooth.result && boothResults && (
            <>
              <div className="booth-vote-summary">
                <div className="vote-stat">
                  <span className="label">Total Votes</span>
                  <span className="value">{formatNumber(selectedBooth.result.total)}</span>
                </div>
                {selectedBooth.result.rejected > 0 && (
                  <div className="vote-stat">
                    <span className="label">Rejected</span>
                    <span className="value">{selectedBooth.result.rejected}</span>
                  </div>
                )}
                {selectedBooth.winner && (
                  <div className="vote-stat winner">
                    <span className="label">Winner</span>
                    <span
                      className="value party-badge"
                      style={{ backgroundColor: getPartyColor(selectedBooth.winner.party) }}
                    >
                      {selectedBooth.winner.party} ({selectedBooth.winner.percent.toFixed(1)}%)
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
                    .map(({ candidate, votes }) => {
                      const percent = selectedBooth.result
                        ? (votes / selectedBooth.result.total) * 100
                        : 0;
                      const partyColor = getPartyColor(candidate.party);
                      const isWinner = selectedBooth.winner?.party === candidate.party;

                      return (
                        <div
                          key={candidate.slNo}
                          className={`booth-candidate-row ${isWinner ? 'winner' : ''}`}
                        >
                          <div className="candidate-info">
                            <span className="party-tag" style={{ backgroundColor: partyColor }}>
                              {candidate.party}
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
          )}
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
