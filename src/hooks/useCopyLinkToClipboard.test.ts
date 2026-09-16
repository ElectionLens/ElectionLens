import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useCopyLinkToClipboard } from './useCopyLinkToClipboard';
import * as firebase from '../utils/firebase';

vi.mock('../utils/firebase', () => ({ trackShare: vi.fn() }));

describe('useCopyLinkToClipboard', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);
    vi.mocked(firebase.trackShare).mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('does nothing for a nullish url - no clipboard write, no analytics', async () => {
    const { result } = renderHook(() => useCopyLinkToClipboard());
    await act(async () => {
      await result.current.copyLink(undefined, 'assembly');
    });
    expect(navigator.clipboard.writeText).not.toHaveBeenCalled();
    expect(firebase.trackShare).not.toHaveBeenCalled();
    expect(result.current.copied).toBe(false);
  });

  it('writes the url, flashes copied, and tracks the given content type', async () => {
    const { result } = renderHook(() => useCopyLinkToClipboard());
    await act(async () => {
      await result.current.copyLink('https://example.com/pc/jaipur', 'parliament');
    });
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('https://example.com/pc/jaipur');
    expect(firebase.trackShare).toHaveBeenCalledWith('copy_link', 'parliament');
    expect(result.current.copied).toBe(true);
  });

  it('flashes copied for exactly 2000ms then resets', async () => {
    const { result } = renderHook(() => useCopyLinkToClipboard());
    await act(async () => {
      await result.current.copyLink('https://example.com/blog/post', 'blog');
    });
    expect(result.current.copied).toBe(true);

    act(() => {
      vi.advanceTimersByTime(1999);
    });
    expect(result.current.copied).toBe(true);

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current.copied).toBe(false);
  });

  it('logs and swallows a clipboard failure rather than throwing', async () => {
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('denied'));
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { result } = renderHook(() => useCopyLinkToClipboard());

    await act(async () => {
      await result.current.copyLink('https://example.com/ac/arani', 'assembly');
    });

    expect(result.current.copied).toBe(false);
    expect(firebase.trackShare).not.toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalled();
  });

  it('scopes copied state per hook instance - two panels do not flash together', async () => {
    const a = renderHook(() => useCopyLinkToClipboard());
    const b = renderHook(() => useCopyLinkToClipboard());

    await act(async () => {
      await a.result.current.copyLink('https://example.com/a', 'assembly');
    });

    expect(a.result.current.copied).toBe(true);
    expect(b.result.current.copied).toBe(false);
  });

  it('lets one instance share its copied flash across two differently-tracked links', async () => {
    // the reason contentType is per-call: the AC panel's main link and its
    // PC-contribution link intentionally share one flash but log differently
    const { result } = renderHook(() => useCopyLinkToClipboard());

    await act(async () => {
      await result.current.copyLink('https://example.com/ac', 'assembly');
    });
    expect(result.current.copied).toBe(true);

    await act(async () => {
      await result.current.copyLink('https://example.com/pc-contribution', 'parliament');
    });
    expect(firebase.trackShare).toHaveBeenNthCalledWith(1, 'copy_link', 'assembly');
    expect(firebase.trackShare).toHaveBeenNthCalledWith(2, 'copy_link', 'parliament');
  });
});
