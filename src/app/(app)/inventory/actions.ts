'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireUser } from '@/lib/auth'

export type ActionState = { error?: string; notice?: string }

/**
 * Records a stock movement. The ledger row and the cached currentStock are
 * written together so the two can never disagree.
 */
export async function recordTransaction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser()
  if (user.role === 'VIEWER') return { error: 'Read-only accounts cannot change stock' }

  const parsed = z
    .object({
      inventoryItemId: z.string(),
      type: z.enum(['RESTOCK', 'WASTE', 'ADJUSTMENT']),
      quantity: z.coerce.number().int(),
      note: z.string().trim().optional(),
    })
    .safeParse({
      inventoryItemId: formData.get('inventoryItemId'),
      type: formData.get('type'),
      quantity: formData.get('quantity'),
      note: formData.get('note') || undefined,
    })

  if (!parsed.success) return { error: 'Enter a whole number quantity' }
  if (parsed.data.quantity === 0) return { error: 'Enter a quantity other than zero' }

  const item = await db.inventoryItem.findFirst({
    where: { id: parsed.data.inventoryItemId, organizationId: user.organizationId },
  })
  if (!item) return { error: 'Item not found' }

  // Restock adds, waste removes; an adjustment is whatever sign the user typed.
  const magnitude = Math.abs(parsed.data.quantity)
  const delta =
    parsed.data.type === 'RESTOCK'
      ? magnitude
      : parsed.data.type === 'WASTE'
        ? -magnitude
        : parsed.data.quantity

  if (item.currentStock + delta < 0) {
    return { error: `Only ${item.currentStock} ${item.unit} on hand` }
  }

  await db.$transaction([
    db.inventoryTransaction.create({
      data: {
        organizationId: user.organizationId,
        inventoryItemId: item.id,
        type: parsed.data.type,
        quantityDelta: delta,
        note: parsed.data.note ?? null,
        recordedById: user.id,
      },
    }),
    db.inventoryItem.update({
      where: { id: item.id },
      data: { currentStock: { increment: delta } },
    }),
  ])

  revalidatePath('/inventory')
  revalidatePath('/dashboard')
  return { notice: `${item.name} updated.` }
}
