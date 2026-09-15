import type { ReactNode } from 'react';
import type { ACElectionResult } from '../../types';

export interface BreadcrumbProps {
  currentState: string | null;
  currentPC: string | null;
  currentDistrict: string | null;
  displayState: string | null;
  selectedAssembly: string | null;
  electionResult: ACElectionResult | null;
  onReset: () => void;
  onGoBackToState: () => void;
}

/** Breadcrumb navigation trail: India › State › PC/District › AC. */
export function Breadcrumb({
  currentState,
  currentPC,
  currentDistrict,
  displayState,
  selectedAssembly,
  electionResult,
  onReset,
  onGoBackToState,
}: BreadcrumbProps): ReactNode[] {
  const crumbs: ReactNode[] = [
    <a key="india" onClick={onReset} role="button" tabIndex={0}>
      India
    </a>,
  ];

  if (currentState) {
    crumbs.push(<span key="sep1"> › </span>);
    if (currentPC ?? currentDistrict) {
      crumbs.push(
        <a key="state" onClick={onGoBackToState} role="button" tabIndex={0}>
          {displayState}
        </a>
      );
      crumbs.push(<span key="sep2"> › </span>);
      if (currentPC) {
        crumbs.push(<span key="pc">{currentPC}</span>);
        if (selectedAssembly) {
          const acCrumbLabel =
            electionResult?.constituencyNameOriginal ??
            electionResult?.name ??
            electionResult?.constituencyName ??
            selectedAssembly;
          crumbs.push(<span key="sep-pc-ac"> › </span>);
          crumbs.push(<span key="ac-under-pc">{acCrumbLabel}</span>);
        }
      } else if (currentDistrict) {
        crumbs.push(<span key="district">{currentDistrict}</span>);
        if (selectedAssembly) {
          const acCrumbLabel =
            electionResult?.constituencyNameOriginal ??
            electionResult?.name ??
            electionResult?.constituencyName ??
            selectedAssembly;
          crumbs.push(<span key="sep-dist-ac"> › </span>);
          crumbs.push(<span key="ac-under-district">{acCrumbLabel}</span>);
        } else {
          crumbs.push(<span key="sep3"> › Assemblies</span>);
        }
      }
    } else {
      crumbs.push(<span key="state">{displayState}</span>);
    }
  }

  return crumbs;
}
