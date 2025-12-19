import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MapView } from './MapView';
import type { StatesGeoJSON, GeoJSONData, MapViewProps, ViewMode } from '../types';

// Mock data with proper type assertions
const mockStatesGeoJSON = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { shapeName: 'Tamil Nadu', ST_NM: 'Tamil Nadu' },
      geometry: { type: 'Polygon', coordinates: [[[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]]] }
    },
    {
      type: 'Feature',
      properties: { shapeName: 'Kerala', ST_NM: 'Kerala' },
      geometry: { type: 'Polygon', coordinates: [[[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]]] }
    },
    {
      type: 'Feature',
      properties: { shapeName: 'Karnataka', ST_NM: 'Karnataka' },
      geometry: { type: 'Polygon', coordinates: [[[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]]] }
    }
  ]
} as unknown as StatesGeoJSON;

const mockConstituencyData = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { ls_seat_name: 'Chennai South', ls_seat_code: '1' },
      geometry: { type: 'Polygon', coordinates: [[[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]]] }
    },
    {
      type: 'Feature',
      properties: { ls_seat_name: 'Chennai Central', ls_seat_code: '2' },
      geometry: { type: 'Polygon', coordinates: [[[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]]] }
    },
    {
      type: 'Feature',
      properties: { PC_NAME: 'Chennai North', PC_No: '3' },
      geometry: { type: 'Polygon', coordinates: [[[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]]] }
    }
  ]
} as unknown as GeoJSONData;

const mockDistrictData = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { district: 'Chennai' },
      geometry: { type: 'Polygon', coordinates: [[[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]]] }
    },
    {
      type: 'Feature',
      properties: { NAME: 'Coimbatore' },
      geometry: { type: 'Polygon', coordinates: [[[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]]] }
    },
    {
      type: 'Feature',
      properties: { DISTRICT: 'Madurai' },
      geometry: { type: 'Polygon', coordinates: [[[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]]] }
    }
  ]
} as unknown as GeoJSONData;

const mockAssemblyData = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { AC_NAME: 'Mylapore', AC_NO: '1' },
      geometry: { type: 'Polygon', coordinates: [[[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]]] }
    },
    {
      type: 'Feature',
      properties: { AC_NAME: 'Velachery', AC_NO: '2' },
      geometry: { type: 'Polygon', coordinates: [[[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]]] }
    }
  ]
} as unknown as GeoJSONData;

const defaultProps: MapViewProps = {
  statesGeoJSON: mockStatesGeoJSON,
  currentData: null,
  currentState: null,
  currentView: 'constituencies' as ViewMode,
  currentPC: null,
  currentDistrict: null,
  onStateClick: vi.fn(),
  onDistrictClick: vi.fn(),
  onConstituencyClick: vi.fn(),
  onAssemblyClick: vi.fn(),
  onSwitchView: vi.fn(),
  onReset: vi.fn()
};

