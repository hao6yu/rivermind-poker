/**
 * Expo dynamic config (review remediation round 3, finding #1).
 *
 * Selects the locale profile and rewrites the expo-localization plugin
 * options with the profile's locale set BEFORE plugin resolution. This file
 * does NOT write any source files (round 2 finding #4) — the JS bundle graph
 * is handled separately by metro.config.js (resolveRequest redirect).
 *
 *   EXPO_PUBLIC_RM_LOCALE_PROFILE = production        (default)
 *                            | internal-preview
 *
 * Development note: `expo start` without the env var resolves to the
 * production profile for BOTH the native config and the runtime —
 * internalPreview.ts reads the same inlined EXPO_PUBLIC_RM_LOCALE_PROFILE and
 * defaults to production when it is unset (there is no separate __DEV__
 * path). Exercise drafts locally with
 * EXPO_PUBLIC_RM_LOCALE_PROFILE=internal-preview expo start.
 */

const manifest = require('./config/locale-manifest.json');

const SUPPORTED_PROFILES = ['production', 'internal-preview'];

module.exports = () => {
  const profile = process.env.EXPO_PUBLIC_RM_LOCALE_PROFILE ?? 'production';
  if (!SUPPORTED_PROFILES.includes(profile)) {
    throw new Error(
      `EXPO_PUBLIC_RM_LOCALE_PROFILE must be one of ${SUPPORTED_PROFILES.join(' | ')}; got "${profile}".`,
    );
  }
  const locales = manifest.nativeLocalesByProfile[profile];
  if (!locales?.length) throw new Error(`No locales for profile "${profile}".`);

  const base = require('./app.json').expo;
  const plugins = (base.plugins ?? []).map((plugin) => {
    if (Array.isArray(plugin) && plugin[0] === 'expo-localization') {
      const [name, options] = plugin;
      return [
        name,
        {
          ...options,
          supportedLocales: { ios: [...locales], android: [...locales] },
        },
      ];
    }
    return plugin;
  });

  return {
    ...base,
    plugins,
    extra: { ...(base.extra ?? {}), localeProfile: profile },
  };
};

module.exports.SUPPORTED_PROFILES = SUPPORTED_PROFILES;
