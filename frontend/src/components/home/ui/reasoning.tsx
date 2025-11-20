'use client';

import { ReactNode } from 'react';

export function Reasoning({ children }: { children: ReactNode }) {
  return <div className="reasoning-container">{children}</div>;
}

export function ReasoningContent({ children }: { children: ReactNode }) {
  return <div className="reasoning-content">{children}</div>;
}

export function ReasoningResponse({ text }: { text: string }) {
  return <p className="text-sm text-foreground">{text}</p>;
}

