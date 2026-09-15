/**
 * Internal-preview draft-catalog graph (review remediation round 3, findings
 * #1 and #5).
 *
 * This file is committed and immutable. Metro's resolver redirects
 * `draftCatalogs.generated` to this file when
 * `EXPO_PUBLIC_RM_LOCALE_PROFILE=internal-preview`.
 *
 * The map is EMPTY as of 2026-09-15: es-419/pt-BR/ja were release-enabled by
 * owner decision (docs/PHASE_19_EXECUTION_RECORD.md) and their catalogs moved
 * into the static registry/learning/scenario graphs, so no draft locales
 * remain. The loader-map pattern stays for FUTURE draft locales: a new draft
 * adds its static-import loader here, its registry entry keeps
 * `releaseEnabled: false`, and only authorized internal-preview builds carry
 * the module.
 *
 * Production resolves to `draftCatalogs.production.ts` (empty map, zero draft
 * imports).
 */

import type { AppLanguage } from './registry';
import type { MessageKey } from './messages';

export type DraftLoaderEntry = {
  load: () => Promise<Record<MessageKey, string>>;
};

export const DRAFT_LOADERS: Partial<Record<AppLanguage, DraftLoaderEntry>> = {};
