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
  Lightbulb,
  Target,
  Zap,
  TrendingDown,
  AlertTriangle,
  Mail,
} from 'lucide-react';
import { useState, useCallback, memo, useMemo, useEffect } from 'react';
import type { ACElectionResult, ElectionCandidate } from '../types';
import { getPartyColor, getPartyFullName } from '../utils/partyData';
import { trackShare } from '../utils/firebase';
import type { BoothResults, BoothWithResult, PostalData } from '../hooks/useBoothData';

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

type TabType = 'overview' | 'candidates' | 'booths' | 'postal' | 'analysis';

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

  // Reset to overview tab if booth data becomes unavailable while on booths/postal/analysis tab
  useEffect(() => {
    if (
      !hasBoothData &&
      (activeTab === 'booths' || activeTab === 'postal' || activeTab === 'analysis')
    ) {
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
        {hasBoothData && boothResults?.postal && (
          <button
            className={`panel-tab ${activeTab === 'postal' ? 'active' : ''}`}
            onClick={() => setActiveTab('postal')}
          >
            <Mail size={14} />
            Postal
          </button>
        )}
        {hasBoothData && (
          <button
            className={`panel-tab ${activeTab === 'analysis' ? 'active' : ''}`}
            onClick={() => setActiveTab('analysis')}
          >
            <Lightbulb size={14} />
            Analysis
          </button>
        )}
      </div>

      {/* Tab content */}
      <div className="panel-tab-content">
        {selectedPCYear && currentPCContribution ? (
          /* Parliament view */
          activeTab === 'overview' ? (
            <div className="overview-view">
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
            </div>
          ) : activeTab === 'booths' ? (
            /* Booth-wise view (Parliament year) */
            <BoothWiseView
              boothResults={boothResults}
              boothsWithResults={boothsWithResults}
              selectedBoothId={selectedBoothId}
              onBoothSelect={setSelectedBoothId}
              selectedBooth={selectedBooth}
            />
          ) : activeTab === 'postal' && boothResults?.postal ? (
            /* Postal Ballots view (Parliament year) */
            <PostalBallotsView postal={boothResults.postal} />
          ) : activeTab === 'analysis' ? (
            /* Boothwise Analysis (Parliament year) */
            <BoothwiseAnalysis
              boothResults={boothResults}
              boothsWithResults={boothsWithResults}
              onBoothClick={(boothId) => {
                setSelectedBoothId(boothId);
                setActiveTab('booths');
              }}
              officialWinner={result.candidates[0]?.party}
            />
          ) : (
            /* Parliament full candidates list */
            <div className="candidates-view">
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
          <div className="overview-view">
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
          </div>
        ) : activeTab === 'candidates' ? (
          /* Full candidates list */
          <div className="candidates-view">
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
        ) : activeTab === 'postal' && boothResults?.postal ? (
          /* Postal Ballots view */
          <PostalBallotsView postal={boothResults.postal} />
        ) : activeTab === 'analysis' ? (
          /* Boothwise Analysis */
          <BoothwiseAnalysis
            boothResults={boothResults}
            boothsWithResults={boothsWithResults}
            onBoothClick={(boothId) => {
              setSelectedBoothId(boothId);
              setActiveTab('booths');
            }}
            officialWinner={result.candidates[0]?.party}
          />
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

// Postal Ballots view component
interface PostalBallotsViewProps {
  postal: PostalData;
}

function PostalBallotsView({ postal }: PostalBallotsViewProps): JSX.Element {
  // Sort postal candidates by postal votes descending
  const sortedCandidates = useMemo(() => {
    return [...postal.candidates].sort((a, b) => b.postal - a.postal);
  }, [postal.candidates]);

  const totalPostal = useMemo(() => {
    return postal.candidates.reduce((sum, c) => sum + c.postal, 0);
  }, [postal.candidates]);

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
            <span className="stat-label">Total Postal Votes</span>
          </div>
          <div className="postal-stat">
            <span className="stat-value">
              {totalPostal > 0 && postal.candidates[0]
                ? (postal.candidates.reduce((sum, c) => sum + c.total, 0) > 0
                    ? (totalPostal / postal.candidates.reduce((sum, c) => sum + c.total, 0)) * 100
                    : 0
                  ).toFixed(1)
                : '0'}
              %
            </span>
            <span className="stat-label">of Total Votes</span>
          </div>
          {postal.nota > 0 && (
            <div className="postal-stat">
              <span className="stat-value">{formatNumber(postal.nota)}</span>
              <span className="stat-label">NOTA (Postal)</span>
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
            const postalPercent =
              candidate.total > 0 ? (candidate.postal / candidate.total) * 100 : 0;

            return (
              <div
                key={`${candidate.name}-${candidate.party}`}
                className={`postal-candidate-row ${idx === 0 ? 'winner' : ''}`}
              >
                <span className="col-rank">{idx + 1}</span>
                <span
                  className="col-party"
                  style={{ backgroundColor: getPartyColor(candidate.party) }}
                  title={`${candidate.name} (${getPartyFullName(candidate.party)})`}
                >
                  {candidate.party}
                </span>
                <span className="col-postal">
                  {formatNumber(candidate.postal)}
                  <small className="postal-pct">({postalPercent.toFixed(1)}%)</small>
                </span>
                <span className="col-booth">{formatNumber(candidate.booth)}</span>
                <span className="col-total">{formatNumber(candidate.total)}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Note about postal ballots */}
      <div className="postal-note">
        <AlertTriangle size={14} />
        <span>
          Postal ballots include votes from government employees, military personnel, and voters
          unable to reach polling stations. Postal = Official Total - Booth Total.
        </span>
      </div>
    </div>
  );
}

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
                      const percent = selectedBooth.result?.total
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

// Boothwise Analysis component - provides detailed insights on election results
interface BoothwiseAnalysisProps {
  boothResults: BoothResults | null | undefined;
  boothsWithResults: BoothWithResult[];
  onBoothClick?: (boothId: string) => void;
  officialWinner?: string | undefined; // Official winner party from election results
}

interface LinkedBooth {
  id: string;
  name: string;
  detail?: string;
}

interface AnalysisInsight {
  type: 'strength' | 'weakness' | 'opportunity' | 'insight';
  title: string;
  description: string;
  value?: string;
  icon: 'target' | 'zap' | 'trending-down' | 'alert' | 'award';
  linkedBooths?: LinkedBooth[];
}

// Component to render a single insight card with expand/collapse for many booths
function InsightCard({
  insight,
  onBoothClick,
  getInsightIcon,
}: {
  insight: AnalysisInsight;
  onBoothClick: ((boothId: string) => void) | undefined;
  getInsightIcon: (icon: AnalysisInsight['icon']) => JSX.Element;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const COLLAPSED_LIMIT = 6;
  const hasMany = (insight.linkedBooths?.length ?? 0) > COLLAPSED_LIMIT;
  const displayedBooths = isExpanded
    ? insight.linkedBooths
    : insight.linkedBooths?.slice(0, COLLAPSED_LIMIT);

  return (
    <div className={`insight-card ${insight.type}`}>
      <div
        className="insight-icon"
        style={{
          backgroundColor:
            insight.type === 'strength'
              ? '#10b98120'
              : insight.type === 'weakness'
                ? '#ef444420'
                : insight.type === 'opportunity'
                  ? '#f59e0b20'
                  : '#6366f120',
        }}
      >
        {getInsightIcon(insight.icon)}
      </div>
      <div className="insight-content">
        <div className="insight-header">
          <span className="insight-title">{insight.title}</span>
          {insight.value && <span className="insight-value">{insight.value}</span>}
        </div>
        <p className="insight-description">{insight.description}</p>
        {displayedBooths && displayedBooths.length > 0 && (
          <div className="insight-booths">
            {displayedBooths.map((booth) => (
              <button
                key={booth.id}
                className="booth-link"
                onClick={() => onBoothClick?.(booth.id)}
                title={`View Booth ${booth.name}`}
              >
                <MapPin size={10} />
                <span className="booth-link-name">{booth.name}</span>
                {booth.detail && <span className="booth-link-detail">{booth.detail}</span>}
              </button>
            ))}
            {hasMany && (
              <button className="expand-collapse-btn" onClick={() => setIsExpanded(!isExpanded)}>
                {isExpanded
                  ? 'Show less'
                  : `+${(insight.linkedBooths?.length ?? 0) - COLLAPSED_LIMIT} more`}
                <ChevronDown size={12} className={isExpanded ? 'rotate-180' : ''} />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function BoothwiseAnalysis({
  boothResults,
  boothsWithResults,
  onBoothClick,
  officialWinner,
}: BoothwiseAnalysisProps): JSX.Element {
  const analysis = useMemo(() => {
    if (!boothResults || boothsWithResults.length === 0) {
      return null;
    }

    const candidates = boothResults.candidates;
    const boothsWithData = boothsWithResults.filter((b) => b.result && b.winner);

    // Calculate booth wins for each party
    const partyBoothWins: Record<string, number> = {};
    const partyTotalVotes: Record<string, number> = {};
    const partyMargins: Record<string, number[]> = {};

    // Women's booth analysis
    const womenBooths = boothsWithResults.filter((b) => b.type === 'women');
    const regularBooths = boothsWithResults.filter((b) => b.type === 'regular');

    // Margin analysis
    const closeContests: BoothWithResult[] = []; // margin < 50 votes
    const landslides: BoothWithResult[] = []; // winner > 60%

    // NEW: Outlier detection
    const oneSidedBooths: Array<{ booth: BoothWithResult; party: string; percent: number }> = []; // >80% vote share
    const highNotaBooths: Array<{
      booth: BoothWithResult;
      notaVotes: number;
      notaPercent: number;
    }> = [];
    const zeroVoteInstances: Array<{ booth: BoothWithResult; party: string }> = [];

    // Area-wise analysis
    const areaWins: Record<string, Record<string, number>> = {};

    // Find NOTA index
    const notaIndex = candidates.findIndex((c) => c.party === 'NOTA' || c.name === 'NOTA');

    // Process each booth
    for (const booth of boothsWithResults) {
      if (!booth.result || !booth.winner) continue;

      const winnerParty = booth.winner.party;
      partyBoothWins[winnerParty] = (partyBoothWins[winnerParty] || 0) + 1;

      // Calculate margin for this booth
      const sortedVotes = [...booth.result.votes].sort((a, b) => b - a);
      const margin = (sortedVotes[0] ?? 0) - (sortedVotes[1] ?? 0);

      if (!partyMargins[winnerParty]) partyMargins[winnerParty] = [];
      partyMargins[winnerParty].push(margin);

      // Close contests (margin < 50 votes)
      if (margin < 50) {
        closeContests.push(booth);
      }

      // Landslides (winner > 60%)
      if (booth.winner.percent > 60) {
        landslides.push(booth);
      }

      // NEW: One-sided booths (>80% vote share) - extreme strongholds
      if (booth.winner.percent > 80) {
        oneSidedBooths.push({ booth, party: winnerParty, percent: booth.winner.percent });
      }

      // NEW: High NOTA detection (>2% or >50 votes)
      if (notaIndex >= 0) {
        const notaVotes = booth.result.votes[notaIndex] ?? 0;
        const boothTotal = booth.result.total || 1; // Avoid division by zero
        const notaPercent = (notaVotes / boothTotal) * 100;
        if (notaPercent > 2 || notaVotes > 50) {
          highNotaBooths.push({ booth, notaVotes, notaPercent });
        }
      }

      // Zero vote detection - will be processed after we know top parties

      // Area-wise tracking
      const area = booth.area || 'Unknown';
      if (!areaWins[area]) areaWins[area] = {};
      areaWins[area][winnerParty] = (areaWins[area][winnerParty] || 0) + 1;

      // Total votes by party
      candidates.forEach((c, idx) => {
        const votes = booth.result?.votes[idx] || 0;
        partyTotalVotes[c.party] = (partyTotalVotes[c.party] || 0) + votes;
      });
    }

    // Sort parties by booth wins
    const sortedParties = Object.entries(partyBoothWins).sort((a, b) => b[1] - a[1]);

    // Use official winner if provided, otherwise fall back to booth wins leader
    const winnerParty = officialWinner || sortedParties[0]?.[0] || '';
    const winnerBoothCount = partyBoothWins[winnerParty] || 0;

    // Runner-up is the party with most booth wins that isn't the winner
    const runnerUpEntry = sortedParties.find(([party]) => party !== winnerParty);
    const runnerUpParty = runnerUpEntry?.[0] || '';
    const runnerUpBoothCount = runnerUpEntry?.[1] || 0;

    // NEW: Calculate Strike Rate for top parties (% of booths won)
    const totalBoothCount = boothsWithData.length || 1; // Avoid division by zero
    const strikeRates = sortedParties.slice(0, 5).map(([party, wins]) => ({
      party,
      wins,
      strikeRate: ((wins / totalBoothCount) * 100).toFixed(1),
      totalVotes: partyTotalVotes[party] || 0,
    }));

    // Calculate total votes to determine vote share
    const grandTotalVotes = Object.values(partyTotalVotes).reduce((a, b) => a + b, 0) || 1; // Avoid division by zero

    // Determine which parties to track for zero votes: top 2 + 3rd if >10%
    const partiesToTrackZero = new Set<string>();
    if (winnerParty) partiesToTrackZero.add(winnerParty);
    if (runnerUpParty) partiesToTrackZero.add(runnerUpParty);

    // Check 3rd party if >10% vote share
    const thirdParty = sortedParties[2];
    if (thirdParty) {
      const thirdPartyVoteShare = ((partyTotalVotes[thirdParty[0]] || 0) / grandTotalVotes) * 100;
      if (thirdPartyVoteShare > 10) {
        partiesToTrackZero.add(thirdParty[0]);
      }
    }

    // Now detect zero votes for these parties
    for (const booth of boothsWithData) {
      if (!booth.result) continue;

      candidates.forEach((c, idx) => {
        if (partiesToTrackZero.has(c.party)) {
          const votes = booth.result?.votes[idx] ?? 0;
          if (votes === 0) {
            zeroVoteInstances.push({ booth, party: c.party });
          }
        }
      });
    }

    // Women's booth performance
    const womenBoothWins: Record<string, number> = {};
    for (const booth of womenBooths) {
      if (booth.winner) {
        womenBoothWins[booth.winner.party] = (womenBoothWins[booth.winner.party] || 0) + 1;
      }
    }

    // Calculate average margins
    const avgMargins: Record<string, number> = {};
    for (const [party, margins] of Object.entries(partyMargins)) {
      avgMargins[party] = Math.round(margins.reduce((a, b) => a + b, 0) / (margins.length || 1));
    }

    // Find strongest and weakest areas for winner
    const areaPerformance = Object.entries(areaWins)
      .map(([area, wins]) => {
        const totalAreaBooths = Object.values(wins).reduce((a, b) => a + b, 0) || 1;
        return {
          area,
          winnerWins: wins[winnerParty] || 0,
          totalBooths: totalAreaBooths,
          winPercent: ((wins[winnerParty] || 0) / totalAreaBooths) * 100,
        };
      })
      .filter((a) => a.totalBooths >= 3); // Only areas with 3+ booths

    const strongestAreas = areaPerformance
      .filter((a) => a.winPercent >= 70)
      .sort((a, b) => b.winPercent - a.winPercent);
    const weakestAreas = areaPerformance
      .filter((a) => a.winPercent <= 30)
      .sort((a, b) => a.winPercent - b.winPercent);

    // Generate insights
    const insights: AnalysisInsight[] = [];

    // Key victory insight with Strike Rate
    const winnerStrikeRate = ((winnerBoothCount / totalBoothCount) * 100).toFixed(1);
    const winnerBooths = boothsWithData
      .filter((b) => b.winner?.party === winnerParty)
      .sort((a, b) => (b.winner?.percent ?? 0) - (a.winner?.percent ?? 0));

    insights.push({
      type: 'strength',
      title: 'Booth Strike Rate',
      description: `${winnerParty} won ${winnerBoothCount} of ${boothsWithData.length} booths — ${winnerStrikeRate}% strike rate. ${parseFloat(winnerStrikeRate) > 70 ? 'Overwhelming dominance.' : parseFloat(winnerStrikeRate) > 50 ? 'Consistent performance.' : 'Targeted strongholds.'}`,
      value: `${winnerStrikeRate}%`,
      icon: 'award',
      linkedBooths: winnerBooths.map((b) => ({
        id: b.id,
        name: b.boothNo,
        detail: `${b.winner?.percent.toFixed(0)}%`,
      })),
    });

    // Margin analysis - calculate margins for all booths won by winner
    const winnerBoothsWithMargin = boothsWithData
      .filter((b) => b.winner?.party === winnerParty)
      .map((b) => {
        const sorted = [...(b.result?.votes || [])].sort((x, y) => y - x);
        const margin = (sorted[0] ?? 0) - (sorted[1] ?? 0);
        return { booth: b, margin };
      })
      .sort((a, b) => b.margin - a.margin);

    if (avgMargins[winnerParty]) {
      insights.push({
        type: 'insight',
        title: 'Average Victory Margin',
        description: `Avg margin: ${formatNumber(avgMargins[winnerParty])} votes/booth. ${avgMargins[winnerParty] > 150 ? 'Comfortable cushion — difficult to overturn.' : avgMargins[winnerParty] > 75 ? 'Moderate margins — some vulnerable.' : 'Razor-thin — many could flip.'}`,
        value: `${formatNumber(avgMargins[winnerParty])} votes`,
        icon: 'target',
        linkedBooths: winnerBoothsWithMargin.slice(0, 20).map((item) => ({
          id: item.booth.id,
          name: item.booth.boothNo,
          detail: `+${formatNumber(item.margin)}`,
        })),
      });
    }

    // NEW: One-sided booths (extreme strongholds >80%)
    if (oneSidedBooths.length > 0) {
      const winnerOneSided = oneSidedBooths.filter((b) => b.party === winnerParty);
      const oppositionOneSided = oneSidedBooths.filter((b) => b.party !== winnerParty);

      if (winnerOneSided.length > 0) {
        insights.push({
          type: 'strength',
          title: 'Extreme Strongholds',
          description: `${winnerOneSided.length} booths with >80% vote share — fortress areas with near-total support.`,
          value: `${winnerOneSided.length} booths`,
          icon: 'zap',
          linkedBooths: winnerOneSided.map((b) => ({
            id: b.booth.id,
            name: b.booth.boothNo,
            detail: `${b.percent.toFixed(1)}%`,
          })),
        });
      }

      if (oppositionOneSided.length > 0) {
        const sortedOpposition = oppositionOneSided.sort((a, b) => b.percent - a.percent);
        insights.push({
          type: 'weakness',
          title: 'Opposition Fortresses',
          description: `${oppositionOneSided.length} booths where opposition has >80% — virtually impenetrable areas.`,
          value: `${oppositionOneSided.length} booths`,
          icon: 'alert',
          linkedBooths: sortedOpposition.map((b) => ({
            id: b.booth.id,
            name: b.booth.boothNo,
            detail: `${b.party} ${b.percent.toFixed(1)}%`,
          })),
        });
      }
    }

    // Landslide booths (>60%)
    if (landslides.length > 0) {
      const winnerLandslides = landslides
        .filter((b) => b.winner?.party === winnerParty)
        .sort((a, b) => (b.winner?.percent ?? 0) - (a.winner?.percent ?? 0));
      if (winnerLandslides.length > 0) {
        insights.push({
          type: 'strength',
          title: 'Landslide Victories',
          description: `Secured ${winnerLandslides.length} booths with >60% vote share (${((winnerLandslides.length / totalBoothCount) * 100).toFixed(1)}% of total). Strong base that can absorb swings.`,
          value: `${winnerLandslides.length} booths`,
          icon: 'zap',
          linkedBooths: winnerLandslides.map((b) => ({
            id: b.id,
            name: b.boothNo,
            detail: `${b.winner?.percent.toFixed(1)}%`,
          })),
        });
      }
    }

    // NEW: High NOTA analysis
    if (highNotaBooths.length > 0) {
      const totalNotaVotes = highNotaBooths.reduce((sum, b) => sum + b.notaVotes, 0);
      const sortedNotaBooths = highNotaBooths.sort((a, b) => b.notaVotes - a.notaVotes);
      insights.push({
        type: 'insight',
        title: 'High NOTA Booths',
        description: `${highNotaBooths.length} booths with high NOTA (>2% or >50 votes). Total: ${formatNumber(totalNotaVotes)} protest votes — signals voter dissatisfaction.`,
        value: `${highNotaBooths.length} booths`,
        icon: 'alert',
        linkedBooths: sortedNotaBooths.map((b) => ({
          id: b.booth.id,
          name: b.booth.boothNo,
          detail: `${b.notaVotes} NOTA (${b.notaPercent.toFixed(1)}%)`,
        })),
      });
    }

    // Zero vote detection for top parties
    if (zeroVoteInstances.length > 0) {
      // Group by party
      const partyZeroBooths: Record<string, BoothWithResult[]> = {};
      zeroVoteInstances.forEach((z) => {
        const existing = partyZeroBooths[z.party] ?? [];
        existing.push(z.booth);
        partyZeroBooths[z.party] = existing;
      });

      // Create insights for each party with zero votes (min 1 booth)
      const partiesWithZero = Object.entries(partyZeroBooths)
        .filter(([_, booths]) => booths.length >= 1)
        .sort((a, b) => b[1].length - a[1].length);

      if (partiesWithZero.length > 0) {
        // Combine all into one insight with all booths
        const totalZeroBooths = partiesWithZero.reduce(
          (sum, [_, booths]) => sum + booths.length,
          0
        );
        const description = partiesWithZero
          .map(([party, booths]) => `${party}: ${booths.length}`)
          .join(', ');

        // Combine all linked booths
        const allLinkedBooths = partiesWithZero.flatMap(([party, booths]) =>
          booths.map((b) => ({
            id: b.id,
            name: b.boothNo,
            detail: `${party}=0`,
          }))
        );

        insights.push({
          type: 'insight',
          title: 'Organizational Gaps',
          description: `Zero votes in ${totalZeroBooths} booth instances (${description}). Complete absence of ground presence.`,
          value: `${totalZeroBooths} gaps`,
          icon: 'trending-down',
          linkedBooths: allLinkedBooths,
        });
      }
    }

    // Women's booth insight
    if (womenBooths.length > 0) {
      const winnerWomenWins = womenBoothWins[winnerParty] || 0;
      const womenWinPercent = (winnerWomenWins / womenBooths.length) * 100;
      const regularWinPercent =
        regularBooths.length > 0
          ? (((partyBoothWins[winnerParty] ?? 0) - winnerWomenWins) / regularBooths.length) * 100
          : 0;

      const diff = womenWinPercent - regularWinPercent;
      // Get women's booths with results, sorted by winner's vote share
      const womenBoothsWithResults = womenBooths
        .filter((b) => b.result && b.winner)
        .sort((a, b) => (b.winner?.percent ?? 0) - (a.winner?.percent ?? 0));

      insights.push({
        type: diff > 5 ? 'strength' : diff < -5 ? 'weakness' : 'insight',
        title: 'Women Voter Analysis',
        description:
          diff > 5
            ? `Won ${womenWinPercent.toFixed(0)}% of women's booths vs ${regularWinPercent.toFixed(0)}% regular. Women voters favored ${winnerParty}.`
            : diff < -5
              ? `Only ${womenWinPercent.toFixed(0)}% of women's booths vs ${regularWinPercent.toFixed(0)}% regular. Gender gap is a vulnerability.`
              : `Similar: ${womenWinPercent.toFixed(0)}% women's booths, ${regularWinPercent.toFixed(0)}% regular. No gender-based pattern.`,
        value: `${womenWinPercent.toFixed(0)}%`,
        icon: diff > 5 ? 'zap' : diff < -5 ? 'trending-down' : 'target',
        linkedBooths: womenBoothsWithResults.map((b) => ({
          id: b.id,
          name: `${b.boothNo} 👩`,
          detail: `${b.winner?.party} ${b.winner?.percent.toFixed(0)}%`,
        })),
      });
    }

    // Close contests - battleground booths
    if (closeContests.length > 0) {
      const lostCloseContests = closeContests.filter((b) => b.winner?.party !== winnerParty);
      const wonCloseContests = closeContests.filter((b) => b.winner?.party === winnerParty);

      if (lostCloseContests.length > 0 || wonCloseContests.length > 0) {
        const totalMarginLost = lostCloseContests.reduce((sum, b) => {
          const sorted = [...(b.result?.votes || [])].sort((a, b) => b - a);
          return sum + ((sorted[0] ?? 0) - (sorted[1] ?? 0));
        }, 0);

        // Combine and sort by margin (closest first)
        const allCloseContests = closeContests
          .map((b) => {
            const sorted = [...(b.result?.votes || [])].sort((x, y) => y - x);
            const margin = (sorted[0] ?? 0) - (sorted[1] ?? 0);
            return { booth: b, margin, won: b.winner?.party === winnerParty };
          })
          .sort((a, b) => a.margin - b.margin);

        insights.push({
          type: 'opportunity',
          title: 'Battleground Booths',
          description: `${closeContests.length} booths decided by <50 votes. Lost ${lostCloseContests.length} (deficit: ${formatNumber(totalMarginLost)}), won ${wonCloseContests.length}. Micro-battlegrounds where every vote counts.`,
          value: `${closeContests.length} booths`,
          icon: 'alert',
          linkedBooths: allCloseContests.map((c) => ({
            id: c.booth.id,
            name: c.booth.boothNo,
            detail: `${c.won ? '✓' : '✗'} by ${c.margin}`,
          })),
        });
      }
    }

    // Strongest areas
    if (strongestAreas.length > 0) {
      // Get booths from strongest areas
      const strongAreaNames = new Set(strongestAreas.map((a) => a.area));
      const strongAreaBooths = boothsWithData
        .filter((b) => strongAreaNames.has(b.area || '') && b.winner?.party === winnerParty)
        .sort((a, b) => (b.winner?.percent ?? 0) - (a.winner?.percent ?? 0));

      insights.push({
        type: 'strength',
        title: 'Core Strongholds',
        description: `Dominated ${strongestAreas
          .slice(0, 3)
          .map((a) => `${a.area} (${a.winPercent.toFixed(0)}%)`)
          .join(', ')}. Core support bases.`,
        value: `${strongestAreas.length} areas`,
        icon: 'target',
        linkedBooths: strongAreaBooths.map((b) => ({
          id: b.id,
          name: b.boothNo,
          detail: `${b.area?.slice(0, 8) ?? ''} ${b.winner?.percent.toFixed(0)}%`,
        })),
      });
    }

    // Weakest areas
    if (weakestAreas.length > 0) {
      // Get booths from weakest areas (lost to opposition)
      const weakAreaNames = new Set(weakestAreas.map((a) => a.area));
      const weakAreaBooths = boothsWithData
        .filter((b) => weakAreaNames.has(b.area || '') && b.winner?.party !== winnerParty)
        .sort((a, b) => (b.winner?.percent ?? 0) - (a.winner?.percent ?? 0));

      insights.push({
        type: 'weakness',
        title: 'Vulnerable Zones',
        description: `Weak in ${weakestAreas
          .slice(0, 3)
          .map((a) => `${a.area} (${a.winPercent.toFixed(0)}%)`)
          .join(', ')}. Opposition strongholds.`,
        value: `${weakestAreas.length} areas`,
        icon: 'trending-down',
        linkedBooths: weakAreaBooths.map((b) => ({
          id: b.id,
          name: b.boothNo,
          detail: `${b.winner?.party} ${b.winner?.percent.toFixed(0)}%`,
        })),
      });
    }

    // Competition analysis with strike rate comparison
    if (runnerUpParty) {
      const runnerUpStrikeRate = ((runnerUpBoothCount / totalBoothCount) * 100).toFixed(1);
      const competitionRatio = winnerBoothCount / (runnerUpBoothCount || 1);
      const runnerUpBooths = boothsWithData
        .filter((b) => b.winner?.party === runnerUpParty)
        .sort((a, b) => (b.winner?.percent ?? 0) - (a.winner?.percent ?? 0));

      // Special case: Runner-up won MORE booths than official winner (postal votes flipped result)
      if (runnerUpBoothCount > winnerBoothCount) {
        insights.push({
          type: 'opportunity',
          title: `${runnerUpParty} Booth Dominance`,
          description: `${runnerUpParty} won ${runnerUpBoothCount} booths vs ${winnerParty}'s ${winnerBoothCount} — but lost overall! Postal votes likely flipped the result. Strong grassroots presence but couldn't convert to victory.`,
          value: `${runnerUpBoothCount} booths`,
          icon: 'alert',
          linkedBooths: runnerUpBooths.map((b) => ({
            id: b.id,
            name: b.boothNo,
            detail: `${runnerUpParty} ${b.winner?.percent.toFixed(0)}%`,
          })),
        });
      } else {
        insights.push({
          type: 'insight',
          title: 'Competition Strike Rate',
          description: `${runnerUpParty}: ${runnerUpStrikeRate}% (${runnerUpBoothCount} booths). ${
            competitionRatio > 2
              ? `Distant second — no threat.`
              : competitionRatio > 1.3
                ? `Competitive but outpaced.`
                : `Neck-and-neck race.`
          }`,
          value: `${runnerUpStrikeRate}%`,
          icon: 'target',
          linkedBooths: runnerUpBooths.map((b) => ({
            id: b.id,
            name: b.boothNo,
            detail: `${runnerUpParty} ${b.winner?.percent.toFixed(0)}%`,
          })),
        });
      }
    }

    return {
      winnerParty,
      winnerBoothCount,
      runnerUpParty,
      runnerUpBoothCount,
      totalBooths: boothsWithData.length,
      partyBoothWins,
      avgMargins,
      insights,
      closeContests: closeContests.length,
      landslides: landslides.length,
      womenBooths: womenBooths.length,
      oneSidedBooths: oneSidedBooths.length,
      highNotaBooths: highNotaBooths.length,
      zeroVoteInstances: zeroVoteInstances.length,
      strongestAreas,
      weakestAreas,
      strikeRates,
    };
  }, [boothResults, boothsWithResults]);

  if (!analysis) {
    return (
      <div className="analysis-empty">
        <Lightbulb size={32} />
        <p>No booth data available for analysis</p>
      </div>
    );
  }

  const getInsightIcon = (icon: AnalysisInsight['icon']) => {
    switch (icon) {
      case 'target':
        return <Target size={18} />;
      case 'zap':
        return <Zap size={18} />;
      case 'trending-down':
        return <TrendingDown size={18} />;
      case 'alert':
        return <AlertTriangle size={18} />;
      case 'award':
        return <Award size={18} />;
    }
  };

  return (
    <div className="boothwise-analysis">
      {/* Summary Header */}
      <div className="analysis-header">
        <div className="analysis-title">
          <Lightbulb size={20} />
          <h4>Why {analysis.winnerParty} Won</h4>
        </div>
        <div className="analysis-summary-stats">
          <div className="summary-stat winner">
            <span
              className="party"
              style={{ backgroundColor: getPartyColor(analysis.winnerParty) }}
            >
              {analysis.winnerParty}
            </span>
            <span className="count">{analysis.winnerBoothCount} booths</span>
          </div>
          <span className="vs">vs</span>
          <div className="summary-stat">
            <span
              className="party"
              style={{ backgroundColor: getPartyColor(analysis.runnerUpParty) }}
            >
              {analysis.runnerUpParty}
            </span>
            <span className="count">{analysis.runnerUpBoothCount} booths</span>
          </div>
        </div>
      </div>

      {/* Booth Distribution Bar */}
      <div className="booth-distribution">
        <div className="distribution-label">Booth Distribution</div>
        <div className="distribution-bar">
          {Object.entries(analysis.partyBoothWins)
            .sort((a, b) => b[1] - a[1])
            .map(([party, count]) => (
              <div
                key={party}
                className="distribution-segment"
                style={{
                  width: `${(count / analysis.totalBooths) * 100}%`,
                  backgroundColor: getPartyColor(party),
                }}
                title={`${party}: ${count} booths (${((count / analysis.totalBooths) * 100).toFixed(1)}%)`}
              >
                {count > analysis.totalBooths * 0.1 && (
                  <span className="segment-label">{party}</span>
                )}
              </div>
            ))}
        </div>
        <div className="distribution-legend">
          {Object.entries(analysis.partyBoothWins)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 4)
            .map(([party, count]) => (
              <div key={party} className="legend-item">
                <span className="legend-color" style={{ backgroundColor: getPartyColor(party) }} />
                <span className="legend-party">{party}</span>
                <span className="legend-count">{count}</span>
              </div>
            ))}
        </div>
      </div>

      {/* Key Insights */}
      <div className="analysis-insights">
        <h5>Key Insights</h5>
        <div className="insights-list">
          {analysis.insights.map((insight, idx) => (
            <InsightCard
              key={idx}
              insight={insight}
              onBoothClick={onBoothClick}
              getInsightIcon={getInsightIcon}
            />
          ))}
        </div>
      </div>

      {/* Strike Rate Table */}
      <div className="strike-rate-table">
        <h5>Party Strike Rates</h5>
        <div className="strike-rate-list">
          {analysis.strikeRates.slice(0, 5).map((sr, idx) => (
            <div key={sr.party} className={`strike-rate-row ${idx === 0 ? 'winner' : ''}`}>
              <span className="sr-rank">{idx + 1}</span>
              <span className="sr-party" style={{ backgroundColor: getPartyColor(sr.party) }}>
                {sr.party}
              </span>
              <span className="sr-booths">{sr.wins} booths</span>
              <span className="sr-rate">{sr.strikeRate}%</span>
              <div className="sr-bar">
                <div
                  className="sr-bar-fill"
                  style={{
                    width: `${sr.strikeRate}%`,
                    backgroundColor: getPartyColor(sr.party),
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Quick Stats */}
      <div className="analysis-quick-stats">
        <div className="quick-stat">
          <span className="stat-number">{analysis.landslides}</span>
          <span className="stat-label">Landslides (&gt;60%)</span>
        </div>
        <div className="quick-stat">
          <span className="stat-number">{analysis.oneSidedBooths}</span>
          <span className="stat-label">One-Sided (&gt;80%)</span>
        </div>
        <div className="quick-stat">
          <span className="stat-number">{analysis.closeContests}</span>
          <span className="stat-label">Battlegrounds (&lt;50)</span>
        </div>
        <div className="quick-stat highlight-nota">
          <span className="stat-number">{analysis.highNotaBooths}</span>
          <span className="stat-label">High NOTA</span>
        </div>
        <div className="quick-stat">
          <span className="stat-number">{analysis.womenBooths}</span>
          <span className="stat-label">Women&apos;s Booths</span>
        </div>
        <div className="quick-stat highlight-zero">
          <span className="stat-number">{analysis.zeroVoteInstances}</span>
          <span className="stat-label">Zero Vote Cases</span>
        </div>
      </div>
    </div>
  );
}
