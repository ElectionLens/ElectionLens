import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BoothResultsPanel } from './BoothResultsPanel';
import type { BoothList, BoothResults, BoothWithResult } from '../hooks/useBoothData';

const mockBoothList: BoothList = {
  acId: 'TN-001',
  acName: 'GUMMIDIPUNDI',
  state: 'Tamil Nadu',
  totalBooths: 2,
  lastUpdated: '2021-04-06',
  source: 'Tamil Nadu CEO',
  booths: [],
};

const mockBoothResults: BoothResults = {
  acId: 'TN-001',
  acName: 'GUMMIDIPUNDI',
  year: 2021,
  electionType: 'assembly',
  date: '2021-04-06',
  totalBooths: 2,
  source: 'ECI',
  candidates: [
    { slNo: 1, name: 'Candidate A', party: 'DMK', symbol: '' },
    { slNo: 2, name: 'Candidate B', party: 'AIADMK', symbol: '' },
  ],
  results: {
    'TN-001-1': { votes: [500, 300], total: 800, rejected: 5 },
    'TN-001-2': { votes: [400, 350], total: 750, rejected: 3 },
  },
  summary: {
    totalVoters: 2000,
    totalVotes: 1550,
    turnoutPercent: 77.5,
    winner: { name: 'Candidate A', party: 'DMK', votes: 900 },
    runnerUp: { name: 'Candidate B', party: 'AIADMK', votes: 650 },
    margin: 250,
    marginPercent: 16.13,
  },
};

const mockBoothsWithResults: BoothWithResult[] = [
  {
    id: 'TN-001-1',
    boothNo: '1',
    num: 1,
    type: 'regular',
    name: 'Panchayat School',
    address: 'Panchayat School, Village A',
    area: 'Village A',
    result: { votes: [500, 300], total: 800, rejected: 5 },
    winner: { name: 'Candidate A', party: 'DMK', votes: 500, percent: 62.5 },
  },
  {
    id: 'TN-001-2',
    boothNo: '2',
    num: 2,
    type: 'women',
    name: 'Government School',
    address: 'Government School, Village B',
    area: 'Village B',
    result: { votes: [400, 350], total: 750, rejected: 3 },
    winner: { name: 'Candidate A', party: 'DMK', votes: 400, percent: 53.33 },
  },
];

