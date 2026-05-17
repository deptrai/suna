import type { Metadata } from 'next';
import { SwarmTeamsClient } from './swarm-teams-client';

export const metadata: Metadata = {
  title: 'Swarm Teams - Chainlens',
};

export default function SwarmTeamsPage() {
  return <SwarmTeamsClient />;
}
