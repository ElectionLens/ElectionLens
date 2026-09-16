import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { useMap } from 'react-leaflet';
import { BackgroundPanes } from './BackgroundPanes';

describe('BackgroundPanes', () => {
  it('creates the backgroundPane when it does not exist yet, at z-index 360', () => {
    const createPane = vi.fn(() => ({ style: {} as CSSStyleDeclaration }));
    const getPane = vi.fn(() => undefined);
    vi.mocked(useMap).mockReturnValue({ getPane, createPane } as never);

    render(<BackgroundPanes />);

    expect(createPane).toHaveBeenCalledWith('backgroundPane');
    expect(getPane.mock.results[0]?.value).toBeUndefined();
  });

  it('sets z-index below the primary overlay pane (400) so background context never paints on top', () => {
    const pane = { style: {} as CSSStyleDeclaration };
    const getPane = vi.fn(() => pane);
    const createPane = vi.fn();
    vi.mocked(useMap).mockReturnValue({ getPane, createPane } as never);

    render(<BackgroundPanes />);

    expect(createPane).not.toHaveBeenCalled();
    expect(pane.style.zIndex).toBe('360');
    expect(Number(pane.style.zIndex)).toBeLessThan(400);
  });

  it('renders nothing to the DOM', () => {
    vi.mocked(useMap).mockReturnValue({
      getPane: () => ({ style: {} as CSSStyleDeclaration }),
      createPane: vi.fn(),
    } as never);
    const { container } = render(<BackgroundPanes />);
    expect(container.firstChild).toBeNull();
  });
});
