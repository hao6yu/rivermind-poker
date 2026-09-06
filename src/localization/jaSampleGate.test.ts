import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { translate } from './core';
import { japaneseLearningContent } from './ja';
import { japaneseMessages } from './ja';
import { japaneseScenarioTemplates } from './ja/scenarioContent';
import type { MessageKey } from './messages';
import { accountDeletionMessage } from './accountDeletionMessages';
import { aiCoachConsentCopy } from './aiCoachConsentMessages';
import '../test/draftCatalogFixture';

/**
 * Sample-gate drift gate (review remediation #3):
 * docs/LOCALIZATION_JA_SAMPLE_GATE.md must quote the authoritative runtime
 * catalogs verbatim — the native reviewer reviews real app copy, not
 * paraphrases. The doc's machine-checked map lists `key = value` lines whose
 * keys resolve against the live ja catalogs; this test fails on any drift so
 * the packet is regenerated alongside catalog changes.
 */

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const docPath = resolve(projectRoot, 'docs', 'LOCALIZATION_JA_SAMPLE_GATE.md');

function resolveSampleKey(key: string): string {
  if (key.startsWith('msg:')) {
    const messageKey = key.slice(4);
    if (messageKey === 'settings.deleteAccountTitle' || messageKey === 'settings.deleteAccountMessage') {
      return accountDeletionMessage('ja', messageKey as never);
    }
    return japaneseMessages[messageKey as MessageKey] ?? translate('ja', messageKey as MessageKey);
  }
  if (key.startsWith('lesson:')) {
    const match = /^lesson:([^.,]+)\.sections\.(\d+)\.(.+)$/.exec(key);
    if (!match) throw new Error(`Unparseable lesson sample key: ${key}`);
    const lessonId = match[1] ?? '';
    const index = match[2] ?? '0';
    const fieldPath = match[3] ?? '';
    const section = japaneseLearningContent.lessons[lessonId]?.sections[Number(index)];
    if (!section) throw new Error(`Missing lesson sample target: ${key}`);
    let value: unknown = section;
    for (const part of fieldPath.split('.')) {
      value = (value as Record<string, unknown>)[part];
    }
    if (typeof value !== 'string') throw new Error(`Lesson sample key does not resolve to a string: ${key}`);
    return value;
  }
  if (key.startsWith('scenario:')) {
    const withoutNamespace = key.slice('scenario:'.length);
    const firstDot = withoutNamespace.indexOf('.');
    const templateId = withoutNamespace.slice(0, firstDot);
    const path = withoutNamespace.slice(firstDot + 1);
    const template = japaneseScenarioTemplates[templateId];
    if (!template) throw new Error(`Missing scenario sample target: ${key}`);
    if (path === 'reasoning') {
      // Math templates carry { mathFallback } — the rendered fallback text is
      // the catalog string the packet quotes.
      const reasoning = template.reasoning;
      return typeof reasoning === 'string' ? reasoning : reasoning.mathFallback;
    }
    let value: unknown = template;
    for (const part of path.split('.')) {
      value = (value as Record<string, unknown>)[part];
    }
    if (typeof value !== 'string') throw new Error(`Scenario sample key does not resolve to a string: ${key}`);
    return value;
  }
  throw new Error(`Unknown sample key namespace: ${key}`);
}

describe('Japanese sample gate (review remediation #3)', () => {
  const doc = readFileSync(docPath, 'utf8');
  const mapBlock = /## Machine-checked sample map[\s\S]*?```\n([\s\S]*?)```/.exec(doc);
  const lines = (mapBlock?.[1] ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && line.includes(' = '));

  it('contains the machine-checked map with sample entries', () => {
    expect(lines.length).toBeGreaterThan(25);
  });

  it('quotes the exact runtime value for every mapped key', () => {
    const failures: string[] = [];
    for (const line of lines) {
      const separator = line.indexOf(' = ');
      const key = line.slice(0, separator);
      const documented = line.slice(separator + 3);
      let actual: string;
      try {
        actual = resolveSampleKey(key);
      } catch (error) {
        failures.push(`${key}: ${(error as Error).message}`);
        continue;
      }
      if (actual !== documented) {
        failures.push(`${key}: packet says "${documented}", catalog renders "${actual}"`);
      }
      // The reviewer-facing prose must also present each value OUTSIDE the
      // machine-checked map block (round 2, finding #12): remove the map and
      // search the remaining document text.
      const docWithoutMap = doc.replace(mapBlock?.[0] ?? '', '');
      if (!docWithoutMap.includes(actual)) {
        failures.push(`${key}: value "${actual.slice(0, 60)}" absent from prose outside the map block`);
      }
    }
    expect(failures).toEqual([]);
  });

  it('documents the consent copy from the live consent catalog', () => {
    const consent = aiCoachConsentCopy('ja');
    expect(doc).toContain(consent.title);
    expect(doc).toContain(consent.introduction);
    expect(doc).toContain(consent.sentItems[0]);
    expect(doc).toContain(consent.allow);
    expect(doc).toContain(consent.decline);
  });

  it('keeps the drafted-not-approved disposition', () => {
    expect(doc).toMatch(/Not approved/);
    expect(doc).toMatch(/No qualified native Japanese poker review has occurred/);
    expect(doc).toMatch(/releaseEnabled: false/);
  });
});
