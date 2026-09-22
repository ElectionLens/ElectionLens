import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { BoothWithResult } from '../../hooks/useBoothData';
import { BoothMiniCardGrid } from './BoothMiniCardGrid';

function makeBooth(overrides: Partial<BoothWithResult> = {}): BoothWithResult {
  return {
    id: 'TN-001-1',
    boothNo: '1',
    num: 1,
    type: 'regular',
    name: 'Government School',
    address: 'Government School, Main Road',
    area: 'Main Road',
    voteSource: 'form20',
    ...overrides,
  };
}

describe('BoothMiniCardGrid', () => {
  it('renders nothing for an empty booth list', () => {
    const { container } = render(
      <BoothMiniCardGrid booths={[]} selectedBoothId={null} onBoothSelect={vi.fn()} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders a flat (non-virtualized) list below the threshold', () => {
    const booths = [
      makeBooth({
        id: 'a',
        boothNo: '1',
        winner: { name: 'Cand A', party: 'DMK', votes: 400, percent: 62 },
      }),
      makeBooth({ id: 'b', boothNo: '2' }),
    ];
    render(<BoothMiniCardGrid booths={booths} selectedBoothId={null} onBoothSelect={vi.fn()} />);

    expect(screen.getAllByRole('button')).toHaveLength(2);
    expect(screen.getByRole('list', { name: /booths/i })).not.toHaveClass(
      'booth-mini-card-grid--virtualized'
    );
  });

  it('calls onBoothSelect with the booth id when a card is clicked', () => {
    const onBoothSelect = vi.fn();
    const booths = [makeBooth({ id: 'TN-001-7', boothNo: '7' })];
    render(
      <BoothMiniCardGrid booths={booths} selectedBoothId={null} onBoothSelect={onBoothSelect} />
    );

    fireEvent.click(screen.getByRole('button'));
    expect(onBoothSelect).toHaveBeenCalledWith('TN-001-7');
  });

  it('marks the selected booth as aria-pressed', () => {
    const booths = [makeBooth({ id: 'a' }), makeBooth({ id: 'b', boothNo: '2' })];
    render(<BoothMiniCardGrid booths={booths} selectedBoothId="b" onBoothSelect={vi.fn()} />);

    const buttons = screen.getAllByRole('button');
    expect(buttons[0]).toHaveAttribute('aria-pressed', 'false');
    expect(buttons[1]).toHaveAttribute('aria-pressed', 'true');
  });

  it('gives each card an accessible name carrying booth number, winner and votes', () => {
    const booths = [
      makeBooth({
        id: 'a',
        boothNo: '5',
        type: 'women',
        winner: { name: 'Cand A', party: 'DMK', votes: 400, percent: 61.5 },
        result: { votes: [400, 250], total: 650 },
      }),
    ];
    render(<BoothMiniCardGrid booths={booths} selectedBoothId={null} onBoothSelect={vi.fn()} />);

    const button = screen.getByRole('button');
    const label = button.getAttribute('aria-label') ?? '';
    expect(label).toContain('Booth 5');
    expect(label).toContain("women's booth");
    expect(label).toContain('DMK');
    expect(label).toContain('61.5');
  });

  it('renders a virtualized container above the threshold, windowing the DOM nodes', () => {
    const booths = Array.from({ length: 200 }, (_, i) =>
      makeBooth({ id: `b-${i}`, boothNo: String(i + 1) })
    );
    render(<BoothMiniCardGrid booths={booths} selectedBoothId={null} onBoothSelect={vi.fn()} />);

    expect(screen.getByRole('list', { name: /booths/i })).toHaveClass(
      'booth-mini-card-grid--virtualized'
    );
    // happy-dom reports 0 clientHeight, so the window is small - the point is
    // that it is nowhere near all 200 real DOM buttons.
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBeGreaterThan(0);
    expect(buttons.length).toBeLessThan(200);
  });

  it('shows a no-data label for booths without a winner', () => {
    const booths = [makeBooth({ id: 'a', voteSource: 'missing' })];
    render(<BoothMiniCardGrid booths={booths} selectedBoothId={null} onBoothSelect={vi.fn()} />);

    expect(screen.getByText('No data')).toBeInTheDocument();
  });
});
