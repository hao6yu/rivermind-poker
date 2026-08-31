import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    exclude: [
      ...configDefaults.exclude,
      '**/.claude/**',
      // The real-HTTP multiplayer lifecycle harness needs the local Supabase
      // stack and Docker; it is invoked explicitly via
      // `pnpm test:multiplayer-integration` and FAILS — never silently skips —
      // when its prerequisites are missing. It must not run in the fast
      // default unit suite.
      'src/services/__tests__/multiplayerLifecycleHttp.test.ts',
    ],
  },
});
