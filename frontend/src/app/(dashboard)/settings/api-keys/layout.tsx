import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'API Keys | Chainlens',
  description: 'Manage your API keys for programmatic access to Chainlens',
  openGraph: {
    title: 'API Keys | Chainlens',
    description: 'Manage your API keys for programmatic access to Chainlens',
    type: 'website',
  },
};

export default async function APIKeysLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
