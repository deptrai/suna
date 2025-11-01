import { Metadata } from 'next';
import { redirect } from 'next/navigation';

export const metadata: Metadata = {
  title: 'Agent Conversation | Epsilon',
  description: 'Interactive agent conversation powered by Epsilon',
  openGraph: {
    title: 'Agent Conversation | Epsilon',
    description: 'Interactive agent conversation powered by Epsilon',
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
