/**
 * Utility Hooks
 */
export { useMediaQuery } from './use-media-query';
export { useIsMobile } from './use-mobile';
export { useGitHubStars } from './use-github-stars';
export { useSunaModePersistence } from '@/stores/suna-modes-store';

// Re-export error handling utilities directly from error-handler
export { handleApiError, type ErrorContext } from '@/lib/error-handler';

