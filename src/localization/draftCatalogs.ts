import { DRAFT_LOADERS as DRAFT_LOADERS_GENERATED } from './draftCatalogs.generated';
import type { AppLanguage } from './registry';
import type { MessageKey } from './messages';

/**
 * Lazy draft-catalog loading (review remediation #11).
 *
 * The es-419/pt-BR/ja catalogs are large (~1.1 MB of raw TS combined) yet
 * unusable in production: their registry entries stay `releaseEnabled: false`,
 * the production picker hides them, and draft preferences sanitize to
 * `system`. Statically importing them pulled all three into every bundle.
 *
 * The draft modules are bound statically per build profile: Metro's resolver
 * redirects the committed immutable entrypoint `draftCatalogs.generated.ts`
 * to `draftCatalogs.production.ts` (an empty map, so the draft modules never
 * enter the production module graph) or to `draftCatalogs.preview.ts` (static
 * draft imports for authorized internal-preview builds). A production build
 * therefore has no loader for a draft locale at all.
 *
 * The synchronous translate contract is preserved: `LOCALES[language]` keeps a
 * (initially empty) message catalog and `translate()` falls back to English
 * per key until the draft catalog registers; the provider re-renders when the
 * load resolves.
 */

export interface DraftCatalogModule {
  messages: Record<MessageKey, string>;
}

/**
 * Registers a draft catalog synchronously. Used ONLY by the vitest setup
 * file (src/test/setupExpoMocks.ts), which is absent from production
 * bundles: production relies on the async path above.
 */
export function registerDraftCatalogSync(language: AppLanguage, messages: Record<MessageKey, string>): void {
  loadStates[language] = 'loaded';
  registerMessages(language, messages);
}

/** Late-bound to avoid a circular static import with registry.ts. */
let registerMessages: (language: AppLanguage, messages: Record<MessageKey, string>) => void = (language, messages) => {
  // registry.ts wires this through setDraftCatalogRegistrar at import; the
  // fallback writes through the registry's dynamic accessor if the setup file
  // somehow loads before it (vitest import order).
  void language;
  void messages;
};

type DraftLoader = () => Promise<DraftCatalogModule>;

/**
 * The per-profile loader map comes from the committed immutable module
 * `draftCatalogs.generated.ts`; Metro's `resolveRequest` redirect selects the
 * production or internal-preview graph from `EXPO_PUBLIC_RM_LOCALE_PROFILE`.
 * The production graph is empty, so the draft modules never enter the Metro
 * module graph (review remediation round 2, finding #5).
 */
const DRAFT_LOADERS: Partial<Record<AppLanguage, DraftLoader>> = Object.fromEntries(
  Object.entries(DRAFT_LOADERS_GENERATED).map(([language, loaderEntry]) => [
    language as AppLanguage,
    async () => {
      // The generated entry's load() resolves the messages AND (for the
      // internal-preview graph) registers the learning/scenario catalogs —
      // draftCatalogs.ts itself carries NO draft-module references so the
      // production module graph stays clean (round 2, finding #5).
      if (!loaderEntry) return { messages: {} as Record<MessageKey, string> };
      const messages = await loaderEntry.load();
      return { messages: messages as Record<MessageKey, string> };
    },
  ]),
);

const loadStates: Partial<Record<AppLanguage, 'loading' | 'loaded'>> = {};
const loadWaiters: Partial<Record<AppLanguage, Promise<void>>> = {};

export function isDraftCatalogLanguage(language: AppLanguage): boolean {
  return DRAFT_LOADERS[language] !== undefined;
}

export function isDraftCatalogLoaded(language: AppLanguage): boolean {
  return loadStates[language] === 'loaded';
}

/**
 * Loads and registers the draft catalog for one locale. Idempotent and
 * single-flight: concurrent callers share one load. Resolves without effect
 * for non-draft locales (released catalogs are statically imported).
 */
/** Wires the registry-facing registration callback (called once at import). */
export function setDraftCatalogRegistrar(
  register: (language: AppLanguage, messages: Record<MessageKey, string>) => void,
): void {
  registerMessages = register;
}

export function loadDraftLocaleCatalog(language: AppLanguage): Promise<void> {
  const loader = DRAFT_LOADERS[language];
  if (!loader) return Promise.resolve();
  const pending = loadWaiters[language];
  if (pending) return pending;
  loadStates[language] = 'loading';
  const promise = loader()
    .then((module) => {
      registerMessages(language, module.messages);
      loadStates[language] = 'loaded';
    })
    .catch((error) => {
      // A failed draft load leaves the English fallback in place; the next
      // picker interaction retries (finding #6 round 2: the rejected promise
      // must not stay cached in loadWaiters).
      loadStates[language] = undefined;
      throw error;
    })
    .finally(() => {
      delete loadWaiters[language];
    });
  loadWaiters[language] = promise;
  return promise;
}
