import { chmodSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { resolveIntegrationTool } from './localIntegrationTools';

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })));
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'rivermind-tools-'));
  roots.push(root);
  const dir = join(root, 'setup action cache', 'bin');
  mkdirSync(dir, { recursive: true });
  const binary = join(dir, 'supabase');
  writeFileSync(binary, '#!/bin/sh\nexit 0\n');
  chmodSync(binary, 0o755);
  return { root, dir, binary };
}

describe('integration executable discovery', () => {
  it('finds the executable installed on PATH even outside fixed system directories', () => {
    const { root, dir, binary } = fixture();
    expect(resolveIntegrationTool('supabase', undefined, `${root}${delimiter}${dir}`, ['/nonexistent/supabase'])).toBe(binary);
  });
  it('honors explicit overrides and never silently replaces an invalid override', () => {
    const { dir, binary } = fixture();
    expect(resolveIntegrationTool('supabase', binary, '', [])).toBe(binary);
    expect(() => resolveIntegrationTool('supabase', '/missing/supabase', dir, [binary])).toThrow('configured override');
  });
  it('rejects non-executable files and gives an actionable prerequisite error', () => {
    const { dir, binary } = fixture();
    chmodSync(binary, 0o644);
    expect(() => resolveIntegrationTool('supabase', undefined, dir, [])).toThrow('SUPABASE_BIN');
  });
});
