/**
 * Global type declarations for extension
 */

// Extend Window interface for frontend code compatibility
declare global {
  interface Window {
    tolt_referral?: string;
  }
}

// Firefox browser API compatibility (global const, not inside declare global)
declare const browser: typeof chrome | undefined;

export {};

