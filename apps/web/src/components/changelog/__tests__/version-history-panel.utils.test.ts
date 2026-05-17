import { describe, expect, test } from 'bun:test';
import {
  normalizeReleaseBody,
  normalizeReleaseTitle,
  parseVersionType,
} from '../version-history-panel.utils';

describe('version-history-panel utils', () => {
  describe('parseVersionType', () => {
    test('detects dev releases', () => {
      expect(parseVersionType('dev-abc123')).toBe('dev');
    });

    test('detects major and minor releases', () => {
      expect(parseVersionType('2.0.0')).toBe('major');
      expect(parseVersionType('2.3.0')).toBe('minor');
    });

    test('defaults to patch for full semver and short versions', () => {
      expect(parseVersionType('2.3.4')).toBe('patch');
      expect(parseVersionType('2.3')).toBe('patch');
    });
  });

  describe('normalizeReleaseTitle', () => {
    test('strips version prefixes and separators from stable titles', () => {
      expect(normalizeReleaseTitle('v2.3.4 — Better charts', '2.3.4')).toBe('Better charts');
      expect(normalizeReleaseTitle('2.3.4: Better charts', '2.3.4')).toBe('Better charts');
    });

    test('keeps dev titles unchanged', () => {
      expect(normalizeReleaseTitle('dev-abc123 — Alpha', 'dev-abc123')).toBe('dev-abc123 — Alpha');
    });

    test('returns original title when stripping would empty it', () => {
      expect(normalizeReleaseTitle('v2.3.4', '2.3.4')).toBe('v2.3.4');
    });
  });

  describe('normalizeReleaseBody', () => {
    test('drops leading heading when it matches the normalized title', () => {
      const body = [
        '# v2.3.4 — Better charts',
        '',
        '## Improvements',
        '- Faster chart rendering',
      ].join('\n');

      expect(normalizeReleaseBody(body, '2.3.4', 'v2.3.4 — Better charts')).toBe([
        '',
        '## Improvements',
        '- Faster chart rendering',
      ].join('\n').trim());
    });

    test('leaves unrelated body intact', () => {
      const body = '# Something else\n\nChange log';
      expect(normalizeReleaseBody(body, '2.3.4', 'Better charts')).toBe(body);
    });

    test('returns undefined for missing body', () => {
      expect(normalizeReleaseBody(undefined, '2.3.4', 'Better charts')).toBeUndefined();
    });
  });
});
