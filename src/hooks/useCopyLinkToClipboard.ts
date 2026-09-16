/**
 * "Copy a link, flash a copied indicator, log a share event" - the same
 * eight lines were written out in the AC panel (twice), the PC panel, and
 * the blog section, each with its own catch block and its own magic 2000ms.
 *
 * Deliberately does NOT own the URL-resolution logic (fallbacks like
 * `shareUrl ?? window.location.href`, or guards like "don't copy while
 * results are still loading") - those differ per caller and belong there.
 * This hook only owns what was actually identical: write, flash, track,
 * log-and-swallow on failure.
 */
import { useCallback, useState } from 'react';
import { trackShare } from '../utils/firebase';

const COPIED_FLASH_MS = 2000;

export interface UseCopyLinkToClipboardResult {
  /** True for COPIED_FLASH_MS after a successful copy. */
  copied: boolean;
  /**
   * No-ops on a nullish url rather than copying "undefined" to the
   * clipboard. contentType is a per-call argument rather than bound at
   * hook creation: one panel can have two share buttons (e.g. "copy AC
   * link" and "copy PC contribution link") that intentionally SHARE one
   * `copied` flash but log different content types - splitting them into
   * two hook instances would silently stop that shared flash.
   */
  copyLink: (url: string | null | undefined, contentType: string) => Promise<void>;
}

export function useCopyLinkToClipboard(): UseCopyLinkToClipboardResult {
  const [copied, setCopied] = useState(false);

  const copyLink = useCallback(
    async (url: string | null | undefined, contentType: string): Promise<void> => {
      if (!url) return;
      try {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), COPIED_FLASH_MS);
        trackShare('copy_link', contentType);
      } catch (err) {
        console.error('Failed to copy:', err);
      }
    },
    []
  );

  return { copied, copyLink };
}
