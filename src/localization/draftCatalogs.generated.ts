/**
 * Draft-catalog resolution target (review remediation round 3, findings
 * #1/#4/#5).
 *
 * This file is a committed thin re-export from the PRODUCTION graph (empty
 * map, zero draft imports). Metro's `resolveRequest` redirects it to the
 * internal-preview graph when `EXPO_PUBLIC_RM_LOCALE_PROFILE=internal-preview` (see
 * metro.config.js). Tests resolve here (production graph) unless they
 * explicitly import the preview file.
 *
 * Both entrypoints are committed and immutable — no build step writes source
 * files (round 2 finding #4: config evaluation must not modify the tree).
 */
export { DRAFT_LOADERS } from './draftCatalogs.production';
export type { DraftLoaderEntry } from './draftCatalogs.production';
