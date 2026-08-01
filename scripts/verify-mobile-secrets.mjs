import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, resolve } from 'node:path';

const mobileSourcePrefixes = ['src/', 'App.tsx', 'index.ts', 'app.json'];
const bundleExtensions = new Set(['.bundle', '.hbc', '.js', '.json', '.map']);
const rawSecretPatterns = [
  { label: 'OpenAI API key', pattern: /(?<![A-Za-z0-9_])sk-(?:proj-)?[A-Za-z0-9_-]{20,240}(?![A-Za-z0-9_-])/g },
  { label: 'Supabase secret key', pattern: /(?<![A-Za-z0-9_])sb_secret_[A-Za-z0-9_-]{20,240}(?![A-Za-z0-9_-])/g },
];
const serverOnlyNames = /\b(?:OPENAI_API_KEY|SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SECRET_KEY)\b/g;
const configuredSecrets = [
  process.env.OPENAI_API_KEY,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  process.env.SUPABASE_SECRET_KEY,
].filter((value) => typeof value === 'string' && value.length >= 16);

function trackedFiles() {
  return execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
    .split('\0')
    .filter(Boolean);
}

function filesBelow(path) {
  const absolute = resolve(path);
  const stat = statSync(absolute);
  if (stat.isFile()) return [absolute];
  return readdirSync(absolute, { withFileTypes: true }).flatMap((entry) => {
    const child = resolve(absolute, entry.name);
    return entry.isDirectory() ? filesBelow(child) : [child];
  });
}

function scanBuffer(path, buffer, includeServerOnlyNames) {
  const findings = [];
  const text = buffer.toString('latin1');
  if (configuredSecrets.some((secret) => buffer.includes(Buffer.from(secret)))) {
    findings.push(`${path}: contains configured server credential material`);
  }
  for (const { label, pattern } of rawSecretPatterns) {
    pattern.lastIndex = 0;
    if (pattern.test(text)) findings.push(`${path}: contains ${label} material`);
  }
  serverOnlyNames.lastIndex = 0;
  if (includeServerOnlyNames && serverOnlyNames.test(text)) {
    findings.push(`${path}: references a server-only environment variable`);
  }
  return findings;
}

const tracked = trackedFiles();
const findings = tracked
  .filter((path) => /(^|\/)\.env(?:\.|$)/.test(path) && !path.endsWith('.env.example'))
  .map((path) => `${path}: local environment files must not be tracked`);

for (const path of tracked) {
  const buffer = readFileSync(path);
  const mobileSource = mobileSourcePrefixes.some((prefix) => path === prefix || path.startsWith(prefix));
  findings.push(...scanBuffer(path, buffer, mobileSource));
}

for (const bundlePath of process.argv.slice(2)) {
  for (const path of filesBelow(bundlePath)) {
    if (!bundleExtensions.has(extname(path).toLowerCase())) continue;
    findings.push(...scanBuffer(path, readFileSync(path), true));
  }
}

if (findings.length > 0) {
  console.error('Mobile secret verification failed:');
  for (const finding of findings) console.error(`- ${finding}`);
  process.exitCode = 1;
} else {
  const bundleCount = process.argv.length - 2;
  console.log(`Mobile secret verification passed for tracked source${bundleCount > 0 ? ` and ${bundleCount} export${bundleCount === 1 ? '' : 's'}` : ''}.`);
}
