'use client';

import { MemoryList } from '@/components/memory/memory-list';

export default function MemorySettingsPage() {
  return (
    <div className="container mx-auto max-w-4xl px-3 sm:px-4 py-4 sm:py-8">
      <MemoryList />
    </div>
  );
}
