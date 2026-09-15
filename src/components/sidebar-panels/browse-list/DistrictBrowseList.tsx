import { Map } from 'lucide-react';
import type { ReactNode } from 'react';
import { getPartyColor } from '../../../utils/partyData';
import { getElectionStateId, getFeatureColor } from '../../../utils/helpers';
import { resolveDistrictPolygonParty } from '../../../utils/mapPolygonWinners';
import type {
  BrowseListWinnersContext,
  DistrictFeature,
  DistrictProperties,
  Feature,
  HexColor,
} from '../../../types';
import { sidebarListRowKeyDown, type ExtendedCSSProperties } from '../shared';

export interface DistrictBrowseListProps {
  features: Feature[];
  browseListWinnersContext: BrowseListWinnersContext | null;
  currentState: string | null;
  resolveDistrictName?: ((districtName: string, stateId: string) => string | null) | undefined;
  getDistrict?: ((districtId: string) => { name?: string } | null | undefined) | undefined;
  onDistrictClick: (districtName: string, feature: DistrictFeature) => void;
}

/** District list for the current state (Layer = Districts). */
export function DistrictBrowseList({
  features,
  browseListWinnersContext,
  currentState,
  resolveDistrictName,
  getDistrict,
  onDistrictClick,
}: DistrictBrowseListProps): ReactNode {
  if (!features.length) {
    return (
      <div className="district-list">
        <h3>No districts found</h3>
      </div>
    );
  }

  type DistrictItem = { name: string; index: number; feature: Feature<DistrictProperties> };

  const districts: DistrictItem[] = features
    .map((f, idx): DistrictItem => {
      const feat = f as Feature<DistrictProperties>;
      return {
        name:
          feat.properties.district ?? feat.properties.NAME ?? feat.properties.DISTRICT ?? 'Unknown',
        index: idx,
        feature: feat,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="district-list">
      <h3>Districts ({features.length})</h3>
      {districts.map(({ name, index, feature }) => {
        const dp =
          browseListWinnersContext && currentState
            ? resolveDistrictPolygonParty(feature.properties, {
                districtWinners: browseListWinnersContext.districtWinners,
                currentState,
                getStateId: getElectionStateId,
                resolveDistrictName: resolveDistrictName ?? (() => null),
                suppressPartyColors: browseListWinnersContext.suppressAssemblyPartyMapColors,
                ...(getDistrict ? { getDistrict } : {}),
              })
            : undefined;
        const color: HexColor = dp
          ? (getPartyColor(dp) as HexColor)
          : getFeatureColor(index, 'districts');
        const style: ExtendedCSSProperties = { '--item-color': color };
        return (
          <div
            key={`district-${index}`}
            className="district-item interactive-row"
            style={style}
            onClick={() => onDistrictClick(name, feature as DistrictFeature)}
            onKeyDown={(e) =>
              sidebarListRowKeyDown(e, () => onDistrictClick(name, feature as DistrictFeature))
            }
            role="button"
            tabIndex={0}
          >
            <Map size={14} className="item-icon" />
            <span>{name}</span>
          </div>
        );
      })}
    </div>
  );
}
