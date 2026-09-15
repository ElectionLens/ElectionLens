import { Landmark } from 'lucide-react';
import type { ReactNode } from 'react';
import type {
  AssemblyFeature,
  BrowseListWinnersContext,
  ConstituencyFeature,
  DistrictFeature,
  Feature,
  GeoJSONData,
  StateFeature,
  StatesGeoJSON,
  ViewMode,
} from '../../../types';
import { AssemblyBrowseList } from './AssemblyBrowseList';
import { ConstituencyBrowseList } from './ConstituencyBrowseList';
import { DistrictBrowseList } from './DistrictBrowseList';
import { StateBrowseList } from './StateBrowseList';

export interface BrowseListProps {
  statesGeoJSON: StatesGeoJSON | null;
  currentData: GeoJSONData | null;
  currentState: string | null;
  currentView: ViewMode;
  currentPC: string | null;
  currentDistrict: string | null;
  browseListWinnersContext: BrowseListWinnersContext | null;
  resolveDistrictName?: ((districtName: string, stateId: string) => string | null) | undefined;
  getDistrict?: ((districtId: string) => { name?: string } | null | undefined) | undefined;
  onStateClick: (stateName: string, feature: StateFeature) => void;
  onDistrictClick: (districtName: string, feature: DistrictFeature) => void;
  onConstituencyClick: (pcName: string, feature: ConstituencyFeature) => void;
  onAssemblyClick?: ((acName: string, feature: AssemblyFeature) => void) | undefined;
}

/**
 * Dispatches to the right browse-list level based on current navigation depth:
 * AC (nested under PC/district) > PC constituencies > districts > state-wide AC > India states.
 */
export function BrowseList({
  statesGeoJSON,
  currentData,
  currentState,
  currentView,
  currentPC,
  currentDistrict,
  browseListWinnersContext,
  resolveDistrictName,
  getDistrict,
  onStateClick,
  onDistrictClick,
  onConstituencyClick,
  onAssemblyClick,
}: BrowseListProps): ReactNode {
  // Assembly constituencies nested under a selected PC or district
  if (currentPC ?? currentDistrict) {
    return (
      <AssemblyBrowseList
        features={(currentData?.features ?? []) as Feature[]}
        browseListWinnersContext={browseListWinnersContext}
        currentPC={currentPC}
        currentDistrict={currentDistrict}
        currentState={currentState}
        resolveDistrictName={resolveDistrictName}
        onAssemblyClick={onAssemblyClick}
        emptyState={
          <div className="district-list">
            <h3>Assembly Constituencies</h3>
            <div className="no-data-message">
              <div className="no-data-icon">
                <Landmark size={40} />
              </div>
              <strong>No Assembly Data</strong>
              <p>
                {currentPC
                  ? 'This is a Union Territory without a state legislative assembly, or assembly boundary data is not available.'
                  : 'This is a newer district created after delimitation, or assembly boundary data is not yet available for this district.'}
              </p>
            </div>
          </div>
        }
      />
    );
  }

  // Parliamentary constituencies for the current state
  if (currentState && currentView === 'constituencies') {
    return (
      <ConstituencyBrowseList
        features={(currentData?.features ?? []) as Feature[]}
        browseListWinnersContext={browseListWinnersContext}
        onConstituencyClick={onConstituencyClick}
      />
    );
  }

  // Districts for the current state
  if (currentState && currentView === 'districts') {
    return (
      <DistrictBrowseList
        features={(currentData?.features ?? []) as Feature[]}
        browseListWinnersContext={browseListWinnersContext}
        currentState={currentState}
        resolveDistrictName={resolveDistrictName}
        getDistrict={getDistrict}
        onDistrictClick={onDistrictClick}
      />
    );
  }

  // All assemblies for the current state (AC view at state level)
  if (currentState && currentView === 'assemblies') {
    return (
      <AssemblyBrowseList
        features={(currentData?.features ?? []) as Feature[]}
        browseListWinnersContext={browseListWinnersContext}
        currentPC={currentPC}
        currentDistrict={currentDistrict}
        currentState={currentState}
        resolveDistrictName={resolveDistrictName}
        onAssemblyClick={onAssemblyClick}
        emptyState={
          <div className="district-list">
            <h3>Assembly Constituencies</h3>
            <div className="no-data-message">
              <div className="no-data-icon">
                <Landmark size={40} />
              </div>
              <strong>Loading assembly data...</strong>
            </div>
          </div>
        }
      />
    );
  }

  // Top-level India view: all states & union territories
  if (statesGeoJSON?.features) {
    return (
      <StateBrowseList
        statesGeoJSON={statesGeoJSON}
        browseListWinnersContext={browseListWinnersContext}
        onStateClick={onStateClick}
      />
    );
  }

  return null;
}
