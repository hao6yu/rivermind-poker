/**
 * Production draft-catalog graph (review remediation round 3, finding #5).
 *
 * EMPTY map with zero draft imports — the es-419/pt-BR/ja catalog modules
 * never enter the Metro module graph for production builds. This file is
 * committed and immutable.
 */

export type DraftLoaderEntry = {
  load: () => Promise<Record<string, string>>;
};

export const DRAFT_LOADERS: Partial<
  Record<import('./registry').AppLanguage, DraftLoaderEntry>
> = {};
