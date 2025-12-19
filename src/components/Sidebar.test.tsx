import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { Sidebar } from './Sidebar';

// Mock GeoJSON data
const mockStatesGeoJSON = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { shapeName: 'Tamil Nadu' },
      geometry: { type: 'Polygon', coordinates: [] },
    },
    {
      type: 'Feature',
      properties: { shapeName: 'Kerala' },
      geometry: { type: 'Polygon', coordinates: [] },
    },
    {
      type: 'Feature',
      properties: { shapeName: 'Karnataka' },
      geometry: { type: 'Polygon', coordinates: [] },
    },
    {
      type: 'Feature',
      properties: { ST_NM: 'Andhra Pradesh' }, // Alternative property name
      geometry: { type: 'Polygon', coordinates: [] },
    },
  ],
};

const mockConstituencyData = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { ls_seat_name: 'Chennai South', ls_seat_code: '1' },
      geometry: { type: 'Polygon', coordinates: [] },
    },
    {
      type: 'Feature',
      properties: { ls_seat_name: 'Chennai Central', ls_seat_code: '2' },
      geometry: { type: 'Polygon', coordinates: [] },
    },
    {
      type: 'Feature',
      properties: { PC_NAME: 'Chennai North', PC_No: '3' }, // Alternative property names
      geometry: { type: 'Polygon', coordinates: [] },
    },
  ],
};

const mockDistrictData = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { district: 'Chennai' },
      geometry: { type: 'Polygon', coordinates: [] },
    },
    {
      type: 'Feature',
      properties: { district: 'Coimbatore' },
      geometry: { type: 'Polygon', coordinates: [] },
    },
    {
      type: 'Feature',
      properties: { NAME: 'Madurai' }, // Alternative property name
      geometry: { type: 'Polygon', coordinates: [] },
    },
    {
      type: 'Feature',
      properties: { DISTRICT: 'Salem' }, // Another alternative
      geometry: { type: 'Polygon', coordinates: [] },
    },
  ],
};

const mockAssemblyData = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { AC_NAME: 'Mylapore', AC_NO: '1' },
      geometry: { type: 'Polygon', coordinates: [] },
    },
    {
      type: 'Feature',
      properties: { AC_NAME: 'Velachery', AC_NO: '2' },
      geometry: { type: 'Polygon', coordinates: [] },
    },
    {
      type: 'Feature',
      properties: { AC_NAME: 'Saidapet', AC_NO: '3' },
      geometry: { type: 'Polygon', coordinates: [] },
    },
  ],
};

const defaultProps = {
  statesGeoJSON: mockStatesGeoJSON,
  currentState: null,
  currentView: 'constituencies',
  currentPC: null,
  currentDistrict: null,
  cacheStats: { dbCount: 5, memCount: 10, totalStates: 36, pcCount: 543, acCount: 4120 },
  currentData: null,
  onStateClick: vi.fn(),
  onDistrictClick: vi.fn(),
  onConstituencyClick: vi.fn(),
  onAssemblyClick: vi.fn(),
  onSwitchView: vi.fn(),
  onReset: vi.fn(),
  onGoBackToState: vi.fn(),
  isOpen: false,
  onClose: vi.fn(),
};

