import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SearchBox } from './SearchBox';
import type { StatesGeoJSON, ConstituenciesGeoJSON, AssembliesGeoJSON } from '../types';

// Mock data
const mockStatesGeoJSON: StatesGeoJSON = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { shapeName: 'Tamil Nadu', ST_NM: 'Tamil Nadu' },
      geometry: { type: 'Polygon', coordinates: [] },
    },
    {
      type: 'Feature',
      properties: { shapeName: 'Kerala', ST_NM: 'Kerala' },
      geometry: { type: 'Polygon', coordinates: [] },
    },
    {
      type: 'Feature',
      properties: { shapeName: 'Karnataka', ST_NM: 'Karnataka' },
      geometry: { type: 'Polygon', coordinates: [] },
    },
  ],
};

const mockParliamentGeoJSON: ConstituenciesGeoJSON = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: {
        ls_seat_name: 'Chennai South',
        PC_NAME: 'Chennai South',
        state_ut_name: 'Tamil Nadu',
        STATE_NAME: 'Tamil Nadu',
        PC_NO: '1',
      },
      geometry: { type: 'Polygon', coordinates: [] },
    },
    {
      type: 'Feature',
      properties: {
        ls_seat_name: 'Chennai North',
        PC_NAME: 'Chennai North',
        state_ut_name: 'Tamil Nadu',
        STATE_NAME: 'Tamil Nadu',
        PC_NO: '2',
      },
      geometry: { type: 'Polygon', coordinates: [] },
    },
  ],
};

const mockAssemblyGeoJSON: AssembliesGeoJSON = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: {
        AC_NAME: 'Mylapore',
        ST_NAME: 'Tamil Nadu',
        PC_NAME: 'Chennai South',
        AC_NO: '1',
      },
      geometry: { type: 'Polygon', coordinates: [] },
    },
    {
      type: 'Feature',
      properties: {
        AC_NAME: 'Velachery',
        ST_NAME: 'Tamil Nadu',
        PC_NAME: 'Chennai South',
        AC_NO: '2',
      },
      geometry: { type: 'Polygon', coordinates: [] },
    },
  ],
};

const defaultProps = {
  statesGeoJSON: mockStatesGeoJSON,
  parliamentGeoJSON: mockParliamentGeoJSON,
  assemblyGeoJSON: mockAssemblyGeoJSON,
  onStateSelect: vi.fn(),
  onConstituencySelect: vi.fn(),
  onAssemblySelect: vi.fn(),
};

