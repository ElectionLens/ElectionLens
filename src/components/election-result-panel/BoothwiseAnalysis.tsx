import {
  Award,
  BarChart3,
  MapPin,
  ChevronDown,
  Lightbulb,
  Target,
  Zap,
  TrendingDown,
  AlertTriangle,
} from 'lucide-react';
import { useState, useCallback, useMemo } from 'react';
import type { BoothResults, BoothWithResult } from '../../hooks/useBoothData';
import { getPartyColor, getPartyFullName, getPartyShortName } from '../../utils/partyData';
import { BoothDataQualityBanner } from '../BoothDataQualityBanner';
import { embeddedPartyChipStyle, solidPartyChipStyle, formatNumber } from './shared';
import { computeBoothwiseAnalysis, type AnalysisInsight } from './boothwiseAnalysisEngine';
import { InsightCard } from './InsightCard';

// Boothwise Analysis component - provides detailed insights on election results
interface BoothwiseAnalysisProps {
  boothResults: BoothResults | null | undefined;
  boothsWithResults: BoothWithResult[];
  onBoothClick?: (boothId: string) => void;
  officialWinner?: string | undefined; // Official winner party from election results
  /** Kerala / West Bengal 2026 — show INC, CPI(M), TMC, etc. instead of full ECI names */
  partyShortNames?: boolean;
  embeddedPanel?: boolean;
}

export function BoothwiseAnalysis({
  boothResults,
  boothsWithResults,
  onBoothClick,
  officialWinner,
  partyShortNames = false,
  embeddedPanel = false,
}: BoothwiseAnalysisProps): JSX.Element {
  const pl = (p: string) => (partyShortNames ? getPartyShortName(p) : p);

  const analysis = useMemo(
    () =>
      computeBoothwiseAnalysis(boothResults, boothsWithResults, officialWinner, partyShortNames),
    [boothResults, boothsWithResults, officialWinner, partyShortNames]
  );

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
      {boothResults?.dataQuality && (
        <BoothDataQualityBanner quality={boothResults.dataQuality} compact />
      )}
      {/* Booth Distribution Bar */}
      <div className="booth-distribution">
        <h3 className="section-heading">
          <BarChart3 size={16} />
          Booth Distribution
        </h3>
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
        <h3 className="section-heading">
          <MapPin size={16} />
          Booths Won by Party
        </h3>
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
                      <span
                        className="party-badge"
                        style={
                          embeddedPanel
                            ? embeddedPartyChipStyle(partyColor)
                            : solidPartyChipStyle(partyColor)
                        }
                      >
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
        <h3 className="section-heading">
          <Lightbulb size={16} />
          Key Insights
        </h3>
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
        <h3 className="section-heading">
          <Target size={16} />
          Party Strike Rates
        </h3>
        <div className="strike-rate-list">
          {analysis.strikeRates.slice(0, 5).map((sr, idx) => (
            <div key={sr.party} className={`strike-rate-row ${idx === 0 ? 'winner' : ''}`}>
              <span className="sr-rank">{idx + 1}</span>
              <span
                className="sr-party"
                style={
                  embeddedPanel
                    ? embeddedPartyChipStyle(getPartyColor(sr.party))
                    : solidPartyChipStyle(getPartyColor(sr.party))
                }
              >
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
        <h3 className="section-heading">
          <Zap size={16} />
          Quick Stats
        </h3>
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
