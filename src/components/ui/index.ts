/**
 * Phase 18.5 (S8/P18-047) — the shared UI primitives.
 *
 * One import surface for the pieces every screen composes from. Each
 * primitive carries its stable `ui.*` test IDs and renders through the theme
 * tokens only; see `src/theme/designTokens.ts` for the scales and
 * `src/theme/styleScaleScan.ts` for the audit that keeps new screens on them.
 */
export { Banner } from './Banner';
export { Button } from './Button';
export { EmptyState } from './EmptyState';
export { Eyebrow } from './Eyebrow';
export { IconButton } from './IconButton';
export { LoadingBlock } from './LoadingBlock';
export { ProgressBar } from './ProgressBar';
export { SectionCard } from './SectionCard';
export { Sheet } from './Sheet';
// GuidedText predates the barrel (P18-027) and keeps its own module so its
// existing importers and tests stay untouched; it is part of the same set.
// It is deliberately NOT re-exported here: the barrel must stay free of the
// persistence-linked import chain the theme provider pulls in.
