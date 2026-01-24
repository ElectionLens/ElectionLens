import { useState, useCallback, useEffect, useMemo } from 'react';
import {
  BookOpen,
  X,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Twitter,
  Link2,
  Check,
  Share2,
} from 'lucide-react';
import type { AssemblyFeature } from '../types';
import type { BoothResults } from '../hooks/useBoothData';
import { trackShare } from '../utils/firebase';

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
  bjp_votes: number;
  pmk_votes: number;
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
  bjp_votes: number;
  pmk_votes: number;
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
  // Read blog post from URL
  const getPostFromUrl = useCallback((): string | null => {
    if (typeof window === 'undefined') return null;
    const searchParams = new URLSearchParams(window.location.search);
    return searchParams.get('blogPost');
  }, []);

  const [selectedPost, setSelectedPost] = useState<string | null>(() => {
    // Initialize from URL on mount
    if (typeof window !== 'undefined') {
      return getPostFromUrl();
    }
    return null;
  });
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
      } else if (selectedPost === 'ammk-admk-alliance' && !allianceData && !loading) {
        // Load data if post is selected but data not loaded yet
        void loadAllianceData();
      }
    } else {
      // Reset when blog closes
      setSelectedPost(null);
    }
  }, [isOpen, getPostFromUrl, selectedPost, loadAllianceData, allianceData, loading]);

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
      title: 'NDA Alliance for 2026: Constituencies That Will Flip with AMMK',
      date: 'January 24, 2026',
      excerpt:
        'Analysis of how the NDA alliance (ADMK + BJP + PMK + AMMK) will impact Tamil Nadu assembly constituencies based on 2021 election data.',
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
  const [copied, setCopied] = useState(false);
  const [showAllMarginIncreases, setShowAllMarginIncreases] = useState(false);

  // Get current share URL
  const shareUrl = useMemo(() => {
    if (typeof window === 'undefined') return '';
    return window.location.href;
  }, []);

  // Generate share text
  const shareText = useMemo(() => {
    return (
      `🗳️ NDA Alliance for 2026: ${data.total_flips} Constituencies Will Flip\n\n` +
      `Based on 2021 Tamil Nadu election data, the NDA alliance (ADMK+BJP+PMK+AMMK) would flip ${data.total_flips} constituencies from DMK/INC to NDA.\n\n` +
      `📊 Analysis includes:\n` +
      `• ${data.total_flips} constituencies that will flip\n` +
      `• ${data.total_margin_increases} NDA seats with increased margins\n\n` +
      `View full analysis:`
    );
  }, [data]);

  const handleCopyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      trackShare('copy_link', 'blog');
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }, [shareUrl]);

  const handleShareToX = useCallback(() => {
    const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`;
    window.open(twitterUrl, '_blank', 'width=550,height=420');
    trackShare('twitter', 'blog');
  }, [shareText, shareUrl]);

  const handleShareToFacebook = useCallback(() => {
    const facebookUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`;
    window.open(facebookUrl, '_blank', 'width=600,height=400');
    trackShare('facebook', 'blog');
  }, [shareUrl]);

  const handleShareToLinkedIn = useCallback(() => {
    const linkedInUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`;
    window.open(linkedInUrl, '_blank', 'width=600,height=400');
    trackShare('linkedin', 'blog');
  }, [shareUrl]);

  return (
    <article className="blog-article">
      <header>
        <div className="blog-header-content">
          <div>
            <h1>NDA Alliance for 2026: Constituencies That Will Flip with AMMK</h1>
            <p className="article-meta">January 24, 2026 • Election Analysis</p>
          </div>
          <div className="blog-share-buttons">
            <button
              className="blog-share-btn twitter-btn"
              onClick={handleShareToX}
              title="Share on Twitter/X"
              aria-label="Share on Twitter/X"
            >
              <Twitter size={18} />
              <span>Twitter</span>
            </button>
            <button
              className="blog-share-btn facebook-btn"
              onClick={handleShareToFacebook}
              title="Share on Facebook"
              aria-label="Share on Facebook"
            >
              <Share2 size={18} />
              <span>Facebook</span>
            </button>
            <button
              className="blog-share-btn linkedin-btn"
              onClick={handleShareToLinkedIn}
              title="Share on LinkedIn"
              aria-label="Share on LinkedIn"
            >
              <Share2 size={18} />
              <span>LinkedIn</span>
            </button>
            <button
              className={`blog-share-btn copy-btn ${copied ? 'copied' : ''}`}
              onClick={handleCopyLink}
              title={copied ? 'Copied!' : 'Copy link'}
              aria-label={copied ? 'Copied!' : 'Copy link'}
            >
              {copied ? <Check size={18} /> : <Link2 size={18} />}
              <span>{copied ? 'Copied!' : 'Copy'}</span>
            </button>
          </div>
        </div>
      </header>

      <div className="article-content">
        <p>
          The <strong>National Democratic Alliance (NDA)</strong> in Tamil Nadu for the 2026
          Assembly elections includes <strong>ADMK</strong>, <strong>BJP</strong>,{' '}
          <strong>PMK</strong> (joined 2026), and <strong>AMMK</strong> (joined 2026). Based on 2021
          election data, we analyze which constituencies will flip and how margins will change when
          all NDA votes are combined.
        </p>

        <div className="analysis-summary">
          <div className="summary-card">
            <h3>{data.total_flips}</h3>
            <p>Constituencies That Will Flip</p>
          </div>
          <div className="summary-card">
            <h3>{data.total_margin_increases}</h3>
            <p>NDA Seats with Increased Margins</p>
          </div>
        </div>

        <section>
          <h2>Constituencies That Will Flip to NDA Alliance</h2>
          <p>
            The following {data.total_flips} constituencies would flip from their current winners to
            the combined NDA alliance (ADMK + BJP + PMK + AMMK) if votes are combined:
          </p>

          <div className="flip-list">
            {data.flips.map((flip, idx) => (
              <FlipItemWithBooths key={flip.ac_id} flip={flip} idx={idx} onACClick={onACClick} />
            ))}
          </div>
        </section>

        <section>
          <h2>NDA Seats with Increased Margins</h2>
          <p>
            The following {data.total_margin_increases} constituencies are already won by NDA
            parties (ADMK: 66, BJP: 4, PMK: 5), but the combined alliance will significantly
            increase their victory margins:
          </p>

          <div className="margin-increase-list">
            {(showAllMarginIncreases
              ? data.margin_increases
              : data.margin_increases.slice(0, 20)
            ).map((increase, idx) => (
              <div
                key={increase.ac_id}
                className="margin-item"
                onClick={() => onACClick(increase.ac_id, increase.ac_name)}
              >
                <span className="margin-rank">#{idx + 1}</span>
                <div className="margin-ac-info">
                  <span className="margin-ac">{increase.ac_name}</span>
                  <span className="margin-winner">({increase.current_winner})</span>
                </div>
                <span className="margin-value">
                  +{increase.margin_increase.toLocaleString()} votes
                </span>
              </div>
            ))}
          </div>
          {data.margin_increases.length > 20 && (
            <div className="show-more-container">
              <button
                className="show-more-btn"
                onClick={() => setShowAllMarginIncreases(!showAllMarginIncreases)}
              >
                {showAllMarginIncreases ? (
                  <>
                    <ChevronUp size={16} />
                    Show Less
                  </>
                ) : (
                  <>
                    <ChevronDown size={16} />
                    Show All {data.total_margin_increases} Constituencies
                  </>
                )}
              </button>
            </div>
          )}
        </section>

        <section>
          <h2>Key Insights</h2>
          <ul>
            <li>
              <strong>{data.total_flips} constituencies</strong> would flip from DMK, INC, and other
              parties to the NDA alliance (ADMK + BJP + PMK + AMMK).
            </li>
            <li>
              The largest flip would be <strong>{data.flips[0]?.ac_name}</strong> with a margin of{' '}
              {data.flips[0]?.margin.toLocaleString()} votes.
            </li>
            <li>
              NDA&apos;s existing seats (ADMK: 66, BJP: 4, PMK: 5) would see margin increases
              totaling{' '}
              <strong>
                {data.margin_increases
                  .reduce((sum, m) => sum + m.margin_increase, 0)
                  .toLocaleString()}
              </strong>{' '}
              additional votes.
            </li>
            <li>
              This analysis assumes 100% vote transfer within the NDA alliance, which may vary in
              practice based on candidate selection and campaign dynamics.
            </li>
          </ul>
        </section>

        <footer className="article-footer">
          <p>
            <em>
              Data source: 2021 Tamil Nadu Assembly Election Results (100% coverage). Analysis based
              on combining all NDA alliance party vote shares (ADMK, BJP, PMK, AMMK).
            </em>
          </p>
        </footer>
      </div>
    </article>
  );
}

interface FlipItemWithBoothsProps {
  flip: FlipData;
  idx: number;
  onACClick: (acId: string, acName: string) => void;
}

function FlipItemWithBooths({ flip, idx, onACClick }: FlipItemWithBoothsProps): JSX.Element {
  const [showBooths, setShowBooths] = useState(false);
  const [boothData, setBoothData] = useState<BoothResults | null>(null);
  const [loadingBooths, setLoadingBooths] = useState(false);
  const [boothError, setBoothError] = useState<string | null>(null);

  const loadBoothData = useCallback(async () => {
    if (boothData || loadingBooths) return;

    setLoadingBooths(true);
    setBoothError(null);
    try {
      const response = await fetch(`/data/booths/TN/${flip.ac_id}/2021.json`);
      if (response.ok) {
        const data: BoothResults = await response.json();
        setBoothData(data);
      } else {
        setBoothError('Booth data not available');
      }
    } catch (err) {
      setBoothError('Failed to load booth data');
      console.error('Failed to load booth data:', err);
    } finally {
      setLoadingBooths(false);
    }
  }, [flip.ac_id, boothData, loadingBooths]);

  const handleToggleBooths = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation(); // Prevent triggering onACClick
      setShowBooths((prev) => {
        const newValue = !prev;
        if (newValue && !boothData) {
          void loadBoothData();
        }
        return newValue;
      });
    },
    [boothData, loadBoothData]
  );

  // Find NDA party candidate indices
  const ndaPartyIndices = {
    ADMK: boothData?.candidates.findIndex((c) => c.party === 'ADMK'),
    BJP: boothData?.candidates.findIndex((c) => c.party === 'BJP'),
    PMK: boothData?.candidates.findIndex((c) => c.party === 'PMK'),
    AMMK: boothData?.candidates.findIndex((c) => c.party === 'AMMK'),
  };

  // Calculate booth-level totals
  const boothTotals = boothData
    ? Object.entries(boothData.results).map(([boothId, result]) => {
        const admkVotes =
          ndaPartyIndices.ADMK !== undefined && ndaPartyIndices.ADMK >= 0
            ? result.votes[ndaPartyIndices.ADMK] || 0
            : 0;
        const bjpVotes =
          ndaPartyIndices.BJP !== undefined && ndaPartyIndices.BJP >= 0
            ? result.votes[ndaPartyIndices.BJP] || 0
            : 0;
        const pmkVotes =
          ndaPartyIndices.PMK !== undefined && ndaPartyIndices.PMK >= 0
            ? result.votes[ndaPartyIndices.PMK] || 0
            : 0;
        const ammkVotes =
          ndaPartyIndices.AMMK !== undefined && ndaPartyIndices.AMMK >= 0
            ? result.votes[ndaPartyIndices.AMMK] || 0
            : 0;
        const combined = admkVotes + bjpVotes + pmkVotes + ammkVotes;
        return {
          boothId,
          admkVotes,
          bjpVotes,
          pmkVotes,
          ammkVotes,
          combined,
          total: result.total,
        };
      })
    : [];

  // Sort by combined votes (descending)
  boothTotals.sort((a, b) => b.combined - a.combined);

  return (
    <div className="flip-item">
      <div className="flip-item-main" onClick={() => onACClick(flip.ac_id, flip.ac_name)}>
        <div className="flip-header">
          <span className="flip-rank">#{idx + 1}</span>
          <h3 className="flip-ac-name">{flip.ac_name}</h3>
          <span className="flip-ac-id">{flip.ac_id}</span>
        </div>
        <div className="flip-details">
          <div className="flip-current">
            <span className="label">Current Winner:</span>
            <span className="value winner">{flip.current_winner}</span>
            <span className="votes">({flip.current_winner_votes.toLocaleString()} votes)</span>
          </div>
          <div className="flip-new">
            <span className="label">NDA Combined:</span>
            <span className="value combined">{flip.combined_votes.toLocaleString()} votes</span>
            <span className="margin">(Margin: +{flip.margin.toLocaleString()})</span>
          </div>
          <div className="flip-breakdown">
            <span>ADMK: {flip.admk_votes.toLocaleString()}</span>
            {flip.bjp_votes > 0 && <span>+ BJP: {flip.bjp_votes.toLocaleString()}</span>}
            {flip.pmk_votes > 0 && <span>+ PMK: {flip.pmk_votes.toLocaleString()}</span>}
            {flip.ammk_votes > 0 && <span>+ AMMK: {flip.ammk_votes.toLocaleString()}</span>}
            <span>= {flip.combined_votes.toLocaleString()}</span>
          </div>
        </div>
        <div className="flip-actions">
          <div className="flip-click-hint">Click to view constituency details →</div>
          <button
            className="flip-toggle-booths"
            onClick={handleToggleBooths}
            aria-label={showBooths ? 'Hide booths' : 'Show booths'}
          >
            {showBooths ? (
              <>
                <ChevronUp size={16} />
                Hide Booths
              </>
            ) : (
              <>
                <ChevronDown size={16} />
                Show Booths
              </>
            )}
          </button>
        </div>
      </div>

      {showBooths && (
        <div className="flip-booths-section" onClick={(e) => e.stopPropagation()}>
          {loadingBooths && <div className="booth-loading">Loading booth data...</div>}
          {boothError && <div className="booth-error">{boothError}</div>}
          {boothData && boothTotals.length > 0 && (
            <div className="booth-list">
              <div className="booth-list-header">
                <h4>Booth-wise NDA Alliance Votes</h4>
                <span className="booth-count">{boothTotals.length} booths</span>
              </div>
              <div className="booth-table">
                <div className="booth-table-header">
                  <div className="booth-col-id">Booth ID</div>
                  <div className="booth-col-admk">ADMK</div>
                  <div className="booth-col-bjp">BJP</div>
                  <div className="booth-col-pmk">PMK</div>
                  <div className="booth-col-ammk">AMMK</div>
                  <div className="booth-col-combined">Combined</div>
                  <div className="booth-col-total">Total Votes</div>
                </div>
                <div className="booth-table-body">
                  {boothTotals.map((booth) => (
                    <div key={booth.boothId} className="booth-row">
                      <div className="booth-col-id">{booth.boothId}</div>
                      <div className="booth-col-admk">{booth.admkVotes.toLocaleString()}</div>
                      <div className="booth-col-bjp">{booth.bjpVotes.toLocaleString()}</div>
                      <div className="booth-col-pmk">{booth.pmkVotes.toLocaleString()}</div>
                      <div className="booth-col-ammk">{booth.ammkVotes.toLocaleString()}</div>
                      <div className="booth-col-combined">
                        <strong>{booth.combined.toLocaleString()}</strong>
                      </div>
                      <div className="booth-col-total">{booth.total.toLocaleString()}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
