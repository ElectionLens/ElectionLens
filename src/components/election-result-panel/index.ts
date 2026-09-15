/**
 * Barrel export for the election-result-panel sub-components.
 * Keeps ElectionResultPanel.tsx's imports tidy after the v3 split of the
 * former 2300-line monolith into focused, independently testable pieces.
 */
export { CandidateRow } from './CandidateRow';
export { PostalBallotsView } from './PostalBallotsView';
export { BoothWiseView } from './BoothWiseView';
export { BoothwiseAnalysis } from './BoothwiseAnalysis';
export {
  computeBoothwiseAnalysis,
  type AnalysisInsight,
  type LinkedBooth,
  type BoothwiseAnalysisResult,
} from './boothwiseAnalysisEngine';
