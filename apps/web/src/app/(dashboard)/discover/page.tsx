import type { Metadata } from 'next';
import { Badge } from '@/components/ui/badge';
import { formatDistanceToNow } from 'date-fns';
import { getEnv } from '@/lib/env-config';
import {
  isWithinLast24Hours,
  type DiscoverFeedItem,
} from '@epsilon/shared/utils';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Discover Feed - Chainlens',
};

function isSafeUrl(url: string | undefined): url is string {
  if (!url) return false;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}

async function fetchDiscoverItems(): Promise<DiscoverFeedItem[]> {
  const baseUrl = getEnv().BACKEND_URL;
  if (!baseUrl) return [];
  try {
    const res = await fetch(`${baseUrl}/v1/discover`, { cache: 'no-store' });
    if (!res.ok) return [];
    const body = (await res.json()) as { items?: DiscoverFeedItem[] };
    return body.items ?? [];
  } catch {
    return [];
  }
}

export default async function DiscoverPage() {
  const items = await fetchDiscoverItems();

  return (
    <div className="container max-w-4xl py-8 space-y-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Discover</h1>
        <p className="text-muted-foreground">
          AI-generated news and alpha insights synthesized from multiple sources.
        </p>
      </div>

      <div className="space-y-6">
        {items.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            No discover feeds available yet. Check back soon!
          </div>
        ) : (
          items.map((item) => {
            const ts = new Date(item.timestamp);
            const showEarlyWarning = item.isAnomaly && isWithinLast24Hours(ts);
            const validSources = (item.sources ?? []).filter((s) => s.name);

            return (
              <div key={item.id} className="border rounded-lg p-6 space-y-4 bg-card">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <h2 className="text-xl font-semibold">{item.title}</h2>
                    <div className="text-sm text-muted-foreground">
                      {formatDistanceToNow(ts, { addSuffix: true })}
                    </div>
                  </div>
                  {showEarlyWarning && (
                    <Badge variant="destructive" className="shrink-0">
                      Early Warning ({item.warningLevel})
                    </Badge>
                  )}
                </div>

                <p className="text-sm leading-relaxed">{item.summary}</p>

                {validSources.length > 0 && (
                  <div className="pt-4 border-t flex flex-wrap gap-2 items-center text-xs text-muted-foreground">
                    <span className="font-medium">Sources:</span>
                    {validSources.map((src, idx) => (
                      <span key={`${item.id}-${idx}`}>
                        {isSafeUrl(src.url) ? (
                          <a
                            href={src.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:underline text-primary"
                          >
                            {src.name}
                          </a>
                        ) : (
                          <span>{src.name}</span>
                        )}
                        {idx < validSources.length - 1 ? ', ' : ''}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
