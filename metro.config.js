/**
 * Metro configuration (review remediation round 3, findings #1/#4/#5).
 *
 * Redirects `./draftCatalogs.generated` to the internal-preview graph when
 * `EXPO_PUBLIC_RM_LOCALE_PROFILE=internal-preview` (set by the EAS preview build
 * profiles). Both resolution targets are committed immutable files — no
 * source file is ever written during config evaluation or bundling.
 *
 * Production builds (the default) resolve to the production graph, whose
 * empty loader map excludes the es-419/pt-BR/ja catalog chunks from the Metro
 * module graph entirely.
 */

const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

const originalResolveRequest = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  // Redirect the draft-catalog resolution target to the internal-preview
  // graph when the build profile selects it.
  if (
    moduleName === './draftCatalogs.generated'
    && process.env.EXPO_PUBLIC_RM_LOCALE_PROFILE === 'internal-preview'
  ) {
    return context.resolveRequest(
      context,
      './draftCatalogs.preview',
      platform,
    );
  }
  if (originalResolveRequest) {
    return originalResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
