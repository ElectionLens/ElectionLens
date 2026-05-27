import { AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import type { BoothDataQuality } from '../utils/boothDataQuality';
import {
  tierDescription,
  tierLabel,
  shouldShowBoothQualityBanner,
} from '../utils/boothDataQuality';

interface BoothDataQualityBannerProps {
  quality: BoothDataQuality;
  compact?: boolean;
}

export function BoothDataQualityBanner({
  quality,
  compact = false,
}: BoothDataQualityBannerProps): JSX.Element | null {
  if (!shouldShowBoothQualityBanner(quality)) return null;

  const Icon =
    quality.tier === 'incomplete'
      ? AlertTriangle
      : quality.tier === 'partial'
        ? Info
        : CheckCircle2;

  const tone =
    quality.tier === 'incomplete' ? 'warning' : quality.tier === 'partial' ? 'info' : 'ok';

  return (
    <div className={`booth-quality-banner booth-quality-${tone}`} data-compact={compact}>
      <Icon size={16} aria-hidden />
      <div className="booth-quality-body">
        <strong>{tierLabel(quality.tier)}.</strong>{' '}
        {compact ? (
          <>
            {quality.form20ParsedPct.toFixed(0)}% booths from Form20
            {quality.postalPct > 0 ? ` · ${quality.postalPct.toFixed(1)}% postal` : ''}
          </>
        ) : (
          tierDescription(quality)
        )}
      </div>
    </div>
  );
}

export function BoothSourceBadge({
  source,
}: {
  source: 'form20' | 'estimated' | 'missing';
}): JSX.Element | null {
  if (source === 'form20') return null;
  const label = source === 'estimated' ? 'Estimated' : 'No booth data';
  return (
    <span className={`booth-source-badge booth-source-${source}`} title={label}>
      {label}
    </span>
  );
}
