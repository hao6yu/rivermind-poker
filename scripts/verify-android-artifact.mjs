#!/usr/bin/env node
/**
 * Gate: assert the Play-facing properties of a signed Android artifact.
 *
 *   node scripts/verify-android-artifact.mjs artifacts/android/<build>.apk
 *   node scripts/verify-android-artifact.mjs artifacts/android/<build>.aab
 *
 * Google Play rejects new apps and updates that target below the current
 * minimum API level (Android 16 / API 36 since 2026-08-31), and requires 16 KB
 * memory-page compatibility for native code (since 2025-11-01). `app.json`
 * cannot prove either: only the binary can.
 *
 * Exit code 0 means every readable check passed. A check that could not be
 * read from this artifact type is reported as BLOCKED, not as a pass — an
 * AAB carries a protobuf manifest, so its target API must be proven from the
 * APK Play generates or from an SDK-equipped machine.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { inspectArtifact } from './androidArtifactInspection.mjs';

/** Google Play minimum target API for new apps and updates. */
const REQUIRED_TARGET_API = 36;
/** Android 15+ memory page size required for native code. */
const REQUIRED_PAGE_BYTES = 16384;

function parseArgs(argv) {
  const files = [];
  let requiredTargetApi = REQUIRED_TARGET_API;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--required-target-api') {
      const value = Number(argv[i + 1]);
      if (!Number.isInteger(value) || value < 1) throw new Error('--required-target-api needs an integer.');
      requiredTargetApi = value;
      i += 1;
    } else if (arg.startsWith('-')) {
      throw new Error(`Unknown option ${arg}.`);
    } else {
      files.push(arg);
    }
  }
  if (files.length === 0) throw new Error('Give at least one .apk or .aab path.');
  return { files, requiredTargetApi };
}

function report(result, requiredTargetApi) {
  console.log(`\n[android-artifact] ${result.fileName} (${result.kind}, ${result.libraryCount} native libraries)`);
  if (result.manifest) {
    const m = result.manifest;
    console.log(
      `  package ${m.package ?? '?'} version ${m.versionName ?? '?'} (code ${m.versionCode ?? '?'}) `
      + `minSdk ${m.minSdkVersion ?? '?'} targetSdk ${m.targetSdkVersion ?? '?'} compileSdk ${m.compileSdkVersion ?? '?'}`,
    );
  }
  for (const check of result.checks) {
    const state = check.passed === true ? 'PASS' : check.passed === false ? 'FAIL' : 'BLOCKED';
    console.log(`  ${state.padEnd(7)} ${check.name}: ${check.detail}`);
  }
  for (const library of result.underAligned.slice(0, 8)) {
    console.log(`          under-aligned: ${library.name} declares page ${library.pageBytes}`);
  }
  for (const finding of result.findings.slice(0, 5)) console.log(`          note: ${finding}`);
  if (result.blockedOn.length > 0) {
    console.log(`  blocked on: ${result.blockedOn.join(', ')}`);
  }
  if (!result.passed) {
    console.error(
      `  required: target API >= ${requiredTargetApi}, every 64-bit native library page-aligned to ${REQUIRED_PAGE_BYTES} bytes`,
    );
  }
  return result.passed;
}

const { files, requiredTargetApi } = parseArgs(process.argv.slice(2));
let allPassed = true;

for (const file of files) {
  const path = resolve(file);
  const buffer = readFileSync(path);
  try {
    const result = inspectArtifact(buffer, {
      fileName: file,
      expectedTargetApi: requiredTargetApi,
      requiredPageBytes: REQUIRED_PAGE_BYTES,
    });
    allPassed = report(result, requiredTargetApi) && allPassed;
  } catch (error) {
    console.error(`\n[android-artifact] ${file}: cannot be inspected — ${error.message}`);
    allPassed = false;
  }
}

if (!allPassed) {
  console.error('\nAndroid artifact gate failed. Fix the binary before submitting to Play.');
  process.exit(1);
}
console.log('\nAndroid artifact gate passed.');
