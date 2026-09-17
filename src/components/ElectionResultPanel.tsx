import {
  Award,
  TrendingUp,
  Vote,
  Link2,
  Check,
  Twitter,
  Share2,
  AlertTriangle,
  Camera,
} from 'lucide-react';
import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import type { ACElectionResult } from '../types';
import { getPartyColor, getPartyFullName, getPartyShortName } from '../utils/partyData';
import { shouldUseShortPartyLabelsAssembly } from '../utils/partyDisplay';
import { trackShare } from '../utils/firebase';
import { useCopyLinkToClipboard } from '../hooks/useCopyLinkToClipboard';
import type { BoothResults, BoothWithResult } from '../hooks/useBoothData';
import { BoothDataQualityBanner } from './BoothDataQualityBanner';
import { shouldShowPostalTab, shouldShowUnmappedInPostalTab } from '../utils/boothDataQuality';
import { YearSelector, type YearOption } from './YearSelector';
import {
  CandidateRow,
  PostalBallotsView,
  BoothWiseView,
  BoothwiseAnalysis,
  ResultPodium,
  KpiStrip,
  PanelTabs,
  CandidateBar,
} from './election-result-panel';
import { selectResultSummary, selectKpiValues } from '../utils/resultSummary';
import { useElementWidth } from '../hooks/useElementWidth';

/**
 * Below this panel width the four view labels cannot sit side by side without
 * truncating, so the select remains the honest control.
 */
const TAB_BAR_MIN_WIDTH = 460;
import {
  embeddedPartyChipStyle,
  winnerPartyChipStyle,
  formatNumber,
  generateShareText,
  loadingSkeletonCandidates,
} from './election-result-panel/shared';

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
  layerOptions?: YearOption[] | undefined;
  /** When embedded in sidebar with title shown in the info header, hide duplicate h3 */
  omitConstituencyHeading?: boolean;
  /** Wired from App so `?tab=` stays aligned with centralized URL bookkeeping */
  onViewTabSync?: ((tab: 'overview' | 'booths' | 'postal' | 'analysis') => void) | undefined;
}

type TabType = 'overview' | 'booths' | 'postal' | 'analysis';

/**
 * Reads the panel's active tab out of `?tab=`.
 *
 * Was written out twice - once as the useState lazy initializer, once as
 * the useCallback used on popstate - with the useState copy quietly
 * missing the `typeof window` guard the callback had (harmless today only
 * because this component never renders during SSR).
 */
