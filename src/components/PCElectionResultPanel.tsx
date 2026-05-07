import { Award, TrendingUp, Vote, Link2, Check, Twitter, Users, Camera } from 'lucide-react';
import { useState, useCallback, memo, useEffect, useMemo, useRef } from 'react';
import type { PCElectionResult, PCElectionCandidate } from '../types';
import { getPartyColor, getPartyFullName, getPartyShortName } from '../utils/partyData';
import { shouldUseShortPartyLabelsPC } from '../utils/partyDisplay';
import { trackShare } from '../utils/firebase';
import { YearSelector, type YearOption } from './YearSelector';

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
  layerOptions?: YearOption[] | undefined;
  /** When embedded in sidebar with title shown in the info header, hide duplicate h3 */
  omitConstituencyHeading?: boolean;
}

/** Remove diacritics from text (e.g., Tamil Nādu → Tamil Nadu) */
function normalizeText(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function generateShareText(
  result: PCElectionResult,
  stateName: string | undefined,
  formatParty: (p: string) => string
): string {
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
    text += `${medals[i]} ${c.name} (${formatParty(c.party)}) - ${c.voteShare.toFixed(1)}%\n`;
  });
  if (result.candidates.length > 3) {
    text += `...+${result.candidates.length - 3} more\n`;
  }

  return text.trim();
}

