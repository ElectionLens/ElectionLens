import type { JSX } from 'react';

import type { KpiValues } from '../../utils/resultSummary';
import { formatNumber } from '../../utils/formatNumber';

export interface KpiStripProps {
  kpis: KpiValues;
  /** Party labels for the booth-lead cells, e.g. "DMK-led". */
  winnerPartyLabel?: string | undefined;
  runnerPartyLabel?: string | undefined;
}

interface Cell {
  key: string;
  label: string;
  value: string | null;
  tone?: 'nota' | 'lead';
}

/** Unknown renders as an em-dash. Never invent a zero for missing data. */
function count(value: number | null): string | null {
  return value == null ? null : formatNumber(value);
}

function percent(value: number | null): string | null {
  return value == null ? null : `${value.toFixed(1)}%`;
}

/**
 * The seven headline numbers, wrapping to two rows (UI revamp S1/S2).
 *
 * Laid out with `auto-fit` rather than a fixed seven columns: at 360px seven
 * cells would be 51px each, which cannot hold "2,32,630". The grid decides how
 * many fit and wraps the rest, so the same markup works at every panel width.
 *
 * Cells with no data are dropped entirely rather than shown as "0" - the
 * distinction between "no NOTA votes" and "we never loaded NOTA" matters.
 */
export function KpiStrip({
  kpis,
  winnerPartyLabel,
  runnerPartyLabel,
}: KpiStripProps): JSX.Element | null {
  const cells: Cell[] = [
    { key: 'electors', label: 'Electors', value: count(kpis.electors) },
    { key: 'valid', label: 'Valid votes', value: count(kpis.validVotes) },
    { key: 'turnout', label: 'Turnout', value: percent(kpis.turnout) },
    { key: 'nota', label: 'NOTA', value: count(kpis.nota), tone: 'nota' },
    { key: 'rejected', label: 'Rejected', value: count(kpis.rejected) },
    {
      key: 'winner-led',
      label: winnerPartyLabel ? `${winnerPartyLabel}-led booths` : 'Winner-led booths',
      value: count(kpis.winnerLedBooths),
      tone: 'lead',
    },
    {
      key: 'runner-led',
      label: runnerPartyLabel ? `${runnerPartyLabel}-led booths` : 'Runner-led booths',
      value: count(kpis.runnerLedBooths),
      tone: 'lead',
    },
    { key: 'booths', label: 'Booths', value: count(kpis.totalBooths) },
  ];

  const present = cells.filter((cell) => cell.value != null);
  if (present.length === 0) return null;

  return (
    <dl className="kpi-strip" data-testid="kpi-strip">
      {present.map((cell) => (
        <div
          key={cell.key}
          className={['kpi-cell', cell.tone && `kpi-cell--${cell.tone}`].filter(Boolean).join(' ')}
        >
          <dt className="kpi-cell-label">{cell.label}</dt>
          <dd className="kpi-cell-value">{cell.value}</dd>
        </div>
      ))}
    </dl>
  );
}