export function parseTabFromSearch(search: string): TabType {
  const tabParam = new URLSearchParams(search).get('tab');
  if (!tabParam) return 'overview';
  /** Legacy deeplinks merged into Overview */
  if (tabParam === 'candidates') return 'overview';
  const validTabs: TabType[] = ['overview', 'booths', 'postal', 'analysis'];
  return validTabs.includes(tabParam as TabType) ? (tabParam as TabType) : 'overview';
}

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
  layerOptions = [],
  omitConstituencyHeading = false,
  onViewTabSync,
}: ElectionResultPanelProps): JSX.Element {
  // Read tab from URL on mount
  const getTabFromUrl = useCallback((): TabType => {
    if (typeof window === 'undefined') return 'overview';
    return parseTabFromSearch(window.location.search);
  }, []);

  const [activeTab, setActiveTab] = useState<TabType>(() =>
    typeof window === 'undefined' ? 'overview' : parseTabFromSearch(window.location.search)
  );
  const [selectedBoothId, setSelectedBoothId] = useState<string | null>(null);

  // A failed AC reconciliation means the raw booth layer is not safe to
  // expose as analysis. Partial rows remain available only when their
  // aggregate booth+postal totals reconcile to the official AC result.
  const boothTotalsTrusted = boothResults?.dataQuality?.acTotalsReconciled !== false;
  const hasBoothData = Boolean(
    boothTotalsTrusted &&
    boothResults &&
    boothResults.results &&
    typeof boothResults.results === 'object' &&
    Object.keys(boothResults.results).length > 0
  );

  useEffect(() => {
    onViewTabSync?.(activeTab);
  }, [activeTab, onViewTabSync]);

  // Read tab from URL when URL changes (e.g., browser back/forward)
  useEffect(() => {
    const handlePopState = (): void => {
      const tabFromUrl = getTabFromUrl();
      setActiveTab(tabFromUrl);
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [getTabFromUrl]);

  // Reset only after booth loading has resolved. `boothResults === null` is
  // also the initial loading state; resetting here would erase a valid
  // `?tab=analysis` deep link before the async booth request completes.
  useEffect(() => {
    if (
      boothResults !== null &&
      !hasBoothData &&
      (activeTab === 'booths' || activeTab === 'postal' || activeTab === 'analysis')
    ) {
      setActiveTab('overview');
    }
  }, [boothResults, hasBoothData, activeTab]);

  // Get selected booth details
  const selectedBooth = useMemo(() => {
    if (!selectedBoothId) return null;
    return boothsWithResults.find((b) => b.id === selectedBoothId) ?? null;
  }, [selectedBoothId, boothsWithResults]);
  const { copied, copyLink } = useCopyLinkToClipboard();
  const [selectedPCYearInternal, setSelectedPCYearInternal] = useState<number | null>(null);

  // Mobile portrait: single expanded sheet (full height class); no peek/half cycling
  const isMobilePortrait =
    typeof window !== 'undefined' &&
    window.innerWidth <= 768 &&
    window.innerHeight > window.innerWidth;

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
  const assemblyCandidates = result.candidates;
  const hasAnnouncedCandidates = assemblyCandidates.length > 0;
  const displayCandidates = acResultsLoading ? loadingSkeletonCandidates() : assemblyCandidates;
  /** Pre-poll announced rows hide vote columns; loading skeleton shows numeric 0 */
  const hideAssemblyVoteFigures = resultsPending && !acResultsLoading;
  const currentPCContribution = selectedPCYear ? parliamentContributions[selectedPCYear] : null;
  const pcWinner = currentPCContribution?.candidates[0];
  const shortPartyUi = shouldUseShortPartyLabelsAssembly(result, stateName);
  const pl = (p: string) => (shortPartyUi ? getPartyShortName(p) : p);

  /**
   * Headline figures for the podium + KPI strip (UI revamp S1/S2).
   *
   * Memoised because selectKpiValues runs the booth-wise analysis engine, which
   * walks every booth - cheap once, wasteful on every keystroke elsewhere in
   * the panel.
   */
  const podiumSummary = useMemo(
    () => selectResultSummary(acResultsLoading ? null : result),
    [result, acResultsLoading]
  );
  const kpiValues = useMemo(
    () => selectKpiValues(result, boothResults, boothsWithResults, podiumSummary),
    [result, boothResults, boothsWithResults, podiumSummary]
  );

  /** Bars scale to the leader, so a 38-vs-35 race reads as the near-tie it is. */
  const leaderShare = useMemo(
    () =>
      displayCandidates.reduce(
        (max, c) => (Number.isFinite(c.voteShare) && c.voteShare > max ? c.voteShare : max),
        0
      ),
    [displayCandidates]
  );

  /** Same, for the parliament-contribution list rendered under a PC year. */
  const pcLeaderShare = useMemo(
    () =>
      (currentPCContribution?.candidates ?? []).reduce(
        (max, c) => (Number.isFinite(c.voteShare) && c.voteShare > max ? c.voteShare : max),
        0
      ),
    [currentPCContribution]
  );

  /**
   * A real tab bar needs room for every label; below that the select is the
   * honest control. Measured on the panel itself rather than the viewport,
   * because the panel-mode token and the user's width override both change it
   * independently of the window.
   */
  const [tabBarRef, panelWidth] = useElementWidth<HTMLDivElement>();
  const useTabBar = panelWidth != null && panelWidth >= TAB_BAR_MIN_WIDTH && !isMobilePortrait;

  /** Parliament-year panel: Overview (full assembly + PC breakdown) plus Booths / Postal / Analysis when data exists. Assembly list always on Overview (no separate Candidates tab). */
  const inParliamentYearMode = Boolean(selectedPCYear && currentPCContribution);
  const isFutureAssemblySidebar = !inParliamentYearMode && (acResultsLoading || resultsPending);
  const showBoothTabs = !isFutureAssemblySidebar && hasBoothData;
  // Preserve a persisted deep-linked sub-view while booth data is loading so
  // the visible selector does not jump back to Overview during hydration.
  const requestedTab =
    typeof window === 'undefined' ? 'overview' : parseTabFromSearch(window.location.search);
  const showRequestedTabWhileLoading =
    requestedTab === activeTab && activeTab !== 'overview' && boothResults === null;

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
    ];

    if (showBoothTabs || showRequestedTabWhileLoading) {
      options.push({
        id: 'booths',
        label: 'Booths',
        isActive: activeTab === 'booths',
        onClick: () => setActiveTab('booths'),
      });
    }
    if (
      (showBoothTabs || (showRequestedTabWhileLoading && requestedTab === 'postal')) &&
      shouldShowPostalTab(boothResults?.postal, boothResults?.dataQuality, boothResults?.unmapped)
    ) {
      options.push({
        id: 'postal',
        label: 'Postal',
        isActive: activeTab === 'postal',
        onClick: () => setActiveTab('postal'),
      });
    }
    if (showBoothTabs || (showRequestedTabWhileLoading && requestedTab === 'analysis')) {
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
    showBoothTabs,
    showRequestedTabWhileLoading,
    requestedTab,
    boothResults?.postal,
    boothResults?.dataQuality,
    boothResults?.unmapped,
  ]);

  const handleCopyLink = useCallback(async () => {
    if (acResultsLoading) return;
    const urlToShare = shareUrlWithTab ?? shareUrl ?? window.location.href;
    await copyLink(urlToShare, 'assembly');
  }, [shareUrlWithTab, shareUrl, acResultsLoading, copyLink]);

  const handleCopyPCLink = useCallback(async () => {
    await copyLink(pcContributionShareUrl, 'parliament');
  }, [pcContributionShareUrl, copyLink]);

  const panelRef = useRef<HTMLDivElement>(null);
  const candidatesScrollRef = useRef<HTMLDivElement>(null);

  /**
   * Reset the candidate list to the top whenever the constituency or year changes.
   * The scroll container is reused across selections, so without this the next AC
   * opens at the previous scroll offset and the rank-1 winner is clipped out of view.
   */
  const scrollIdentity = `${result.constituencyName ?? result.name ?? ''}|${result.year ?? ''}`;
  useEffect(() => {
    const el = candidatesScrollRef.current;
    if (el) el.scrollTop = 0;
  }, [scrollIdentity, activeTab]);

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

  const showElectionPanelHeader = !omitConstituencyHeading;

  return (
    <div
      ref={panelRef}
      className={[
        'election-panel',
        omitConstituencyHeading && 'election-panel--embed',
        isMobilePortrait && 'panel-full',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="controls-card pane-section">
        {showElectionPanelHeader && (
          <div className="election-panel-header">
            <div className="election-panel-title">
              <h3>
                {result.constituencyNameOriginal ??
                  result.name ??
                  result.constituencyName ??
                  'Unknown'}
              </h3>
              <span className={`constituency-type type-${constituencyType.toLowerCase()}`}>
                {constituencyType}
              </span>
            </div>
          </div>
        )}

        {layerOptions.length > 0 && (
          <YearSelector
            label="Layer"
            fieldId="ac-panel-layer"
            className="election-year-selector pane-section-tight"
            variant="stacked"
            options={layerOptions}
          />
        )}

        {/* Year selector - shows assembly and parliament years interleaved */}
        {allYearItems.length > 0 && (
          <YearSelector
            label="Year"
            fieldId="ac-panel-year"
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

        {/* A real tablist where it fits, the select where it does not (S5).
            The ref stays mounted on the wrapper so the width is measured even
            while the select is showing - otherwise we could never learn that
            the panel had grown enough to switch. */}
        <div ref={tabBarRef} className="panel-view-control">
          {useTabBar ? (
            <PanelTabs
              tabs={viewOptions.map((option) => ({
                id: option.id,
                label: option.label,
                title: option.title,
              }))}
              activeId={activeTab}
              onSelect={(id) => setActiveTab(id as TabType)}
              panelId="ac-panel-tabpanel"
              label="Result view"
            />
          ) : (
            <YearSelector
              label="View"
              fieldId="ac-panel-view"
              className="election-view-selector pane-section-tight"
              variant="stacked"
              options={viewOptions}
            />
          )}
        </div>
      </div>

      {/* Tab content */}
      <div
        className="panel-tab-content"
        id="ac-panel-tabpanel"
        // Only a tabpanel when a tablist is actually driving it; with the
        // select showing, the role would reference a tab that is not rendered.
        {...(useTabBar
          ? {
              role: 'tabpanel',
              'aria-labelledby': `ac-panel-tabpanel-tab-${activeTab}`,
              tabIndex: 0,
            }
          : {})}
      >
        {selectedPCYear && currentPCContribution ? (
          /* Parliament year: overview (full PC candidate list) + booths / postal / analysis */
          activeTab === 'booths' ? (
            <BoothWiseView
              boothResults={boothResults}
              boothsWithResults={boothsWithResults}
              selectedBoothId={selectedBoothId}
              onBoothSelect={setSelectedBoothId}
              selectedBooth={selectedBooth}
              partyShortNames={shortPartyUi}
              embeddedPanel={omitConstituencyHeading}
            />
          ) : activeTab === 'postal' && boothResults?.postal ? (
            <PostalBallotsView
              postal={boothResults.postal}
              unmapped={boothResults.unmapped}
              showUnmapped={shouldShowUnmappedInPostalTab(boothResults.dataQuality)}
              partyShortNames={shortPartyUi}
              embeddedPanel={omitConstituencyHeading}
            />
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
              embeddedPanel={omitConstituencyHeading}
            />
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
                      style={winnerPartyChipStyle(
                        getPartyColor(pcWinner.party),
                        omitConstituencyHeading
                      )}
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
                <h4>Parliament {currentPCContribution.year} — candidates</h4>
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
                        className={`candidate-row interactive-row ${idx === 0 ? 'winner' : ''} ${idx === 1 ? 'runner-up' : ''}`}
                      >
                        <span className="col-pos">{c.position}</span>
                        <span className="col-name" title={c.name}>
                          {c.name}
                        </span>
                        <span
                          className="col-party"
                          title={getPartyFullName(c.party)}
                          style={
                            omitConstituencyHeading
                              ? embeddedPartyChipStyle(getPartyColor(c.party))
                              : {
                                  backgroundColor: `${getPartyColor(c.party)}20`,
                                  color: getPartyColor(c.party),
                                  borderColor: getPartyColor(c.party),
                                  borderWidth: 1,
                                  borderStyle: 'solid',
                                }
                          }
                        >
                          {pl(c.party)}
                        </span>
                        <span className="col-votes">{formatNumber(c.votes)}</span>
                        <span className="col-share">{c.voteShare.toFixed(1)}%</span>
                        <CandidateBar
                          voteShare={c.voteShare}
                          party={c.party}
                          leaderShare={pcLeaderShare}
                        />
                      </div>
                    ))}
                  </div>
                </div>
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
            {boothResults?.dataQuality && (
              <BoothDataQualityBanner quality={boothResults.dataQuality} />
            )}
            {/* Podium -> KPI strip -> candidate table (UI revamp S1/S2).
                Previously a single winner card sat above a raw table, so the
                runner-up, third place and margin all required reading rows. */}
            <ResultPodium summary={podiumSummary} partyShortNames={shortPartyUi} />

            <KpiStrip
              kpis={kpiValues}
              winnerPartyLabel={podiumSummary.winner ? pl(podiumSummary.winner.party) : undefined}
              runnerPartyLabel={
                podiumSummary.runnerUp ? pl(podiumSummary.runnerUp.party) : undefined
              }
            />

            <div className="candidates-preview">
              <h4>Candidates</h4>
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
                  <div className="candidates-scroll" ref={candidatesScrollRef}>
                    {displayCandidates.map((candidate, idx) => (
                      <CandidateRow
                        key={idx}
                        candidate={candidate}
                        displayRank={idx + 1}
                        isWinner={!resultsPending && !acResultsLoading && idx === 0}
                        isRunnerUp={!resultsPending && !acResultsLoading && idx === 1}
                        hideVoteStats={hideAssemblyVoteFigures}
                        partyShortNames={shortPartyUi}
                        embeddedPanel={omitConstituencyHeading}
                        leaderShare={leaderShare}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : activeTab === 'postal' && boothResults?.postal ? (
          /* Postal Ballots view */
          <PostalBallotsView
            postal={boothResults.postal}
            unmapped={boothResults.unmapped}
            showUnmapped={shouldShowUnmappedInPostalTab(boothResults.dataQuality)}
            partyShortNames={shortPartyUi}
            embeddedPanel={omitConstituencyHeading}
          />
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
            embeddedPanel={omitConstituencyHeading}
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
            embeddedPanel={omitConstituencyHeading}
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
