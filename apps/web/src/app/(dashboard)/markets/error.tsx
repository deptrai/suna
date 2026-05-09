'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { AlertCircle } from 'lucide-react';

export default function MarketsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[markets] page error', error);
  }, [error]);

  return (
    <div className="container max-w-2xl py-16 text-center space-y-4">
      <AlertCircle className="mx-auto h-10 w-10 text-rose-500" />
      <h2 className="text-xl font-semibold">Could not load market data</h2>
      <p className="text-muted-foreground text-sm">
        We couldn't reach the market service. Please try again in a moment.
      </p>
      <Button onClick={reset} variant="outline">
        Retry
      </Button>
    </div>
  );
}