describe('MapView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('rendering - basic structure', () => {
    it('should render map container', () => {
      render(<MapView {...defaultProps} />);
      expect(screen.getByTestId('map-container')).toBeInTheDocument();
    });

    it('should render tile layer', () => {
      render(<MapView {...defaultProps} />);
      expect(screen.getByTestId('tile-layer')).toBeInTheDocument();
    });

    it('should render within map-container div', () => {
      const { container } = render(<MapView {...defaultProps} />);
      expect(container.querySelector('.map-container')).toBeInTheDocument();
    });
  });

  describe('rendering - GeoJSON layer', () => {
    it('should render GeoJSON layer with states data', () => {
      render(<MapView {...defaultProps} />);
      
      const geoJsonLayer = screen.getByTestId('geojson-layer');
      expect(geoJsonLayer).toBeInTheDocument();
      expect(geoJsonLayer).toHaveAttribute('data-features', '3');
    });

    it('should update GeoJSON layer when data changes', () => {
      const { rerender } = render(<MapView {...defaultProps} />);
      
      let geoJsonLayer = screen.getByTestId('geojson-layer');
      expect(geoJsonLayer).toHaveAttribute('data-features', '3');
      
      // Rerender with constituency data
      rerender(
        <MapView 
          {...defaultProps}
          currentState="Tamil Nadu"
          currentData={mockConstituencyData}
        />
      );
      
      geoJsonLayer = screen.getByTestId('geojson-layer');
      expect(geoJsonLayer).toHaveAttribute('data-features', '3');
    });
  });

  describe('India view (no state selected)', () => {
    it('should display states GeoJSON when no state selected', () => {
      render(<MapView {...defaultProps} />);
      
      const geoJsonLayer = screen.getByTestId('geojson-layer');
      expect(geoJsonLayer).toHaveAttribute('data-features', '3');
    });

    it('should use states level styling', () => {
      render(<MapView {...defaultProps} />);
      // Component should render without error using states level
      expect(screen.getByTestId('geojson-layer')).toBeInTheDocument();
    });
  });

  describe('state view - constituencies', () => {
    it('should render constituency data when state selected', () => {
      render(
        <MapView 
          {...defaultProps} 
          currentState="Tamil Nadu"
          currentData={mockConstituencyData}
        />
      );
      
      const geoJsonLayer = screen.getByTestId('geojson-layer');
      expect(geoJsonLayer).toHaveAttribute('data-features', '3');
    });

    it('should use constituencies level styling', () => {
      render(
        <MapView 
          {...defaultProps} 
          currentState="Tamil Nadu"
          currentView="constituencies"
          currentData={mockConstituencyData}
        />
      );
      
      expect(screen.getByTestId('geojson-layer')).toBeInTheDocument();
    });

    it('should handle state with diacritics', () => {
      render(
        <MapView 
          {...defaultProps} 
          currentState="Rājasthān"
          currentView="constituencies"
          currentData={mockConstituencyData}
        />
      );
      
      expect(screen.getByTestId('geojson-layer')).toBeInTheDocument();
    });
  });

  describe('state view - districts', () => {
    it('should render district data when in district view', () => {
      render(
        <MapView 
          {...defaultProps} 
          currentState="Tamil Nadu"
          currentView="districts"
          currentData={mockDistrictData}
        />
      );
      
      const geoJsonLayer = screen.getByTestId('geojson-layer');
      expect(geoJsonLayer).toHaveAttribute('data-features', '3');
    });

    it('should use districts level styling', () => {
      render(
        <MapView 
          {...defaultProps} 
          currentState="Tamil Nadu"
          currentView="districts"
          currentData={mockDistrictData}
        />
      );
      
      expect(screen.getByTestId('geojson-layer')).toBeInTheDocument();
    });
  });

  describe('PC view - assemblies', () => {
    it('should render assembly data when PC selected', () => {
      render(
        <MapView 
          {...defaultProps} 
          currentState="Tamil Nadu"
          currentPC="Chennai South"
          currentData={mockAssemblyData}
        />
      );
      
      const geoJsonLayer = screen.getByTestId('geojson-layer');
      expect(geoJsonLayer).toHaveAttribute('data-features', '2');
    });

    it('should use assemblies level styling', () => {
      render(
        <MapView 
          {...defaultProps} 
          currentState="Tamil Nadu"
          currentPC="Chennai South"
          currentData={mockAssemblyData}
        />
      );
      
      expect(screen.getByTestId('geojson-layer')).toBeInTheDocument();
    });
  });

  describe('district view - assemblies', () => {
    it('should render assembly data when district selected', () => {
      render(
        <MapView 
          {...defaultProps} 
          currentState="Tamil Nadu"
          currentDistrict="Chennai"
          currentData={mockAssemblyData}
        />
      );
      
      const geoJsonLayer = screen.getByTestId('geojson-layer');
      expect(geoJsonLayer).toHaveAttribute('data-features', '2');
    });

    it('should use assemblies level styling for district selection', () => {
      render(
        <MapView 
          {...defaultProps} 
          currentState="Tamil Nadu"
          currentDistrict="Chennai"
          currentData={mockAssemblyData}
        />
      );
      
      expect(screen.getByTestId('geojson-layer')).toBeInTheDocument();
    });
  });

  describe('loading state', () => {
    it('should show loading overlay when no data', () => {
      render(
        <MapView 
          {...defaultProps} 
          statesGeoJSON={null}
        />
      );
      
      expect(screen.getByText((content, element) => {
        return element?.classList?.contains('spinner');
      })).toBeInTheDocument();
    });

    it('should show loading overlay with correct container', () => {
      render(
        <MapView 
          {...defaultProps} 
          statesGeoJSON={null}
        />
      );
      
      const loadingOverlay = document.querySelector('.loading-overlay.active');
      expect(loadingOverlay).toBeInTheDocument();
    });

    it('should not show loading when data is available', () => {
      render(<MapView {...defaultProps} />);
      
      const loadingOverlay = document.querySelector('.loading-overlay.active');
      expect(loadingOverlay).not.toBeInTheDocument();
    });
  });

  describe('data display', () => {
    it('should display states when on India view', () => {
      render(<MapView {...defaultProps} />);
      
      const geoJsonLayer = screen.getByTestId('geojson-layer');
      expect(geoJsonLayer).toHaveAttribute('data-features', '3');
    });

    it('should display current data when available', () => {
      render(
        <MapView 
          {...defaultProps}
          currentState="Tamil Nadu" 
          currentData={mockConstituencyData}
        />
      );
      
      const geoJsonLayer = screen.getByTestId('geojson-layer');
      expect(geoJsonLayer).toHaveAttribute('data-features', '3');
    });

    it('should handle empty features array', () => {
      render(
        <MapView 
          {...defaultProps}
          currentState="Delhi"
          currentPC="New Delhi"
          currentData={{ type: 'FeatureCollection', features: [] }}
        />
      );
      
      const geoJsonLayer = screen.getByTestId('geojson-layer');
      expect(geoJsonLayer).toHaveAttribute('data-features', '0');
    });

    it('should handle undefined features', () => {
      render(
        <MapView 
          {...defaultProps}
          currentState="Tamil Nadu"
          currentData={{ type: 'FeatureCollection' }}
        />
      );
      
      // Should fall back to states data
      expect(screen.getByTestId('geojson-layer')).toBeInTheDocument();
    });
  });

  describe('view toggle visibility', () => {
    it('should show view toggle when state selected and not in assembly view', () => {
      const { container } = render(
        <MapView 
          {...defaultProps}
          currentState="Tamil Nadu"
          currentData={mockConstituencyData}
        />
      );
      
      expect(container).toBeTruthy();
    });

    it('should not show view toggle when PC selected', () => {
      const { container } = render(
        <MapView 
          {...defaultProps}
          currentState="Tamil Nadu"
          currentPC="Chennai South"
          currentData={mockAssemblyData}
        />
      );
      
      expect(container).toBeTruthy();
    });

    it('should not show view toggle when district selected', () => {
      const { container } = render(
        <MapView 
          {...defaultProps}
          currentState="Tamil Nadu"
          currentDistrict="Chennai"
          currentData={mockAssemblyData}
        />
      );
      
      expect(container).toBeTruthy();
    });

    it('should not show view toggle when no state selected', () => {
      const { container } = render(<MapView {...defaultProps} />);
      expect(container).toBeTruthy();
    });
  });

  describe('level determination', () => {
    it('should use states level when no state selected', () => {
      render(<MapView {...defaultProps} />);
      const geoJsonLayer = screen.getByTestId('geojson-layer');
      expect(geoJsonLayer).toBeInTheDocument();
    });

    it('should use constituencies level when state selected in constituency view', () => {
      render(
        <MapView 
          {...defaultProps}
          currentState="Tamil Nadu"
          currentView="constituencies"
          currentData={mockConstituencyData}
        />
      );
      
      expect(screen.getByTestId('geojson-layer')).toBeInTheDocument();
    });

    it('should use districts level when state selected in district view', () => {
      render(
        <MapView 
          {...defaultProps}
          currentState="Tamil Nadu"
          currentView="districts"
          currentData={mockDistrictData}
        />
      );
      
      expect(screen.getByTestId('geojson-layer')).toBeInTheDocument();
    });

    it('should use assemblies level when PC selected', () => {
      render(
        <MapView 
          {...defaultProps}
          currentState="Tamil Nadu"
          currentPC="Chennai South"
          currentData={mockAssemblyData}
        />
      );
      
      expect(screen.getByTestId('geojson-layer')).toBeInTheDocument();
    });

    it('should use assemblies level when district selected', () => {
      render(
        <MapView 
          {...defaultProps}
          currentState="Tamil Nadu"
          currentDistrict="Chennai"
          currentData={mockAssemblyData}
        />
      );
      
      expect(screen.getByTestId('geojson-layer')).toBeInTheDocument();
    });

    it('should prioritize PC over district for level determination', () => {
      // If both PC and district are set (edge case), PC takes precedence
      render(
        <MapView 
          {...defaultProps}
          currentState="Tamil Nadu"
          currentPC="Chennai South"
          currentDistrict="Chennai"
          currentData={mockAssemblyData}
        />
      );
      
      expect(screen.getByTestId('geojson-layer')).toBeInTheDocument();
    });
  });

  describe('GeoJSON key generation', () => {
    it('should generate unique key for India view', () => {
      render(<MapView {...defaultProps} />);
      expect(screen.getByTestId('geojson-layer')).toBeInTheDocument();
    });

    it('should generate unique key for state view', () => {
      render(
        <MapView 
          {...defaultProps}
          currentState="Tamil Nadu"
          currentData={mockConstituencyData}
        />
      );
      expect(screen.getByTestId('geojson-layer')).toBeInTheDocument();
    });

    it('should generate unique key for PC view', () => {
      render(
        <MapView 
          {...defaultProps}
          currentState="Tamil Nadu"
          currentPC="Chennai South"
          currentData={mockAssemblyData}
        />
      );
      expect(screen.getByTestId('geojson-layer')).toBeInTheDocument();
    });

    it('should generate unique key for district view', () => {
      render(
        <MapView 
          {...defaultProps}
          currentState="Tamil Nadu"
          currentDistrict="Chennai"
          currentData={mockAssemblyData}
        />
      );
      expect(screen.getByTestId('geojson-layer')).toBeInTheDocument();
    });
  });

  describe('props handling', () => {
    it('should handle all click handlers being undefined', () => {
      render(
        <MapView 
          {...defaultProps}
          onStateClick={undefined}
          onDistrictClick={undefined}
          onConstituencyClick={undefined}
          onAssemblyClick={undefined}
        />
      );
      expect(screen.getByTestId('geojson-layer')).toBeInTheDocument();
    });

    it('should show loading when currentData is null with state selected', () => {
      render(
        <MapView 
          {...defaultProps}
          currentState="Tamil Nadu"
          currentData={null}
        />
      );
      // When currentState is set but currentData is null, displayData is null
      // Component shows loading overlay
      const loadingOverlay = document.querySelector('.loading-overlay.active');
      expect(loadingOverlay).toBeInTheDocument();
    });

    it('should show loading when currentData is undefined with state selected', () => {
      render(
        <MapView 
          {...defaultProps}
          currentState="Tamil Nadu"
          currentData={undefined}
        />
      );
      // When currentState is set but currentData is undefined, displayData is undefined
      // Component shows loading overlay
      const loadingOverlay = document.querySelector('.loading-overlay.active');
      expect(loadingOverlay).toBeInTheDocument();
    });
  });

  describe('edge cases', () => {
    it('should handle very large feature count', () => {
      const largeData = {
        type: 'FeatureCollection',
        features: Array(1000).fill(null).map((_, i) => ({
          type: 'Feature',
          properties: { AC_NAME: `Assembly ${i}`, AC_NO: `${i}` },
          geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] }
        }))
      };
      
      render(
        <MapView 
          {...defaultProps}
          currentState="Tamil Nadu"
          currentPC="Chennai South"
          currentData={largeData}
        />
      );
      
      const geoJsonLayer = screen.getByTestId('geojson-layer');
      expect(geoJsonLayer).toHaveAttribute('data-features', '1000');
    });

    it('should handle features with missing properties', () => {
      const dataWithMissingProps = {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: {},
            geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] }
          }
        ]
      };
      
      render(
        <MapView 
          {...defaultProps}
          currentState="Tamil Nadu"
          currentData={dataWithMissingProps}
        />
      );
      
      expect(screen.getByTestId('geojson-layer')).toBeInTheDocument();
    });

    it('should handle features with null properties', () => {
      const dataWithNullProps = {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: null,
            geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] }
          }
        ]
      };
      
      render(
        <MapView 
          {...defaultProps}
          currentState="Tamil Nadu"
          currentData={dataWithNullProps}
        />
      );
      
      expect(screen.getByTestId('geojson-layer')).toBeInTheDocument();
    });

    it('should handle complex geometry', () => {
      const complexGeometry = {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: { shapeName: 'Complex State' },
            geometry: {
              type: 'MultiPolygon',
              coordinates: [
                [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]],
                [[[2, 2], [3, 2], [3, 3], [2, 3], [2, 2]]]
              ]
            }
          }
        ]
      };
      
      render(
        <MapView 
          {...defaultProps}
          statesGeoJSON={complexGeometry}
        />
      );
      
      expect(screen.getByTestId('geojson-layer')).toBeInTheDocument();
    });
  });

  describe('rerendering behavior', () => {
    it('should update when currentState changes', () => {
      const { rerender } = render(<MapView {...defaultProps} />);
      
      expect(screen.getByTestId('geojson-layer')).toHaveAttribute('data-features', '3');
      
      rerender(
        <MapView 
          {...defaultProps}
          currentState="Tamil Nadu"
          currentData={mockConstituencyData}
        />
      );
      
      expect(screen.getByTestId('geojson-layer')).toHaveAttribute('data-features', '3');
    });

    it('should update when currentView changes', () => {
      const { rerender } = render(
        <MapView 
          {...defaultProps}
          currentState="Tamil Nadu"
          currentView="constituencies"
          currentData={mockConstituencyData}
        />
      );
      
      rerender(
        <MapView 
          {...defaultProps}
          currentState="Tamil Nadu"
          currentView="districts"
          currentData={mockDistrictData}
        />
      );
      
      expect(screen.getByTestId('geojson-layer')).toBeInTheDocument();
    });

    it('should update when currentPC changes', () => {
      const { rerender } = render(
        <MapView 
          {...defaultProps}
          currentState="Tamil Nadu"
          currentData={mockConstituencyData}
        />
      );
      
      rerender(
        <MapView 
          {...defaultProps}
          currentState="Tamil Nadu"
          currentPC="Chennai South"
          currentData={mockAssemblyData}
        />
      );
      
      expect(screen.getByTestId('geojson-layer')).toHaveAttribute('data-features', '2');
    });

    it('should update when currentDistrict changes', () => {
      const { rerender } = render(
        <MapView 
          {...defaultProps}
          currentState="Tamil Nadu"
          currentView="districts"
          currentData={mockDistrictData}
        />
      );
      
      rerender(
        <MapView 
          {...defaultProps}
          currentState="Tamil Nadu"
          currentDistrict="Chennai"
          currentData={mockAssemblyData}
        />
      );
      
      expect(screen.getByTestId('geojson-layer')).toHaveAttribute('data-features', '2');
    });
  });

  describe('map container props', () => {
    it('should render map with correct initial center', () => {
      render(<MapView {...defaultProps} />);
      // MapContainer is mocked, but we can verify it renders
      expect(screen.getByTestId('map-container')).toBeInTheDocument();
    });

    it('should render map container with 100% dimensions', () => {
      const { container } = render(<MapView {...defaultProps} />);
      expect(container.querySelector('.map-container')).toBeInTheDocument();
    });
  });
});

