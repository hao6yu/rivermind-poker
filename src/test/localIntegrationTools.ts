import { accessSync, constants } from 'node:fs';
import { delimiter, join } from 'node:path';

/** Resolve the same executable the setup action/shell put on PATH. */
export function resolveIntegrationTool(
  name: string,
  override: string | undefined,
  searchPath: string | undefined,
  fallbacks: readonly string[],
): string {
  const candidates = override ? [override] : [
    ...(searchPath ?? '').split(delimiter).filter(Boolean).map((dir) => join(dir, name)),
    ...fallbacks,
  ];
  for (const candidate of candidates) {
    try {
      accessSync(candidate, constants.X_OK);
      return candidate;
    } catch {
      // Continue only for discovery; an explicit override never falls back.
    }
  }
  throw new Error(`${name} executable unavailable${override ? ' at the configured override' : ' on PATH'}. Install it or set ${name.toUpperCase()}_BIN to an executable path.`);
}
