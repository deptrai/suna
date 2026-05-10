import { Skeleton } from '@/components/ui/skeleton';

export function HeaderSkeleton() {
  return (
    <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4 p-6 rounded-xl border border-white/10 bg-black/40 backdrop-blur-xl shadow-2xl">
      <Skeleton className="w-16 h-16 rounded-full" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-4 w-24" />
      </div>
      <div className="flex flex-col items-end space-y-2">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-4 w-20" />
      </div>
    </div>
  );
}

export function RiskSkeleton() {
  return (
    <div className="rounded-xl border border-white/10 bg-black/40 backdrop-blur-xl shadow-2xl p-6 space-y-4">
      <div className="flex justify-between items-center">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-6 w-16" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
      </div>
    </div>
  );
}

export function HoldersSkeleton() {
  return (
    <div className="rounded-xl border border-white/10 bg-black/40 backdrop-blur-xl shadow-2xl p-6 space-y-4">
      <Skeleton className="h-6 w-40" />
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    </div>
  );
}

export function ChartSkeleton() {
  return (
    <div className="rounded-xl border border-white/10 bg-black/40 backdrop-blur-xl shadow-2xl" style={{ height: '520px' }}>
      <Skeleton className="w-full h-full rounded-xl" />
    </div>
  );
}

export function TxsSkeleton() {
  return (
    <div className="rounded-xl border border-white/10 bg-black/40 backdrop-blur-xl shadow-2xl p-6 space-y-4">
      <Skeleton className="h-6 w-48" />
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    </div>
  );
}