describe('Sidebar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('rendering - header', () => {
    it('should render application title', () => {
      render(<Sidebar {...defaultProps} />);
      expect(screen.getByText('🔍 Election Lens')).toBeInTheDocument();
    });

    it('should render application subtitle', () => {
      render(<Sidebar {...defaultProps} />);
      expect(screen.getByText('India Electoral Map')).toBeInTheDocument();
    });
  });

  describe('rendering - cache status', () => {
    it('should render cache status section', () => {
      render(<Sidebar {...defaultProps} />);
      expect(screen.getByText(/💾 DB:/)).toBeInTheDocument();
    });

    it('should display DB count', () => {
      render(<Sidebar {...defaultProps} />);
      expect(screen.getByText(/5 items/)).toBeInTheDocument();
    });

    it('should display memory count', () => {
      render(
        <Sidebar {...defaultProps} cacheStats={{ ...defaultProps.cacheStats, memCount: 15 }} />
      );
      expect(screen.getByText(/15\/36/)).toBeInTheDocument();
    });

    it('should display PC count', () => {
      render(<Sidebar {...defaultProps} />);
      expect(screen.getByText(/🗳️ PC:/)).toBeInTheDocument();
      expect(screen.getByText(/543/)).toBeInTheDocument();
    });

    it('should display AC count', () => {
      render(<Sidebar {...defaultProps} />);
      expect(screen.getByText(/🏛️ AC:/)).toBeInTheDocument();
      expect(screen.getByText(/4120/)).toBeInTheDocument();
    });

    it('should show checkmark when fully loaded', () => {
      const fullCacheStats = {
        dbCount: 10,
        memCount: 36,
        totalStates: 36,
        pcCount: 543,
        acCount: 4120,
      };
      render(<Sidebar {...defaultProps} cacheStats={fullCacheStats} />);
      expect(screen.getByText('✓')).toBeInTheDocument();
    });

    it('should not show checkmark when not fully loaded', () => {
      render(<Sidebar {...defaultProps} />);
      expect(screen.queryByText('✓')).not.toBeInTheDocument();
    });
  });

  describe('info panel - India view', () => {
    it('should show India info when no state selected', () => {
      render(<Sidebar {...defaultProps} />);
      // India appears multiple times (breadcrumb, info title)
      const indiaElements = screen.getAllByText('India');
      expect(indiaElements.length).toBeGreaterThan(0);
    });

    it('should show 36 States & UTs count', () => {
      render(<Sidebar {...defaultProps} />);
      expect(screen.getByText('36')).toBeInTheDocument();
      expect(screen.getByText('States & UTs')).toBeInTheDocument();
    });

    it('should show "Select a State" prompt', () => {
      render(<Sidebar {...defaultProps} />);
      expect(screen.getByText('Select a State')).toBeInTheDocument();
    });
  });

  describe('info panel - state view', () => {
    it('should show state name as title', () => {
      render(
        <Sidebar {...defaultProps} currentState="Tamil Nadu" currentData={mockConstituencyData} />
      );
      // State name appears multiple times (title, stat, breadcrumb)
      const tamilNaduElements = screen.getAllByText('Tamil Nadu');
      expect(tamilNaduElements.length).toBeGreaterThan(0);
    });

    it('should show constituency count in stat card', () => {
      render(
        <Sidebar {...defaultProps} currentState="Tamil Nadu" currentData={mockConstituencyData} />
      );
      // '3' appears multiple times (count and PC numbers)
      const threeElements = screen.getAllByText('3');
      expect(threeElements.length).toBeGreaterThan(0);
      expect(screen.getByText('Lok Sabha Seats')).toBeInTheDocument();
    });

    it('should show district count when in district view', () => {
      render(
        <Sidebar
          {...defaultProps}
          currentState="Tamil Nadu"
          currentView="districts"
          currentData={mockDistrictData}
        />
      );
      expect(screen.getByText('4')).toBeInTheDocument();
      // 'Districts' appears in multiple places
      const districtsElements = screen.getAllByText(/Districts/);
      expect(districtsElements.length).toBeGreaterThan(0);
    });
  });

  describe('info panel - PC view', () => {
    it('should show PC name as title', () => {
      render(
        <Sidebar
          {...defaultProps}
          currentState="Tamil Nadu"
          currentPC="Chennai South"
          currentData={mockAssemblyData}
        />
      );
      // PC name appears in multiple places (title, breadcrumb)
      const pcElements = screen.getAllByText('Chennai South');
      expect(pcElements.length).toBeGreaterThan(0);
    });

    it('should show assembly count', () => {
      render(
        <Sidebar
          {...defaultProps}
          currentState="Tamil Nadu"
          currentPC="Chennai South"
          currentData={mockAssemblyData}
        />
      );
      // '3' appears multiple times (count and AC numbers)
      const threeElements = screen.getAllByText('3');
      expect(threeElements.length).toBeGreaterThan(0);
      expect(screen.getByText('Assembly Segments')).toBeInTheDocument();
    });
  });

  describe('info panel - district view', () => {
    it('should show district name as title', () => {
      render(
        <Sidebar
          {...defaultProps}
          currentState="Tamil Nadu"
          currentDistrict="Chennai"
          currentData={mockAssemblyData}
        />
      );
      // District name appears in multiple places (title, breadcrumb)
      const chennaiElements = screen.getAllByText('Chennai');
      expect(chennaiElements.length).toBeGreaterThan(0);
    });

    it('should show assembly count for district', () => {
      render(
        <Sidebar
          {...defaultProps}
          currentState="Tamil Nadu"
          currentDistrict="Chennai"
          currentData={mockAssemblyData}
        />
      );
      expect(screen.getByText('Assembly Segments')).toBeInTheDocument();
    });
  });

  describe('states list', () => {
    it('should render states list when on India view', () => {
      render(<Sidebar {...defaultProps} />);
      expect(screen.getByText(/States & Union Territories/)).toBeInTheDocument();
    });

    it('should show state count in header', () => {
      render(<Sidebar {...defaultProps} />);
      expect(screen.getByText(/States & Union Territories \(4\)/)).toBeInTheDocument();
    });

    it('should render all states', () => {
      render(<Sidebar {...defaultProps} />);
      expect(screen.getByText('Tamil Nadu')).toBeInTheDocument();
      expect(screen.getByText('Kerala')).toBeInTheDocument();
      expect(screen.getByText('Karnataka')).toBeInTheDocument();
    });

    it('should sort states alphabetically', () => {
      render(<Sidebar {...defaultProps} />);
      const stateItems = screen.getAllByText(/^(Tamil Nadu|Kerala|Karnataka|Andhra Pradesh)$/);
      // First should be Andhra Pradesh (alphabetically)
      expect(stateItems[0].textContent).toBe('Andhra Pradesh');
    });

    it('should call onStateClick when state is clicked', () => {
      const onStateClick = vi.fn();
      render(<Sidebar {...defaultProps} onStateClick={onStateClick} />);

      fireEvent.click(screen.getByText('Tamil Nadu'));

      expect(onStateClick).toHaveBeenCalledTimes(1);
      expect(onStateClick).toHaveBeenCalledWith('Tamil Nadu', expect.any(Object));
    });

    it('should render color dots for states', () => {
      const { container } = render(<Sidebar {...defaultProps} />);
      const colorDots = container.querySelectorAll('.color-dot');
      expect(colorDots.length).toBe(4);
    });
  });

  describe('constituencies list', () => {
    it('should render constituencies when state is selected', () => {
      render(
        <Sidebar {...defaultProps} currentState="Tamil Nadu" currentData={mockConstituencyData} />
      );
      expect(screen.getByText(/Parliamentary Constituencies/)).toBeInTheDocument();
    });

    it('should show constituency count', () => {
      render(
        <Sidebar {...defaultProps} currentState="Tamil Nadu" currentData={mockConstituencyData} />
      );
      expect(screen.getByText(/Parliamentary Constituencies \(3\)/)).toBeInTheDocument();
    });

    it('should render all constituencies', () => {
      render(
        <Sidebar {...defaultProps} currentState="Tamil Nadu" currentData={mockConstituencyData} />
      );
      expect(screen.getByText('Chennai South')).toBeInTheDocument();
      expect(screen.getByText('Chennai Central')).toBeInTheDocument();
      expect(screen.getByText('Chennai North')).toBeInTheDocument();
    });

    it('should display PC numbers', () => {
      render(
        <Sidebar {...defaultProps} currentState="Tamil Nadu" currentData={mockConstituencyData} />
      );
      // PC numbers are displayed
      const pcNumbers = document.querySelectorAll('.pc-number');
      expect(pcNumbers.length).toBe(3);
    });

    it('should call onConstituencyClick when constituency is clicked', () => {
      const onConstituencyClick = vi.fn();
      render(
        <Sidebar
          {...defaultProps}
          currentState="Tamil Nadu"
          currentData={mockConstituencyData}
          onConstituencyClick={onConstituencyClick}
        />
      );

      fireEvent.click(screen.getByText('Chennai South'));

      expect(onConstituencyClick).toHaveBeenCalledTimes(1);
    });

    it('should show no constituencies message when empty', () => {
      render(
        <Sidebar
          {...defaultProps}
          currentState="Tamil Nadu"
          currentData={{ type: 'FeatureCollection', features: [] }}
        />
      );
      expect(screen.getByText('No constituencies found')).toBeInTheDocument();
    });
  });

  describe('districts list', () => {
    it('should render districts when in district view', () => {
      render(
        <Sidebar
          {...defaultProps}
          currentState="Tamil Nadu"
          currentView="districts"
          currentData={mockDistrictData}
        />
      );
      // 'Districts' appears in multiple places
      const districtsElements = screen.getAllByText(/Districts/);
      expect(districtsElements.length).toBeGreaterThan(0);
    });

    it('should show district count', () => {
      render(
        <Sidebar
          {...defaultProps}
          currentState="Tamil Nadu"
          currentView="districts"
          currentData={mockDistrictData}
        />
      );
      expect(screen.getByText(/Districts \(4\)/)).toBeInTheDocument();
    });

    it('should render all districts', () => {
      render(
        <Sidebar
          {...defaultProps}
          currentState="Tamil Nadu"
          currentView="districts"
          currentData={mockDistrictData}
        />
      );
      expect(screen.getByText('Chennai')).toBeInTheDocument();
      expect(screen.getByText('Coimbatore')).toBeInTheDocument();
      expect(screen.getByText('Madurai')).toBeInTheDocument();
      expect(screen.getByText('Salem')).toBeInTheDocument();
    });

    it('should sort districts alphabetically', () => {
      render(
        <Sidebar
          {...defaultProps}
          currentState="Tamil Nadu"
          currentView="districts"
          currentData={mockDistrictData}
        />
      );
      const districtItems = screen.getAllByText(/^(Chennai|Coimbatore|Madurai|Salem)$/);
      expect(districtItems[0].textContent).toBe('Chennai');
    });

    it('should call onDistrictClick when district is clicked', () => {
      const onDistrictClick = vi.fn();
      render(
        <Sidebar
          {...defaultProps}
          currentState="Tamil Nadu"
          currentView="districts"
          currentData={mockDistrictData}
          onDistrictClick={onDistrictClick}
        />
      );

      fireEvent.click(screen.getByText('Chennai'));

      expect(onDistrictClick).toHaveBeenCalledTimes(1);
    });

    it('should show no districts message when empty', () => {
      render(
        <Sidebar
          {...defaultProps}
          currentState="Tamil Nadu"
          currentView="districts"
          currentData={{ type: 'FeatureCollection', features: [] }}
        />
      );
      expect(screen.getByText('No districts found')).toBeInTheDocument();
    });
  });

  describe('assemblies list', () => {
    it('should render assemblies when PC is selected', () => {
      render(
        <Sidebar
          {...defaultProps}
          currentState="Tamil Nadu"
          currentPC="Chennai South"
          currentData={mockAssemblyData}
        />
      );
      expect(screen.getByText(/Assembly Constituencies/)).toBeInTheDocument();
    });

    it('should show assembly count', () => {
      render(
        <Sidebar
          {...defaultProps}
          currentState="Tamil Nadu"
          currentPC="Chennai South"
          currentData={mockAssemblyData}
        />
      );
      expect(screen.getByText(/Assembly Constituencies \(3\)/)).toBeInTheDocument();
    });

    it('should render all assemblies', () => {
      render(
        <Sidebar
          {...defaultProps}
          currentState="Tamil Nadu"
          currentPC="Chennai South"
          currentData={mockAssemblyData}
        />
      );
      expect(screen.getByText('Mylapore')).toBeInTheDocument();
      expect(screen.getByText('Velachery')).toBeInTheDocument();
      expect(screen.getByText('Saidapet')).toBeInTheDocument();
    });

    it('should display AC numbers', () => {
      render(
        <Sidebar
          {...defaultProps}
          currentState="Tamil Nadu"
          currentPC="Chennai South"
          currentData={mockAssemblyData}
        />
      );
      // AC numbers shown
      const acNumbers = screen.getAllByText(/^[123]$/);
      expect(acNumbers.length).toBeGreaterThanOrEqual(3);
    });

    it('should sort assemblies by AC number', () => {
      render(
        <Sidebar
          {...defaultProps}
          currentState="Tamil Nadu"
          currentPC="Chennai South"
          currentData={mockAssemblyData}
        />
      );
      const assemblyItems = screen.getAllByText(/^(Mylapore|Velachery|Saidapet)$/);
      expect(assemblyItems[0].textContent).toBe('Mylapore'); // AC_NO: 1
    });

    it('should render assemblies when district is selected', () => {
      render(
        <Sidebar
          {...defaultProps}
          currentState="Tamil Nadu"
          currentDistrict="Chennai"
          currentData={mockAssemblyData}
        />
      );
      expect(screen.getByText(/Assembly Constituencies/)).toBeInTheDocument();
    });

    it('should show no assembly data message for PC', () => {
      render(
        <Sidebar
          {...defaultProps}
          currentState="Delhi"
          currentPC="New Delhi"
          currentData={{ type: 'FeatureCollection', features: [] }}
        />
      );
      expect(screen.getByText('No Assembly Data')).toBeInTheDocument();
      expect(
        screen.getByText(/Union Territory without a state legislative assembly/)
      ).toBeInTheDocument();
    });

    it('should show no assembly data message for district', () => {
      render(
        <Sidebar
          {...defaultProps}
          currentState="Tamil Nadu"
          currentDistrict="New District"
          currentData={{ type: 'FeatureCollection', features: [] }}
        />
      );
      expect(screen.getByText('No Assembly Data')).toBeInTheDocument();
      expect(screen.getByText(/newer district created after delimitation/)).toBeInTheDocument();
    });

    it('should call onAssemblyClick when assembly is clicked', () => {
      const onAssemblyClick = vi.fn();
      render(
        <Sidebar
          {...defaultProps}
          currentState="Tamil Nadu"
          currentPC="Chennai South"
          currentData={mockAssemblyData}
          onAssemblyClick={onAssemblyClick}
        />
      );

      fireEvent.click(screen.getByText('Mylapore'));

      expect(onAssemblyClick).toHaveBeenCalledTimes(1);
    });
  });

  describe('view toggle', () => {
    it('should show view toggle when state is selected', () => {
      render(
        <Sidebar {...defaultProps} currentState="Tamil Nadu" currentData={mockConstituencyData} />
      );
      expect(screen.getByText('🗳️ Constituencies')).toBeInTheDocument();
      expect(screen.getByText('🗺️ Districts')).toBeInTheDocument();
    });

    it('should not show view toggle when no state selected', () => {
      render(<Sidebar {...defaultProps} />);
      expect(screen.queryByText('🗳️ Constituencies')).not.toBeInTheDocument();
    });

    it('should not show view toggle when PC is selected', () => {
      render(
        <Sidebar
          {...defaultProps}
          currentState="Tamil Nadu"
          currentPC="Chennai South"
          currentData={mockAssemblyData}
        />
      );
      expect(screen.queryByText('🗳️ Constituencies')).not.toBeInTheDocument();
    });

    it('should not show view toggle when district is selected', () => {
      render(
        <Sidebar
          {...defaultProps}
          currentState="Tamil Nadu"
          currentDistrict="Chennai"
          currentData={mockAssemblyData}
        />
      );
      expect(screen.queryByText('🗳️ Constituencies')).not.toBeInTheDocument();
    });

    it('should have active class on constituencies button when in constituencies view', () => {
      render(
        <Sidebar
          {...defaultProps}
          currentState="Tamil Nadu"
          currentView="constituencies"
          currentData={mockConstituencyData}
        />
      );
      const constituenciesBtn = screen.getByText('🗳️ Constituencies');
      expect(constituenciesBtn).toHaveClass('active');
    });

    it('should have active class on districts button when in districts view', () => {
      render(
        <Sidebar
          {...defaultProps}
          currentState="Tamil Nadu"
          currentView="districts"
          currentData={mockDistrictData}
        />
      );
      const districtsBtn = screen.getByText('🗺️ Districts');
      expect(districtsBtn).toHaveClass('active');
    });

    it('should call onSwitchView with constituencies when clicked', () => {
      const onSwitchView = vi.fn();
      render(
        <Sidebar
          {...defaultProps}
          currentState="Tamil Nadu"
          currentView="districts"
          currentData={mockDistrictData}
          onSwitchView={onSwitchView}
        />
      );

      fireEvent.click(screen.getByText('🗳️ Constituencies'));

      expect(onSwitchView).toHaveBeenCalledWith('constituencies');
    });

    it('should call onSwitchView with districts when clicked', () => {
      const onSwitchView = vi.fn();
      render(
        <Sidebar
          {...defaultProps}
          currentState="Tamil Nadu"
          currentView="constituencies"
          currentData={mockConstituencyData}
          onSwitchView={onSwitchView}
        />
      );

      fireEvent.click(screen.getByText('🗺️ Districts'));

      expect(onSwitchView).toHaveBeenCalledWith('districts');
    });
  });

  describe('breadcrumb', () => {
    it('should show India in breadcrumb on home view', () => {
      render(<Sidebar {...defaultProps} />);
      const breadcrumb = document.querySelector('.breadcrumb');
      expect(breadcrumb).toBeInTheDocument();
      expect(within(breadcrumb).getByText('India')).toBeInTheDocument();
    });

    it('should show India > State in breadcrumb when state selected', () => {
      render(
        <Sidebar {...defaultProps} currentState="Tamil Nadu" currentData={mockConstituencyData} />
      );
      const breadcrumb = document.querySelector('.breadcrumb');
      expect(within(breadcrumb).getByText('India')).toBeInTheDocument();
      expect(within(breadcrumb).getByText('Tamil Nadu')).toBeInTheDocument();
    });

    it('should show India > State > PC in breadcrumb when PC selected', () => {
      render(
        <Sidebar
          {...defaultProps}
          currentState="Tamil Nadu"
          currentPC="Chennai South"
          currentData={mockAssemblyData}
        />
      );
      const breadcrumb = document.querySelector('.breadcrumb');
      expect(within(breadcrumb).getByText('India')).toBeInTheDocument();
      expect(within(breadcrumb).getByText('Tamil Nadu')).toBeInTheDocument();
      expect(within(breadcrumb).getByText('Chennai South')).toBeInTheDocument();
    });

    it('should show India > State > District > Assemblies in breadcrumb when district selected', () => {
      render(
        <Sidebar
          {...defaultProps}
          currentState="Tamil Nadu"
          currentDistrict="Chennai"
          currentData={mockAssemblyData}
        />
      );
      const breadcrumb = document.querySelector('.breadcrumb');
      expect(within(breadcrumb).getByText('India')).toBeInTheDocument();
      expect(within(breadcrumb).getByText('Tamil Nadu')).toBeInTheDocument();
      expect(within(breadcrumb).getByText('Chennai')).toBeInTheDocument();
      expect(within(breadcrumb).getByText(/Assemblies/)).toBeInTheDocument();
    });

    it('should call onReset when India is clicked in breadcrumb', () => {
      const onReset = vi.fn();
      render(
        <Sidebar
          {...defaultProps}
          currentState="Tamil Nadu"
          currentData={mockConstituencyData}
          onReset={onReset}
        />
      );

      const breadcrumb = document.querySelector('.breadcrumb');
      const indiaLink = within(breadcrumb).getByText('India');
      fireEvent.click(indiaLink);

      expect(onReset).toHaveBeenCalledTimes(1);
    });

    it('should call onGoBackToState when state is clicked in breadcrumb from PC view', () => {
      const onGoBackToState = vi.fn();
      render(
        <Sidebar
          {...defaultProps}
          currentState="Tamil Nadu"
          currentPC="Chennai South"
          currentData={mockAssemblyData}
          onGoBackToState={onGoBackToState}
        />
      );

      const breadcrumb = document.querySelector('.breadcrumb');
      const stateLink = within(breadcrumb).getByText('Tamil Nadu');
      fireEvent.click(stateLink);

      expect(onGoBackToState).toHaveBeenCalledTimes(1);
    });
  });

  describe('mobile behavior', () => {
    it('should have sidebar class', () => {
      const { container } = render(<Sidebar {...defaultProps} />);
      expect(container.querySelector('.sidebar')).toBeInTheDocument();
    });

    it('should have open class when isOpen is true', () => {
      const { container } = render(<Sidebar {...defaultProps} isOpen={true} />);
      expect(container.querySelector('.sidebar.open')).toBeInTheDocument();
    });

    it('should not have open class when isOpen is false', () => {
      const { container } = render(<Sidebar {...defaultProps} isOpen={false} />);
      expect(container.querySelector('.sidebar.open')).not.toBeInTheDocument();
    });

    it('should render overlay', () => {
      const { container } = render(<Sidebar {...defaultProps} />);
      expect(container.querySelector('.sidebar-overlay')).toBeInTheDocument();
    });

    it('should have visible class on overlay when open', () => {
      const { container } = render(<Sidebar {...defaultProps} isOpen={true} />);
      expect(container.querySelector('.sidebar-overlay.visible')).toBeInTheDocument();
    });

    it('should call onClose when overlay is clicked', () => {
      const onClose = vi.fn();
      const { container } = render(<Sidebar {...defaultProps} isOpen={true} onClose={onClose} />);

      fireEvent.click(container.querySelector('.sidebar-overlay'));

      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('edge cases', () => {
    it('should handle null statesGeoJSON', () => {
      render(<Sidebar {...defaultProps} statesGeoJSON={null} />);
      expect(screen.getByText('🔍 Election Lens')).toBeInTheDocument();
    });

    it('should handle undefined features', () => {
      render(<Sidebar {...defaultProps} statesGeoJSON={{ type: 'FeatureCollection' }} />);
      expect(screen.getByText('🔍 Election Lens')).toBeInTheDocument();
    });

    it('should handle empty features array', () => {
      render(
        <Sidebar {...defaultProps} statesGeoJSON={{ type: 'FeatureCollection', features: [] }} />
      );
      expect(screen.getByText(/States & Union Territories \(0\)/)).toBeInTheDocument();
    });

    it('should handle missing property names gracefully', () => {
      // Data with some valid and some invalid features
      const dataWithMixedProps = {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: { AC_NAME: 'Valid Name', AC_NO: '1' },
            geometry: { type: 'Polygon', coordinates: [] },
          },
          {
            type: 'Feature',
            properties: { AC_NAME: '', AC_NO: '2' }, // Empty - should be filtered out
            geometry: { type: 'Polygon', coordinates: [] },
          },
        ],
      };
      render(
        <Sidebar
          {...defaultProps}
          currentState="Tamil Nadu"
          currentPC="Test"
          currentData={dataWithMixedProps}
        />
      );
      // Only valid features should be shown (empty AC_NAME filtered out)
      expect(screen.getByText('Assembly Constituencies (1)')).toBeInTheDocument();
      expect(screen.getByText('Valid Name')).toBeInTheDocument();
    });

    it('should handle state names with whitespace', () => {
      const statesWithWhitespace = {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: { shapeName: '  Rajasthan  ' },
            geometry: { type: 'Polygon', coordinates: [] },
          },
        ],
      };
      render(<Sidebar {...defaultProps} statesGeoJSON={statesWithWhitespace} />);
      expect(screen.getByText('Rajasthan')).toBeInTheDocument();
    });
  });

  describe('accessibility', () => {
    it('should have clickable state items', () => {
      render(<Sidebar {...defaultProps} />);
      const stateItem = screen.getByText('Tamil Nadu');
      expect(stateItem.closest('.district-item')).toBeInTheDocument();
    });

    it('should have clickable toggle buttons', () => {
      render(
        <Sidebar {...defaultProps} currentState="Tamil Nadu" currentData={mockConstituencyData} />
      );
      const buttons = screen.getAllByRole('button');
      expect(buttons.length).toBeGreaterThan(0);
    });
  });
});

describe('Sidebar - state normalization', () => {
  it('should normalize state names with whitespace', () => {
    render(
      <Sidebar {...defaultProps} currentState="  Rajasthan  " currentData={mockConstituencyData} />
    );
    // Should display normalized name (may appear multiple times in title and stat)
    const rajasthanElements = screen.getAllByText('Rajasthan');
    expect(rajasthanElements.length).toBeGreaterThan(0);
  });
});
