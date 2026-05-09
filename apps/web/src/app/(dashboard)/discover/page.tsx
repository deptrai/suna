import type { Metadata } from 'next';
import { getEnv } from '@/lib/env-config';
import type { DiscoverFeedItem } from '@epsilon/shared/utils';
import { DiscoverFeedClient } from './discover-feed-client';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Discover Feed - Chainlens',
};

async function fetchDiscoverItems(): Promise<DiscoverFeedItem[]> {
  const baseUrl = getEnv().BACKEND_URL;
  if (!baseUrl) return [];
  try {
    const res = await fetch(`${baseUrl}/discover`, { cache: 'no-store' });
    if (!res.ok) return [];
    const body = (await res.json()) as { items?: DiscoverFeedItem[] };
    return body.items ?? [];
  } catch {
    return [];
  }
}

export default async function DiscoverPage() {
  const initialItems = await fetchDiscoverItems();

  return (
    <div className="container max-w-4xl py-8 space-y-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Discover</h1>
        <p className="text-muted-foreground">
          AI-generated news and alpha insights synthesized from multiple sources.
        </p>
      </div>

      <DiscoverFeedClient initialItems={initialItems} />
    </div>
  );
}
