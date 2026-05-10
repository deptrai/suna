'use client';

import { useState, useMemo } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { ArrowDownIcon, ArrowUpIcon, ArrowUpDown, LineChart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ProtocolMetrics } from '@epsilon/shared';
import { openTabAndNavigate } from '@/stores/tab-store';

// ─── Pure helpers (exported for unit tests) ────────────────────────────────

export function formatCurrency(val: number): string {
  if (!Number.isFinite(val)) return '—';
  if (val >= 1e9) return `$${(val / 1e9).toFixed(2)}B`;
  if (val >= 1e6) return `$${(val / 1e6).toFixed(2)}M`;
  return `$${val.toLocaleString()}`;
}

export function formatPercentSigned(val: number): string {
  if (!Number.isFinite(val)) return '—';
  const sign = val >= 0 ? '+' : '';
  return `${sign}${val.toFixed(2)}%`;
}

/**
 * Generic sort comparator. Treats null/undefined as always-last regardless of direction
 * so future schema additions don't silently misbehave.
 */
export function compareValues(
  a: unknown,
  b: unknown,
  desc: boolean,
): number {
  const aMissing = a === null || a === undefined;
  const bMissing = b === null || b === undefined;
  if (aMissing && bMissing) return 0;
  if (aMissing) return 1;
  if (bMissing) return -1;
  if (Array.isArray(a) || Array.isArray(b)) return 0;
  if (typeof a === 'string' && typeof b === 'string') {
    return desc ? b.localeCompare(a) : a.localeCompare(b);
  }
  if (typeof a === 'number' && typeof b === 'number') {
    if (a < b) return desc ? 1 : -1;
    if (a > b) return desc ? -1 : 1;
    return 0;
  }
  return 0;
}

// ─── Sparkline ─────────────────────────────────────────────────────────────

function Sparkline({
  data,
  title,
  positive,
}: {
  data: number[];
  title: string;
  positive: boolean;
}) {
  const cleaned = (data ?? []).filter((d) => Number.isFinite(d));
  if (cleaned.length === 0) return null;
  const min = Math.min(...cleaned);
  const max = Math.max(...cleaned);
  const range = max - min || 1;
  const height = 24;
  const width = 60;

  const points = cleaned
    .map((d, i) => {
      const x = cleaned.length > 1 ? (i / (cleaned.length - 1)) * width : width / 2;
      const y = height - ((d - min) / range) * height;
      return `${x},${y}`;
    })
    .join(' ');

  // Use positive prop (driven by change24h) for color so sparkline + percentage stay consistent.
  const color = positive ? 'var(--emerald-500, #10b981)' : 'var(--rose-500, #f43f5e)';

  return (
    <svg width={width} height={height} className="overflow-visible" aria-label={title} role="img">
      <title>{title}</title>
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ─── Table ─────────────────────────────────────────────────────────────────

export function ProtocolsTable({ data }: { data: ProtocolMetrics[] }) {
  const [sortKey, setSortKey] = useState<keyof ProtocolMetrics>('tvl');
  const [sortDesc, setSortDesc] = useState(true);

  const sortedData = useMemo(() => {
    return [...data].sort((a, b) => compareValues(a[sortKey], b[sortKey], sortDesc));
  }, [data, sortKey, sortDesc]);

  const handleSort = (key: keyof ProtocolMetrics) => {
    if (sortKey === key) {
      setSortDesc(!sortDesc);
    } else {
      setSortKey(key);
      setSortDesc(true);
    }
  };

  return (
    <div className="rounded-md border border-border/50 bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>
              <Button variant="ghost" onClick={() => handleSort('name')} className="-ml-4 h-8 data-[state=open]:bg-accent">
                Protocol
                <ArrowUpDown className="ml-2 h-4 w-4" />
              </Button>
            </TableHead>
            <TableHead>
              <Button variant="ghost" onClick={() => handleSort('chain')} className="-ml-4 h-8 data-[state=open]:bg-accent">
                Chain
                <ArrowUpDown className="ml-2 h-4 w-4" />
              </Button>
            </TableHead>
            <TableHead className="text-right">
              <Button variant="ghost" onClick={() => handleSort('tvl')} className="h-8 justify-end w-full data-[state=open]:bg-accent">
                TVL
                <ArrowUpDown className="ml-2 h-4 w-4" />
              </Button>
            </TableHead>
            <TableHead className="text-right">
              <Button variant="ghost" onClick={() => handleSort('apy7d')} className="h-8 justify-end w-full data-[state=open]:bg-accent">
                APY 7d
                <ArrowUpDown className="ml-2 h-4 w-4" />
              </Button>
            </TableHead>
            <TableHead className="text-right">
              <Button variant="ghost" onClick={() => handleSort('apy30d')} className="h-8 justify-end w-full data-[state=open]:bg-accent">
                APY 30d
                <ArrowUpDown className="ml-2 h-4 w-4" />
              </Button>
            </TableHead>
            <TableHead className="text-right">
              <Button variant="ghost" onClick={() => handleSort('change24h')} className="h-8 justify-end w-full data-[state=open]:bg-accent">
                Change 24h
                <ArrowUpDown className="ml-2 h-4 w-4" />
              </Button>
            </TableHead>
            <TableHead className="text-right">7d Trend</TableHead>
            <TableHead className="w-10"><span className="sr-only">View chart</span></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedData.map((row) => {
            const positive = row.change24h >= 0;
            const change24hLabel = `${positive ? 'Up' : 'Down'} ${Math.abs(row.change24h).toFixed(2)} percent`;
            const chartSlug = row.symbol.toLowerCase().replace(/[^a-z0-9]/g, '');
            return (
              <TableRow key={row.id}>
                <TableCell className="font-medium">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{row.name}</span>
                    <span className="text-xs text-muted-foreground">{row.symbol}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="secondary" className="font-normal text-xs">{row.chain}</Badge>
                </TableCell>
                <TableCell className="text-right font-mono text-sm">{formatCurrency(row.tvl)}</TableCell>
                <TableCell className={`text-right font-mono text-sm ${row.apy7d >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                  {formatPercentSigned(row.apy7d)}
                </TableCell>
                <TableCell className={`text-right font-mono text-sm ${row.apy30d >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                  {formatPercentSigned(row.apy30d)}
                </TableCell>
                <TableCell className="text-right">
                  <div
                    className={`flex items-center justify-end gap-1 font-mono text-sm ${positive ? 'text-emerald-500' : 'text-rose-500'}`}
                    aria-label={change24hLabel}
                  >
                    {positive ? <ArrowUpIcon className="h-3 w-3" aria-hidden /> : <ArrowDownIcon className="h-3 w-3" aria-hidden />}
                    {Math.abs(row.change24h).toFixed(2)}%
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end">
                    <Sparkline
                      data={row.sparkline7d}
                      title={`${row.name} 7-day trend`}
                      positive={positive}
                    />
                  </div>
                </TableCell>
                <TableCell>
                  {chartSlug ? (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-violet-400"
                      title={`View ${row.symbol} chart`}
                      onClick={() => openTabAndNavigate(
                        { id: `page:/chart/${chartSlug}`, type: 'page', href: `/chart/${chartSlug}`, title: `${row.symbol} Chart` },
                      )}
                    >
                      <LineChart className="h-3.5 w-3.5" />
                    </Button>
                  ) : null}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
