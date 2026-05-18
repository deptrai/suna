import { describe, expect, test } from 'bun:test'
import { clearTokenGraceWindow, getTokenGraceState, isWithinGraceWindow, startTokenGraceWindow } from '../token-grace'

describe('token grace window', () => {
  test('stores previous token and grace deadline', () => {
    clearTokenGraceWindow()
    startTokenGraceWindow('old-token', 30_000)
    const state = getTokenGraceState()
    expect(state.previousToken).toBe('old-token')
    expect(state.acceptOldUntilMs).toBeGreaterThan(Date.now())
    expect(isWithinGraceWindow()).toBeTrue()
  })

  test('clear resets state', () => {
    clearTokenGraceWindow()
    const state = getTokenGraceState()
    expect(state.previousToken).toBe('')
    expect(state.acceptOldUntilMs).toBe(0)
  })
})
