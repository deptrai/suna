let previousToken = ''
let acceptOldUntilMs = 0

export function startTokenGraceWindow(oldToken: string, durationMs = 30_000): void {
  if (!oldToken) return
  previousToken = oldToken
  acceptOldUntilMs = Date.now() + Math.max(durationMs, 1_000)
}

export function getTokenGraceState(): { previousToken: string; acceptOldUntilMs: number } {
  return { previousToken, acceptOldUntilMs }
}

export function isWithinGraceWindow(): boolean {
  return !!previousToken && Date.now() < acceptOldUntilMs
}

export function clearTokenGraceWindow(): void {
  previousToken = ''
  acceptOldUntilMs = 0
}
