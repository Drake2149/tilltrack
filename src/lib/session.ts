import 'server-only'

import { cookies } from 'next/headers'
import { SignJWT, jwtVerify } from 'jose'
import type { Role } from '@prisma/client'

const COOKIE_NAME = 'tilltrack_session'
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30

export type SessionPayload = {
  userId: string
  organizationId: string
  role: Role
}

function secret(): Uint8Array {
  const value = process.env.SESSION_SECRET
  if (!value || value.length < 32) {
    throw new Error('SESSION_SECRET must be set and at least 32 characters')
  }
  return new TextEncoder().encode(value)
}

export async function createSession(payload: SessionPayload): Promise<void> {
  const token = await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SECONDS}s`)
    .sign(secret())

  const store = await cookies()
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: MAX_AGE_SECONDS,
  })
}

export async function destroySession(): Promise<void> {
  const store = await cookies()
  store.delete(COOKIE_NAME)
}

export async function readSession(): Promise<SessionPayload | null> {
  const store = await cookies()
  const token = store.get(COOKIE_NAME)?.value
  if (!token) return null

  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ['HS256'] })
    const { userId, organizationId, role } = payload as Record<string, unknown>
    if (typeof userId !== 'string' || typeof organizationId !== 'string') return null
    if (role !== 'ADMIN' && role !== 'VOLUNTEER' && role !== 'VIEWER') return null
    return { userId, organizationId, role }
  } catch {
    return null
  }
}
