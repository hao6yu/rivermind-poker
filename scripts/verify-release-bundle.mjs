#!/usr/bin/env node
/**
 * Gate: prove the friend-table capability inside a built release artifact.
 *
 * Source presence proves nothing about what a release build actually ships:
 * an environment gate, a wrong lane constant, or a tree-shaken surface can
 * silently drop friend tables from the bundle while the repository still
 * contains them (P18-004). This gate scans the compiled JavaScript/Hermes
 * bundle inside an APK or AAB for the shipped strings that only exist when
 * the private-table entry, review, recovery, and v4 lane are really compiled
 * in — and it fails if the retired preview gate is still present.
 *
 *   node scripts/verify-release-bundle.mjs artifacts/android/<build>.apk
 *   node scripts/verify-release-bundle.mjs artifacts/android/<build>.aab
 *
 * Hermes keeps string literals in the bytecode string table, so the markers
 * appear verbatim in the bundle bytes. Every marker is a stable message key
 * or lane constant, not prose, so copy changes cannot false-fail the gate.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { readArtifactSync } from './androidArtifactInspection.mjs';

/** The v4 worker lane the release must route capability-4 rooms to. */
const REQUIRED_MARKERS = [
  {
    marker: 'multiplayer-room-v4',
    why: 'the multiplayer-room-v4 worker lane constant',
  },
  {
    marker: 'multiplayer.session.reviewHands',
    why: 'the private Review hands entry',
  },
  {
    marker: 'multiplayer.game.returnNextHand',
    why: 'the sitting-out Return next hand recovery action',
  },
  {
    marker: 'multiplayer.create.coachNote',
    why: 'the friend-table create flow',
  },
  {
    marker: 'multiplayer.lobby.you',
    why: 'the private-table lobby',
  },
];

/**
 * The retired preview gate must be gone from compiled output: its presence
 * would mean the flag — and its silent friend-table kill switch — is still
 * compiled into the release.
 */
const FORBIDDEN_MARKERS = [
  {
    marker: 'EXPO_PUBLIC_MULTIPLAYER_PREVIEW',
    why: 'the retired friend-table preview gate',
  },
];

const BUNDLE_NAME_PATTERN = /(^|\/)(index\.[a-z]+\.bundle|bundle|main\.jsbundle|index\.android\.bundle)$/i;

/** Expo export directories keep the compiled JS under _expo/static/js/**. */
function collectDirectoryBundles(dir) {
  const bundles = [];
  const walk = (path) => {
    for (const name of readdirSync(path)) {
      const full = join(path, name);
      const stat = statSync(full);
      if (stat.isDirectory()) {
        walk(full);
        continue;
      }
      if ((name.endsWith('.js') || name.endsWith('.hbc')) && stat.size > 100_000) {
        bundles.push({ name: full, bytes: readFileSync(full) });
      }
    }
  };
  walk(dir);
  if (bundles.length === 0) {
    throw new Error(`No compiled JavaScript bundle larger than 100 KB found under ${dir}.`);
  }
  return bundles;
}

function collectArtifactBundles(buffer) {
  const zip = readArtifactSync(buffer);
  const candidates = zip.entries.filter((entry) => (
    BUNDLE_NAME_PATTERN.test(entry.name)
    || entry.name.endsWith('.hbc')
    || (entry.name.endsWith('.js') && entry.uncompressedSize > 100_000)
  ));
  if (candidates.length === 0) {
    throw new Error(
      'No compiled JavaScript bundle found in this artifact '
      + '(looked for *.bundle, *.hbc, and large *.js entries).',
    );
  }
  return candidates.map((entry) => ({
    name: entry.name,
    bytes: zip.readEntry(entry),
  }));
}

function report(bundles, files) {
  let passed = true;
  for (const bundle of bundles) {
    const text = bundle.bytes.toString('latin1');
    console.log(`\n[release-bundle] ${files} → ${bundle.name} (${bundle.bytes.length} bytes)`);    for (const { marker, why } of REQUIRED_MARKERS) {
      const found = text.includes(marker);
      console.log(`  ${found ? 'PASS' : 'FAIL'}  ${marker}  (${why})`);
      if (!found) passed = false;
    }
    for (const { marker, why } of FORBIDDEN_MARKERS) {
      const absent = !text.includes(marker);
      console.log(`  ${absent ? 'PASS' : 'FAIL'}  absent: ${marker}  (${why} must not be compiled in)`);
      if (!absent) passed = false;
    }
  }
  return passed;
}

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error('Usage: node scripts/verify-release-bundle.mjs <artifact.apk|artifact.aab|export-dir> [...]');
  process.exit(2);
}

let allPassed = true;
for (const file of files) {
  try {
    const path = resolve(file);
    const bundles = statSync(path).isDirectory()
      ? collectDirectoryBundles(path)
      : collectArtifactBundles(readFileSync(path));
    if (!report(bundles, file)) allPassed = false;
  } catch (error) {
    console.error(`\n[release-bundle] ${file}: ${error.message}`);
    allPassed = false;
  }
}

console.log(allPassed
  ? '\nRelease bundle carries the complete friend-table surface and v4 lane.'
  : '\nRelease bundle is missing required friend-table markers — do not ship this build.');
process.exit(allPassed ? 0 : 1);
