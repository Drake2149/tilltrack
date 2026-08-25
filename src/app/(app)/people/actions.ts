'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { db } from '@/lib/db'
import { hashPassword, requireAdmin } from '@/lib/auth'

export type ActionState = { error?: string; notice?: string }

export async function createUser(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireAdmin()

  const parsed = z
    .object({
      name: z.string().trim().min(1, 'Enter their name'),
      email: z.string().trim().toLowerCase().email('Enter a valid email address'),
      role: z.enum(['ADMIN', 'VOLUNTEER', 'VIEWER']),
      password: z.string().min(8, 'Password must be at least 8 characters'),
    })
    .safeParse({
      name: formData.get('name'),
      email: formData.get('email'),
      role: formData.get('role'),
      password: formData.get('password'),
    })

  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const existing = await db.user.findUnique({ where: { email: parsed.data.email } })
  if (existing) return { error: 'Someone already uses that email address' }

  await db.user.create({
    data: {
      organizationId: admin.organizationId,
      name: parsed.data.name,
      email: parsed.data.email,
      role: parsed.data.role,
      passwordHash: await hashPassword(parsed.data.password),
    },
  })

  revalidatePath('/people')
  return { notice: `${parsed.data.name} can now sign in with that email and password.` }
}

export async function setUserActive(formData: FormData): Promise<void> {
  const admin = await requireAdmin()
  const id = String(formData.get('id'))
  const active = formData.get('active') === 'true'

  // Guard against an admin locking themselves out of their own club.
  if (id === admin.id) return

  const user = await db.user.findFirst({ where: { id, organizationId: admin.organizationId } })
  if (!user) return

  await db.user.update({ where: { id }, data: { active } })
  revalidatePath('/people')
}
