import type { DomainParser, ExtractedToken } from './types';

const ADDRESS_RE = /^(0x[a-fA-F0-9]{40}|[1-9A-HJ-NP-Za-km-z]{43,44})$/;
const TICKER_RE = /\b[A-Z0-9]{2,10}\b/;

function alreadyHighlighted(element: HTMLElement): boolean {
  return !!element.closest('.chainlens-token-highlight');
}

export function parseDexPath(pathname: string): { trusted: string | null; slug: string | null } {
  const match = pathname.match(/^\/(ethereum|solana|bsc|base|arbitrum|polygon|avalanche|optimism)\/([^/?#]+)/i);
  if (!match) return { trusted: null, slug: null };
  const value = decodeURIComponent(match[2] || '').trim();
  if (!value) return { trusted: null, slug: null };
  if (ADDRESS_RE.test(value)) return { trusted: value, slug: null };
  return { trusted: null, slug: value.toUpperCase() };
}

export function detectTicker(text: string): string | null {
  const trimmed = text.trim().toUpperCase();
  if (!trimmed) return null;
  const direct = trimmed.match(TICKER_RE);
  return direct?.[0] ?? null;
}

function pickCandidates(root: HTMLElement): Array<{ element: HTMLElement; source: ExtractedToken['source'] }> {
  const out: Array<{ element: HTMLElement; source: ExtractedToken['source'] }> = [];

  // URL-only path (most stable) still needs a visual anchor element.
  const heading = root.querySelector('main h1 span, main [role="heading"] span, main h1, main [role="heading"]') as HTMLElement | null;
  if (heading) out.push({ element: heading, source: 'selector' });

  for (const el of root.querySelectorAll('[aria-label*="token" i], main [role="heading"]')) {
    out.push({ element: el as HTMLElement, source: 'aria' });
  }

  for (const el of root.querySelectorAll('[data-cy*="token" i], [data-testid*="token" i]')) {
    out.push({ element: el as HTMLElement, source: 'data-attr' });
  }

  // Last-resort fragile selector fallback.
  for (const el of root.querySelectorAll('[class*="Token" i], [class*="token" i]')) {
    out.push({ element: el as HTMLElement, source: 'selector' });
  }

  return out;
}

export const dexScreenerParser: DomainParser = {
  hostnames: ['dexscreener.com'],

  extract(root: HTMLElement): ExtractedToken[] {
    const results: ExtractedToken[] = [];
    const { trusted, slug } = parseDexPath(window.location.pathname);

    if (!trusted && !slug) return results;

    const seen = new Set<HTMLElement>();
    const candidates = pickCandidates(root);
    for (const candidate of candidates) {
      const element = candidate.element;
      if (seen.has(element) || alreadyHighlighted(element)) continue;
      seen.add(element);

      const text = element.textContent?.trim() ?? '';
      if (!text) continue;

      if (trusted) {
        results.push({ element, token: trusted, source: 'url' });
        continue;
      }

      const ticker = detectTicker(text);
      if (!ticker || !slug) continue;
      if (ticker !== slug) continue;

      if (candidate.source === 'selector') {
        console.warn('[chainlens] dexscreener parser falling back to fragile selector');
      }

      results.push({ element, token: ticker, source: candidate.source });
    }

    return results;
  },

  observeTarget(): HTMLElement | null {
    return (
      (document.querySelector('main') as HTMLElement | null) ??
      (document.querySelector('[role="main"]') as HTMLElement | null)
    );
  },
};
