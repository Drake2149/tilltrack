import 'server-only'

import bcrypt from 'bcryptjs'
import { redirect } from 'next/navigation'
import type { Role, User } from '@prisma/client'
import { db } from './db'
import { readSession } from './session'

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 12)
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash)
}

/**
 * Resolves the signed-in user from the session cookie and re-reads them from the
 * database. The DB read is deliberate: a deactivated or role-changed user must
 * lose access immediately rather than at cookie expiry.
 */
export async function getCurrentUser(): Promise<User | null> {
  const session = await readSession()
  if (!session) return null

  const user = await db.user.findUnique({ where: { id: session.userId } })
  if (!user || !user.active) return null
  if (user.organizationId !== session.organizationId) return null

  return user
}

export async function requireUser(): Promise<User> {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  return user
}

export async function requireRole(...roles: Role[]): Promise<User> {
  const user = await requireUser()
  if (!roles.includes(user.role)) redirect('/denied')
  return user
}

export function requireAdmin(): Promise<User> {
  return requireRole('ADMIN')
}

/** Admins and viewers can both read reports; only admins can mutate. */
export function requireReadAccess(): Promise<User> {
  return requireRole('ADMIN', 'VIEWER')
}
