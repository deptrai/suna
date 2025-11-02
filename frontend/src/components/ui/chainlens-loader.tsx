'use client';

import * as React from 'react';
import { useTheme } from 'next-themes';
import { cn } from '@/lib/utils';

interface EpsilonLoaderProps {
  /**
   * Size preset for the loader
   * @default 'medium'
   */
  size?: 'small' | 'medium' | 'large' | 'xlarge';
  /**
   * Animation speed multiplier
   * @default 1.2
   */
  speed?: number;
  /**
   * Custom size in pixels (overrides size preset)
   */
  customSize?: number;
  /**
   * Additional className for the container
   */
  className?: string;
  /**
   * Additional style for the container
   */
  style?: React.CSSProperties;
  /**
   * Whether the animation should autoPlay
   * @default true
   */
  autoPlay?: boolean;
  /**
   * Whether the animation should loop
   * @default true
   */
  loop?: boolean;
  /**
   * Force a specific color (overrides theme)
   * Use 'light' or 'dark' to force a specific theme color
   */
  forceTheme?: 'light' | 'dark';
}

const SIZE_MAP = {
  small: 20,
  medium: 40,
  large: 80,
  xlarge: 120,
} as const;

/**
 * EpsilonLoader - A unified loading animation component
 * 
 * Uses the Lottie animation for consistent loading indicators across the app.
 * Automatically adapts to light/dark mode with appropriate colors.
 * Can be used as a replacement for Loader2 with better visual appeal.
 * 
 * **Theme Support:**
 * - Light mode: Black loader
 * - Dark mode: White loader
 * 
 * @example
 * ```tsx
 * // Simple usage (auto-themed)
 * <EpsilonLoader />
 * 
 * // Custom size
 * <EpsilonLoader size="large" />
 * 
 * // Force dark theme (white loader)
 * <EpsilonLoader forceTheme="dark" />
 * 
 * // With custom styling
 * <EpsilonLoader className="my-4" customSize={60} />
 * ```
 */
export function EpsilonLoader({
  size = 'medium',
  speed = 1.2,
  customSize,
  className,
  style,
  autoPlay = true,
  loop = true,
  forceTheme,
}: EpsilonLoaderProps) {
  const { resolvedTheme } = useTheme();
  const loaderSize = customSize || SIZE_MAP[size];
  
  // Track mounted state to prevent hydration mismatch
  const [mounted, setMounted] = React.useState(false);

  // Set mounted on client
  React.useEffect(() => {
    setMounted(true);
  }, []);

  // Determine effective theme only after mount
  const effectiveTheme = forceTheme || resolvedTheme || 'dark';
  const isDark = effectiveTheme === 'dark';

  // Don't render Lottie during SSR - render a simple placeholder instead
  // This prevents any hydration mismatches
  if (!mounted) {
    return (
      <div 
        className={cn('flex items-center justify-center', className)} 
        style={style}
      >
        <div 
          style={{ 
            width: loaderSize, 
            height: loaderSize 
          }} 
        />
      </div>
    );
  }

  // Dynamically import Lottie only on client-side
  return (
    <div className={cn('flex items-center justify-center', className)} style={style}>
      <LottieAnimation
        loaderSize={loaderSize}
        loop={loop}
        autoPlay={autoPlay}
        isDark={isDark}
        speed={speed}
      />
    </div>
  );
}

// Separate client-only Lottie component
function LottieAnimation({
  loaderSize,
  loop,
  autoPlay,
  isDark,
  speed,
}: {
  loaderSize: number;
  loop: boolean;
  autoPlay: boolean;
  isDark: boolean;
  speed: number;
}) {
  const lottieRef = React.useRef<any>(null);
  const [Lottie, setLottie] = React.useState<any>(null);
  const [animationData, setAnimationData] = React.useState<any>(null);

  // Dynamically import Lottie and animation data on mount
  React.useEffect(() => {
    Promise.all([
      import('lottie-react'),
      import('@/assets/animations/loading.json')
    ]).then(([lottieModule, animData]) => {
      setLottie(() => lottieModule.default);
      setAnimationData(animData.default);
    });
  }, []);

  // Ensure animation starts from beginning when loaded
  React.useEffect(() => {
    if (lottieRef.current) {
      lottieRef.current.goToAndPlay(0, true);
      lottieRef.current.setSpeed(speed);
    }
  }, [Lottie, speed]);

  // Show placeholder while loading
  if (!Lottie || !animationData) {
    return (
      <div 
        style={{ 
          width: loaderSize, 
          height: loaderSize 
        }} 
      />
    );
  }

  return (
    <Lottie
      lottieRef={lottieRef}
      animationData={animationData}
      loop={loop}
      autoplay={autoPlay}
      style={{ 
        width: loaderSize, 
        height: loaderSize,
        // Default animation is white, invert to black for light mode
        filter: isDark ? 'none' : 'brightness(0)'
      }}
    />
  );
}

