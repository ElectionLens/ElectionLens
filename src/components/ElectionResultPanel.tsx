import {
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
  Camera,
} from 'lucide-react';
import { useState, useCallback, memo, useMemo, useEffect, useRef } from 'react';
import type { ACElectionResult, ElectionCandidate } from '../types';
import { getPartyColor, getPartyFullName, getPartyShortName } from '../utils/partyData';
import { shouldUseShortPartyLabelsAssembly } from '../utils/partyDisplay';
import { trackShare } from '../utils/firebase';
import type { BoothResults, BoothWithResult, PostalData } from '../hooks/useBoothData';
import { YearSelector, type YearOption } from './YearSelector';

function formatNumber(num: number | undefined | null): string {
  if (num === undefined || num === null) return '—';
  return num.toLocaleString('en-IN');
}

/** Placeholder rows while AC JSON is fetching (votes/shares shown as 0). */
function loadingSkeletonCandidates(): ElectionCandidate[] {
  return Array.from({ length: 10 }, (_, i) => ({
    position: i + 1,
    name: '…',
    party: '—',
    votes: 0,
    voteShare: 0,
    margin: null,
    marginPct: null,
    sex: '',
    age: null,
    depositLost: false,
  }));
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
  /** When true (AC within PC view), show only PC years in the year selector */
  showOnlyPCYears?: boolean;
  /** Booth data for booth-wise view */
  boothResults?: BoothResults | null | undefined;
  boothsWithResults?: BoothWithResult[] | undefined;
  /** True while assembly year JSON / constituency row is loading */
  acResultsLoading?: boolean;
  /** Shown when load failed (panel stays open with placeholder result) */
  acResultsLoadError?: string | null;
}

