'use client';

import Image from 'next/image';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';

interface EpsilonLogoProps {
  size?: number;
}
export function EpsilonLogo({ size = 24 }: EpsilonLogoProps) {
  const { theme, systemTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // After mount, we can access the theme
  useEffect(() => {
    setMounted(true);
  }, []);

  const shouldInvert = mounted && (
    theme === 'dark' || (theme === 'system' && systemTheme === 'dark')
  );

  const logoSrc = shouldInvert ? '/chainlens-logo-white.svg' : '/chainlens-logo.svg';

  return (
    <Image
        src={logoSrc}
        alt="Chainlens"
        width={size * 2.5}
        height={size}
        className="flex-shrink-0"
        style={{ width: size * 2.5, height: size, minWidth: size * 2.5, minHeight: size }}
      />
  );
}