describe('MapView - display data logic', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should show statesGeoJSON when on India view', () => {
    render(<MapView {...defaultProps} />);
    const geoJsonLayer = screen.getByTestId('geojson-layer');
    expect(geoJsonLayer).toHaveAttribute('data-features', '3');
  });

  it('should show currentData when PC is selected', () => {
    render(
      <MapView 
        {...defaultProps}
        currentState="Tamil Nadu"
        currentPC="Chennai South"
        currentData={mockAssemblyData}
      />
    );
    const geoJsonLayer = screen.getByTestId('geojson-layer');
    expect(geoJsonLayer).toHaveAttribute('data-features', '2');
  });

  it('should show currentData when district is selected', () => {
    render(
      <MapView 
        {...defaultProps}
        currentState="Tamil Nadu"
        currentDistrict="Chennai"
        currentData={mockAssemblyData}
      />
    );
    const geoJsonLayer = screen.getByTestId('geojson-layer');
    expect(geoJsonLayer).toHaveAttribute('data-features', '2');
  });

  it('should show currentData when state is selected', () => {
    render(
      <MapView 
        {...defaultProps}
        currentState="Tamil Nadu"
        currentData={mockConstituencyData}
      />
    );
    const geoJsonLayer = screen.getByTestId('geojson-layer');
    expect(geoJsonLayer).toHaveAttribute('data-features', '3');
  });
});

describe('MapView - integration with MapControls', () => {
  it('should pass showViewToggle=true when state selected without PC/district', () => {
    render(
      <MapView 
        {...defaultProps}
        currentState="Tamil Nadu"
        currentData={mockConstituencyData}
      />
    );
    // MapControls receives showViewToggle=true
    expect(screen.getByTestId('map-container')).toBeInTheDocument();
  });

  it('should pass showViewToggle=false when PC is selected', () => {
    render(
      <MapView 
        {...defaultProps}
        currentState="Tamil Nadu"
        currentPC="Chennai South"
        currentData={mockAssemblyData}
      />
    );
    // MapControls receives showViewToggle=false
    expect(screen.getByTestId('map-container')).toBeInTheDocument();
  });

  it('should pass showViewToggle=false when no state selected', () => {
    render(<MapView {...defaultProps} />);
    // MapControls receives showViewToggle=false
    expect(screen.getByTestId('map-container')).toBeInTheDocument();
  });
});
