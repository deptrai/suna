import type { DomainParser, ExtractedToken } from './types';

const SLUG_TO_TICKER: Record<string, string> = {
  bitcoin: 'BTC',
  ethereum: 'ETH',
  tether: 'USDT',
  ripple: 'XRP',
  solana: 'SOL',
  bnb: 'BNB',
  'usd-coin': 'USDC',
  dogecoin: 'DOGE',
  cardano: 'ADA',
  tron: 'TRX',
};

const TICKER_RE = /\b[A-Z0-9]{2,10}\b/;

function alreadyHighlighted(element: HTMLElement): boolean {
  return !!element.closest('.chainlens-token-highlight');
}

export function parseCmcSlug(pathname: string): string | null {
  const match = pathname.match(/^\/currencies\/([^/?#]+)/i);
  if (!match) return null;
  return decodeURIComponent(match[1] || '').trim().toLowerCase();
}

export function detectTicker(text: string): string | null {
  const hit = text.trim().toUpperCase().match(TICKER_RE);
  return hit?.[0] ?? null;
}

export function expectedTickerFromSlug(slug: string): string | null {
  const mapped = SLUG_TO_TICKER[slug];
  if (mapped) return mapped;
  // Conservative fallback: first token from slug (e.g. "pepe-coin" -> "PEPE").
  const first = slug.split('-')[0];
  if (!first || first.length < 2 || first.length > 10) return null;
  if (!/^[a-z0-9]+$/.test(first)) return null;
  return first.toUpperCase();
}

export const coinMarketCapParser: DomainParser = {
  hostnames: ['coinmarketcap.com'],

  extract(root: HTMLElement): ExtractedToken[] {
    const results: ExtractedToken[] = [];
    const slug = parseCmcSlug(window.location.pathname);
    if (!slug) return results;

    const expected = expectedTickerFromSlug(slug);
    if (!expected) return results;

    const sources: Array<{ selector: string; source: ExtractedToken['source'] }> = [
      { selector: 'main [aria-label*="token" i], main [role="heading"]', source: 'aria' },
      { selector: 'main [data-cy*="token" i], main [data-testid*="token" i]', source: 'data-attr' },
      { selector: 'main h1 span, main h1, [class*="nameSymbol" i], [class*="symbol" i]', source: 'selector' },
    ];

    const seen = new Set<HTMLElement>();
    for (const source of sources) {
      for (const node of root.querySelectorAll(source.selector)) {
        const element = node as HTMLElement;
        if (seen.has(element) || alreadyHighlighted(element)) continue;
        seen.add(element);

        const ticker = detectTicker(element.textContent ?? '');
        if (!ticker) continue;
        if (ticker !== expected) continue;

        if (source.source === 'selector') {
          console.warn('[chainlens] coinmarketcap parser falling back to fragile selector');
        }

        results.push({ element, token: ticker, source: source.source });
      }
    }

    return results;
  },

  observeTarget(): HTMLElement | null {
    return (
      (document.querySelector('main h1') as HTMLElement | null) ??
      (document.querySelector('main') as HTMLElement | null)
    );
  },
};
