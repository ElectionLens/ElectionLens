import { Landmark, Clock } from 'lucide-react';
import type { ReactNode } from 'react';
import { getPartyColor } from '../../../utils/partyData';
import { getElectionStateId, getFeatureColor } from '../../../utils/helpers';
import { resolveAssemblyMapPolygonWinner } from '../../../utils/mapPolygonWinners';
import type {
  AssemblyFeature,
  AssemblyProperties,
  BrowseListWinnersContext,
  Feature,
  HexColor,
} from '../../../types';
import {
  sidebarListRowKeyDown,
  rowHoverProps,
  type ExtendedCSSProperties,
  type RowHoverHandlers,
} from '../shared';

/**
 * Check if features are assembly data (have valid AC_NAME) vs constituency data (have ls_seat_name).
 * Guards against a race where stale constituency-shaped features briefly linger during a view switch.
 */
export function isAssemblyData(features: Feature[]): boolean {
  if (!features.length) return false;
  const sample = features.slice(0, 5);
  const hasAssemblyProps = sample.some((f) => {
    const props = f.properties as Record<string, unknown>;
    const acName = props['AC_NAME'];
    return acName && typeof acName === 'string' && acName.trim() !== '';
  });
  const hasConstituencyProps = sample.some((f) => {
    const props = f.properties as Record<string, unknown>;
    const seatName = props['ls_seat_name'];
    return seatName && typeof seatName === 'string';
  });
  return hasAssemblyProps && !hasConstituencyProps;
}

export interface AssemblyBrowseListProps extends RowHoverHandlers {
  /** Raw features for the current level - may be empty or still constituency-shaped mid-transition. */
  features: Feature[];
  /** Shown when `features` is empty (message differs by caller context). */
  emptyState: ReactNode;
  browseListWinnersContext: BrowseListWinnersContext | null;
  currentPC: string | null;
  currentDistrict: string | null;
  currentState: string | null;
  resolveDistrictName?: ((districtName: string, stateId: string) => string | null) | undefined;
  onAssemblyClick?: ((acName: string, feature: AssemblyFeature) => void) | undefined;
}

/** Assembly constituency list, shared between the "AC under PC/district" and "AC for whole state" views. */
export function AssemblyBrowseList({
  features,
  emptyState,
  browseListWinnersContext,
  currentPC,
  currentDistrict,
  currentState,
  resolveDistrictName,
  onAssemblyClick,
  onRowEnter,
  onRowLeave,
}: AssemblyBrowseListProps): ReactNode {
  if (!features.length) {
    return emptyState;
  }

  if (!isAssemblyData(features)) {
    return (
      <div className="district-list">
        <h3>Assembly Constituencies</h3>
        <div className="no-data-message">
          <div className="no-data-icon">
            <Clock size={40} />
          </div>
          <strong>Loading assembly data...</strong>
        </div>
      </div>
    );
  }

  type SortedAssembly = { feature: Feature<AssemblyProperties>; index: number };

  // Filter out features without valid names (pre-delimitation placeholders)
  const validFeatures = features.filter((f) => {
    const props = (f as Feature<AssemblyProperties>).properties;
    return props.AC_NAME && props.AC_NAME.trim() !== '';
  });

  const sorted: SortedAssembly[] = validFeatures
    .map((f, idx): SortedAssembly => ({ feature: f as Feature<AssemblyProperties>, index: idx }))
    .sort((a, b) => {
      const noA = parseInt(a.feature.properties.AC_NO ?? '0', 10);
      const noB = parseInt(b.feature.properties.AC_NO ?? '0', 10);
      return noA - noB;
    });

  return (
    <div className="district-list">
      <h3>Assembly Constituencies ({sorted.length})</h3>
      {sorted.map(({ feature, index }) => {
        const name = feature.properties.AC_NAME ?? '';
        const acNo = feature.properties.AC_NO ?? '';
        const aw = resolveAssemblyMapPolygonWinner({
          props: feature.properties,
          winners: browseListWinnersContext?.constituencyWinners ?? {},
          suppressAssemblyPartyMapColors:
            browseListWinnersContext?.suppressAssemblyPartyMapColors ?? false,
          currentPC,
          currentDistrict,
          currentState,
          getStateId: getElectionStateId,
          districtWinners: browseListWinnersContext?.districtWinners ?? {},
          resolveDistrictName: resolveDistrictName ?? (() => null),
        });
        const color: HexColor = aw?.party
          ? (getPartyColor(aw.party) as HexColor)
          : getFeatureColor(index, 'assemblies');
        const style: ExtendedCSSProperties = { '--item-color': color };

        return (
          <div
            key={`assembly-${index}`}
            className="assembly-item interactive-row"
            style={style}
            onClick={() => onAssemblyClick?.(name, feature as AssemblyFeature)}
            {...rowHoverProps(
              { onRowEnter, onRowLeave },
              {
                level: 'assemblies',
                name,
                // AC_NO disambiguates same-named ACs (TN has two
                // Tiruppatturs); without it the matcher refuses to guess.
                no: Number.isFinite(parseInt(acNo, 10)) ? parseInt(acNo, 10) : undefined,
                schemaId: (feature.properties as { schemaId?: string }).schemaId,
              }
            )}
            onKeyDown={(e) =>
              sidebarListRowKeyDown(e, () => onAssemblyClick?.(name, feature as AssemblyFeature))
            }
            role="button"
            tabIndex={0}
          >
            <Landmark size={14} className="item-icon" />
            <span>{name}</span>
            <span className="ac-number">{acNo}</span>
          </div>
        );
      })}
    </div>
  );
}
