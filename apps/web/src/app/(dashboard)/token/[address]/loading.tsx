import { HeaderSkeleton, RiskSkeleton, HoldersSkeleton, TxsSkeleton } from './_components/skeletons';

export default function TokenDetailLoading() {
  return (
    <div className="container max-w-6xl py-8 space-y-6 animate-in fade-in zoom-in duration-500 ease-out">
      <HeaderSkeleton />
      <div className="rounded-xl border border-white/10 bg-black/40 backdrop-blur-xl shadow-2xl p-12 flex flex-col items-center justify-center text-center space-y-4">
        <div className="w-16 h-16 rounded-full bg-primary/10 animate-pulse" />
        <div className="h-6 w-48 bg-white/10 animate-pulse rounded" />
      </div>
      <RiskSkeleton />
      <HoldersSkeleton />
      <TxsSkeleton />
    </div>
  );
}
