import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { MetaTags } from './MetaTags';

describe('MetaTags', () => {
  beforeEach(() => {
    document.title = '';
  });

  afterEach(() => {
    document.head
      .querySelectorAll('meta[property="og:title"], meta[name="twitter:title"]')
      .forEach((el) => {
        if (el.getAttribute('content')?.includes('Test')) el.remove();
      });
  });

  it('sets document title and core meta tags from props', async () => {
    render(
      <MetaTags
        title="Test Title"
        description="Test Desc"
        url="https://example.com/page"
        type="article"
      />
    );

    await waitFor(() => {
      expect(document.title).toBe('Test Title');
    });

    expect(document.querySelector('meta[name="description"]')?.getAttribute('content')).toBe(
      'Test Desc'
    );
    expect(document.querySelector('meta[property="og:type"]')?.getAttribute('content')).toBe(
      'article'
    );
    expect(document.querySelector('meta[property="og:url"]')?.getAttribute('content')).toBe(
      'https://example.com/page'
    );
    expect(document.querySelector('meta[property="og:title"]')?.getAttribute('content')).toBe(
      'Test Title'
    );
    expect(document.querySelector('meta[property="og:site_name"]')?.getAttribute('content')).toBe(
      'Election Lens'
    );
    expect(document.querySelector('meta[name="twitter:card"]')?.getAttribute('content')).toBe(
      'summary_large_image'
    );
  });

  it('uses window.location when url is omitted', async () => {
    render(<MetaTags title="Loc" description="D" />);

    await waitFor(() => {
      expect(
        document.querySelector('meta[property="og:url"]')?.getAttribute('content')
      ).toBeTruthy();
    });
  });

  it('prefixes relative image paths with site base and cache-busts absolute images', async () => {
    render(<MetaTags title="T" description="D" image="/custom.png" />);

    await waitFor(() => {
      const og = document.querySelector('meta[property="og:image"]')?.getAttribute('content');
      expect(og).toContain('electionlens.netlify.app');
      expect(og).toContain('/custom.png');
      expect(og).toContain('v=2');
    });

    document.head.querySelectorAll('meta[property="og:image"]').forEach((el) => el.remove());

    render(<MetaTags title="T2" description="D2" image="https://cdn.example.com/x.png" />);

    await waitFor(() => {
      const og = document.querySelector('meta[property="og:image"]')?.getAttribute('content');
      expect(og).toMatch(/^https:\/\/cdn\.example\.com\/x\.png\?v=2$/);
    });
  });
});
