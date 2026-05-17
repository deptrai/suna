'use client';

import { useMemo, useState } from 'react';
import { Users } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { TierGateBanner } from '@/components/tier-gate-banner';
import { isTier1 } from '@/components/tier-gate.utils';
import { useSubscriptionStore } from '@/stores/subscription-store';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { SWARM_PRESETS, type SwarmPreset } from '@/components/swarm-teams/preset-catalog';
import { useCreateOpenCodeSession } from '@/hooks/opencode/use-opencode-sessions';
import { useServerStore } from '@/stores/server-store';
import { openTabAndNavigate } from '@/stores/tab-store';
import { buildSwarmPrompt, dispatchSwarmPrompt } from './swarm-teams.utils';

export function SwarmTeamsClient() {
  const accountState = useSubscriptionStore((s) => s.accountState);
  const tierKey = accountState?.subscription?.tier_key;
  const blocked = isTier1(tierKey);

  const createSession = useCreateOpenCodeSession();
  const activeServerId = useServerStore((s) => s.activeServerId);

  const [selected, setSelected] = useState<SwarmPreset | null>(null);
  const [vars, setVars] = useState<Record<string, string>>({});
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string>('');

  const allFilled = useMemo(() => {
    if (!selected) return false;
    return selected.requiredVars.every((v) => (vars[v.name] || '').trim().length > 0);
  }, [selected, vars]);

  const runPreset = async () => {
    if (!selected || !allFilled) return;
    setRunning(true);
    setError('');
    try {
      const prompt = buildSwarmPrompt(selected, vars);
      await dispatchSwarmPrompt(createSession.mutateAsync, prompt, openTabAndNavigate, activeServerId);
      setSelected(null);
      setVars({});
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to start swarm');
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="container max-w-6xl py-8 space-y-6 animate-in fade-in zoom-in duration-500 ease-out">
      <PageHeader icon={Users}>Swarm Teams</PageHeader>

      <div className="rounded-xl border border-border/50 bg-muted/30 p-4 text-sm">
        Some swarm presets require your OpenAI key. Configure it in{' '}
        <a href="/dashboard/settings" className="underline">Settings → AI Keys</a>.
      </div>

      {blocked ? (
        <TierGateBanner feature="Swarm Teams" />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {SWARM_PRESETS.map((preset) => (
            <Card key={preset.name}>
              <CardHeader>
                <CardTitle>{preset.displayName}</CardTitle>
                <CardDescription>{preset.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-sm text-muted-foreground mb-3">{preset.agentCount} agents</div>
                <Button
                  onClick={() => {
                    setSelected(preset);
                    setVars({});
                  }}
                >
                  Configure & Run
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{selected?.displayName ?? 'Configure Swarm'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            {selected?.requiredVars.map((v) => (
              <div key={v.name} className="space-y-1">
                <label className="text-sm font-medium">{v.label}</label>
                <Input
                  value={vars[v.name] ?? ''}
                  placeholder={v.placeholder}
                  onChange={(e) => setVars((prev) => ({ ...prev, [v.name]: e.target.value }))}
                />
              </div>
            ))}
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setSelected(null)}>Cancel</Button>
            <Button onClick={() => void runPreset()} disabled={!allFilled || running}>Run</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
