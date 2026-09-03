// Minimal ambient module for `@supabase/server` (resolved through each
// function's deno.json import map at runtime). Shaped exactly to the surface
// the five Edge Functions use so the repository-local typecheck gate covers
// their handler wiring; the real package remains authoritative at deploy time.

declare module '@supabase/server' {
  import type { SupabaseClient } from '@supabase/supabase-js';

  export interface WithSupabaseContext {
    supabaseAdmin: SupabaseClient;
    userClaims?: { id: string };
    jwtClaims?: { sub: string };
  }

  export function withSupabase(
    config: { auth: 'user' | 'secret' },
    handler: (request: Request, context: WithSupabaseContext) => Response | Promise<Response>,
  ): (request: Request) => Response | Promise<Response>;
}
