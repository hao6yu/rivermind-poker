import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Side-effect boundary (plan §6.7 / §8): the beginner tutorial is fully
 * offline and completely separate from real-game persistence and statistics.
 * No module under `src/domain/tutorial` or `src/features/tutorial` may import
 * a backend client, coach/OpenAI service, hand-history or statistics writer,
 * missions/streaks/daily-challenge/learning-progress writer, or any
 * multiplayer service. Pure card/evaluator types and presentation components
 * are the only shared imports allowed.
 */

const ROOTS = ['src/domain/tutorial', 'src/features/tutorial'];

const FORBIDDEN_IMPORT_PATTERNS: ReadonlyArray<{ pattern: RegExp; why: string }> = [
  { pattern: /supabase/i, why: 'Supabase client / Edge Function dependency' },
  { pattern: /services\/(coach|coachErrors|verifyCoach)/, why: 'AI-coach service' },
  { pattern: /openai/i, why: 'OpenAI dependency' },
  { pattern: /services\/handHistory/, why: 'hand-history writer' },
  { pattern: /services\/playStatistics/, why: 'play-statistics writer' },
  { pattern: /services\/(multiplayer|multiplayerEndpoint|multiplayerContract|multiplayerRecovery|multiplayerInvite|multiplayerRequest)/, why: 'multiplayer service' },
  { pattern: /services\/(learningProgress|learningHistory|learningProfile|learningReviewQueue|recommendedSession)/, why: 'learning-progress writer' },
  { pattern: /services\/(dailyChallengeProgress|championshipProgress|tournamentCheckpoint|opponentMemory|betaFeedback)/, why: 'progression/statistics writer' },
  { pattern: /services\/accountDeletion/, why: 'account-deletion flow (the tutorial only exposes a clear helper; the flow wires it)' },
  { pattern: /domain\/poker\/(engine|ai|aiProfiles|multiway|championship|decisionGrading|equity)/, why: 'real-game engine / AI / grading modules' },
  { pattern: /domain\/learning\//, why: 'learning-catalog domain (the tutorial is its own domain)' },
  { pattern: /features\/(table|multiplayer|learn|shell)\//, why: 'real-game feature modules' },
];

function collectFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      files.push(...collectFiles(full));
    } else if (/\.(ts|tsx)$/.test(entry)) {
      files.push(full);
    }
  }
  return files;
}

const IMPORT_RE = /(?:^|\n)\s*(?:import|export)[^'"]*from\s+'([^']+)'|(?:^|\n)\s*import\s*\(\s*'([^']+)'\s*\)/g;

describe('beginner tutorial side-effect boundary', () => {
  it('exists in its own domain and feature modules', () => {
    for (const root of ROOTS) {
      expect(() => statSync(root), root).not.toThrow();
    }
  });

  it('imports no backend, coach, multiplayer, statistics, or real-game modules', () => {
    const violations: string[] = [];
    for (const root of ROOTS) {
      for (const file of collectFiles(root)) {
        const source = readFileSync(file, 'utf8');
        for (const match of source.matchAll(IMPORT_RE)) {
          const specifier = match[1] ?? match[2] ?? '';
          if (!specifier.startsWith('.')) {
            // Absolute package imports: only react/react-native/expo icons/
            // their own localization+theme are expected; anything else is
            // flagged for review except test-only vitest imports in tests.
            if (/^(react|react-dom|react-test-renderer|react-native)$/.test(specifier)) continue;
            if (specifier === '@expo/vector-icons') continue;
            if (/^vitest$/.test(specifier) || specifier.startsWith('node:')) continue;
            violations.push(`${file}: unexpected package import "${specifier}"`);
            continue;
          }
          const resolved = specifier.replace(/^(\.\.\/)+/, '');
          for (const { pattern, why } of FORBIDDEN_IMPORT_PATTERNS) {
            if (pattern.test(specifier)) {
              violations.push(`${file}: imports ${specifier} — ${why}`);
            }
          }
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it('uses only local storage through its own service (no shared persistence imports)', () => {
    // The feature/domain may import exactly one persistence module: the
    // tutorial's own service. The screen imports it; nothing else persists.
    const storageImports = new Set<string>();
    for (const root of ROOTS) {
      for (const file of collectFiles(root)) {
        const source = readFileSync(file, 'utf8');
        for (const match of source.matchAll(IMPORT_RE)) {
          const specifier = match[1] ?? match[2] ?? '';
          if (specifier.includes('services/')) storageImports.add(`${file} -> ${specifier}`);
        }
      }
    }
    expect([...storageImports].sort()).toEqual([
      'src/features/tutorial/BeginnerTutorialScreen.tsx -> ../../services/beginnerTutorial',
    ]);
  });
});
