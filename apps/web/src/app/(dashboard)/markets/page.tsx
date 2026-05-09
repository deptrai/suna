import type { Metadata } from 'next';
import { getEnv } from '@/lib/env-config';
import type { ProtocolMetrics, SmartMoneyMovement } from '@epsilon/shared';
import { ProtocolsTable } from '@/components/markets/protocols-table';
import { SmartMoneyVisualizer } from '@/components/markets/smart-money-visualizer';

export const metadata: Metadata = {
  title: 'DeFi & Markets - Chainlens',
};

const FETCH_REVALIDATE_SECONDS = 60;

function authHeaders(): HeadersInit {
  const token = process.env.INTERNAL_SERVICE_KEY;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function fetchProtocols(): Promise<ProtocolMetrics[]> {
  const baseUrl = getEnv().BACKEND_URL;
  if (!baseUrl) {
    console.warn('[markets] BACKEND_URL not set — returning empty protocols');
    return [];
  }
  const res = await fetch(`${baseUrl}/market/protocols`, {
    next: { revalidate: FETCH_REVALIDATE_SECONDS },
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error(`Failed to fetch protocols: ${res.status}`);
  const body = (await res.json()) as { items?: ProtocolMetrics[] };
  return body.items ?? [];
}

async function fetchSmartMoney(): Promise<SmartMoneyMovement[]> {
  const baseUrl = getEnv().BACKEND_URL;
  if (!baseUrl) {
    console.warn('[markets] BACKEND_URL not set — returning empty smart-money');
    return [];
  }
  const res = await fetch(`${baseUrl}/market/smart-money`, {
    next: { revalidate: FETCH_REVALIDATE_SECONDS },
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error(`Failed to fetch smart money movements: ${res.status}`);
  const body = (await res.json()) as { items?: SmartMoneyMovement[] };
  return body.items ?? [];
}

export default async function MarketsPage() {
  const [protocols, smartMoney] = await Promise.all([
    fetchProtocols(),
    fetchSmartMoney(),
  ]);

  return (
    <div className="container max-w-6xl py-8 space-y-8 animate-in fade-in zoom-in duration-500 ease-out">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight text-white drop-shadow-sm">DeFi & Market Dashboard</h1>
        <p className="text-muted-foreground text-lg">
          Live protocols metrics and smart money movement across chains.
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
        {/* Left Column: Protocols */}
        <div className="xl:col-span-2 space-y-4">
          <div className="rounded-xl border border-white/10 bg-black/40 backdrop-blur-xl shadow-2xl p-6 transition-all duration-300 hover:border-white/20">
            <h2 className="text-xl font-semibold mb-6 flex items-center gap-2 text-white/90">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              Top Protocols
            </h2>
            <ProtocolsTable data={protocols} />
          </div>
        </div>

        {/* Right Column: Smart Money */}
        <div className="space-y-4">
          <div className="rounded-xl border border-white/10 bg-black/40 backdrop-blur-xl shadow-2xl p-6 h-full transition-all duration-300 hover:border-white/20">
            <h2 className="text-xl font-semibold mb-6 flex items-center gap-2 text-white/90">
              <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse"></span>
              Smart Money Flow
            </h2>
            <SmartMoneyVisualizer initialData={smartMoney} />
          </div>
        </div>
      </div>
    </div>
  );
}