describe('SearchBox', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('rendering', () => {
    it('should render search input', () => {
      render(<SearchBox {...defaultProps} />);
      expect(screen.getByPlaceholderText('Search states, constituencies...')).toBeInTheDocument();
    });

    it('should render search icon', () => {
      const { container } = render(<SearchBox {...defaultProps} />);
      expect(container.querySelector('.search-icon')).toBeInTheDocument();
    });

    it('should not show clear button when query is empty', () => {
      render(<SearchBox {...defaultProps} />);
      expect(screen.queryByLabelText('Clear search')).not.toBeInTheDocument();
    });

    it('should show clear button when query has text', () => {
      render(<SearchBox {...defaultProps} />);
      const input = screen.getByPlaceholderText('Search states, constituencies...');
      fireEvent.change(input, { target: { value: 'Tamil' } });
      expect(screen.getByLabelText('Clear search')).toBeInTheDocument();
    });
  });

  describe('search functionality', () => {
    it('should filter states by name', () => {
      render(<SearchBox {...defaultProps} />);
      const input = screen.getByPlaceholderText('Search states, constituencies...');
      fireEvent.change(input, { target: { value: 'Kerala' } });

      expect(screen.getByText('Kerala')).toBeInTheDocument();
    });

    it('should filter parliamentary constituencies', () => {
      render(<SearchBox {...defaultProps} />);
      const input = screen.getByPlaceholderText('Search states, constituencies...');
      fireEvent.change(input, { target: { value: 'Chennai' } });

      expect(screen.getByText('Chennai South')).toBeInTheDocument();
      expect(screen.getByText('Chennai North')).toBeInTheDocument();
    });

    it('should filter assembly constituencies', () => {
      render(<SearchBox {...defaultProps} />);
      const input = screen.getByPlaceholderText('Search states, constituencies...');
      fireEvent.change(input, { target: { value: 'Mylapore' } });

      expect(screen.getByText('Mylapore')).toBeInTheDocument();
    });

    it('should show no results message when no matches', () => {
      render(<SearchBox {...defaultProps} />);
      const input = screen.getByPlaceholderText('Search states, constituencies...');
      fireEvent.change(input, { target: { value: 'xyz123' } });

      expect(screen.getByText(/No results found/)).toBeInTheDocument();
    });

    it('should show type badges for results', () => {
      render(<SearchBox {...defaultProps} />);
      const input = screen.getByPlaceholderText('Search states, constituencies...');
      fireEvent.change(input, { target: { value: 'Tamil' } });

      // State badge
      expect(screen.getByText('State')).toBeInTheDocument();
    });

    it('should show PC badge for constituencies', () => {
      render(<SearchBox {...defaultProps} />);
      const input = screen.getByPlaceholderText('Search states, constituencies...');
      fireEvent.change(input, { target: { value: 'Chennai South' } });

      expect(screen.getByText('PC')).toBeInTheDocument();
    });

    it('should show AC badge for assemblies', () => {
      render(<SearchBox {...defaultProps} />);
      const input = screen.getByPlaceholderText('Search states, constituencies...');
      fireEvent.change(input, { target: { value: 'Mylapore' } });

      expect(screen.getByText('AC')).toBeInTheDocument();
    });
  });

  describe('selection', () => {
    it('should call onStateSelect when state is clicked', () => {
      const onStateSelect = vi.fn();
      render(<SearchBox {...defaultProps} onStateSelect={onStateSelect} />);

      const input = screen.getByPlaceholderText('Search states, constituencies...');
      fireEvent.change(input, { target: { value: 'Kerala' } });

      const result = screen.getByText('Kerala');
      fireEvent.click(result);

      expect(onStateSelect).toHaveBeenCalledTimes(1);
      expect(onStateSelect).toHaveBeenCalledWith('Kerala', expect.any(Object));
    });

    it('should call onConstituencySelect when constituency is clicked', () => {
      const onConstituencySelect = vi.fn();
      render(<SearchBox {...defaultProps} onConstituencySelect={onConstituencySelect} />);

      const input = screen.getByPlaceholderText('Search states, constituencies...');
      fireEvent.change(input, { target: { value: 'Chennai South' } });

      const result = screen.getByText('Chennai South');
      fireEvent.click(result);

      expect(onConstituencySelect).toHaveBeenCalledTimes(1);
      expect(onConstituencySelect).toHaveBeenCalledWith(
        'Chennai South',
        'Tamil Nadu',
        expect.any(Object)
      );
    });

    it('should call onAssemblySelect when assembly is clicked', () => {
      const onAssemblySelect = vi.fn();
      render(<SearchBox {...defaultProps} onAssemblySelect={onAssemblySelect} />);

      const input = screen.getByPlaceholderText('Search states, constituencies...');
      fireEvent.change(input, { target: { value: 'Mylapore' } });

      const result = screen.getByText('Mylapore');
      fireEvent.click(result);

      expect(onAssemblySelect).toHaveBeenCalledTimes(1);
      expect(onAssemblySelect).toHaveBeenCalledWith('Mylapore', 'Tamil Nadu', expect.any(Object));
    });

    it('should clear query after selection', () => {
      render(<SearchBox {...defaultProps} />);
      const input = screen.getByPlaceholderText(
        'Search states, constituencies...'
      ) as HTMLInputElement;
      fireEvent.change(input, { target: { value: 'Kerala' } });

      const result = screen.getByText('Kerala');
      fireEvent.click(result);

      expect(input.value).toBe('');
    });
  });

  describe('keyboard navigation', () => {
    it('should navigate down with ArrowDown', () => {
      render(<SearchBox {...defaultProps} />);
      const input = screen.getByPlaceholderText('Search states, constituencies...');
      fireEvent.change(input, { target: { value: 'Chennai' } });

      // First item should be selected by default
      const results = screen.getAllByRole('option');
      expect(results[0]).toHaveClass('selected');

      // Press ArrowDown
      fireEvent.keyDown(input, { key: 'ArrowDown' });
      expect(results[1]).toHaveClass('selected');
    });

    it('should navigate up with ArrowUp', () => {
      render(<SearchBox {...defaultProps} />);
      const input = screen.getByPlaceholderText('Search states, constituencies...');
      fireEvent.change(input, { target: { value: 'Chennai' } });

      // Navigate down first
      fireEvent.keyDown(input, { key: 'ArrowDown' });
      const results = screen.getAllByRole('option');
      expect(results[1]).toHaveClass('selected');

      // Navigate up
      fireEvent.keyDown(input, { key: 'ArrowUp' });
      expect(results[0]).toHaveClass('selected');
    });

    it('should select item with Enter', () => {
      const onConstituencySelect = vi.fn();
      render(<SearchBox {...defaultProps} onConstituencySelect={onConstituencySelect} />);

      const input = screen.getByPlaceholderText('Search states, constituencies...');
      fireEvent.change(input, { target: { value: 'Chennai South' } });
      fireEvent.keyDown(input, { key: 'Enter' });

      expect(onConstituencySelect).toHaveBeenCalledTimes(1);
    });

    it('should close results with Escape', () => {
      render(<SearchBox {...defaultProps} />);
      const input = screen.getByPlaceholderText('Search states, constituencies...');
      fireEvent.change(input, { target: { value: 'Tamil' } });

      expect(screen.getByRole('listbox')).toBeInTheDocument();

      fireEvent.keyDown(input, { key: 'Escape' });
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });

    it('should not navigate past last item', () => {
      render(<SearchBox {...defaultProps} />);
      const input = screen.getByPlaceholderText('Search states, constituencies...');
      fireEvent.change(input, { target: { value: 'Chennai' } });

      const results = screen.getAllByRole('option');

      // Press ArrowDown many times
      for (let i = 0; i < results.length + 5; i++) {
        fireEvent.keyDown(input, { key: 'ArrowDown' });
      }

      // Last item should be selected
      expect(results[results.length - 1]).toHaveClass('selected');
    });

    it('should not navigate past first item', () => {
      render(<SearchBox {...defaultProps} />);
      const input = screen.getByPlaceholderText('Search states, constituencies...');
      fireEvent.change(input, { target: { value: 'Chennai' } });

      // Press ArrowUp multiple times
      for (let i = 0; i < 5; i++) {
        fireEvent.keyDown(input, { key: 'ArrowUp' });
      }

      const results = screen.getAllByRole('option');
      expect(results[0]).toHaveClass('selected');
    });
  });

  describe('clear button', () => {
    it('should clear query when clear button is clicked', () => {
      render(<SearchBox {...defaultProps} />);
      const input = screen.getByPlaceholderText(
        'Search states, constituencies...'
      ) as HTMLInputElement;
      fireEvent.change(input, { target: { value: 'Tamil' } });

      const clearButton = screen.getByLabelText('Clear search');
      fireEvent.click(clearButton);

      expect(input.value).toBe('');
    });

    it('should close results when clear button is clicked', () => {
      render(<SearchBox {...defaultProps} />);
      const input = screen.getByPlaceholderText('Search states, constituencies...');
      fireEvent.change(input, { target: { value: 'Tamil' } });

      expect(screen.getByRole('listbox')).toBeInTheDocument();

      const clearButton = screen.getByLabelText('Clear search');
      fireEvent.click(clearButton);

      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });
  });

  describe('mouse interaction', () => {
    it('should highlight item on mouse enter', () => {
      render(<SearchBox {...defaultProps} />);
      const input = screen.getByPlaceholderText('Search states, constituencies...');
      fireEvent.change(input, { target: { value: 'Chennai' } });

      const results = screen.getAllByRole('option');
      fireEvent.mouseEnter(results[1]);

      expect(results[1]).toHaveClass('selected');
    });
  });

  describe('edge cases', () => {
    it('should handle null statesGeoJSON', () => {
      render(<SearchBox {...defaultProps} statesGeoJSON={null} />);
      const input = screen.getByPlaceholderText('Search states, constituencies...');
      fireEvent.change(input, { target: { value: 'Kerala' } });

      // Should not crash, but no state results for Kerala (only in statesGeoJSON)
      expect(screen.queryByText('State')).not.toBeInTheDocument();
    });

    it('should handle null parliamentGeoJSON', () => {
      render(<SearchBox {...defaultProps} parliamentGeoJSON={null} />);
      const input = screen.getByPlaceholderText('Search states, constituencies...');
      fireEvent.change(input, { target: { value: 'Chennai' } });

      // Should not crash, but no constituency results
      expect(screen.queryByText('Chennai South')).not.toBeInTheDocument();
    });

    it('should handle null assemblyGeoJSON', () => {
      render(<SearchBox {...defaultProps} assemblyGeoJSON={null} />);
      const input = screen.getByPlaceholderText('Search states, constituencies...');
      fireEvent.change(input, { target: { value: 'Mylapore' } });

      // Should not crash, but no assembly results
      expect(screen.queryByText('Mylapore')).not.toBeInTheDocument();
    });

    it('should handle empty query', () => {
      render(<SearchBox {...defaultProps} />);
      const input = screen.getByPlaceholderText('Search states, constituencies...');
      fireEvent.change(input, { target: { value: '   ' } });

      // No results should show for whitespace-only query
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });

    it('should deduplicate assembly results with same name and state', () => {
      const duplicateAssemblyGeoJSON: AssembliesGeoJSON = {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: { AC_NAME: 'Mylapore', ST_NAME: 'Tamil Nadu', PC_NAME: 'Chennai South' },
            geometry: { type: 'Polygon', coordinates: [] },
          },
          {
            type: 'Feature',
            properties: { AC_NAME: 'Mylapore', ST_NAME: 'Tamil Nadu', PC_NAME: 'Chennai South' },
            geometry: { type: 'Polygon', coordinates: [] },
          },
        ],
      };

      render(<SearchBox {...defaultProps} assemblyGeoJSON={duplicateAssemblyGeoJSON} />);
      const input = screen.getByPlaceholderText('Search states, constituencies...');
      fireEvent.change(input, { target: { value: 'Mylapore' } });

      // Should only show one result
      const results = screen.getAllByText('Mylapore');
      expect(results.length).toBe(1);
    });

    it('should search by state name as well', () => {
      render(<SearchBox {...defaultProps} />);
      const input = screen.getByPlaceholderText('Search states, constituencies...');
      // Search by state name should return constituencies in that state
      fireEvent.change(input, { target: { value: 'Tamil Nadu' } });

      // Should find state and constituencies in that state (Tamil Nadu appears multiple times)
      const results = screen.getAllByRole('option');
      expect(results.length).toBeGreaterThan(0);
    });
  });

  describe('focus behavior', () => {
    it('should open results on focus if query has text', () => {
      render(<SearchBox {...defaultProps} />);
      const input = screen.getByPlaceholderText('Search states, constituencies...');

      // Type something
      fireEvent.change(input, { target: { value: 'Tamil' } });
      // Close with Escape
      fireEvent.keyDown(input, { key: 'Escape' });
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();

      // Focus should reopen
      fireEvent.focus(input);
      expect(screen.getByRole('listbox')).toBeInTheDocument();
    });
  });

  describe('accessibility', () => {
    it('should have aria-label on input', () => {
      render(<SearchBox {...defaultProps} />);
      expect(screen.getByLabelText('Search regions')).toBeInTheDocument();
    });

    it('should have aria-expanded attribute', () => {
      render(<SearchBox {...defaultProps} />);
      const input = screen.getByPlaceholderText('Search states, constituencies...');

      expect(input).toHaveAttribute('aria-expanded', 'false');

      fireEvent.change(input, { target: { value: 'Tamil' } });
      expect(input).toHaveAttribute('aria-expanded', 'true');
    });

    it('should have aria-autocomplete attribute', () => {
      render(<SearchBox {...defaultProps} />);
      const input = screen.getByPlaceholderText('Search states, constituencies...');
      expect(input).toHaveAttribute('aria-autocomplete', 'list');
    });

    it('should have role listbox on results', () => {
      render(<SearchBox {...defaultProps} />);
      const input = screen.getByPlaceholderText('Search states, constituencies...');
      fireEvent.change(input, { target: { value: 'Tamil' } });

      expect(screen.getByRole('listbox')).toBeInTheDocument();
    });

    it('should have role option on result items', () => {
      render(<SearchBox {...defaultProps} />);
      const input = screen.getByPlaceholderText('Search states, constituencies...');
      fireEvent.change(input, { target: { value: 'Tamil' } });

      expect(screen.getAllByRole('option').length).toBeGreaterThan(0);
    });

    it('should have aria-selected on selected option', () => {
      render(<SearchBox {...defaultProps} />);
      const input = screen.getByPlaceholderText('Search states, constituencies...');
      fireEvent.change(input, { target: { value: 'Chennai' } });

      const results = screen.getAllByRole('option');
      expect(results[0]).toHaveAttribute('aria-selected', 'true');
      expect(results[1]).toHaveAttribute('aria-selected', 'false');
    });
  });
});
