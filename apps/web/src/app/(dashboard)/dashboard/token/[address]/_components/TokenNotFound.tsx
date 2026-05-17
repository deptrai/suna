import Image from 'next/image';
import Link from 'next/link';

export interface SearchResult {
  id: string;
  name: string;
  symbol: string;
  image_url?: string;
  market_cap_rank?: number;
}

interface TokenNotFoundProps {
  rawQuery: string;
  suggestions: SearchResult[];
  /** Optional reason override (e.g. "Unsupported chain: foo"). Falls back to default phrasing. */
  message?: string;
}

export function TokenNotFound({ rawQuery, suggestions, message }: TokenNotFoundProps) {
  return (
    <div className="container max-w-4xl py-12 flex flex-col items-center justify-center min-h-[50vh] text-center space-y-8 animate-in fade-in zoom-in duration-500">
      <div className="space-y-4">
        <h1 className="text-3xl font-bold tracking-tight">Token Not Found</h1>
        <p className="text-muted-foreground text-lg max-w-xl mx-auto">
          {message ? (
            <>{message}</>
          ) : (
            <>We couldn&apos;t find an exact match for <span className="font-mono text-primary bg-primary/10 px-2 py-1 rounded">&quot;{rawQuery}&quot;</span>.</>
          )}
        </p>
      </div>

      {suggestions.length > 0 && (
        <div className="w-full max-w-2xl rounded-xl border border-white/10 bg-black/40 backdrop-blur-xl shadow-2xl p-6 text-left space-y-4">
          <h2 className="text-xl font-semibold">Did you mean one of these?</h2>
          <div className="grid gap-3">
            {suggestions.map((suggestion) => (
              <Link
                key={suggestion.id}
                href={`/dashboard/token/${suggestion.id}`}
                className="flex items-center justify-between p-4 rounded-lg border border-white/5 bg-white/5 hover:bg-white/10 transition-colors group"
              >
                <div className="flex items-center gap-4">
                  {suggestion.image_url ? (
                    <Image
                      src={suggestion.image_url}
                      alt={suggestion.name}
                      width={32}
                      height={32}
                      className="rounded-full"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">
                      <span className="text-xs font-bold text-white/50">{suggestion.symbol.charAt(0).toUpperCase()}</span>
                    </div>
                  )}
                  <div>
                    <div className="font-medium group-hover:text-primary transition-colors">{suggestion.name}</div>
                    <div className="text-sm text-muted-foreground uppercase">{suggestion.symbol}</div>
                  </div>
                </div>
                {suggestion.market_cap_rank && (
                  <div className="text-xs text-muted-foreground">
                    Rank #{suggestion.market_cap_rank}
                  </div>
                )}
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="pt-4">
        <Link
          href="/dashboard/markets"
          className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-8 text-sm font-medium text-primary-foreground ring-offset-background transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
        >
          Browse all tokens
        </Link>
      </div>
    </div>
  );
}
