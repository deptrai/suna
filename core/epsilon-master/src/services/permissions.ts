import type { Context } from 'hono'
import { HTTPException } from 'hono/http-exception'

import type { EpsilonUserContext } from './epsilon-user-context'

export type EpsilonScope = string

const WILDCARD: EpsilonScope = '*'
const MANAGER_ROLES = new Set(['owner', 'platform_admin'])

function getUser(c: Context): EpsilonUserContext | undefined {
  return c.get('epsilonUser') as EpsilonUserContext | undefined
}

export function hasScope(
  user: EpsilonUserContext | undefined,
  scope: EpsilonScope,
): boolean {
  if (!user) return true
  if (MANAGER_ROLES.has(user.sandboxRole)) return true
  if (user.scopes?.includes(WILDCARD)) return true
  return user.scopes?.includes(scope) ?? false
}

export function hasScopeIn(
  user: EpsilonUserContext | undefined,
  ...scopes: EpsilonScope[]
): boolean {
  return scopes.some((s) => hasScope(user, s))
}

export function requireScope(scope: EpsilonScope) {
  return async (c: Context, next: () => Promise<void>) => {
    const user = getUser(c)
    if (!hasScope(user, scope)) {
      throw new HTTPException(403, { message: `Missing permission: ${scope}` })
    }
    await next()
  }
}

export function assertScope(c: Context, scope: EpsilonScope): void {
  const user = getUser(c)
  if (!hasScope(user, scope)) {
    throw new HTTPException(403, { message: `Missing permission: ${scope}` })
  }
}

export function isManager(user: EpsilonUserContext | undefined): boolean {
  if (!user) return true
  return MANAGER_ROLES.has(user.sandboxRole)
}
