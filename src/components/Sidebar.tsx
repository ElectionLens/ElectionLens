import { normalizeStateName, getFeatureColor } from '../utils/helpers';
import type {
  SidebarProps,
  InfoPanelContent,
  GeoJSONData,
  StateFeature,
  DistrictFeature,
  ConstituencyFeature,
  AssemblyFeature,
  Feature,
  AssemblyProperties,
  ConstituencyProperties,
  DistrictProperties,
  StateProperties,
  HexColor
} from '../types';
import type { ReactNode, CSSProperties } from 'react';

/** Extended CSS properties to allow custom CSS variables */
interface ExtendedCSSProperties extends CSSProperties {
  '--item-color'?: string;
}

/**
 * Sidebar component for navigation and info display
 * Shows breadcrumbs, info panel, and lists of geographical features
 */
export function Sidebar({
  statesGeoJSON,
  currentState,
  currentView,
  currentPC,
  currentDistrict,
  cacheStats,
  currentData,
  onStateClick,
  onDistrictClick,
  onConstituencyClick,
  onAssemblyClick,
  onSwitchView,
  onReset,
  onGoBackToState,
  isOpen,
  onClose
}: SidebarProps): JSX.Element {
  const displayState = currentState ? normalizeStateName(currentState) : null;
  
  /**
   * Determine what to show in info panel based on current navigation
   */
  const getInfoContent = (): InfoPanelContent => {
    if (currentPC) {
      return {
        title: currentPC,
        statValue: displayState ?? '',
        statLabel: '',
        subValue: currentData?.features?.length ?? 0,
        subLabel: 'Assembly Segments'
      };
    }
    if (currentDistrict) {
      return {
        title: currentDistrict,
        statValue: displayState ?? '',
        statLabel: '',
        subValue: currentData?.features?.length ?? 0,
        subLabel: 'Assembly Segments'
      };
    }
    if (currentState) {
      const count = currentData?.features?.length ?? 0;
      return {
        title: displayState ?? '',
        statValue: displayState ?? '',
        statLabel: '',
        subValue: count,
        subLabel: currentView === 'constituencies' ? 'Lok Sabha Seats' : 'Districts'
      };
    }
    return {
      title: 'India',
      statValue: '36',
      statLabel: 'States & UTs',
      subValue: '-',
      subLabel: 'Select a State'
    };
  };

  const info = getInfoContent();
  
  /**
   * Render breadcrumb navigation
   */
  const renderBreadcrumb = (): ReactNode[] => {
    const crumbs: ReactNode[] = [
      <a key="india" onClick={onReset} role="button" tabIndex={0}>India</a>
    ];
    
    if (currentState) {
      crumbs.push(<span key="sep1"> › </span>);
      if (currentPC ?? currentDistrict) {
        crumbs.push(
          <a key="state" onClick={onGoBackToState} role="button" tabIndex={0}>{displayState}</a>
        );
        crumbs.push(<span key="sep2"> › </span>);
        if (currentPC) {
          crumbs.push(<span key="pc">{currentPC}</span>);
        } else if (currentDistrict) {
          crumbs.push(<span key="district">{currentDistrict}</span>);
          crumbs.push(<span key="sep3"> › Assemblies</span>);
        }
      } else {
        crumbs.push(<span key="state">{displayState}</span>);
      }
    }
    
    return crumbs;
  };

  /**
   * Check if features are assembly data (have valid AC_NAME) vs constituency data (have ls_seat_name)
   */
  const isAssemblyData = (features: Feature[]): boolean => {
    if (!features.length) return false;
    // Check first few features for AC_NAME with actual value
    const sample = features.slice(0, 5);
    const hasAssemblyProps = sample.some(f => {
      const props = f.properties as Record<string, unknown>;
      // Assembly data has AC_NAME with value, constituency has ls_seat_name
      const acName = props['AC_NAME'];
      return acName && typeof acName === 'string' && acName.trim() !== '';
    });
    const hasConstituencyProps = sample.some(f => {
      const props = f.properties as Record<string, unknown>;
      const seatName = props['ls_seat_name'];
      return seatName && typeof seatName === 'string';
    });
    // It's assembly data if it has AC_NAME values and NOT ls_seat_name
    return hasAssemblyProps && !hasConstituencyProps;
  };

  /**
   * Render the appropriate list based on current navigation level
   */
  const renderList = (): ReactNode => {
    // Show assemblies if we're in assembly view
    if (currentPC ?? currentDistrict) {
      // Check if we have no data at all (empty features)
      if (!currentData?.features?.length) {
        return (
          <div className="district-list">
            <h3>Assembly Constituencies</h3>
            <div className="no-data-message">
              <div className="no-data-icon">🏛️</div>
              <strong>No Assembly Data</strong>
              <p>
                {currentPC 
                  ? 'This is a Union Territory without a state legislative assembly, or assembly boundary data is not available.'
                  : 'This is a newer district created after delimitation, or assembly boundary data is not yet available for this district.'}
              </p>
            </div>
          </div>
        );
      }
      
      // Verify we have assembly data, not constituency data (race condition protection)
      if (!isAssemblyData(currentData.features as Feature[])) {
        return (
          <div className="district-list">
            <h3>Assembly Constituencies</h3>
            <div className="no-data-message">
              <div className="no-data-icon">⏳</div>
              <strong>Loading assembly data...</strong>
            </div>
          </div>
        );
      }
      
      type SortedAssembly = { feature: Feature<AssemblyProperties>; index: number };
      
      // Filter out features without valid names (pre-delimitation placeholders)
      const validFeatures = (currentData as GeoJSONData).features.filter(f => {
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
            const color = getFeatureColor(index, 'assemblies');
            const style: ExtendedCSSProperties = { '--item-color': color };
            
            return (
              <div
                key={`assembly-${index}`}
                className="assembly-item"
                style={style}
                onClick={() => onAssemblyClick?.(name, feature as AssemblyFeature)}
                role="button"
                tabIndex={0}
              >
                <span className="color-dot"></span>
                <span>{name}</span>
                <span className="ac-number">{acNo}</span>
              </div>
            );
          })}
        </div>
      );
    }
    
    // Show constituencies
    if (currentState && currentView === 'constituencies') {
      if (!currentData?.features?.length) {
        return <div className="district-list"><h3>No constituencies found</h3></div>;
      }
      
      type SortedConstituency = { feature: Feature<ConstituencyProperties>; index: number };
      
      const sorted: SortedConstituency[] = [...(currentData as GeoJSONData).features]
        .map((f, idx): SortedConstituency => ({ feature: f as Feature<ConstituencyProperties>, index: idx }))
        .sort((a, b) => {
          const noA = parseInt(a.feature.properties.ls_seat_code ?? a.feature.properties.PC_No ?? '0', 10);
          const noB = parseInt(b.feature.properties.ls_seat_code ?? b.feature.properties.PC_No ?? '0', 10);
          return noA - noB;
        });
      
      return (
        <div className="district-list">
          <h3>Parliamentary Constituencies ({currentData.features.length})</h3>
          {sorted.map(({ feature, index }) => {
            const name = feature.properties.ls_seat_name ?? feature.properties.PC_NAME ?? 'Unknown';
            const pcNo = feature.properties.ls_seat_code ?? feature.properties.PC_No ?? '';
            const color = getFeatureColor(index, 'constituencies');
            const style: ExtendedCSSProperties = { '--item-color': color };
            
            return (
              <div
                key={`pc-${index}`}
                className="constituency-item"
                style={style}
                onClick={() => onConstituencyClick(name, feature as ConstituencyFeature)}
                role="button"
                tabIndex={0}
              >
                <span className="color-dot"></span>
                <span>{name}</span>
                <span className="pc-number">{pcNo}</span>
              </div>
            );
          })}
        </div>
      );
    }
    
    // Show districts
    if (currentState && currentView === 'districts') {
      if (!currentData?.features?.length) {
        return <div className="district-list"><h3>No districts found</h3></div>;
      }
      
      type DistrictItem = { name: string; index: number; feature: Feature<DistrictProperties> };
      
      const districts: DistrictItem[] = (currentData as GeoJSONData).features
        .map((f, idx): DistrictItem => {
          const feat = f as Feature<DistrictProperties>;
          return {
            name: feat.properties.district ?? feat.properties.NAME ?? feat.properties.DISTRICT ?? 'Unknown',
            index: idx,
            feature: feat
          };
        })
        .sort((a, b) => a.name.localeCompare(b.name));
      
      return (
        <div className="district-list">
          <h3>Districts ({currentData.features.length})</h3>
          {districts.map(({ name, index, feature }) => {
            const color = getFeatureColor(index, 'districts');
            const style: ExtendedCSSProperties = { '--item-color': color };
            return (
              <div
                key={`district-${index}`}
                className="district-item"
                style={style}
                onClick={() => onDistrictClick(name, feature as DistrictFeature)}
                role="button"
                tabIndex={0}
              >
                <span className="color-dot"></span>
                <span>{name}</span>
              </div>
            );
          })}
        </div>
      );
    }
    
    // Show states list (India view)
    if (statesGeoJSON?.features) {
      type StateItem = { name: string; index: number; feature: Feature<StateProperties> };
      
      const states: StateItem[] = statesGeoJSON.features
        .map((f, idx): StateItem => {
          const feat = f as Feature<StateProperties>;
          return {
            name: feat.properties.shapeName ?? feat.properties.ST_NM ?? '',
            index: idx,
            feature: feat
          };
        })
        .sort((a, b) => normalizeStateName(a.name).localeCompare(normalizeStateName(b.name)));
      
      return (
        <div className="district-list">
          <h3>States & Union Territories ({states.length})</h3>
          {states.map(({ name, index, feature }) => {
            const displayName = normalizeStateName(name);
            const color: HexColor = getFeatureColor(index, 'states');
            return (
              <div
                key={`state-${index}`}
                className="district-item"
                onClick={() => onStateClick(name, feature as StateFeature)}
                role="button"
                tabIndex={0}
              >
                <span className="color-dot" style={{ background: color }}></span>
                <span>{displayName}</span>
              </div>
            );
          })}
        </div>
      );
    }
    
    return null;
  };

  // Show view toggle only when state is selected and not in assembly view
  const showViewToggle = currentState && !currentPC && !currentDistrict;

  return (
    <>
      <div className={`sidebar ${isOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <h1>🔍 Election Lens</h1>
          <p>India Electoral Map</p>
        </div>
        
        <div className="breadcrumb">
          {renderBreadcrumb()}
        </div>
        
        <div className="info-panel">
          <div className="info-title">{info.title}</div>
          <div className="info-stats">
            <div className="stat-card">
              <div className="stat-value">{info.statValue}</div>
              <div className="stat-label">{info.statLabel}</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{info.subValue}</div>
              <div className="stat-label">{info.subLabel}</div>
            </div>
          </div>
          
          {showViewToggle && (
            <div className="view-toggle">
              <button
                className={`toggle-btn ${currentView === 'constituencies' ? 'active' : ''}`}
                onClick={() => onSwitchView('constituencies')}
              >
                🗳️ Constituencies
              </button>
              <button
                className={`toggle-btn ${currentView === 'districts' ? 'active' : ''}`}
                onClick={() => onSwitchView('districts')}
              >
                🗺️ Districts
              </button>
            </div>
          )}
          
          {renderList()}
        </div>
        
        <div className="cache-status">
          <strong>💾 DB:</strong> {cacheStats.dbCount} items
          {' | '}<strong>🗺️</strong> {cacheStats.memCount}/{cacheStats.totalStates}
          {' | '}<strong>🗳️ PC:</strong> {cacheStats.pcCount}
          {' | '}<strong>🏛️ AC:</strong> {cacheStats.acCount}
          {cacheStats.memCount >= (cacheStats.totalStates ?? 0) && cacheStats.pcCount > 0 && cacheStats.acCount > 0 && (
            <span style={{ color: '#22c55e' }}> ✓</span>
          )}
        </div>
      </div>
      
      {/* Mobile overlay */}
      <div 
        className={`sidebar-overlay ${isOpen ? 'visible' : ''}`} 
        onClick={onClose}
        role="button"
        tabIndex={-1}
        aria-label="Close sidebar"
      />
    </>
  );
}

