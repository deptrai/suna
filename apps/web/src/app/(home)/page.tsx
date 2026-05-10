'use client';

import { cn } from '@/lib/utils';
import { useState, useCallback, useEffect } from 'react';
import { BackgroundAALChecker } from '@/components/auth/background-aal-checker';
import { WallpaperBackground } from '@/components/ui/wallpaper-background';
import { ArrowRight, Check, Copy, Globe, Smartphone, Bot, Sparkles, Terminal, Zap, RefreshCw, Brain, GitFork, Blocks, Shield, LineChart, Database, Cpu } from 'lucide-react';
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
                Crypto Intelligence &amp;<br />
                <span className="text-muted-foreground">Algorithmic Strategy Platform</span>
              </h1>
            </div>
            <div className="relative z-[1] pb-8 px-4 flex flex-col items-center gap-6">
              <Button
                size="lg"
                className="h-12 px-8 text-sm rounded-full transition-colors"
                onClick={handleLaunch}
              >
                Launch Your Epsilon<ArrowRight className="ml-1.5 size-3.5" />
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
            AI Advisory. Automated Code Gen. Risk Validation.
          </p>
          </Reveal>
          <Reveal delay={0.1}>
          <p className="mt-3 text-base sm:text-lg text-muted-foreground leading-relaxed max-w-2xl">
            Chainlens is an enterprise-grade platform built natively for Web3. It provides investors and quants with powerful tools to generate insights, run automated backtesting, and monitor crypto markets in real time without compromising privacy.
          </p>
          </Reveal>
          <Reveal delay={0.15}>
          <p className="mt-3 text-base sm:text-lg text-muted-foreground leading-relaxed max-w-2xl">
            Whether you&apos;re hunting for alpha in our community-driven AI News hub, deploying trading bots in an isolated Sandbox, or running our Tier 3 Enterprise Local LLM for absolute confidentiality, Chainlens scales with you. Powered by a continuous Data Flywheel and Epsilon agents, it turns raw on-chain data into actionable strategies.
          </p>
          </Reveal>
        </section>

        {/* ═══════════════ THE ADVANTAGE ═══════════════ */}
        <section className="max-w-3xl mx-auto px-6 py-10 sm:py-14">
          <Reveal>
          <h2 className="text-2xl sm:text-3xl font-medium tracking-tight text-foreground mb-2">
            The Advantage
          </h2>
          </Reveal>
          <Reveal delay={0.1}>
          <p className="text-sm text-muted-foreground leading-relaxed max-w-2xl mb-2">
            Chainlens isn&apos;t just another generic AI. It&apos;s packed with crypto-native workflows and backed by decentralized RAG data to give you the ultimate edge.
          </p>
          </Reveal>
          <Reveal delay={0.15}>
          <div className="flex flex-col gap-4 mt-6">
            {[
              { icon: <Globe className="size-4" />, title: 'AI-Generated News & Discover', desc: 'Real-time aggregated intelligence and early warning risk alerts, updated by our 24/7 background data workers and community interactions.' },
              { icon: <LineChart className="size-4" />, title: 'Automated Backtesting Sandbox', desc: 'A secure MicroVM environment with a Monaco Editor for coding, testing, and visualizing trading strategies against historical market data.' },
              { icon: <Shield className="size-4" />, title: 'Enterprise Zero-Data-Leakage', desc: 'Tier 3 customers can deploy Chainlens directly on their infrastructure with Local LLM support, ensuring strategies and research are entirely private.' },
              { icon: <Database className="size-4" />, title: 'Data Flywheel', desc: 'Community queries enrich our shared RAG database, continuously fine-tuning the insights available to all users across the platform.' },
              { icon: <Bot className="size-4" />, title: 'Crypto-Native Tools', desc: 'Built-in integrations with top data providers (DeFiLlama, Nansen, Dune), multi-chain support, and smart contract risk analysis.' },
              { icon: <Cpu className="size-4" />, title: 'Epsilon Agents', desc: 'Deploy specialized Epsilon agents to monitor markets, generate strategy code, or alert you on specific on-chain movements.' },
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
            Access insights, customize your agents, and backtest your strategies.
          </p>
          </Reveal>

          <div className="flex flex-col gap-10">
            {/* Step 1 */}
            <Reveal>
            <div>
              <div className="flex items-center gap-3 mb-2">
                <span className="text-[13px] font-mono text-muted-foreground">/01</span>
                <span className="text-sm font-semibold text-foreground">Gain Intelligence</span>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed mb-4 max-w-xl">
                Start by browsing the Discover page or interacting with the AI Chat Widgets. Our Epsilon agents process high-fidelity data from multiple chains to provide you with smart contract risk badges, token info, and early warnings.
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
                <span className="text-sm font-semibold text-foreground">Backtest Strategies</span>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed mb-4 max-w-xl">
                Use your Internal Credits to spin up a secure Sandbox. Let the Epsilon agents generate trading code, visualize the equity curve, and analyze KPIs like Sharpe Ratio and Max Drawdown against the benchmark.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <ConfigCard
                  icon={<Terminal className="size-4 text-foreground" />}
                  title="Generative UI"
                  desc="Interactive widgets and components stream directly into your chat, providing rich visual feedback."
                />
                <ConfigCard
                  icon={<Zap className="size-4 text-foreground" />}
                  title="MicroVM Sandbox"
                  desc="Run complex code safely with isolated network access and sub-second startup times."
                />
              </div>
            </div>
            </Reveal>

            {/* Step 3 */}
            <Reveal>
            <div>
              <div className="flex items-center gap-3 mb-2">
                <span className="text-[13px] font-mono text-muted-foreground">/03</span>
                <span className="text-sm font-semibold text-foreground">Scale to Enterprise</span>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed mb-4 max-w-xl">
                For funds and institutions, upgrade to Tier 3. Deploy the platform on-premise with Local LLM integration. Benefit from the global RAG data flywheel while keeping your own strategies strictly confidential.
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
            Launch Platform<ArrowRight className="ml-1.5 size-3" />
          </Button>
        </div>
      </div>
    </BackgroundAALChecker>
  );
}
