'use client';

import { cn } from '@/lib/utils';
import { useState, useCallback, useEffect } from 'react';
import { BackgroundAALChecker } from '@/components/auth/background-aal-checker';
import { WallpaperBackground } from '@/components/ui/wallpaper-background';
import { ArrowRight, Globe, Bot, Sparkles, Terminal, Shield, LineChart, Database, Cpu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { trackCtaSignup } from '@/lib/analytics/gtm';
import { motion, useScroll, useTransform } from 'framer-motion';
import { useAuth } from '@/components/AuthProvider';
import { Reveal } from '@/components/home/reveal';

/* ─── Google Favicon helper ─── */
const favicon = (domain: string) =>
  `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;

/* ─── Integration pill ─── */
function IntegrationPill({ domain, icon, name }: { domain?: string; icon?: React.ReactNode; name: string }) {
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border bg-card/60 hover:bg-muted/50 transition-colors">
      {domain ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={favicon(domain)} alt={name} width={16} height={16} className="size-4 shrink-0 rounded-sm" />
      ) : (
        <div className="size-4 shrink-0">{icon}</div>
      )}
      <span className="text-[13px] font-medium text-foreground">{name}</span>
    </div>
  );
}

/* ─── Config card (for agents/skills/commands/triggers) ─── */
function ConfigCard({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="flex items-start gap-3 p-4 rounded-xl border border-border bg-card/40">
      <div className="mt-0.5 flex items-center justify-center size-8 rounded-lg bg-foreground/[0.06] border border-foreground/[0.1] shrink-0">
        {icon}
      </div>
      <div>
        <span className="text-sm font-medium text-foreground">{title}</span>
        <p className="text-[13px] text-muted-foreground mt-1 leading-relaxed">{desc}</p>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════ */

export default function Home() {
  const [showFloatingCta, setShowFloatingCta] = useState(false);
  const { user } = useAuth();

  const { scrollY } = useScroll();
  const drawerRadius = useTransform(scrollY, [200, 600], [24, 0]);
  const heroOpacity = useTransform(scrollY, [0, 400], [1, 0]);
  const heroScale = useTransform(scrollY, [0, 400], [1, 0.95]);

  useEffect(() => {
    const onScroll = () => setShowFloatingCta(window.scrollY > window.innerHeight);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const handleLaunch = useCallback(() => {
    trackCtaSignup();
    if (!user) {
      window.location.href = '/auth';
      return;
    }
    window.location.href = '/dashboard';
  }, [user]);

  return (
    <BackgroundAALChecker>
      <div className="relative bg-background">

        {/* ═══════════════ HERO ═══════════════ */}
        <div className="sticky top-0 h-dvh overflow-hidden z-0">
          <WallpaperBackground wallpaperId="brandmark" />
          <motion.div
            className="relative z-[1] flex flex-col h-full"
            style={{ opacity: heroOpacity, scale: heroScale }}
          >
            <div className="flex-1 flex items-center justify-center pt-40 pointer-events-none">
              <h1 className="text-4xl sm:text-5xl md:text-6xl font-medium tracking-tight text-foreground text-center">
                Chainlens for Web3 Research &amp; Trading<br />
                <span className="text-muted-foreground">Free signals. Premium backtests. Private enterprise deployment.</span>
              </h1>
            </div>
            <div className="relative z-[1] pb-8 px-4 flex flex-col items-center gap-6">
              <Button
                size="lg"
                className="h-12 px-8 text-sm rounded-full transition-colors"
                onClick={handleLaunch}
              >
                Launch Chainlens<ArrowRight className="ml-1.5 size-3.5" />
              </Button>
              <motion.div
                className="mt-3"
                animate={{ y: [0, 6, 0] }}
                transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
              >
                <div className="w-5 h-8 rounded-full border-2 border-muted-foreground/20 flex items-start justify-center p-1">
                  <motion.div
                    className="w-1 h-1.5 rounded-full bg-muted-foreground/40"
                    animate={{ y: [0, 8, 0] }}
                    transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                  />
                </div>
              </motion.div>
            </div>
          </motion.div>
        </div>

        {/* ═══════════════ DRAWER ═══════════════ */}
        <motion.div
          className="relative z-10 bg-background"
          style={{ borderTopLeftRadius: drawerRadius, borderTopRightRadius: drawerRadius }}
        >
          {/* Handle */}
          <div className="flex justify-center pt-5 pb-3">
            <div className="w-8 h-[3px] rounded-full bg-muted-foreground/40" />
          </div>

        {/* ═══════════════ WHAT IS CHAINLENS ═══════════════ */}
        <section className="max-w-3xl mx-auto px-6 py-10 sm:py-14">
          <Reveal>
          <p className="text-2xl sm:text-3xl md:text-4xl font-medium text-foreground leading-snug tracking-tight">
            One platform, three clear tiers.
          </p>
          </Reveal>
          <Reveal delay={0.1}>
          <p className="mt-3 text-base sm:text-lg text-muted-foreground leading-relaxed max-w-2xl">
            Chainlens is a crypto-native intelligence platform for investors, quants, and teams. We combine AI research, market data workers, and secure execution so users can move from idea to validated strategy faster.
          </p>
          </Reveal>
          <Reveal delay={0.15}>
          <p className="mt-3 text-base sm:text-lg text-muted-foreground leading-relaxed max-w-2xl">
            Tier 1 gives free users live AI risk alerts and discovery insights. Tier 2 unlocks Vibe-Trading backtesting and advanced research tools in isolated sandboxes. Tier 3 adds on-prem/private deployment with local LLM support for zero-data-leakage workflows.
          </p>
          </Reveal>
        </section>

        {/* ═══════════════ TIER MODEL ═══════════════ */}
        <section className="max-w-3xl mx-auto px-6 py-10 sm:py-14">
          <Reveal>
          <h2 className="text-2xl sm:text-3xl font-medium tracking-tight text-foreground mb-2">
            3-Tier Experience
          </h2>
          </Reveal>
          <Reveal delay={0.1}>
          <p className="text-sm text-muted-foreground leading-relaxed max-w-2xl mb-2">
            A simple progression model from discovery to execution to institutional privacy.
          </p>
          </Reveal>
          <Reveal delay={0.15}>
          <div className="flex flex-col gap-4 mt-6">
            {[
              { icon: <Globe className="size-4" />, title: 'Tier 1 — Free Intelligence', desc: 'AI-generated Discover feed, contract/token risk snapshots, and early alerts driven by background data workers.' },
              { icon: <LineChart className="size-4" />, title: 'Tier 2 — Premium Execution', desc: 'Vibe-Trading toolkit, backtest sandbox visualizer, and advanced strategy validation with measurable KPIs.' },
              { icon: <Shield className="size-4" />, title: 'Tier 3 — Enterprise Privacy', desc: 'Deploy in your own environment with local LLM options and strict data boundary controls for sensitive strategies.' },
              { icon: <Database className="size-4" />, title: 'Continuous Data Flywheel', desc: 'Worker pipelines continuously enrich crypto context so insights stay fresh across all tiers.' },
              { icon: <Bot className="size-4" />, title: 'Crypto-Native AI Tools', desc: 'Integrated research workflows for on-chain risk, protocol metrics, market monitoring, and strategy ideation.' },
              { icon: <Cpu className="size-4" />, title: 'Agent-First Workflow', desc: 'From quick advisory prompts to multi-step trading analysis loops in one unified product experience.' },
            ].map(({ icon, title, desc }) => (
              <div key={title} className="flex items-start gap-3">
                <div className="mt-0.5 flex items-center justify-center size-7 rounded-lg bg-foreground/[0.06] border border-foreground/[0.1] text-foreground/80 shrink-0">
                  {icon}
                </div>
                <div>
                  <span className="text-sm font-semibold text-foreground">{title}</span>
                  <p className="text-sm text-muted-foreground leading-relaxed mt-1">{desc}</p>
                </div>
              </div>
            ))}
          </div>
          </Reveal>
        </section>

        {/* ═══════════════ HOW IT WORKS ═══════════════ */}
        <section className="max-w-3xl mx-auto px-6 py-10 sm:py-14">
          <Reveal>
          <h2 className="text-2xl sm:text-3xl font-medium tracking-tight text-foreground mb-2">
            How it works
          </h2>
          </Reveal>
          <Reveal delay={0.1}>
          <p className="text-base text-muted-foreground leading-relaxed max-w-2xl mb-8">
            Move from detection to validated execution in three steps.
          </p>
          </Reveal>

          <div className="flex flex-col gap-10">
            {/* Step 1 */}
            <Reveal>
            <div>
              <div className="flex items-center gap-3 mb-2">
                <span className="text-[13px] font-mono text-muted-foreground">/01</span>
                <span className="text-sm font-semibold text-foreground">Detect &amp; Research</span>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed mb-4 max-w-xl">
                Start with Discover and AI widgets to monitor token, protocol, and market risks. Chainlens aggregates multi-source crypto data into concise, actionable intelligence.
              </p>
              <div className="flex flex-wrap gap-2">
                <IntegrationPill icon={<Sparkles className="size-4 text-foreground" />} name="AI Chat" />
                <IntegrationPill icon={<Globe className="size-4 text-foreground" />} name="Discover News" />
              </div>
            </div>
            </Reveal>

            {/* Step 2 */}
            <Reveal>
            <div>
              <div className="flex items-center gap-3 mb-2">
                <span className="text-[13px] font-mono text-muted-foreground">/02</span>
                <span className="text-sm font-semibold text-foreground">Build &amp; Backtest</span>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed mb-4 max-w-xl">
                Use the premium sandbox to iterate on strategy code, run multi-strategy backtests, and review outcomes with KPI-driven visual outputs before any live execution.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <ConfigCard
                  icon={<Terminal className="size-4 text-foreground" />}
                  title="Generative UI"
                  desc="Interactive widgets stream analysis, metrics, and tool outputs directly inside your workflow."
                />
                <ConfigCard
                  icon={<Terminal className="size-4 text-foreground" />}
                  title="Vibe Sandbox"
                  desc="Isolated environment for safe strategy testing and repeatable validation cycles."
                />
              </div>
            </div>
            </Reveal>

            {/* Step 3 */}
            <Reveal>
            <div>
              <div className="flex items-center gap-3 mb-2">
                <span className="text-[13px] font-mono text-muted-foreground">/03</span>
                <span className="text-sm font-semibold text-foreground">Scale Privately</span>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed mb-4 max-w-xl">
                For funds and teams, deploy with enterprise controls and optional local LLMs so research, code, and strategy operations remain under your own governance boundary.
              </p>
            </div>
            </Reveal>
          </div>
        </section>

        {/* Bottom spacing for floating CTA clearance */}
        <div className="h-24 sm:h-28" />

        </motion.div>

        {/* ═══════════════ FLOATING CTA BAR ═══════════════ */}
        <div
           className={cn('fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-1.5 px-1.5 py-1.5 rounded-full border border-border bg-background/95 backdrop-blur-md will-change-transform transition-[transform,opacity] duration-[600ms] ease-[cubic-bezier(0.32,0.72,0,1)]',
            showFloatingCta ? 'translate-y-0 opacity-100' : 'translate-y-16 opacity-0 pointer-events-none'
          )}
        >
          <Button
            size="sm"
            className="px-5 text-xs rounded-full font-medium"
            onClick={handleLaunch}
          >
            Launch Chainlens<ArrowRight className="ml-1.5 size-3" />
          </Button>
        </div>
      </div>
    </BackgroundAALChecker>
  );
}
