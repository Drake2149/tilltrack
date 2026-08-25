'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { db } from '@/lib/db'
import { verifyPassword } from '@/lib/auth'
import { createSession, destroySession } from '@/lib/session'

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
  password: z.string().min(1, 'Enter your password'),
})

export type LoginState = { error?: string }

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  })

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Check your details and try again' }
  }

  const user = await db.user.findUnique({ where: { email: parsed.data.email } })

  // Same message for unknown email and wrong password so the form can't be used
  // to discover which addresses have accounts.
  const invalid = { error: 'Email or password is incorrect' }
  if (!user || !user.active) return invalid
  if (!(await verifyPassword(parsed.data.password, user.passwordHash))) return invalid

  await createSession({
    userId: user.id,
    organizationId: user.organizationId,
    role: user.role,
  })

  redirect(user.role === 'VOLUNTEER' ? '/shifts' : '/dashboard')
}

export async function logout(): Promise<void> {
  await destroySession()
  redirect('/login')
}
