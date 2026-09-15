import { ChevronDown, MapPin } from 'lucide-react';
import { useState } from 'react';
import type { AnalysisInsight } from './boothwiseAnalysisEngine';

// Component to render a single insight card with expand/collapse for many booths
export function InsightCard({
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
