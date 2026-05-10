import { getServerAuthHeader } from './getServerAuthHeader';
import { RiskBadgeCard } from '@/components/widgets/RiskBadgeCard';
import type { ContractRiskResult } from '@/components/widgets/risk-badge-utils';

interface RiskSectionProps {
  address: string;
  chain: string;
}

type ContractRiskResponse =
  | ({ success: true } & ContractRiskResult)
  | { success: false; error: string };

async function fetchContractRiskServer(address: string, chain: string): Promise<ContractRiskResponse> {
  // Solana addresses are not supported by GoPlus EVM endpoint — short-circuit to a clean error.
  if (chain === 'solana' || chain === 'sol') {
    return { success: false, error: 'Risk analysis not yet available for Solana (planned post-MVP)' };
  }

  try {
    const baseUrl = process.env.BACKEND_URL ?? process.env.NEXT_PUBLIC_BACKEND_URL;
    if (!baseUrl) return { success: false, error: 'No BACKEND_URL configured' };

    const authHeader = await getServerAuthHeader();

    const res = await fetch(`${baseUrl}/router/contract-risk`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeader,
      },
      body: JSON.stringify({ address, chain }),
      signal: AbortSignal.timeout(2500),
      next: { revalidate: 30 },
    });

    if (!res.ok) {
      return { success: false, error: `API returned ${res.status}` };
    }

    const text = await res.text();
    try {
      return JSON.parse(text) as ContractRiskResponse;
    } catch {
      return { success: false, error: 'Upstream returned non-JSON' };
    }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

export async function RiskSection({ address, chain }: RiskSectionProps) {
  const data = await fetchContractRiskServer(address, chain);

  if (!data.success) {
    return (
      <RiskBadgeCard
        data={null}
        errorMessage={data.error || 'Failed to analyze contract risk'}
      />
    );
  }

  return <RiskBadgeCard data={data} />;
}
