import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';

import { CandidateBar } from './CandidateBar';

function widthOf(container: HTMLElement): string {
  return (container.querySelector('.candidate-bar') as HTMLElement | null)?.style.width ?? '';
}

describe('CandidateBar', () => {
  it('scales relative to the leader, not to 100%', () => {
    // A 38-vs-35 contest should read as a near-tie. Against an absolute scale
    // both bars would be short stubs in mostly empty space.
    const { container } = render(<CandidateBar voteShare={35} party="ADMK" leaderShare={38} />);
    expect(widthOf(container)).toBe(`${(35 / 38) * 100}%`);
  });

  it('draws the leader at full width', () => {
    const { container } = render(<CandidateBar voteShare={38} party="DMK" leaderShare={38} />);
    expect(widthOf(container)).toBe('100%');
  });

  it('falls back to an absolute scale when the leader is unknown', () => {
    const { container } = render(<CandidateBar voteShare={40} party="DMK" leaderShare={0} />);
    expect(widthOf(container)).toBe('40%');
  });

  it('never exceeds 100% even if a share overshoots the leader', () => {
    const { container } = render(<CandidateBar voteShare={60} party="DMK" leaderShare={50} />);
    expect(widthOf(container)).toBe('100%');
  });

  it('renders nothing for a zero or non-finite share', () => {
    expect(
      render(<CandidateBar voteShare={0} party="DMK" leaderShare={50} />).container
    ).toBeEmptyDOMElement();
    expect(
      render(<CandidateBar voteShare={Number.NaN} party="DMK" leaderShare={50} />).container
    ).toBeEmptyDOMElement();
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