describe('BoothResultsPanel', () => {
  const defaultProps = {
    acName: 'GUMMIDIPUNDI',
    boothList: mockBoothList,
    boothResults: mockBoothResults,
    boothsWithResults: mockBoothsWithResults,
    availableYears: [2021, 2024],
    loading: false,
    error: null,
    selectedYear: 2021,
    onYearChange: vi.fn(),
    onClose: vi.fn(),
    onBoothSelect: vi.fn(),
  };

  describe('loading state', () => {
    it('shows loading message when loading', () => {
      render(<BoothResultsPanel {...defaultProps} loading={true} />);
      expect(screen.getByText('Loading booth data...')).toBeInTheDocument();
    });
  });

  describe('error state', () => {
    it('shows error message when there is an error', () => {
      render(<BoothResultsPanel {...defaultProps} error="Failed to load data" />);
      expect(screen.getByText('Failed to load data')).toBeInTheDocument();
    });

    it('shows close button in error state', () => {
      const onClose = vi.fn();
      render(<BoothResultsPanel {...defaultProps} error="Error" onClose={onClose} />);
      const closeButton = screen.getAllByRole('button')[0];
      fireEvent.click(closeButton);
      expect(onClose).toHaveBeenCalled();
    });
  });

  describe('normal rendering', () => {
    it('displays AC name', () => {
      render(<BoothResultsPanel {...defaultProps} />);
      expect(screen.getByText('GUMMIDIPUNDI')).toBeInTheDocument();
    });

    it('displays stats', () => {
      render(<BoothResultsPanel {...defaultProps} />);
      expect(screen.getByText('Total Booths')).toBeInTheDocument();
      expect(screen.getByText('Women Booths')).toBeInTheDocument();
      expect(screen.getByText('Total Votes')).toBeInTheDocument();
    });

    it('displays year selector', () => {
      render(<BoothResultsPanel {...defaultProps} />);
      expect(screen.getByText('2021')).toBeInTheDocument();
      expect(screen.getByText('2024')).toBeInTheDocument();
    });

    it('calls onYearChange when year button clicked', () => {
      const onYearChange = vi.fn();
      render(<BoothResultsPanel {...defaultProps} onYearChange={onYearChange} />);
      fireEvent.click(screen.getByText('2024'));
      expect(onYearChange).toHaveBeenCalledWith(2024);
    });

    it('displays booth rows', () => {
      render(<BoothResultsPanel {...defaultProps} />);
      expect(screen.getByText('Panchayat School')).toBeInTheDocument();
      expect(screen.getByText('Government School')).toBeInTheDocument();
    });
  });

  describe('filtering', () => {
    it('filters by search query', () => {
      render(<BoothResultsPanel {...defaultProps} />);
      const searchInput = screen.getByPlaceholderText(/Search booth/i);
      fireEvent.change(searchInput, { target: { value: 'Panchayat' } });
      expect(screen.getByText('Panchayat School')).toBeInTheDocument();
      expect(screen.queryByText('Government School')).not.toBeInTheDocument();
    });

    it('filters women booths', () => {
      render(<BoothResultsPanel {...defaultProps} />);
      fireEvent.click(screen.getByText('Women'));
      expect(screen.queryByText('Panchayat School')).not.toBeInTheDocument();
      expect(screen.getByText('Government School')).toBeInTheDocument();
    });

    it('filters regular booths', () => {
      render(<BoothResultsPanel {...defaultProps} />);
      fireEvent.click(screen.getByText('Regular'));
      expect(screen.getByText('Panchayat School')).toBeInTheDocument();
      expect(screen.queryByText('Government School')).not.toBeInTheDocument();
    });
  });

  describe('sorting', () => {
    it('sorts by booth number', () => {
      render(<BoothResultsPanel {...defaultProps} />);
      const boothHeader = screen.getByText('Booth');
      fireEvent.click(boothHeader);
      // Should toggle sort order
      fireEvent.click(boothHeader);
    });

    it('sorts by winner', () => {
      render(<BoothResultsPanel {...defaultProps} />);
      const winnerHeader = screen.getByText('Winner');
      fireEvent.click(winnerHeader);
    });

    it('sorts by votes', () => {
      render(<BoothResultsPanel {...defaultProps} />);
      const votesHeader = screen.getByText('Votes');
      fireEvent.click(votesHeader);
    });
  });

  describe('booth expansion', () => {
    it('expands booth row on click', () => {
      render(<BoothResultsPanel {...defaultProps} />);
      const boothRow = screen.getByText('Panchayat School').closest('.border-b');
      fireEvent.click(boothRow!);
      // After expansion, should show candidate details
      expect(screen.getByText('Village A')).toBeInTheDocument();
    });
  });

  describe('close button', () => {
    it('calls onClose when close button clicked', () => {
      const onClose = vi.fn();
      render(<BoothResultsPanel {...defaultProps} onClose={onClose} />);
      const closeButtons = screen.getAllByRole('button');
      // Find the X button in the header
      fireEvent.click(closeButtons[0]);
      expect(onClose).toHaveBeenCalled();
    });
  });

  describe('empty state', () => {
    it('shows no booths message when filtered list is empty', () => {
      render(<BoothResultsPanel {...defaultProps} />);
      const searchInput = screen.getByPlaceholderText(/Search booth/i);
      fireEvent.change(searchInput, { target: { value: 'nonexistent' } });
      expect(screen.getByText('No booths found matching your filters.')).toBeInTheDocument();
    });
  });
});
