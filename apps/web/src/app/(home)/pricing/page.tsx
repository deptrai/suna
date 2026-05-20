'use client';

import { useCallback } from 'react';
import { ArrowRight, Check, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useAuth } from '@/components/AuthProvider';
import { Reveal } from '@/components/home/reveal';
import { trackCtaSignup } from '@/lib/analytics/gtm';

const TIERS = [
  {
    name: 'Free',
    tier: 'tier1',
    price: '$0',
    period: '/month',
    tokens: '10M tokens',
    tokensSub: 'per month · resets monthly',
    description: 'Get started with AI crypto research at no cost.',
    cta: 'Get Started Free',
    highlighted: false,
    canTopup: false,
    features: [
      'Discover feed & market signals',
      'Token & contract risk snapshots',
      'AI Chat (free model pool)',
      '10,000,000 platform tokens/mo',
      'Auto-activated on sign up',
    ],
  },
  {
    name: 'Pro',
    tier: 'tier2',
    price: '$40',
    period: '/month',
    tokens: '200M tokens',
    tokensSub: 'per month · resets monthly',
    description: 'Full backtesting suite and premium AI models.',
    cta: 'Upgrade to Pro',
    highlighted: true,
    canTopup: true,
    features: [
      'Everything in Free',
      'Vibe-Trading sandbox backtests',
      'Multi-strategy comparison',
      'Premium AI model pool',
      '200,000,000 platform tokens/mo',
      'Token top-up available',
    ],
  },
  {
    name: 'Enterprise',
    tier: 'tier3',
    price: '$200',
    period: '/month',
    tokens: '1.5B tokens',
    tokensSub: 'per month · resets monthly',
    description: 'Private deployment and enterprise-grade controls.',
    cta: 'Upgrade to Enterprise',
    highlighted: false,
    canTopup: true,
    features: [
      'Everything in Pro',
      'Private / on-prem deployment',
      'Local LLM option',
      'Strict data governance',
      '1,500,000,000 platform tokens/mo',
      'Token top-up available',
      'Priority support',
    ],
  },
];

function TierCard({
  tier,
  onSelect,
}: {
  tier: (typeof TIERS)[number];
  onSelect: (t: (typeof TIERS)[number]) => void;
}) {
  return (
    <div
      className={cn(
        'relative flex flex-col rounded-2xl border p-6 gap-6',
        tier.highlighted
          ? 'border-foreground/40 bg-foreground/[0.04] shadow-lg'
          : 'border-border bg-card/40',
      )}
    >
      {tier.highlighted && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <span className="inline-flex items-center gap-1 rounded-full bg-foreground px-3 py-0.5 text-[11px] font-semibold text-background">
            <Zap className="size-3" />
            Most Popular
          </span>
        </div>
      )}

      <div>
        <p className="text-sm font-medium text-muted-foreground">{tier.name}</p>
        <div className="mt-1 flex items-baseline gap-0.5">
          <span className="text-4xl font-semibold tracking-tight text-foreground">{tier.price}</span>
          <span className="text-sm text-muted-foreground">{tier.period}</span>
        </div>
        <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{tier.description}</p>
      </div>

      <div className="rounded-xl border border-border bg-background/60 px-4 py-3">
        <p className="text-sm font-semibold text-foreground">{tier.tokens}</p>
        <p className="text-[12px] text-muted-foreground mt-0.5">{tier.tokensSub}</p>
        {tier.canTopup && (
          <p className="text-[12px] text-muted-foreground mt-0.5">+ top-up tokens available</p>
        )}
      </div>

      <ul className="flex flex-col gap-2.5">
        {tier.features.map((f) => (
          <li key={f} className="flex items-start gap-2 text-sm text-foreground">
            <Check className="mt-0.5 size-3.5 shrink-0 text-foreground/60" />
            {f}
          </li>
        ))}
      </ul>

      <Button
        variant={tier.highlighted ? 'default' : 'outline'}
        className="mt-auto w-full rounded-xl"
        onClick={() => onSelect(tier)}
      >
        {tier.cta}
        <ArrowRight className="ml-1.5 size-3.5" />
      </Button>
    </div>
  );
}

export default function PricingPage() {
  const { user } = useAuth();

  const handleSelect = useCallback(
    (tier: (typeof TIERS)[number]) => {
      trackCtaSignup();
      if (!user) {
        window.location.href = '/auth';
        return;
      }
      if (tier.tier === 'tier1') {
        window.location.href = '/dashboard';
      } else {
        window.location.href = `/dashboard/billing?upgrade=${tier.tier}`;
      }
    },
    [user],
  );

  return (
    <div className="min-h-dvh bg-background pt-28 pb-24 px-4">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <Reveal>
          <div className="text-center mb-12">
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-medium tracking-tight text-foreground">
              Simple, transparent pricing
            </h1>
            <p className="mt-3 text-base sm:text-lg text-muted-foreground max-w-xl mx-auto leading-relaxed">
              All plans include a monthly token grant. Tokens reset each cycle — unused tokens don&apos;t carry over.
            </p>
          </div>
        </Reveal>

        {/* Tier cards */}
        <Reveal delay={0.1}>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {TIERS.map((tier) => (
              <TierCard key={tier.tier} tier={tier} onSelect={handleSelect} />
            ))}
          </div>
        </Reveal>

        {/* Token model explainer */}
        <Reveal delay={0.2}>
          <div className="mt-14 rounded-2xl border border-border bg-card/40 p-6 sm:p-8">
            <h2 className="text-lg font-semibold text-foreground mb-4">How platform tokens work</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[
                { label: 'Free model', rate: '1× token per AI token used' },
                { label: 'Free model + thinking', rate: '1.5× token per AI token used' },
                { label: 'Premium model', rate: '4× token per AI token used' },
                { label: 'Premium model + thinking', rate: '6× token per AI token used' },
              ].map(({ label, rate }) => (
                <div key={label} className="flex flex-col gap-1">
                  <span className="text-sm font-medium text-foreground">{label}</span>
                  <span className="text-sm text-muted-foreground">{rate}</span>
                </div>
              ))}
            </div>
            <p className="mt-5 text-sm text-muted-foreground">
              Pro and Enterprise plans unlock premium AI models (Claude Opus, GPT-5.5, and more) and can purchase additional top-up tokens at any time. Top-up tokens never expire.
            </p>
          </div>
        </Reveal>
      </div>
    </div>
  );
}
