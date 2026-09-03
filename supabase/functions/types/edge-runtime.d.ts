// Minimal ambient surface of the Supabase edge runtime for the repository-local
// Edge Function typecheck gate (`pnpm typecheck:functions`). The authoritative
// runtime types remain Deno's edge runtime (supplied at deploy time); these
// declarations cover exactly the API surface the functions use so the gate
// runs without a Deno binary. Extend it only when a function genuinely needs a
// new runtime API — do not widen it speculatively.

declare namespace Deno {
  namespace env {
    function get(key: string): string | undefined;
    function set(key: string, value: string): void;
    function has(key: string): boolean;
    function toObject(): Record<string, string>;
  }
}
