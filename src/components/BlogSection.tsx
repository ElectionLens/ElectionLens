import { useState, useCallback, useEffect } from 'react';
import { BookOpen, X, ExternalLink } from 'lucide-react';
import type { AssemblyFeature } from '../types';

interface BlogPost {
  id: string;
  title: string;
  date: string;
  excerpt: string;
  content: React.ReactNode;
}

interface BlogSectionProps {
  isOpen: boolean;
  onClose: () => void;
  onAssemblyClick?: (acName: string, feature: AssemblyFeature) => void;
  onNavigateToState?: (stateName: string) => Promise<void>;
}

interface FlipData {
  ac_id: string;
  ac_name: string;
  current_winner: string;
  current_winner_name?: string;
  current_winner_votes: number;
  admk_votes: number;
  ammk_votes: number;
  combined_votes: number;
  margin: number;
  dmk_votes?: number;
}

interface MarginIncreaseData {
  ac_id: string;
  ac_name: string;
  current_winner: string;
  current_winner_votes: number;
  admk_votes: number;
  ammk_votes: number;
  combined_votes: number;
  margin_increase: number;
}

interface AllianceAnalysis {
  flips: FlipData[];
  margin_increases: MarginIncreaseData[];
  total_flips: number;
  total_margin_increases: number;
}

