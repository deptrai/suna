import { Suspense } from 'react';
import type { Metadata } from 'next';
import { ALLOWED_EVM_CHAINS, detectChain, normalizeAddress, type TokenInfoSnapshot } from '@epsilon/shared';
import { getServerAuthHeader } from './_components/getServerAuthHeader';
import { HeaderSection } from './_components/HeaderSection';
import { ChartPlaceholderCard } from './_components/ChartPlaceholderCard';
import { RiskSection } from './_components/RiskSection';
import { HoldersSection } from './_components/HoldersSection';
import { TxsSection } from './_components/TxsSection';
import { TokenNotFound, type SearchResult } from './_components/TokenNotFound';
import { HeaderSkeleton, RiskSkeleton, HoldersSkeleton, TxsSkeleton } from './_components/skeletons';

const ALLOWED_CHAINS_SET = new Set<string>([...ALLOWED_EVM_CHAINS, 'solana']);
// AC5: search-suggestion gate — only invoke /router/token-search when raw param looks
// like a search term (length 1-30, alphanumeric/dash) to avoid burning credits on bot scrapes.
const SEARCH_TERM_RE = /^[A-Za-z0-9_-]{1,30}$/;

function getCanonicalBaseUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') ?? 'https://app.chainlens.com';
}

async function searchTokensServerSide(query: string): Promise<SearchResult[]> {
  if (!SEARCH_TERM_RE.test(query)) return [];
  try {
    const baseUrl = process.env.BACKEND_URL ?? process.env.NEXT_PUBLIC_BACKEND_URL;
    if (!baseUrl) return [];

    const authHeader = await getServerAuthHeader();

    const res = await fetch(`${baseUrl}/router/token-search?q=${encodeURIComponent(query)}`, {
      method: 'GET',
      headers: authHeader,
      signal: AbortSignal.timeout(1000),
      next: { revalidate: 3600 },
    });

    if (!res.ok) {
      console.warn(`[token-search] upstream ${res.status} for query="${query}"`);
      return [];
    }
    const body = await res.json() as { results?: SearchResult[] };
    return Array.isArray(body.results) ? body.results : [];
  } catch (err) {
    console.warn(`[token-search] failed for query="${query}":`, err instanceof Error ? err.message : err);
    return [];
  }
}

export async function generateMetadata({ params }: { params: Promise<{ address: string }> }): Promise<Metadata> {
  const { address: raw } = await params;
  const detected = detectChain(raw);

  if (detected === 'unknown') {
    return {
      title: 'Token not found — Chainlens',
      robots: { index: false },
    };
  }

  // EVM addresses are case-insensitive — normalize to lowercase for canonical to avoid
  // SEO duplicate content. Solana base58 is case-sensitive — preserve.
  const canonicalAddr = detected === 'evm' ? raw.toLowerCase() : raw;
  const baseHref = getCanonicalBaseUrl();
  const canonicalUrl = `${baseHref}/dashboard/token/${canonicalAddr}`;

  try {
    const baseUrl = process.env.BACKEND_URL ?? process.env.NEXT_PUBLIC_BACKEND_URL;
    if (baseUrl) {
      const authHeader = await getServerAuthHeader();

      const res = await fetch(`${baseUrl}/router/token-info`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeader,
        },
        body: JSON.stringify({ address: normalizeAddress(raw, detected === 'solana' ? 'solana' : 'ethereum') }),
        signal: AbortSignal.timeout(1000),
        next: { revalidate: 60 },
      });

      if (res.ok) {
        const text = await res.text();
        try {
          const info = JSON.parse(text) as { success: boolean } & Partial<TokenInfoSnapshot>;
          if (info.success && info.symbol && info.name) {
            return {
              title: `${info.symbol} ${info.name} — Chainlens`,
              description: `Live price, risk analysis, holders, and transactions for ${info.name}`,
              alternates: { canonical: canonicalUrl },
              openGraph: {
                title: `${info.symbol} ${info.name} — Chainlens`,
                description: `Live price, risk analysis, holders, and transactions for ${info.name}`,
                url: canonicalUrl,
              },
            };
          }
        } catch {
          // fall through to fallback
        }
      }
    }
  } catch {
    // fallback
  }

  return {
    title: `${raw.slice(0, 10)}… — Chainlens`,
    alternates: { canonical: canonicalUrl },
  };
}

export default async function TokenDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ address: string }>;
  searchParams: Promise<{ chain?: string }>;
}) {
  const { address: raw } = await params;
  const { chain: chainParam } = await searchParams;
  const detected = detectChain(raw);

  if (detected === 'unknown') {
    const suggestions = await searchTokensServerSide(raw);
    return <TokenNotFound rawQuery={raw} suggestions={suggestions} />;
  }

  // Validate chain query param against allowlist; fall back to detected default.
  const chainCandidate = chainParam ?? (detected === 'evm' ? 'ethereum' : 'solana');
  const chain = ALLOWED_CHAINS_SET.has(chainCandidate) ? chainCandidate : (detected === 'evm' ? 'ethereum' : 'solana');
  // Reject EVM<>Solana mismatch
  if ((chain === 'solana') !== (detected === 'solana')) {
    const suggestions = await searchTokensServerSide(raw);
    return <TokenNotFound rawQuery={raw} suggestions={suggestions} />;
  }
  const address = normalizeAddress(raw, chain);

  return (
    <div className="container max-w-6xl py-8 space-y-6 animate-in fade-in zoom-in duration-500 ease-out">
      <Suspense fallback={<HeaderSkeleton />}>
        <HeaderSection address={address} chain={chain} />
      </Suspense>

      <ChartPlaceholderCard symbol={null} />

      <Suspense fallback={<RiskSkeleton />}>
        <RiskSection address={address} chain={chain} />
      </Suspense>

      <Suspense fallback={<HoldersSkeleton />}>
        <HoldersSection address={address} chain={chain} />
      </Suspense>

      <Suspense fallback={<TxsSkeleton />}>
        <TxsSection address={address} chain={chain} />
      </Suspense>
    </div>
  );
}
