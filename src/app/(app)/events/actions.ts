'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/auth'

export type ActionState = { error?: string }

export async function createEvent(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireAdmin()

  const parsed = z
    .object({
      name: z.string().trim().min(1, 'Name the event'),
      startsAt: z.coerce.date({ message: 'Pick a date and time' }),
    })
    .safeParse({ name: formData.get('name'), startsAt: formData.get('startsAt') })

  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const event = await db.event.create({
    data: {
      organizationId: user.organizationId,
      name: parsed.data.name,
      startsAt: parsed.data.startsAt,
    },
  })

  revalidatePath('/events')
  redirect(`/events/${event.id}`)
}

export async function createShift(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireAdmin()

  const parsed = z
    .object({
      eventId: z.string(),
      standId: z.string().min(1, 'Pick a stand'),
      name: z.string().trim().optional(),
      startsAt: z.coerce.date({ message: 'Pick a start time' }),
      endsAt: z.coerce.date({ message: 'Pick an end time' }),
    })
    .safeParse({
      eventId: formData.get('eventId'),
      standId: formData.get('standId'),
      name: formData.get('name') || undefined,
      startsAt: formData.get('startsAt'),
      endsAt: formData.get('endsAt'),
    })

  if (!parsed.success) return { error: parsed.error.issues[0].message }
  if (parsed.data.endsAt <= parsed.data.startsAt) {
    return { error: 'The shift has to end after it starts' }
  }

  const [event, stand] = await Promise.all([
    db.event.findFirst({ where: { id: parsed.data.eventId, organizationId: user.organizationId } }),
    db.stand.findFirst({ where: { id: parsed.data.standId, organizationId: user.organizationId } }),
  ])
  if (!event || !stand) return { error: 'Event or stand not found' }

  await db.shift.create({
    data: {
      organizationId: user.organizationId,
      eventId: event.id,
      standId: stand.id,
      name: parsed.data.name || null,
      startsAt: parsed.data.startsAt,
      endsAt: parsed.data.endsAt,
    },
  })

  revalidatePath(`/events/${event.id}`)
  return {}
}

export async function toggleAssignment(formData: FormData): Promise<void> {
  const admin = await requireAdmin()
  const shiftId = String(formData.get('shiftId'))
  const userId = String(formData.get('userId'))

  const [shift, user] = await Promise.all([
    db.shift.findFirst({ where: { id: shiftId, organizationId: admin.organizationId } }),
    db.user.findFirst({ where: { id: userId, organizationId: admin.organizationId } }),
  ])
  if (!shift || !user) return

  const existing = await db.shiftAssignment.findUnique({
    where: { shiftId_userId: { shiftId, userId } },
  })

  if (existing) {
    await db.shiftAssignment.delete({ where: { id: existing.id } })
  } else {
    await db.shiftAssignment.create({
      data: { organizationId: admin.organizationId, shiftId, userId },
    })
  }

  revalidatePath(`/events/${shift.eventId}`)
}

export async function deleteShift(formData: FormData): Promise<void> {
  const admin = await requireAdmin()
  const shiftId = String(formData.get('shiftId'))

  const shift = await db.shift.findFirst({
    where: { id: shiftId, organizationId: admin.organizationId },
    include: { _count: { select: { saleEntries: true, tillCounts: true } } },
  })
  if (!shift) return

  // Once money has been recorded against a shift it becomes part of the audit
  // trail, so deleting is only allowed while it's still empty.
  if (shift._count.saleEntries > 0 || shift._count.tillCounts > 0) return

  await db.shift.delete({ where: { id: shiftId } })
  revalidatePath(`/events/${shift.eventId}`)
}
