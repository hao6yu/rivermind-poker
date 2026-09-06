import type { AppLanguage } from './registry';

/**
 * Locale build profile (review remediation #5).
 *
 * The EAS build profile selects the native locale set through
 * `EXPO_PUBLIC_RM_LOCALE_PROFILE` (see eas.json: production builds set
 * "production"; simulator/preview set "internal-preview"). Expo inlines
 * `EXPO_PUBLIC_*` variables into the bundle at build time, so a production
 * build physically carries the production profile while authorized internal
 * QA builds carry the internal-preview profile.
 *
 * Profile behavior:
 * - `production` — draft locales stay out of the picker and draft
 *   preferences sanitize to `system` (unchanged release boundary).
 * - `internal-preview` — catalog-complete draft locales appear in the picker
 *   and saved draft preferences resolve, so QA can exercise the draft
 *   catalogs on device. This is the only path that exposes them; release
 *   approval is still an owner gate.
 * - Development (`expo start`) resolves to production unless the env var is
 *   set; run EXPO_PUBLIC_RM_LOCALE_PROFILE=internal-preview expo start to
 *   exercise drafts locally. There is no separate `__DEV__` branch.
 *
 * Tests use {@link setLocaleProfileOverride} instead of mutating process.env.
 */

export type LocaleProfile = 'production' | 'internal-preview';

export const LOCALE_PROFILES: readonly LocaleProfile[] = ['production', 'internal-preview'];

let profileOverride: LocaleProfile | null = null;

/** Test/diagnostic seam: forces the profile until cleared with null. */
export function setLocaleProfileOverride(profile: LocaleProfile | null): void {
  profileOverride = profile;
}

function profileFromBuildEnv(): LocaleProfile | null {
  // Expo inlines EXPO_PUBLIC_* written in the literal `process.env.X` form at
  // bundle time: production builds fold this to "production" and internal-
  // preview builds to "internal-preview", which keeps the draft-catalog
  // modules out of the production module graph entirely (they weigh ~1.1 MB
  // of raw source). Keep the literal form — an optional-chained or aliased
  // read defeats the inlining.
  if (process.env.EXPO_PUBLIC_RM_LOCALE_PROFILE === 'internal-preview') return 'internal-preview';
  if (process.env.EXPO_PUBLIC_RM_LOCALE_PROFILE === 'production') return 'production';
  return null;
}

/**
 * The effective locale profile for this build (round 3 finding #1): derived
 * from `EXPO_PUBLIC_RM_LOCALE_PROFILE` — the SINGLE variable shared by
 * `app.config.js`, `metro.config.js`, and this runtime module. Expo inlines
 * `EXPO_PUBLIC_*` into the bundle, so the same literal is available in Node
 * (config/bundler) and in the app runtime. `RM_NATIVE_LOCALE_PROFILE` is NOT
 * read: setting it alone would produce a preview picker with a production
 * native/catalog graph (round 4 finding #1).
 */
export function resolveLocaleProfile(): LocaleProfile {
  if (profileOverride) return profileOverride;
  const fromBuild = profileFromBuildEnv();
  if (fromBuild) return fromBuild;
  return 'production';
}

/** Whether catalog-complete draft locales are visible in this build. */
export function internalPreviewLocalesEnabled(): boolean {
  return resolveLocaleProfile() === 'internal-preview';
}

/** Draft locales the authorized builds may pick (catalog-complete, unreleased). */
export function draftPreviewLocales(
  catalogCompleteLocales: readonly AppLanguage[],
  shippedLocales: readonly AppLanguage[],
): readonly AppLanguage[] {
  return catalogCompleteLocales.filter((locale) => !shippedLocales.includes(locale));
}
