import type { CSSProperties } from 'react';
import { Users } from 'lucide-react';
import type { BoothWithResult } from '../../hooks/useBoothData';
import { useVirtualList } from '../../hooks/useVirtualList';
import { getPartyColor, getPartyShortName } from '../../utils/partyData';
import { winnerPartyChipStyle, formatNumber } from './shared';

interface BoothMiniCardGridProps {
  booths: BoothWithResult[];
  selectedBoothId: string | null;
  onBoothSelect: (boothId: string) => void;
  embeddedPanel?: boolean;
}

/** Fixed row height every card renders at - see useVirtualList's docstring for why fixed. */
const CARD_HEIGHT = 56;
/** Above this count virtualization actually matters; below it the DOM cost is trivial. */
const VIRTUALIZE_THRESHOLD = 60;
/** Cards without a visible list role would read as an empty region to a screen reader. */
const LIST_LABEL = 'Booths (click to view details)';

interface ExtendedCSSProperties extends CSSProperties {
  '--item-color'?: string;
}

function boothAccessibleLabel(booth: BoothWithResult): string {
  const parts = [`Booth ${booth.boothNo}`];
  if (booth.type === 'women') parts.push("women's booth");
  if (booth.winner) {
    parts.push(`${booth.winner.party} won with ${booth.winner.percent.toFixed(1)} percent`);
  } else if (booth.voteSource === 'missing') {
    parts.push('no data');
  }
  if (booth.result) parts.push(`${formatNumber(booth.result.total)} total votes`);
  return parts.join(', ');
}

function BoothMiniCard({
  booth,
  selected,
  onSelect,
  embeddedPanel,
}: {
  booth: BoothWithResult;
  selected: boolean;
  onSelect: () => void;
  embeddedPanel: boolean;
}) {
  const winnerColor = booth.winner ? getPartyColor(booth.winner.party) : undefined;
  const percent = booth.winner?.percent ?? 0;

  return (
    <button
      type="button"
      className={`booth-mini-card${selected ? ' selected' : ''}`}
      style={winnerColor ? ({ '--item-color': winnerColor } as ExtendedCSSProperties) : undefined}
      onClick={onSelect}
      aria-pressed={selected}
      aria-label={boothAccessibleLabel(booth)}
    >
      <span className="booth-mini-card-no">
        {booth.boothNo}
        {booth.type === 'women' && <Users size={11} className="booth-mini-card-women-icon" />}
      </span>

      <span className="booth-mini-card-body">
        {booth.winner ? (
          <>
            <span
              className="booth-mini-card-party"
              style={winnerPartyChipStyle(getPartyColor(booth.winner.party), embeddedPanel)}
            >
              {getPartyShortName(booth.winner.party)}
            </span>
            <span className="booth-mini-card-bar-track">
              <span
                className="booth-mini-card-bar-fill"
                style={{ width: `${Math.min(percent, 100)}%`, backgroundColor: winnerColor }}
              />
            </span>
            <span className="booth-mini-card-percent">{percent.toFixed(0)}%</span>
          </>
        ) : (
          <span className="booth-mini-card-no-data">
            {booth.voteSource === 'missing' ? 'No data' : '\u2014'}
          </span>
        )}
      </span>
    </button>
  );
}

/**
 * Scannable, virtualized grid of booth mini-cards (UI revamp S6).
 *
 * The map-marker-click trigger the original plan called for isn't honest to
 * build yet: none of the booth JSON in `public/data/booths` carries
 * lat/lng (see `Booth.location` in useBoothData.ts - always undefined in
 * practice), so there is no marker to click. What *is* achievable, and what
 * this delivers, is the actual value behind S6: replacing "pick one booth
 * from a giant dropdown, see nothing else" with a scannable list of cards -
 * booth number, winner chip, and a vote-share bar - that stays smooth for a
 * 909-booth constituency because only the rows near the viewport ever become
 * real DOM nodes.
 */
export function BoothMiniCardGrid({
  booths,
  selectedBoothId,
  onBoothSelect,
  embeddedPanel = false,
}: BoothMiniCardGridProps): JSX.Element | null {
  const { containerRef, totalHeight, visibleItems } = useVirtualList(booths, CARD_HEIGHT);

  if (booths.length === 0) return null;

  // Small lists render flat (no absolute positioning / scroll container) -
  // virtualization machinery earns nothing here and would just add a fixed
  // height where the content could otherwise size naturally.
  if (booths.length <= VIRTUALIZE_THRESHOLD) {
    return (
      <div className="booth-mini-card-grid" role="list" aria-label={LIST_LABEL}>
        {booths.map((booth) => (
          <BoothMiniCard
            key={booth.id}
            booth={booth}
            selected={booth.id === selectedBoothId}
            onSelect={() => onBoothSelect(booth.id)}
            embeddedPanel={embeddedPanel}
          />
        ))}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="booth-mini-card-grid booth-mini-card-grid--virtualized"
      role="list"
      aria-label={LIST_LABEL}
    >
      <div className="booth-mini-card-grid-spacer" style={{ height: totalHeight }}>
        {visibleItems.map(({ item: booth, offsetTop }) => (
          <div
            key={booth.id}
            className="booth-mini-card-slot"
            style={{ transform: `translateY(${offsetTop}px)`, height: CARD_HEIGHT }}
          >
            <BoothMiniCard
              booth={booth}
              selected={booth.id === selectedBoothId}
              onSelect={() => onBoothSelect(booth.id)}
              embeddedPanel={embeddedPanel}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

export default BoothMiniCardGrid;
