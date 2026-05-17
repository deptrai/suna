'use client';

import { Button } from '@/components/ui/button';
import { usePricingModalStore } from '@/stores/pricing-modal-store';
import { useSubscriptionStore } from '@/stores/subscription-store';
import { isTier1 } from '@/components/tier-gate.utils';

export function TierGateBanner({ feature }: { feature: string }) {
  const accountState = useSubscriptionStore((s) => s.accountState);
  const tierKey = accountState?.subscription?.tier_key;

  if (!isTier1(tierKey)) return null;

  return (
    <div className="rounded-xl border border-border/50 bg-muted/40 p-8 text-center space-y-4">
      <h2 className="text-xl font-semibold">{feature} requires Tier 2</h2>
      <p className="text-muted-foreground">Upgrade to unlock advanced research tools.</p>
      <Button
        onClick={() =>
          usePricingModalStore.getState().openPricingModal({
            isAlert: true,
            alertTitle: `${feature} requires Tier 2`,
          })
        }
      >
        Upgrade to Tier 2
      </Button>
    </div>
  );
}
