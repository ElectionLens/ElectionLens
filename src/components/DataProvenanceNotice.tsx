import { ExternalLink, Info } from 'lucide-react';

/**
 * Trust/provenance notice for a civic-data product that is not an official government
 * publication. Keep this visible near navigation and repeat the correction path in the
 * footer so data issues have somewhere useful to go.
 */
export function DataProvenanceNotice(): JSX.Element {
  return (
    <aside className="data-disclaimer" role="note" aria-label="Data source disclaimer">
      <Info size={15} aria-hidden="true" />
      <p>
        This is <strong>not an official website</strong> of the Election Commission of India, Tamil
        Nadu Legislative Assembly, or any Government of Tamil Nadu entity.
      </p>
    </aside>
  );
}

export function DataProvenanceFooter(): JSX.Element {
  return (
    <footer className="data-provenance-footer">
      <a
        href="https://github.com/ElectionLens/ElectionLens/issues"
        target="_blank"
        rel="noreferrer"
      >
        Report a correction or contribute <ExternalLink size={12} aria-hidden="true" />
      </a>
    </footer>
  );
}
