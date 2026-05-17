import type { UpdatePhase } from '@/lib/platform-client';

export const DEV_PHASES: UpdatePhase[] = ['pulling', 'patching', 'stopping', 'restarting', 'verifying', 'complete'];

export function getDevPhase(devMode: boolean, devPhaseIdx: number, phase: UpdatePhase): UpdatePhase {
  return devMode ? DEV_PHASES[devPhaseIdx] ?? phase : phase;
}

export function getDevProgress(devMode: boolean, devPhaseIdx: number, phaseProgress: number): number {
  if (!devMode) return phaseProgress;
  return Math.round((devPhaseIdx / (DEV_PHASES.length - 1)) * 100);
}

export function shouldForceCloseUpdateDialog(
  open: boolean,
  isUpdating: boolean,
  isDestructive: boolean,
): boolean {
  return open && isUpdating && !isDestructive;
}

export function shouldForceOpenUpdateDialog(open: boolean, isDestructive: boolean): boolean {
  return !open && isDestructive;
}
