import { Building2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { getPartyColor } from '../../../utils/partyData';
import { getFeatureColor } from '../../../utils/helpers';
import { resolvePcMapPolygonWinner } from '../../../utils/mapPolygonWinners';
import type {
  BrowseListWinnersContext,
  ConstituencyFeature,
  ConstituencyProperties,
  Feature,
  HexColor,
} from '../../../types';
import { sidebarListRowKeyDown, type ExtendedCSSProperties } from '../shared';

export interface ConstituencyBrowseListProps {
  features: Feature[];
  browseListWinnersContext: BrowseListWinnersContext | null;
  onConstituencyClick: (pcName: string, feature: ConstituencyFeature) => void;
}

/** Parliamentary constituency list for the current state (Layer = Parliament). */
export function ConstituencyBrowseList({
  features,
  browseListWinnersContext,
  onConstituencyClick,
}: ConstituencyBrowseListProps): ReactNode {
  if (!features.length) {
    return (
      <div className="district-list">
        <h3>No constituencies found</h3>
      </div>
    );
  }

  type SortedConstituency = { feature: Feature<ConstituencyProperties>; index: number };

  const sorted: SortedConstituency[] = [...features]
    .map(
      (f, idx): SortedConstituency => ({
        feature: f as Feature<ConstituencyProperties>,
        index: idx,
      })
    )
    .sort((a, b) => {
      const noA = parseInt(
        a.feature.properties.ls_seat_code ?? a.feature.properties.PC_No ?? '0',
        10
      );
      const noB = parseInt(
        b.feature.properties.ls_seat_code ?? b.feature.properties.PC_No ?? '0',
        10
      );
      return noA - noB;
    });

  return (
    <div className="district-list">
      <h3>Parliamentary Constituencies ({features.length})</h3>
      {sorted.map(({ feature, index }) => {
        const name = feature.properties.ls_seat_name ?? feature.properties.PC_NAME ?? 'Unknown';
        const pcNo = feature.properties.ls_seat_code ?? feature.properties.PC_No ?? '';
        const pw = resolvePcMapPolygonWinner({
          props: feature.properties,
          winners: browseListWinnersContext?.constituencyWinners ?? {},
          dominantPCParty: browseListWinnersContext?.dominantPCParty ?? null,
        });
        const color: HexColor = pw?.party
          ? (getPartyColor(pw.party) as HexColor)
          : getFeatureColor(index, 'constituencies');
        const style: ExtendedCSSProperties = { '--item-color': color };

        return (
          <div
            key={`pc-${index}`}
            className="constituency-item interactive-row"
            style={style}
            onClick={() => onConstituencyClick(name, feature as ConstituencyFeature)}
            onKeyDown={(e) =>
              sidebarListRowKeyDown(e, () =>
                onConstituencyClick(name, feature as ConstituencyFeature)
              )
            }
            role="button"
            tabIndex={0}
          >
            <Building2 size={16} className="item-icon" />
            <span>{name}</span>
            <span className="pc-number">{pcNo}</span>
          </div>
        );
      })}
    </div>
  );
}
