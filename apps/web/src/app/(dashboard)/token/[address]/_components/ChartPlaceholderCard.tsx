import Link from 'next/link';

interface ChartPlaceholderCardProps {
  symbol: string | null;
}

export function ChartPlaceholderCard({ symbol }: ChartPlaceholderCardProps) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/40 backdrop-blur-xl shadow-2xl p-12 flex flex-col items-center justify-center text-center space-y-4">
      <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-2">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="32"
          height="32"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-primary"
        >
          <path d="M3 3v18h18" />
          <path d="m19 9-5 5-4-4-3 3" />
        </svg>
      </div>
      <h2 className="text-xl font-semibold">Chart coming soon</h2>
      <p className="text-muted-foreground max-w-md">
        Live OHLCV charts for arbitrary token addresses are planned for a future update.
      </p>
      
      <Link 
        href={symbol ? `/dashboard/chart/${symbol}` : "/dashboard/markets"}
        className="mt-4 inline-flex items-center text-sm font-medium text-primary hover:underline"
      >
        View existing chart for known tokens →
      </Link>
    </div>
  );
}
