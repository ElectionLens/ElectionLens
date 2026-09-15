import { Map } from 'lucide-react';
import type { ReactNode } from 'react';
import { getPartyColor } from '../../../utils/partyData';
import { getElectionStateId, getFeatureColor, normalizeName } from '../../../utils/helpers';
import type {
  BrowseListWinnersContext,
  Feature,
  HexColor,
  StateFeature,
  StateProperties,
  StatesGeoJSON,
} from '../../../types';
import { sidebarListRowKeyDown, type ExtendedCSSProperties } from '../shared';

export interface StateBrowseListProps {
  statesGeoJSON: StatesGeoJSON | null;
  browseListWinnersContext: BrowseListWinnersContext | null;
  onStateClick: (stateName: string, feature: StateFeature) => void;
}

/** Top-level India view: all states & union territories. */
export function StateBrowseList({
  statesGeoJSON,
  browseListWinnersContext,
  onStateClick,
}: StateBrowseListProps): ReactNode {
  if (!statesGeoJSON?.features) return null;

  type StateItem = { name: string; index: number; feature: Feature<StateProperties> };

  const states: StateItem[] = statesGeoJSON.features
    .map((f, idx): StateItem => {
      const feat = f as Feature<StateProperties>;
      return {
        name: feat.properties.shapeName ?? feat.properties.ST_NM ?? '',
        index: idx,
        feature: feat,
      };
    })
    .sort((a, b) => normalizeName(a.name).localeCompare(normalizeName(b.name)));

  return (
    <div className="district-list">
      <h3>States & Union Territories ({states.length})</h3>
      {states.map(({ name, index, feature }) => {
        const displayName = normalizeName(name);
        const stateId = feature.properties.schemaId ?? getElectionStateId(name);
        const sw = browseListWinnersContext?.stateWinners[stateId]?.party;
        const color: HexColor = sw
          ? (getPartyColor(sw) as HexColor)
          : getFeatureColor(index, 'states');
        return (
          <div
            key={`state-${index}`}
            className="district-item state-item interactive-row"
            onClick={() => onStateClick(name, feature as StateFeature)}
            onKeyDown={(e) =>
              sidebarListRowKeyDown(e, () => onStateClick(name, feature as StateFeature))
            }
            role="button"
            tabIndex={0}
            style={{ '--item-color': color } as ExtendedCSSProperties}
          >
            <Map size={16} className="item-icon" />
            <span>{displayName}</span>
          </div>
        );
      })}
    </div>
  );
}
