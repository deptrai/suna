import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'API Keys | Epsilon',
  description: 'Manage your API keys for programmatic access to Epsilon',
  openGraph: {
    title: 'API Keys | Epsilon',
    description: 'Manage your API keys for programmatic access to Epsilon',
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
