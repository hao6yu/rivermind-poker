import { configDefaults, defineConfig } from 'vitest/config';

// Config for the explicit real-HTTP multiplayer lifecycle harness
// (`pnpm test:multiplayer-integration`). It is separate from the default
// vitest.config.mts precisely so the harness can be excluded there (fast unit
// runs stay Supabase-free) while this invocation still finds and FAILS on the
// integration file when its local-stack prerequisites are missing.
export default defineConfig({
  test: {
    include: ['src/services/__tests__/multiplayerLifecycleHttp.test.ts'],
    exclude: [...configDefaults.exclude, '**/.claude/**'],
  },
});
