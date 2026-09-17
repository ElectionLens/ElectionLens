import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';

import { CandidateBar } from './CandidateBar';

/** The bar is scaled inside a fixed track, so magnitude lives in scaleX. */
function scaleOf(container: HTMLElement): number | null {
  const el = container.querySelector('.candidate-bar') as HTMLElement | null;
  if (!el) return null;
  const match = /scaleX\(([\d.]+)\)/.exec(el.style.transform);
  return match ? Number(match[1]) : null;
}

describe('CandidateBar', () => {
  it('scales relative to the leader, not to 100%', () => {
    // A 38-vs-35 contest should read as a near-tie. Against an absolute scale
    // both bars would be short stubs in mostly empty space.
    const { container } = render(<CandidateBar voteShare={35} party="ADMK" leaderShare={38} />);
    expect(scaleOf(container)).toBeCloseTo(35 / 38, 5);
  });

  it('draws the leader at full width', () => {
    const { container } = render(<CandidateBar voteShare={38} party="DMK" leaderShare={38} />);
    expect(scaleOf(container)).toBeCloseTo(1, 5);
  });

  it('falls back to an absolute scale when the leader is unknown', () => {
    const { container } = render(<CandidateBar voteShare={40} party="DMK" leaderShare={0} />);
    expect(scaleOf(container)).toBeCloseTo(0.4, 5);
  });

  it('never exceeds 100% even if a share overshoots the leader', () => {
    const { container } = render(<CandidateBar voteShare={60} party="DMK" leaderShare={50} />);
    expect(scaleOf(container)).toBeCloseTo(1, 5);
  });

  it('renders nothing for a zero or non-finite share', () => {
    expect(
      render(<CandidateBar voteShare={0} party="DMK" leaderShare={50} />).container
    ).toBeEmptyDOMElement();
    expect(
      render(<CandidateBar voteShare={Number.NaN} party="DMK" leaderShare={50} />).container
    ).toBeEmptyDOMElement();
  });

  describe('sub-pixel shares', () => {
    // Measured on the real panel: a 0.1% candidate produced a 0.45px fill,
    // which reads as a coloured smudge behind the 24px rank column rather
    // than as a magnitude.
    it('drops a bar that would be too narrow to read as a bar', () => {
      const { container } = render(<CandidateBar voteShare={0.1} party="IND" leaderShare={49.2} />);
      expect(container).toBeEmptyDOMElement();
    });

    it('does not round tiny shares up to a visible width, which would overstate them', () => {
      const { container } = render(<CandidateBar voteShare={0.5} party="IND" leaderShare={49.2} />);
      expect(container).toBeEmptyDOMElement();
    });

    it('keeps bars that are genuinely legible', () => {
      // 5.1% of a 49.2% leader is 10.4% - small but a real bar.
      const { container } = render(<CandidateBar voteShare={5.1} party="NTK" leaderShare={49.2} />);
      expect(scaleOf(container)).toBeCloseTo(5.1 / 49.2, 5);
    });
  });

  it('renders nothing when vote figures are hidden', () => {
    // Pre-poll rows show em-dashes; a bar would imply a result exists.
    const { container } = render(
      <CandidateBar voteShare={40} party="DMK" leaderShare={50} hidden />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('is hidden from assistive tech, since the columns already state the numbers', () => {
    const { container } = render(<CandidateBar voteShare={40} party="DMK" leaderShare={50} />);
    expect(container.querySelector('.candidate-bar')).toHaveAttribute('aria-hidden');
  });
});
