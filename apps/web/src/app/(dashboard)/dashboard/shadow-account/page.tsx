import type { Metadata } from 'next';
import { ShadowAccountClient } from './shadow-account-client';

export const metadata: Metadata = {
  title: 'Shadow Account - Chainlens',
};

export default function ShadowAccountPage() {
  return <ShadowAccountClient />;
}
