'use client';

import { useQuery } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { formatDistanceToNow } from 'date-fns';
import { getEnv } from '@/lib/env-config';
import { isWithinLast24Hours, type DiscoverFeedItem } from '@epsilon/shared/utils';

const POLL_INTERVAL_MS = 5 * 60 * 1000;

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
  const res = await fetch(`${baseUrl}/discover`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`feed fetch failed: ${res.status}`);
  const body = (await res.json()) as { items?: DiscoverFeedItem[] };
  return body.items ?? [];
}

export function DiscoverFeedClient({ initialItems = [] }: { initialItems?: DiscoverFeedItem[] }) {
  const { data: items = initialItems } = useQuery({
    queryKey: ['discover-feed'],
    queryFn: fetchDiscoverItems,
    initialData: initialItems.length > 0 ? initialItems : undefined,
    refetchInterval: POLL_INTERVAL_MS,
    refetchOnWindowFocus: true,
    staleTime: POLL_INTERVAL_MS / 2,
  });

  if (items.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        No discover feeds available yet. Check back soon!
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {items.map((item) => {
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
      })}
    </div>
  );
}