export function BlogSection({
  isOpen,
  onClose,
  onAssemblyClick,
  onNavigateToState,
}: BlogSectionProps): JSX.Element {
  const [selectedPost, setSelectedPost] = useState<string | null>(null);
  const [allianceData, setAllianceData] = useState<AllianceAnalysis | null>(null);
  const [loading, setLoading] = useState(false);

  // Load alliance analysis data
  const loadAllianceData = useCallback(async () => {
    if (allianceData) return;

    setLoading(true);
    try {
      const response = await fetch('/data/blog/ammk-admk-alliance-2026.json');
      if (response.ok) {
        const data = (await response.json()) as AllianceAnalysis;
        setAllianceData(data);
      }
    } catch (err) {
      console.error('Failed to load alliance data:', err);
    } finally {
      setLoading(false);
    }
  }, [allianceData]);

  // Read blog post from URL
  const getPostFromUrl = useCallback((): string | null => {
    if (typeof window === 'undefined') return null;
    const searchParams = new URLSearchParams(window.location.search);
    return searchParams.get('blogPost');
  }, []);

  // Update URL when blog post changes
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const searchParams = new URLSearchParams(window.location.search);

    if (selectedPost) {
      searchParams.set('blogPost', selectedPost);
      if (!searchParams.has('blog')) {
        searchParams.set('blog', 'true');
      }
    } else {
      searchParams.delete('blogPost');
      // Don't remove blog param here - let App.tsx handle it when blog closes
    }

    const newUrl = searchParams.toString()
      ? `${window.location.pathname}?${searchParams.toString()}`
      : window.location.pathname;
    window.history.replaceState({}, '', newUrl);
  }, [selectedPost]);

  // Read blog post from URL when blog opens
  useEffect(() => {
    if (isOpen) {
      const postFromUrl = getPostFromUrl();
      if (postFromUrl && postFromUrl !== selectedPost) {
        setSelectedPost(postFromUrl);
        if (postFromUrl === 'ammk-admk-alliance') {
          void loadAllianceData();
        }
      }
    } else {
      // Reset when blog closes
      setSelectedPost(null);
    }
  }, [isOpen, getPostFromUrl, selectedPost, loadAllianceData]);

  // Read blog post from URL when URL changes (e.g., browser back/forward)
  useEffect(() => {
    const handlePopState = (): void => {
      const postFromUrl = getPostFromUrl();
      setSelectedPost(postFromUrl);
      if (postFromUrl === 'ammk-admk-alliance') {
        void loadAllianceData();
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [getPostFromUrl, loadAllianceData]);

  const isLoading = loading && !allianceData;

  const handlePostClick = useCallback(
    (postId: string) => {
      setSelectedPost(postId);
      if (postId === 'ammk-admk-alliance') {
        void loadAllianceData();
      }
      // URL will be updated by the useEffect that watches selectedPost
    },
    [loadAllianceData]
  );

  const handleACClick = useCallback(
    async (acId: string, acName: string) => {
      // Navigate to Tamil Nadu assemblies view and select the AC
      const mockFeature: AssemblyFeature = {
        type: 'Feature',
        properties: {
          AC_NAME: acName.toUpperCase(),
          AC_NO: acId.replace('TN-', ''),
          PC_NAME: '', // Will be resolved by the app
          schemaId: acId,
        },
        geometry: {
          type: 'Polygon',
          coordinates: [],
        },
      };

      // Close blog first
      onClose();

      // Navigate to Tamil Nadu first if not already there
      if (onNavigateToState) {
        await onNavigateToState('Tamil Nadu');
      }

      // Then select the assembly
      if (onAssemblyClick) {
        // Small delay to ensure state navigation completes
        setTimeout(() => {
          onAssemblyClick(acName.toUpperCase(), mockFeature);
        }, 300);
      }
    },
    [onAssemblyClick, onClose, onNavigateToState]
  );

  const blogPosts: BlogPost[] = [
    {
      id: 'ammk-admk-alliance',
      title: 'AMMK Joins ADMK Alliance for 2026: Constituencies That Will Flip',
      date: 'January 24, 2026',
      excerpt:
        'Analysis of how the AMMK-ADMK alliance will impact Tamil Nadu assembly constituencies based on 2021 election data.',
      content: allianceData ? (
        <AlliancePostContent data={allianceData} onACClick={handleACClick} />
      ) : isLoading ? (
        <div className="loading">Loading analysis...</div>
      ) : (
        <div className="loading">Click to load analysis...</div>
      ),
    },
  ];

  if (!isOpen) {
    return <></>;
  }

  return (
    <div className="blog-section" style={{ transform: 'translateX(0)' }}>
      <div className="blog-header">
        <div className="blog-title">
          <BookOpen size={24} />
          <h2>Blog</h2>
        </div>
        <button className="blog-close" onClick={onClose} aria-label="Close blog">
          <X size={24} />
        </button>
      </div>

      <div className="blog-content">
        {selectedPost === null ? (
          <div className="blog-list">
            {blogPosts.map((post) => (
              <div
                key={post.id}
                className="blog-post-card"
                onClick={() => handlePostClick(post.id)}
              >
                <h3>{post.title}</h3>
                <p className="blog-date">{post.date}</p>
                <p className="blog-excerpt">{post.excerpt}</p>
                <button className="blog-read-more">
                  Read More <ExternalLink size={16} />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="blog-post-view">
            <button className="blog-back" onClick={() => setSelectedPost(null)}>
              ← Back to Blog
            </button>
            {blogPosts.find((p) => p.id === selectedPost)?.content}
          </div>
        )}
      </div>
    </div>
  );
}

interface AlliancePostContentProps {
  data: AllianceAnalysis;
  onACClick: (acId: string, acName: string) => void;
}

function AlliancePostContent({ data, onACClick }: AlliancePostContentProps): JSX.Element {
  return (
    <article className="blog-article">
      <header>
        <h1>AMMK Joins ADMK Alliance for 2026: Constituencies That Will Flip</h1>
        <p className="article-meta">January 24, 2026 • Election Analysis</p>
      </header>

      <div className="article-content">
        <p>
          The announcement that <strong>Amma Makkal Munnetra Kazhagam (AMMK)</strong> has joined the{' '}
          <strong>All India Anna Dravida Munnetra Kazhagam (ADMK)</strong> alliance for the 2026
          Tamil Nadu Assembly elections is set to reshape the electoral landscape. Based on 2021
          election data, we analyze which constituencies will flip and how margins will change.
        </p>

        <div className="analysis-summary">
          <div className="summary-card">
            <h3>{data.total_flips}</h3>
            <p>Constituencies That Will Flip</p>
          </div>
          <div className="summary-card">
            <h3>{data.total_margin_increases}</h3>
            <p>ADMK Seats with Increased Margins</p>
          </div>
        </div>

        <section>
          <h2>Constituencies That Will Flip to ADMK+AMMK</h2>
          <p>
            The following {data.total_flips} constituencies would flip from their current winners to
            the combined ADMK+AMMK alliance if votes are combined:
          </p>

          <div className="flip-list">
            {data.flips.map((flip, idx) => (
              <div
                key={flip.ac_id}
                className="flip-item"
                onClick={() => onACClick(flip.ac_id, flip.ac_name)}
              >
                <div className="flip-header">
                  <span className="flip-rank">#{idx + 1}</span>
                  <h3 className="flip-ac-name">{flip.ac_name}</h3>
                  <span className="flip-ac-id">{flip.ac_id}</span>
                </div>
                <div className="flip-details">
                  <div className="flip-current">
                    <span className="label">Current Winner:</span>
                    <span className="value winner">{flip.current_winner}</span>
                    <span className="votes">
                      ({flip.current_winner_votes.toLocaleString()} votes)
                    </span>
                  </div>
                  <div className="flip-new">
                    <span className="label">ADMK+AMMK:</span>
                    <span className="value combined">
                      {flip.combined_votes.toLocaleString()} votes
                    </span>
                    <span className="margin">(Margin: +{flip.margin.toLocaleString()})</span>
                  </div>
                  <div className="flip-breakdown">
                    <span>ADMK: {flip.admk_votes.toLocaleString()}</span>
                    <span>+ AMMK: {flip.ammk_votes.toLocaleString()}</span>
                    <span>= {flip.combined_votes.toLocaleString()}</span>
                  </div>
                </div>
                <div className="flip-click-hint">Click to view constituency details →</div>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2>ADMK Seats with Increased Margins</h2>
          <p>
            The following {data.total_margin_increases} constituencies are already won by ADMK, but
            the alliance will significantly increase their victory margins:
          </p>

          <div className="margin-increase-list">
            {data.margin_increases.slice(0, 20).map((increase, idx) => (
              <div
                key={increase.ac_id}
                className="margin-item"
                onClick={() => onACClick(increase.ac_id, increase.ac_name)}
              >
                <span className="margin-rank">#{idx + 1}</span>
                <span className="margin-ac">{increase.ac_name}</span>
                <span className="margin-value">
                  +{increase.margin_increase.toLocaleString()} votes
                </span>
              </div>
            ))}
            {data.margin_increases.length > 20 && (
              <p className="more-items">
                ... and {data.margin_increases.length - 20} more constituencies
              </p>
            )}
          </div>
        </section>

        <section>
          <h2>Key Insights</h2>
          <ul>
            <li>
              <strong>{data.total_flips} constituencies</strong> would flip from DMK, INC, and other
              parties to the ADMK+AMMK alliance.
            </li>
            <li>
              The largest flip would be <strong>{data.flips[0]?.ac_name}</strong> with a margin of{' '}
              {data.flips[0]?.margin.toLocaleString()} votes.
            </li>
            <li>
              ADMK&apos;s existing seats would see margin increases totaling{' '}
              <strong>
                {data.margin_increases
                  .reduce((sum, m) => sum + m.margin_increase, 0)
                  .toLocaleString()}
              </strong>{' '}
              additional votes.
            </li>
            <li>
              This analysis assumes 100% vote transfer from AMMK to ADMK, which may vary in practice
              based on candidate selection and campaign dynamics.
            </li>
          </ul>
        </section>

        <footer className="article-footer">
          <p>
            <em>
              Data source: 2021 Tamil Nadu Assembly Election Results (100% coverage). Analysis based
              on combining AMMK and ADMK vote shares.
            </em>
          </p>
        </footer>
      </div>
    </article>
  );
}