export function PCElectionResultPanel({
  result,
  onClose: _onClose,
  availableYears = [],
  selectedYear,
  onYearChange,
  shareUrl,
  stateName,
  layerOptions = [],
  omitConstituencyHeading = false,
}: PCElectionResultPanelProps): JSX.Element {
  const [copied, setCopied] = useState(false);
  const getTabFromUrl = useCallback((): 'overview' | 'candidates' => {
    if (typeof window === 'undefined') return 'overview';
    const tab = new URLSearchParams(window.location.search).get('tab');
    return tab === 'candidates' ? 'candidates' : 'overview';
  }, []);

  const [activeTab, setActiveTab] = useState<'overview' | 'candidates'>(() => getTabFromUrl());

  const isMobilePortrait =
    typeof window !== 'undefined' &&
    window.innerWidth <= 768 &&
    window.innerHeight > window.innerWidth;

  const winner = result.candidates[0];
  const shortPartyUi = shouldUseShortPartyLabelsPC(result, stateName);
  const pl = (p: string) => (shortPartyUi ? getPartyShortName(p) : p);
  const viewOptions = useMemo<YearOption[]>(
    () => [
      {
        id: 'overview',
        label: 'Overview',
        isActive: activeTab === 'overview',
        onClick: () => setActiveTab('overview'),
      },
      {
        id: 'candidates',
        label: `Candidates (${result.totalCandidates})`,
        isActive: activeTab === 'candidates',
        onClick: () => setActiveTab('candidates'),
      },
    ],
    [activeTab, result.totalCandidates]
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const searchParams = new URLSearchParams(window.location.search);
    const currentTab = searchParams.get('tab');

    if (activeTab === 'overview') {
      if (!currentTab) return;
      searchParams.delete('tab');
    } else if (currentTab !== 'candidates') {
      searchParams.set('tab', 'candidates');
    } else {
      return;
    }

    const newUrl = searchParams.toString()
      ? `${window.location.pathname}?${searchParams.toString()}`
      : window.location.pathname;
    window.history.replaceState({}, '', newUrl);
  }, [activeTab]);

  useEffect(() => {
    const handlePopState = (): void => {
      setActiveTab(getTabFromUrl());
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [getTabFromUrl]);

  useEffect(
    () => () => {
      if (typeof window === 'undefined') return;
      const searchParams = new URLSearchParams(window.location.search);
      if (!searchParams.get('tab')) return;
      searchParams.delete('tab');
      const newUrl = searchParams.toString()
        ? `${window.location.pathname}?${searchParams.toString()}`
        : window.location.pathname;
      window.history.replaceState({}, '', newUrl);
    },
    []
  );

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

  const panelRef = useRef<HTMLDivElement>(null);

  const handleShareToX = useCallback(() => {
    const text = generateShareText(result, stateName, (p) =>
      shortPartyUi ? getPartyShortName(p) : p
    );
    const url = shareUrl ?? window.location.href;
    const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
    window.open(twitterUrl, '_blank', 'width=550,height=420');
    trackShare('twitter', 'parliament');
  }, [result, shareUrl, stateName, shortPartyUi]);

  const handleSaveScreenshot = useCallback(async () => {
    const el = panelRef.current;
    if (!el) return;
    const w = el.offsetWidth;
    const fullHeight = el.scrollHeight;
    if (w <= 0 || fullHeight <= 0) return;
    const padH = 32;
    const totalW = w + padH * 2;
    let wrapper: HTMLElement | null = null;
    let styleEl: HTMLStyleElement | null = null;
    try {
      const clone = el.cloneNode(true) as HTMLElement;
      clone.classList.add('screenshot-capture');
      clone.style.position = 'absolute';
      clone.style.left = `${padH}px`;
      clone.style.top = '0';
      clone.style.width = `${w}px`;
      clone.style.height = `${fullHeight}px`;
      clone.style.overflow = 'visible';
      clone.style.background = 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)';
      styleEl = document.createElement('style');
      styleEl.textContent = `.screenshot-capture * { animation: none !important; opacity: 1 !important; transform: none !important; visibility: visible !important; }`;
      document.head.appendChild(styleEl);
      wrapper = document.createElement('div');
      wrapper.style.cssText = `position:fixed;left:0;top:0;width:${totalW}px;height:${fullHeight}px;overflow:hidden;z-index:99999;pointer-events:none;background:#fafbfc;`;
      wrapper.appendChild(clone);
      document.body.appendChild(wrapper);
      await new Promise((r) => setTimeout(r, 150));
      const html2canvas = (await import('html2canvas')).default;
      const rawCanvas = await html2canvas(wrapper, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#fafbfc',
        width: totalW,
        height: Math.min(fullHeight, 8000),
      });
      const blob = await new Promise<Blob | null>((res) => rawCanvas.toBlob(res, 'image/png', 1));
      if (!blob) return;
      const safeName = (result.constituencyNameOriginal ?? 'pc')
        .replace(/[^a-zA-Z0-9-_]/g, '-')
        .slice(0, 40);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `election-${safeName}-${result.year}.png`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Screenshot failed:', err);
    } finally {
      if (wrapper?.parentNode) wrapper.parentNode.removeChild(wrapper);
      if (styleEl?.parentNode) styleEl.parentNode.removeChild(styleEl);
    }
  }, [result]);

  const showElectionPanelHeader = !omitConstituencyHeading;

  return (
    <div
      ref={panelRef}
      className={`election-panel pc-panel ${isMobilePortrait ? 'panel-full' : ''}`}
    >
      <div className="controls-card pane-section">
        {showElectionPanelHeader && (
          <div className="election-panel-header">
            <div className="election-panel-title">
              <h3>{result.constituencyNameOriginal || result.constituencyName}</h3>
              <div className="title-badges">
                <span className="pc-badge">Parliament</span>
                <span
                  className={`constituency-type type-${result.constituencyType?.toLowerCase() ?? 'gen'}`}
                >
                  {result.constituencyType ?? 'GEN'}
                </span>
              </div>
            </div>
          </div>
        )}

        {layerOptions.length > 0 && (
          <YearSelector
            label="Layer"
            fieldId="pc-panel-layer"
            className="election-year-selector pane-section-tight"
            variant="stacked"
            options={layerOptions}
          />
        )}

        {/* Year selector */}
        {availableYears.length > 1 && (
          <YearSelector
            label="Year"
            fieldId="pc-panel-year"
            className="election-year-selector pane-section-tight"
            variant="stacked"
            options={availableYears.map<YearOption>((year) => ({
              id: `pc-${year}`,
              label: `${year}`,
              title: `Parliament Election ${year}`,
              isActive: year === selectedYear,
              onClick: () => onYearChange?.(year),
            }))}
          />
        )}

        <YearSelector
          label="View"
          fieldId="pc-panel-view"
          className="election-view-selector pane-section-tight"
          variant="stacked"
          options={viewOptions}
        />
      </div>

      <div className="panel-tab-content">
        {activeTab === 'candidates' ? (
          <div className="candidates-view">
            <h4 style={{ margin: '12px 0 8px', fontSize: 14 }}>Candidates</h4>
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
                    partyShortNames={shortPartyUi}
                  />
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="overview-view">
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
                    {pl(winner.party)}
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

            <div className="candidates-preview">
              <h4>Top candidates</h4>
              {result.candidates.slice(0, 3).map((candidate, idx) => (
                <PCCandidateRowCompact
                  key={idx}
                  candidate={candidate}
                  isWinner={idx === 0}
                  partyShortNames={shortPartyUi}
                />
              ))}
              {result.candidates.length > 3 && (
                <button
                  className="view-all-btn"
                  onClick={() => setActiveTab('candidates')}
                  type="button"
                >
                  View all {result.candidates.length} candidates →
                </button>
              )}
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
          <button
            type="button"
            className="election-panel-btn twitter-btn"
            onClick={handleShareToX}
            title="Share candidates on X"
          >
            <Twitter size={18} />
          </button>
          <button
            type="button"
            className="election-panel-btn screenshot-btn"
            onClick={handleSaveScreenshot}
            title="Save screenshot"
          >
            <Camera size={18} />
          </button>
          <button
            type="button"
            className={`election-panel-btn ${copied ? 'copied' : ''}`}
            onClick={handleCopyLink}
            title={copied ? 'Copied!' : 'Copy link'}
          >
            {copied ? <Check size={18} /> : <Link2 size={18} />}
          </button>
        </div>
      </div>
    </div>
  );
}

const PCCandidateRowCompact = memo(function PCCandidateRowCompact({
  candidate,
  isWinner,
  partyShortNames = false,
}: {
  candidate: PCElectionCandidate;
  isWinner: boolean;
  partyShortNames?: boolean;
}): JSX.Element {
  const partyColor = getPartyColor(candidate.party);
  const partyText = partyShortNames ? getPartyShortName(candidate.party) : candidate.party;

  return (
    <div className={`candidate-row-compact ${isWinner ? 'winner' : ''}`}>
      <span className="pos">{candidate.position}</span>
      <span className="name">{candidate.name}</span>
      <span
        className="party"
        style={{ backgroundColor: partyColor, color: 'white' }}
        title={getPartyFullName(candidate.party)}
      >
        {partyText}
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

// Memoized full PC candidate row
const PCCandidateRow = memo(function PCCandidateRow({
  candidate,
  isWinner,
  isRunnerUp,
  partyShortNames = false,
}: {
  candidate: PCElectionCandidate;
  isWinner: boolean;
  isRunnerUp: boolean;
  partyShortNames?: boolean;
}): JSX.Element {
  const partyColor = getPartyColor(candidate.party);
  const partyText = partyShortNames ? getPartyShortName(candidate.party) : candidate.party;

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
        {partyText}
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