/** Remove diacritics from text (e.g., Tamil Nādu → Tamil Nadu) */
function normalizeText(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function generateShareText(
  result: ACElectionResult,
  stateName?: string,
  includeAllCandidates = false,
  formatParty: (p: string) => string = (p) => p
): string {
  if (result.resultsPending) {
    const loc =
      result.constituencyNameOriginal ?? result.name ?? result.constituencyName ?? 'Constituency';
    const st = stateName ? normalizeText(stateName) : '';
    const head = `🗳️ ${loc}${st ? `, ${st}` : ''} | ${result.year}`;
    const lines = result.candidates.map((c) => `${c.name} (${formatParty(c.party)})`);
    if (lines.length > 0) {
      return `${head}\n\nCandidates: ${lines.join('; ')}.`.trim();
    }
    return `${head}\n\nNo candidate list for this seat yet.`.trim();
  }
  const winner = result.candidates[0];
  if (!winner) return '';

  const normalizedState = stateName ? normalizeText(stateName) : undefined;
  const location = normalizedState
    ? `${result.constituencyNameOriginal ?? result.name ?? result.constituencyName ?? 'Unknown'}, ${normalizedState}`
    : result.constituencyNameOriginal;

  let text = `🗳️ ${location} | ${result.year}\n\n`;

  if (includeAllCandidates) {
    const topCandidates = result.candidates.slice(0, 3);
    const medals = ['🥇', '🥈', '🥉'];
    topCandidates.forEach((c, i) => {
      text += `${medals[i]} ${c.name} (${formatParty(c.party)}) - ${c.voteShare.toFixed(1)}%\n`;
    });
    if (result.candidates.length > 3) {
      text += `...+${result.candidates.length - 3} more\n`;
    }
  } else {
    const marginText = winner.margin ? ` by ${formatNumber(winner.margin)} votes` : '';
    text += `🏆 ${winner.name} (${formatParty(winner.party)})${marginText}\n`;
    text += `📊 ${winner.voteShare?.toFixed(1) ?? '0.0'}% vote share\n`;
  }

  return text.trim();
}

type TabType = 'overview' | 'candidates' | 'booths' | 'postal' | 'analysis';

export function ElectionResultPanel({
  result,
  onClose: _onClose,
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
  showOnlyPCYears = false,
  boothResults,
  boothsWithResults = [],
  acResultsLoading = false,
  acResultsLoadError = null,
}: ElectionResultPanelProps): JSX.Element {
  // Read tab from URL on mount
  const getTabFromUrl = useCallback((): TabType => {
    if (typeof window === 'undefined') return 'overview';
    const searchParams = new URLSearchParams(window.location.search);
    const tabParam = searchParams.get('tab');
    const validTabs: TabType[] = ['overview', 'candidates', 'booths', 'postal', 'analysis'];
    if (tabParam && validTabs.includes(tabParam as TabType)) {
      return tabParam as TabType;
    }
    return 'overview';
  }, []);

  const [activeTab, setActiveTab] = useState<TabType>(() => {
    if (typeof window === 'undefined') return 'overview';
    const tabParam = new URLSearchParams(window.location.search).get('tab');
    const validTabs: TabType[] = ['overview', 'candidates', 'booths', 'postal', 'analysis'];
    if (tabParam && validTabs.includes(tabParam as TabType)) {
      return tabParam as TabType;
    }
    return 'overview';
  });
  const [selectedBoothId, setSelectedBoothId] = useState<string | null>(null);

  // Check if booth data is available
  // For booth data to be available, we need:
  // 1. boothResults must be loaded (not null/undefined)
  // 2. boothResults must have results (at least one booth with results)
  // Note: boothsWithResults can be empty if boothList is missing but boothResults exists
  const hasBoothData = Boolean(
    boothResults &&
    boothResults.results &&
    typeof boothResults.results === 'object' &&
    Object.keys(boothResults.results).length > 0
  );

  // Update URL when tab changes
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const searchParams = new URLSearchParams(window.location.search);

    // Only update tab param if it's different from current
    const currentTab = searchParams.get('tab');
    if (currentTab !== activeTab) {
      if (activeTab === 'overview') {
        // Remove tab param for overview (default)
        searchParams.delete('tab');
      } else {
        searchParams.set('tab', activeTab);
      }

      const newUrl = searchParams.toString()
        ? `${window.location.pathname}?${searchParams.toString()}`
        : window.location.pathname;
      window.history.replaceState({}, '', newUrl);
    }
  }, [activeTab]);

  // Read tab from URL when URL changes (e.g., browser back/forward)
  useEffect(() => {
    const handlePopState = (): void => {
      const tabFromUrl = getTabFromUrl();
      setActiveTab(tabFromUrl);
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

  const resultsPending = Boolean(result.resultsPending);
  const winner = resultsPending || acResultsLoading ? undefined : result.candidates[0];
  const assemblyCandidates = result.candidates;
  const hasAnnouncedCandidates = assemblyCandidates.length > 0;
  const displayCandidates = acResultsLoading ? loadingSkeletonCandidates() : assemblyCandidates;
  /** Pre-poll announced rows hide vote columns; loading skeleton shows numeric 0 */
  const hideAssemblyVoteFigures = resultsPending && !acResultsLoading;
  const currentPCContribution = selectedPCYear ? parliamentContributions[selectedPCYear] : null;
  const pcWinner = currentPCContribution?.candidates[0];
  const shortPartyUi = shouldUseShortPartyLabelsAssembly(result, stateName);
  const pl = (p: string) => (shortPartyUi ? getPartyShortName(p) : p);

  /** Parliament-year panel is always “past” style (full tabs). Assembly pre-poll/loading: only Overview + All candidates. */
  const inParliamentYearMode = Boolean(selectedPCYear && currentPCContribution);
  const isFutureAssemblySidebar = !inParliamentYearMode && (acResultsLoading || resultsPending);
  const showBoothTabs = !isFutureAssemblySidebar && hasBoothData;

  useEffect(() => {
    if (
      isFutureAssemblySidebar &&
      (activeTab === 'booths' || activeTab === 'postal' || activeTab === 'analysis')
    ) {
      setActiveTab('overview');
    }
  }, [isFutureAssemblySidebar, activeTab]);

  // Generate share URL with current tab
  const shareUrlWithTab = useMemo(() => {
    if (!shareUrl) return undefined;
    if (activeTab === 'overview') return shareUrl; // Default tab, no need to add param

    try {
      const url = new URL(shareUrl, window.location.origin);
      url.searchParams.set('tab', activeTab);
      return url.toString();
    } catch {
      // If shareUrl is relative, append tab param
      const separator = shareUrl.includes('?') ? '&' : '?';
      return `${shareUrl}${separator}tab=${activeTab}`;
    }
  }, [shareUrl, activeTab]);

  // Derive constituency type from name if not provided
  const constituencyType =
    result.constituencyType ??
    (() => {
      const name = result.constituencyNameOriginal ?? result.constituencyName ?? '';
      if (name.includes('(SC)')) return 'SC';
      if (name.includes('(ST)')) return 'ST';
      return 'GEN';
    })();

  // Combined year items: assembly + parliament (sorted by year). showOnlyPCYears limits to parliament only (rare).
  type YearItem = { year: number; type: 'assembly' | 'parliament' };
  const allYearItems: YearItem[] = showOnlyPCYears
    ? availablePCYears
        .map((y) => ({ year: y, type: 'parliament' as const }))
        .sort((a, b) => a.year - b.year)
    : [
        ...availableYears.map((y) => ({ year: y, type: 'assembly' as const })),
        ...availablePCYears.map((y) => ({ year: y, type: 'parliament' as const })),
      ].sort((a, b) => a.year - b.year);

  const viewOptions = useMemo<YearOption[]>(() => {
    const options: YearOption[] = [
      {
        id: 'overview',
        label: 'Overview',
        isActive: activeTab === 'overview',
        onClick: () => setActiveTab('overview'),
      },
      {
        id: 'candidates',
        label:
          inParliamentYearMode && currentPCContribution
            ? `Candidates (${currentPCContribution.candidates.length})`
            : isFutureAssemblySidebar
              ? 'Candidates'
              : assemblyCandidates.length > 0
                ? `Candidates (${assemblyCandidates.length})`
                : 'Candidates',
        isActive: activeTab === 'candidates',
        onClick: () => setActiveTab('candidates'),
      },
    ];

    if (showBoothTabs) {
      options.push({
        id: 'booths',
        label: 'Booths',
        isActive: activeTab === 'booths',
        onClick: () => setActiveTab('booths'),
      });
    }
    if (showBoothTabs && boothResults?.postal) {
      options.push({
        id: 'postal',
        label: 'Postal',
        isActive: activeTab === 'postal',
        onClick: () => setActiveTab('postal'),
      });
    }
    if (showBoothTabs) {
      options.push({
        id: 'analysis',
        label: 'Analysis',
        isActive: activeTab === 'analysis',
        onClick: () => setActiveTab('analysis'),
      });
    }
    return options;
  }, [
    activeTab,
    inParliamentYearMode,
    currentPCContribution,
    isFutureAssemblySidebar,
    assemblyCandidates.length,
    showBoothTabs,
    boothResults?.postal,
  ]);

  const handleCopyLink = useCallback(async () => {
    if (acResultsLoading) return;
    const urlToShare = shareUrlWithTab ?? shareUrl ?? window.location.href;
    try {
      await navigator.clipboard.writeText(urlToShare);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      trackShare('copy_link', 'assembly');
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }, [shareUrlWithTab, shareUrl, acResultsLoading]);

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

  const panelRef = useRef<HTMLDivElement>(null);

  const handleShareToX = useCallback(() => {
    if (acResultsLoading) return;
    const text = generateShareText(result, stateName, true, (p) =>
      shortPartyUi ? getPartyShortName(p) : p
    );
    const url = shareUrlWithTab ?? shareUrl ?? window.location.href;
    const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
    window.open(twitterUrl, '_blank', 'width=550,height=420');
    trackShare('twitter', 'assembly');
  }, [result, shareUrlWithTab, shareUrl, stateName, acResultsLoading, shortPartyUi]);

  const handleSaveScreenshot = useCallback(async () => {
    if (acResultsLoading) return;
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
      const name =
        result.constituencyNameOriginal ?? result.name ?? result.constituencyName ?? 'constituency';
      const safeName = name.replace(/[^a-zA-Z0-9-_]/g, '-').slice(0, 40);
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
  }, [result, acResultsLoading]);

  return (
    <div
      ref={panelRef}
      className={`election-panel ${isMobilePortrait ? `panel-${panelState}` : ''}`}
    >
      {/* Mobile drag handle - click to cycle states */}
      {isMobilePortrait && (
        <div
          className="bottom-sheet-handle"
          onClick={handleDragHandleClick}
          role="button"
          aria-label={`Panel is ${panelState}. Click to ${panelState === 'full' ? 'minimize' : 'expand'}`}
        />
      )}

      <div className="controls-card pane-section">
        <div
          className="election-panel-header"
          onClick={() => isMobilePortrait && panelState === 'peek' && setPanelState('half')}
        >
          <div className="election-panel-title">
            <h3>
              {result.constituencyNameOriginal ??
                result.name ??
                result.constituencyName ??
                'Unknown'}
            </h3>
            {/* Peek mode: show winner inline */}
            {isMobilePortrait && panelState === 'peek' && winner && (
              <span className="peek-winner">
                🏆 {winner.name} ({pl(winner.party)}) - {winner.voteShare?.toFixed(1) ?? '0.0'}%
              </span>
            )}
            {(!isMobilePortrait || panelState !== 'peek') && (
              <span className={`constituency-type type-${constituencyType.toLowerCase()}`}>
                {constituencyType}
              </span>
            )}
          </div>
        </div>

        {/* Year selector - shows assembly and parliament years interleaved */}
        {allYearItems.length > 0 && (
          <YearSelector
            className="election-year-selector pane-section-tight"
            variant="stacked"
            options={allYearItems.map<YearOption>((item) =>
              item.type === 'assembly'
                ? {
                    id: `ac-${item.year}`,
                    label: `${item.year}`,
                    title: `Assembly Election ${item.year}`,
                    isActive: item.year === selectedYear && !selectedPCYear,
                    onClick: () => {
                      setSelectedPCYear(null);
                      onYearChange?.(item.year);
                    },
                  }
                : {
                    id: `pc-${item.year}`,
                    label: `${item.year}-PC`,
                    title: `Parliament Election ${item.year}`,
                    isActive: selectedPCYear === item.year,
                    onClick: () => setSelectedPCYear(item.year),
                    tone: 'parliament',
                  }
            )}
          />
        )}

        <YearSelector
          label="View"
          fieldId="ac-panel-view"
          className="election-view-selector pane-section-tight"
          variant="stacked"
          options={viewOptions}
        />
      </div>

      {/* Tab content */}
      <div className="panel-tab-content">
        {selectedPCYear && currentPCContribution ? (
          /* Parliament year: overview (top 3) + candidates tab + booths / postal / analysis */
          activeTab === 'booths' ? (
            <BoothWiseView
              boothResults={boothResults}
              boothsWithResults={boothsWithResults}
              selectedBoothId={selectedBoothId}
              onBoothSelect={setSelectedBoothId}
              selectedBooth={selectedBooth}
              partyShortNames={shortPartyUi}
            />
          ) : activeTab === 'postal' && boothResults?.postal ? (
            <PostalBallotsView postal={boothResults.postal} partyShortNames={shortPartyUi} />
          ) : activeTab === 'analysis' ? (
            <BoothwiseAnalysis
              boothResults={boothResults}
              boothsWithResults={boothsWithResults}
              onBoothClick={(boothId) => {
                setSelectedBoothId(boothId);
                setActiveTab('booths');
              }}
              officialWinner={result.candidates[0]?.party}
              partyShortNames={shortPartyUi}
            />
          ) : activeTab === 'candidates' ? (
            <div className="candidates-view">
              <h4 style={{ margin: '12px 0 8px', fontSize: 14 }}>
                Candidates — Parliament {currentPCContribution.year}
              </h4>
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
                        title={getPartyFullName(c.party)}
                        style={{
                          backgroundColor: `${getPartyColor(c.party)}20`,
                          color: getPartyColor(c.party),
                          borderColor: getPartyColor(c.party),
                        }}
                      >
                        {pl(c.party)}
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
          ) : (
            <div className="overview-view">
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
                      {pl(pcWinner.party)}
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

              <div className="candidates-preview">
                <h4>Parliament {currentPCContribution.year} — top candidates</h4>
                {currentPCContribution.candidates.slice(0, 3).map((c, idx) => (
                  <div key={idx} className={`candidate-row-compact ${idx === 0 ? 'winner' : ''}`}>
                    <span className="pos">{c.position}</span>
                    <span className="name">{c.name}</span>
                    <span
                      className="party"
                      style={{ backgroundColor: getPartyColor(c.party), color: 'white' }}
                    >
                      {pl(c.party)}
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
          )
        ) : activeTab === 'overview' ? (
          <div className="overview-view">
            {acResultsLoadError && (
              <div
                className="prepoll-banner"
                style={{
                  borderColor: 'rgba(185, 28, 28, 0.45)',
                  background: 'rgba(254, 242, 242, 0.95)',
                }}
              >
                <AlertTriangle size={16} aria-hidden />
                <div className="prepoll-banner-body">{acResultsLoadError}</div>
              </div>
            )}
            {acResultsLoading && (
              <div
                className="prepoll-banner"
                style={{
                  borderColor: 'rgba(37, 99, 235, 0.35)',
                  background: 'rgba(239, 246, 255, 0.95)',
                }}
              >
                <div className="prepoll-banner-body">
                  <strong>Loading results.</strong> Candidate names and vote totals will appear when
                  data is ready.
                </div>
              </div>
            )}
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
                    <span>{winner.voteShare?.toFixed(1) ?? '0.0'}%</span>
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
                <span className="value">
                  {resultsPending ? '—' : formatNumber(result.validVotes)}
                </span>
              </div>
              <div className="stat-inline highlight">
                <span className="label">Turnout</span>
                <span className="value">
                  {resultsPending || result.turnout <= 0 ? '—' : `${result.turnout.toFixed(1)}%`}
                </span>
              </div>
              {(() => {
                const notaCandidate = boothResults?.postal?.candidates?.find(
                  (c) => c.party === 'NOTA' || c.name === 'NOTA'
                );
                const notaVotes = notaCandidate?.total ?? 0;
                return notaVotes > 0 ? (
                  <div className="stat-inline nota">
                    <span className="label">NOTA</span>
                    <span className="value">{formatNumber(notaVotes)}</span>
                  </div>
                ) : null;
              })()}
            </div>

            <div className="candidates-preview">
              <h4>{isFutureAssemblySidebar ? 'Candidates' : 'Top candidates'}</h4>
              {!acResultsLoading && !hasAnnouncedCandidates && resultsPending ? (
                <p style={{ fontSize: 13, margin: 0, color: 'var(--muted-foreground, #64748b)' }}>
                  No sourced candidate names for this constituency yet.
                </p>
              ) : (
                <>
                  {displayCandidates.slice(0, 3).map((candidate, idx) => (
                    <CandidateRowCompact
                      key={idx}
                      candidate={candidate}
                      isWinner={!resultsPending && !acResultsLoading && idx === 0}
                      hideVoteStats={hideAssemblyVoteFigures}
                      partyShortNames={shortPartyUi}
                    />
                  ))}
                  {!acResultsLoading && assemblyCandidates.length > 3 && (
                    <button className="view-all-btn" onClick={() => setActiveTab('candidates')}>
                      View all {assemblyCandidates.length} →
                    </button>
                  )}
                  {acResultsLoading && (
                    <button className="view-all-btn" onClick={() => setActiveTab('candidates')}>
                      View all →
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        ) : activeTab === 'candidates' ? (
          <div className="candidates-view">
            {!acResultsLoading && !hasAnnouncedCandidates && resultsPending ? (
              <p style={{ fontSize: 13, margin: 0, color: 'var(--muted-foreground, #64748b)' }}>
                No sourced candidate names for this constituency yet.
              </p>
            ) : (
              <div className="candidates-table-full">
                <div className="candidates-header">
                  <span className="col-pos">#</span>
                  <span className="col-name">Candidate</span>
                  <span className="col-party">Party</span>
                  <span className="col-votes">Votes</span>
                  <span className="col-share">%</span>
                </div>
                <div className="candidates-scroll">
                  {displayCandidates.map((candidate, idx) => (
                    <CandidateRow
                      key={idx}
                      candidate={candidate}
                      isWinner={!resultsPending && !acResultsLoading && idx === 0}
                      isRunnerUp={!resultsPending && !acResultsLoading && idx === 1}
                      hideVoteStats={hideAssemblyVoteFigures}
                      partyShortNames={shortPartyUi}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : activeTab === 'postal' && boothResults?.postal ? (
          /* Postal Ballots view */
          <PostalBallotsView postal={boothResults.postal} partyShortNames={shortPartyUi} />
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
            partyShortNames={shortPartyUi}
          />
        ) : (
          /* Booth-wise view */
          <BoothWiseView
            boothResults={boothResults}
            boothsWithResults={boothsWithResults}
            selectedBoothId={selectedBoothId}
            onBoothSelect={setSelectedBoothId}
            selectedBooth={selectedBooth}
            partyShortNames={shortPartyUi}
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
          <button
            type="button"
            className="election-panel-btn twitter-btn"
            onClick={handleShareToX}
            disabled={acResultsLoading}
            title={
              acResultsLoading ? 'Share is available after results load' : 'Share candidates on X'
            }
          >
            <Twitter size={18} />
          </button>
          <button
            type="button"
            className="election-panel-btn screenshot-btn"
            onClick={handleSaveScreenshot}
            disabled={acResultsLoading}
            title={
              acResultsLoading ? 'Screenshot is available after results load' : 'Save screenshot'
            }
          >
            <Camera size={18} />
          </button>
          <button
            type="button"
            className={`election-panel-btn ${copied ? 'copied' : ''}`}
            onClick={handleCopyLink}
            disabled={acResultsLoading}
            title={
              acResultsLoading
                ? 'Copy link is available after results load'
                : copied
                  ? 'Copied!'
                  : 'Copy link'
            }
          >
            {copied ? <Check size={18} /> : <Link2 size={18} />}
          </button>
        </div>
      </div>
    </div>
  );
}

const CandidateRowCompact = memo(function CandidateRowCompact({
  candidate,
  isWinner,
  hideVoteStats = false,
  partyShortNames = false,
}: {
  candidate: ElectionCandidate;
  isWinner: boolean;
  hideVoteStats?: boolean;
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
      <span className="votes">{hideVoteStats ? '—' : formatNumber(candidate.votes)}</span>
      <span className="share">{hideVoteStats ? '—' : `${candidate.voteShare.toFixed(1)}%`}</span>
      {!hideVoteStats && (
        <div
          className="bar"
          style={{ width: `${Math.min(candidate.voteShare, 100)}%`, backgroundColor: partyColor }}
        />
      )}
    </div>
  );
});

// Memoized full candidate row - expensive due to complex styling
const CandidateRow = memo(function CandidateRow({
  candidate,
  isWinner,
  isRunnerUp,
  hideVoteStats = false,
  partyShortNames = false,
}: {
  candidate: ElectionCandidate;
  isWinner: boolean;
  isRunnerUp: boolean;
  hideVoteStats?: boolean;
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
      <span className="col-votes">{hideVoteStats ? '—' : formatNumber(candidate.votes)}</span>
      <span className="col-share">
        {hideVoteStats ? '—' : `${candidate.voteShare.toFixed(1)}%`}
      </span>
      {!hideVoteStats && (
        <div
          className="vote-bar"
          style={{
            width: `${Math.min(candidate.voteShare, 100)}%`,
            backgroundColor: partyColor,
          }}
        />
      )}
    </div>
  );
});

// Postal Ballots view component
interface PostalBallotsViewProps {
  postal: PostalData;
  partyShortNames?: boolean;
}

function PostalBallotsView({
  postal,
  partyShortNames = false,
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

  const totalVotes = useMemo(() => {
    return postal.candidates.reduce((sum, c) => sum + c.total, 0);
  }, [postal.candidates]);

  const postalPercent = useMemo(() => {
    return totalVotes > 0 ? (totalPostal / totalVotes) * 100 : 0;
  }, [totalPostal, totalVotes]);

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
            <span className="stat-value">{postalPercent.toFixed(1)}%</span>
            <span className="stat-label">of Total Votes</span>
          </div>
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
                  {partyShortNames ? getPartyShortName(candidate.party) : candidate.party}
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
  partyShortNames?: boolean;
}

function BoothWiseView({
  boothResults,
  boothsWithResults,
  selectedBoothId,
  onBoothSelect,
  selectedBooth,
  partyShortNames = false,
}: BoothWiseViewProps): JSX.Element {
  const pl = (p: string) => (partyShortNames ? getPartyShortName(p) : p);
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
            aria-label="Select booth"
            title="Select booth"
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

          {selectedBooth.result && boothResults && boothResults.candidates && (
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
                      style={{ backgroundColor: getPartyColor(selectedBooth.winner.party) }}
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
                          className={`booth-candidate-row ${isWinner ? 'winner' : ''}`}
                        >
                          <div className="candidate-info">
                            <span className="party-tag" style={{ backgroundColor: partyColor }}>
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
  /** Kerala / West Bengal 2026 — show INC, CPI(M), TMC, etc. instead of full ECI names */
  partyShortNames?: boolean;
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
  partyShortNames = false,
}: BoothwiseAnalysisProps): JSX.Element {
  const pl = (p: string) => (partyShortNames ? getPartyShortName(p) : p);

  const analysis = useMemo(() => {
    if (!boothResults || !boothResults.candidates || boothsWithResults.length === 0) {
      return null;
    }

    const fmtParty = (p: string) => (partyShortNames ? getPartyShortName(p) : p);

    const candidates = boothResults.candidates;
    const boothsWithData = boothsWithResults.filter((b) => b.result && b.winner);

    // Calculate booth wins for each party
    const partyBoothWins: Record<string, number> = {};
    const partyTotalVotes: Record<string, number> = {};
    const partyMargins: Record<string, number[]> = {};
    // Track which booths each party won
    const partyBooths: Record<
      string,
      Array<{ booth: BoothWithResult; percent: number; margin: number }>
    > = {};

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

      // Track booths won by each party
      if (!partyBooths[winnerParty]) partyBooths[winnerParty] = [];
      partyBooths[winnerParty].push({ booth, percent: booth.winner.percent, margin });

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
            detail: `${fmtParty(b.party)} ${b.percent.toFixed(1)}%`,
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
          .map(([party, booths]) => `${fmtParty(party)}: ${booths.length}`)
          .join(', ');

        // Combine all linked booths
        const allLinkedBooths = partiesWithZero.flatMap(([party, booths]) =>
          booths.map((b) => ({
            id: b.id,
            name: b.boothNo,
            detail: `${fmtParty(party)}=0`,
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
            ? `Won ${womenWinPercent.toFixed(0)}% of women's booths vs ${regularWinPercent.toFixed(0)}% regular. Women voters favored ${fmtParty(winnerParty)}.`
            : diff < -5
              ? `Only ${womenWinPercent.toFixed(0)}% of women's booths vs ${regularWinPercent.toFixed(0)}% regular. Gender gap is a vulnerability.`
              : `Similar: ${womenWinPercent.toFixed(0)}% women's booths, ${regularWinPercent.toFixed(0)}% regular. No gender-based pattern.`,
        value: `${womenWinPercent.toFixed(0)}%`,
        icon: diff > 5 ? 'zap' : diff < -5 ? 'trending-down' : 'target',
        linkedBooths: womenBoothsWithResults.map((b) => ({
          id: b.id,
          name: `${b.boothNo} 👩`,
          detail: `${fmtParty(b.winner?.party ?? '')} ${b.winner?.percent.toFixed(0)}%`,
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
          detail: `${fmtParty(b.winner?.party ?? '')} ${b.winner?.percent.toFixed(0)}%`,
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
          title: `${fmtParty(runnerUpParty)} Booth Dominance`,
          description: `${fmtParty(runnerUpParty)} won ${runnerUpBoothCount} booths vs ${fmtParty(winnerParty)}'s ${winnerBoothCount} — but lost overall! Postal votes likely flipped the result. Strong grassroots presence but couldn't convert to victory.`,
          value: `${runnerUpBoothCount} booths`,
          icon: 'alert',
          linkedBooths: runnerUpBooths.map((b) => ({
            id: b.id,
            name: b.boothNo,
            detail: `${fmtParty(runnerUpParty)} ${b.winner?.percent.toFixed(0)}%`,
          })),
        });
      } else {
        insights.push({
          type: 'insight',
          title: 'Competition Strike Rate',
          description: `${fmtParty(runnerUpParty)}: ${runnerUpStrikeRate}% (${runnerUpBoothCount} booths). ${
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
            detail: `${fmtParty(runnerUpParty)} ${b.winner?.percent.toFixed(0)}%`,
          })),
        });
      }
    }

    // Sort booths within each party by vote percent descending
    for (const party of Object.keys(partyBooths)) {
      partyBooths[party]?.sort((a, b) => b.percent - a.percent);
    }

    return {
      winnerParty,
      winnerBoothCount,
      runnerUpParty,
      runnerUpBoothCount,
      totalBooths: boothsWithData.length,
      partyBoothWins,
      partyBooths,
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
  }, [boothResults, boothsWithResults, officialWinner, partyShortNames]);

  // State for expanded party sections
  const [expandedParties, setExpandedParties] = useState<Set<string>>(new Set());

  const togglePartyExpand = useCallback((party: string) => {
    setExpandedParties((prev) => {
      const next = new Set(prev);
      if (next.has(party)) {
        next.delete(party);
      } else {
        next.add(party);
      }
      return next;
    });
  }, []);

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
      {/* Booth Distribution Bar */}
      <div className="booth-distribution">
        <h5 className="section-heading">
          <BarChart3 size={16} />
          Booth Distribution
        </h5>
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
                title={`${getPartyFullName(party)}: ${count} booths (${((count / analysis.totalBooths) * 100).toFixed(1)}%)`}
              >
                {count > analysis.totalBooths * 0.1 && (
                  <span className="segment-label">{pl(party)}</span>
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
                <span className="legend-party">{pl(party)}</span>
                <span className="legend-count">{count}</span>
              </div>
            ))}
        </div>
      </div>

      {/* Party Booth Breakdown */}
      <div className="party-booth-breakdown">
        <h5 className="section-heading">
          <MapPin size={16} />
          Booths Won by Party
        </h5>
        <div className="party-booth-cards">
          {Object.entries(analysis.partyBoothWins)
            .sort((a, b) => b[1] - a[1])
            .map(([party, count]) => {
              const isExpanded = expandedParties.has(party);
              const partyBoothList = analysis.partyBooths[party] || [];
              const partyColor = getPartyColor(party);
              const avgPercent =
                partyBoothList.length > 0
                  ? (
                      partyBoothList.reduce((sum, b) => sum + b.percent, 0) / partyBoothList.length
                    ).toFixed(1)
                  : '0';
              const avgMargin =
                partyBoothList.length > 0
                  ? Math.round(
                      partyBoothList.reduce((sum, b) => sum + b.margin, 0) / partyBoothList.length
                    )
                  : 0;

              return (
                <div key={party} className={`party-booth-card ${isExpanded ? 'expanded' : ''}`}>
                  <button
                    className="party-booth-header"
                    onClick={() => togglePartyExpand(party)}
                    style={{ borderLeftColor: partyColor }}
                  >
                    <div className="party-info">
                      <span className="party-badge" style={{ backgroundColor: partyColor }}>
                        {pl(party)}
                      </span>
                      <span className="booth-count">{count} booths won</span>
                    </div>
                    <div className="party-stats">
                      <span className="stat">Avg: {avgPercent}%</span>
                      <span className="stat">+{formatNumber(avgMargin)}</span>
                    </div>
                    <ChevronDown
                      size={18}
                      className={`expand-icon ${isExpanded ? 'rotated' : ''}`}
                    />
                  </button>
                  {isExpanded && (
                    <div className="party-booth-list">
                      <div className="booth-list-header">
                        <span className="col-booth">Booth</span>
                        <span className="col-vote">Vote %</span>
                        <span className="col-margin">Margin</span>
                      </div>
                      <div className="booth-list-items">
                        {partyBoothList.map(({ booth, percent, margin }) => (
                          <button
                            key={booth.id}
                            className="booth-list-item"
                            onClick={() => onBoothClick?.(booth.id)}
                          >
                            <span className="col-booth" title={booth.name}>
                              {booth.boothNo}
                              {booth.type === 'women' && <span className="women-badge">W</span>}
                            </span>
                            <span className="col-vote">
                              {percent.toFixed(1)}%
                              <div
                                className="mini-bar"
                                style={{
                                  width: `${Math.min(percent, 100)}%`,
                                  backgroundColor: partyColor,
                                }}
                              />
                            </span>
                            <span className="col-margin">+{formatNumber(margin)}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
        </div>
      </div>

      {/* Key Insights */}
      <div className="analysis-insights">
        <h5 className="section-heading">
          <Lightbulb size={16} />
          Key Insights
        </h5>
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
        <h5 className="section-heading">
          <Target size={16} />
          Party Strike Rates
        </h5>
        <div className="strike-rate-list">
          {analysis.strikeRates.slice(0, 5).map((sr, idx) => (
            <div key={sr.party} className={`strike-rate-row ${idx === 0 ? 'winner' : ''}`}>
              <span className="sr-rank">{idx + 1}</span>
              <span className="sr-party" style={{ backgroundColor: getPartyColor(sr.party) }}>
                {pl(sr.party)}
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
      <div className="analysis-quick-stats-section">
        <h5 className="section-heading">
          <Zap size={16} />
          Quick Stats
        </h5>
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
    </div>
  );
}
