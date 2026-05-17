export type VersionType = 'major' | 'minor' | 'patch' | 'dev';

export function parseVersionType(version: string): VersionType {
  if (version.startsWith('dev-')) return 'dev';
  const parts = version.split('.');
  if (parts.length < 3) return 'patch';
  if (parts[2] === '0' && parts[1] === '0') return 'major';
  if (parts[2] === '0') return 'minor';
  return 'patch';
}

export function normalizeReleaseTitle(title: string | undefined, version: string): string | undefined {
  if (!title) return title;
  if (version.startsWith('dev-')) return title;

  const escaped = version.replace(/\./g, '\\.');
  const patterns = [
    new RegExp(`^v${escaped}\\s*[—–:-]\\s*`, 'i'),
    new RegExp(`^${escaped}\\s*[—–:-]\\s*`, 'i'),
    new RegExp(`^v${escaped}\\s+`, 'i'),
    new RegExp(`^${escaped}\\s+`, 'i'),
  ];

  let normalized = title;
  for (const pattern of patterns) {
    normalized = normalized.replace(pattern, '');
  }

  return normalized.trim() || title;
}

export function normalizeReleaseBody(
  body: string | undefined,
  version: string,
  title?: string,
): string | undefined {
  if (!body) return body;

  const normalizedTitle = normalizeReleaseTitle(title, version)?.trim();
  if (!normalizedTitle) return body;

  const lines = body.split('\n');
  const firstLine = lines[0]?.trim() ?? '';
  const firstHeading = firstLine.replace(/^#{1,6}\s*/, '').trim();
  const candidates = new Set<string>([
    normalizedTitle,
    `v${version} — ${normalizedTitle}`,
    `v${version} - ${normalizedTitle}`,
    `${version} — ${normalizedTitle}`,
    `${version} - ${normalizedTitle}`,
  ]);

  if (candidates.has(firstHeading)) {
    return lines.slice(1).join('\n').trim();
  }

  return body;
}
