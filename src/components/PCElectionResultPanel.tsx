import { X, Award, TrendingUp, Vote, Link2, Check, Twitter, Users, BarChart3 } from 'lucide-react';
import { useState, useCallback } from 'react';
import type { PCElectionResult, PCElectionCandidate } from '../types';
import { getPartyColor, getPartyFullName } from '../utils/partyData';
import { trackShare } from '../utils/firebase';

function formatNumber(num: number): string {
  return num.toLocaleString('en-IN');
}

interface PCElectionResultPanelProps {
  result: PCElectionResult;
  onClose: () => void;
  availableYears?: number[] | undefined;
  selectedYear?: number | undefined;
  onYearChange?: ((year: number) => void) | undefined;
  shareUrl?: string | undefined;
  stateName?: string | undefined;
}

/** Remove diacritics from text (e.g., Tamil Nādu → Tamil Nadu) */
function normalizeText(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function generateShareText(result: PCElectionResult, stateName?: string): string {
  const winner = result.candidates[0];
  if (!winner) return '';

  const normalizedState = stateName ? normalizeText(stateName) : undefined;
  const location = normalizedState
    ? `${result.constituencyNameOriginal} (Parliament), ${normalizedState}`
    : `${result.constituencyNameOriginal} (Parliament)`;

  let text = `🗳️ ${location} | ${result.year}\n\n`;

  const topCandidates = result.candidates.slice(0, 3);
  const medals = ['🥇', '🥈', '🥉'];
  topCandidates.forEach((c, i) => {
    text += `${medals[i]} ${c.name} (${c.party}) - ${c.voteShare.toFixed(1)}%\n`;
  });
  if (result.candidates.length > 3) {
    text += `...+${result.candidates.length - 3} more\n`;
  }

  return text.trim();
}

type TabType = 'overview' | 'candidates';

export function PCElectionResultPanel({
  result,
  onClose,
  availableYears = [],
  selectedYear,
  onYearChange,
  shareUrl,
  stateName,
}: PCElectionResultPanelProps): JSX.Element {
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [copied, setCopied] = useState(false);

  const winner = result.candidates[0];

  const handleCopyLink = useCallback(async () => {
    const url = shareUrl ?? window.location.href;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      trackShare('copy_link', 'parliament');
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }, [shareUrl]);

  const handleShareToX = useCallback(() => {
    const text = generateShareText(result, stateName);
    const url = shareUrl ?? window.location.href;
    const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
    window.open(twitterUrl, '_blank', 'width=550,height=420');
    trackShare('twitter', 'parliament');
  }, [result, shareUrl, stateName]);

  return (
    <div className="election-panel pc-panel">
      {/* Mobile drag handle */}
      <div className="bottom-sheet-handle" aria-hidden="true" />

      {/* Header */}
      <div className="election-panel-header">
        <div className="election-panel-title">
          <h3>{result.constituencyNameOriginal}</h3>
          <div className="title-badges">
            <span className="pc-badge">Parliament</span>
            <span
              className={`constituency-type type-${result.constituencyType?.toLowerCase() ?? 'gen'}`}
            >
              {result.constituencyType ?? 'GEN'}
            </span>
          </div>
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

      {/* Year selector */}
      {availableYears.length > 1 && (
        <div className="election-year-selector">
          {availableYears.map((year) => (
            <button
              key={year}
              className={`year-btn ${year === selectedYear ? 'active' : ''}`}
              onClick={() => onYearChange?.(year)}
            >
              {year}
            </button>
          ))}
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
          All {result.totalCandidates} Candidates
        </button>
      </div>

      {/* Tab content */}
      <div className="panel-tab-content">
        {activeTab === 'overview' ? (
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
        ) : (
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
                  <PCCandidateRow
                    key={idx}
                    candidate={candidate}
                    isWinner={idx === 0}
                    isRunnerUp={idx === 1}
                  />
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="share-bar">
        <div className="share-bar-info">
          <span className="district-label">State:</span>
          <span className="district-name">{result.stateName ?? stateName ?? '—'}</span>
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

function CandidateRowCompact({
  candidate,
  isWinner,
}: {
  candidate: PCElectionCandidate;
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
}

function PCCandidateRow({
  candidate,
  isWinner,
  isRunnerUp,
}: {
  candidate: PCElectionCandidate;
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
}
