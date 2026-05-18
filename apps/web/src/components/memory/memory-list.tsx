'use client';

import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { Trash2 } from 'lucide-react';
import { authenticatedFetch } from '@/lib/auth-token';
import { Button } from '@/components/ui/button';

interface MemoryItem {
  id: string;
  category: string;
  content: string;
  updatedAt: string;
}

const categoryTitle: Record<string, string> = {
  preference: 'Preferences',
  trading_style: 'Trading Style',
  risk_profile: 'Risk Profile',
  fact: 'Facts',
  tool_usage: 'Tool Usage',
};

async function fetchMemories(): Promise<MemoryItem[]> {
  const res = await authenticatedFetch('/v1/router/memory');
  if (!res.ok) throw new Error('Failed to load memories');
  const data = await res.json() as { items: MemoryItem[] };
  return data.items ?? [];
}

export function MemoryList() {
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ['memory-items'], queryFn: fetchMemories });

  const delOne = useMutation({
    mutationFn: async (id: string) => {
      const res = await authenticatedFetch(`/v1/router/memory/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Delete failed');
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['memory-items'] }),
  });

  const clearAll = useMutation({
    mutationFn: async () => {
      const res = await authenticatedFetch('/v1/router/memory', { method: 'DELETE' });
      if (!res.ok) throw new Error('Clear all failed');
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['memory-items'] }),
  });

  const grouped = useMemo(() => {
    const map = new Map<string, MemoryItem[]>();
    for (const item of query.data ?? []) {
      if (!map.has(item.category)) map.set(item.category, []);
      map.get(item.category)!.push(item);
    }
    return [...map.entries()];
  }, [query.data]);

  if (query.isLoading) return <div className="text-sm text-muted-foreground">Loading memories...</div>;
  if ((query.data?.length ?? 0) === 0) {
    return <p className="text-sm text-muted-foreground">No memories yet. Chat more with the agent to build up memory.</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg sm:text-xl font-semibold">Memory</h1>
          <p className="text-sm text-muted-foreground mt-1">Persistent memory learned from your sessions.</p>
        </div>
        <Button
          variant="destructive"
          size="sm"
          onClick={() => {
            if (window.confirm(`This will delete all ${query.data?.length ?? 0} memories. Cannot be undone.`)) {
              clearAll.mutate();
            }
          }}
        >
          Clear All
        </Button>
      </div>

      {grouped.map(([category, items]) => (
        <div key={category} className="space-y-2">
          <h2 className="text-sm font-medium">{categoryTitle[category] ?? category}</h2>
          <div className="space-y-2">
            {items.map((item) => (
              <div key={item.id} className="rounded-md border p-3 flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm">{item.content}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Updated {formatDistanceToNow(new Date(item.updatedAt), { addSuffix: true })}
                  </p>
                </div>
                <Button size="icon" variant="ghost" onClick={() => delOne.mutate(item.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
