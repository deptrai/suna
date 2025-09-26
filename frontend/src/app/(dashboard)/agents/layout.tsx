import { Metadata } from 'next';
import { redirect } from 'next/navigation';

export const metadata: Metadata = {
  title: 'Agent Conversation | Epsilon Chainlens',
  description: 'Interactive agent conversation powered by Epsilon Chainlens',
  openGraph: {
    title: 'Agent Conversation | Epsilon Chainlens',
    description: 'Interactive agent conversation powered by Epsilon Chainlens',
    type: 'website',
  },
};

export default async function AgentsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
