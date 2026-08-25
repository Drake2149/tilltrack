'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/auth'
import { parseMoneyToCents } from '@/lib/money'

const moneyField = z.string().transform((value, ctx) => {
  const cents = parseMoneyToCents(value)
  if (cents === null || cents < 0) {
    ctx.addIssue({ code: 'custom', message: 'Enter an amount like 3.00' })
    return z.NEVER
  }
  return cents
})

export type ActionState = { error?: string }

/** Confirms the stand belongs to the caller's org before any nested write. */
async function assertStandInOrg(standId: string, organizationId: string) {
  const stand = await db.stand.findFirst({ where: { id: standId, organizationId } })
  if (!stand) throw new Error('Stand not found')
  return stand
}

export async function createStand(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireAdmin()

  const parsed = z
    .object({ name: z.string().trim().min(1, 'Give the stand a name') })
    .safeParse({ name: formData.get('name') })

  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const stand = await db.stand.create({
    data: { organizationId: user.organizationId, name: parsed.data.name },
  })

  revalidatePath('/stands')
  redirect(`/stands/${stand.id}`)
}

export async function addMenuItem(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireAdmin()

  const parsed = z
    .object({
      standId: z.string(),
      name: z.string().trim().min(1, 'Give the item a name'),
      priceCents: moneyField,
      costCents: moneyField,
    })
    .safeParse({
      standId: formData.get('standId'),
      name: formData.get('name'),
      priceCents: formData.get('price'),
      costCents: formData.get('cost') || '0',
    })

  if (!parsed.success) return { error: parsed.error.issues[0].message }

  await assertStandInOrg(parsed.data.standId, user.organizationId)

  const count = await db.menuItem.count({ where: { standId: parsed.data.standId } })

  await db.menuItem.create({
    data: {
      organizationId: user.organizationId,
      standId: parsed.data.standId,
      name: parsed.data.name,
      priceCents: parsed.data.priceCents,
      costCents: parsed.data.costCents,
      sortOrder: count + 1,
    },
  })

  revalidatePath(`/stands/${parsed.data.standId}`)
  return {}
}

/**
 * Edits an existing menu item in place. Safe for mid-season price changes:
 * every SaleEntry stores the price and cost it was rung up at, so past shifts
 * and reports keep the numbers they were actually sold for.
 */
export async function updateMenuItem(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireAdmin()

  const parsed = z
    .object({
      id: z.string(),
      name: z.string().trim().min(1, 'Give the item a name'),
      priceCents: moneyField,
      costCents: moneyField,
    })
    .safeParse({
      id: formData.get('id'),
      name: formData.get('name'),
      priceCents: formData.get('price'),
      costCents: formData.get('cost') || '0',
    })

  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const item = await db.menuItem.findFirst({
    where: { id: parsed.data.id, organizationId: user.organizationId },
  })
  if (!item) return { error: 'That item no longer exists' }

  await db.menuItem.update({
    where: { id: item.id },
    data: {
      name: parsed.data.name,
      priceCents: parsed.data.priceCents,
      costCents: parsed.data.costCents,
    },
  })

  revalidatePath(`/stands/${item.standId}`)
  return {}
}

export async function archiveMenuItem(formData: FormData): Promise<void> {
  const user = await requireAdmin()
  const id = String(formData.get('id'))

  const item = await db.menuItem.findFirst({
    where: { id, organizationId: user.organizationId },
  })
  if (!item) return

  // Soft delete — hard-deleting would orphan the sale history that reports rely on.
  await db.menuItem.update({ where: { id }, data: { active: false } })
  revalidatePath(`/stands/${item.standId}`)
}

export async function addInventoryItem(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireAdmin()

  const parsed = z
    .object({
      standId: z.string(),
      name: z.string().trim().min(1, 'Give the item a name'),
      unit: z.string().trim().min(1).default('each'),
      currentStock: z.coerce.number().int().min(0),
      reorderThreshold: z.coerce.number().int().min(0),
      unitCostCents: moneyField,
    })
    .safeParse({
      standId: formData.get('standId'),
      name: formData.get('name'),
      unit: formData.get('unit') || 'each',
      currentStock: formData.get('currentStock') || 0,
      reorderThreshold: formData.get('reorderThreshold') || 0,
      unitCostCents: formData.get('unitCost') || '0',
    })

  if (!parsed.success) return { error: parsed.error.issues[0].message }

  await assertStandInOrg(parsed.data.standId, user.organizationId)

  await db.inventoryItem.create({
    data: {
      organizationId: user.organizationId,
      standId: parsed.data.standId,
      name: parsed.data.name,
      unit: parsed.data.unit,
      currentStock: parsed.data.currentStock,
      reorderThreshold: parsed.data.reorderThreshold,
      unitCostCents: parsed.data.unitCostCents,
    },
  })

  revalidatePath(`/stands/${parsed.data.standId}`)
  revalidatePath('/inventory')
  return {}
}

export async function archiveInventoryItem(formData: FormData): Promise<void> {
  const user = await requireAdmin()
  const id = String(formData.get('id'))

  const item = await db.inventoryItem.findFirst({
    where: { id, organizationId: user.organizationId },
  })
  if (!item) return

  await db.inventoryItem.update({ where: { id }, data: { active: false } })
  revalidatePath(`/stands/${item.standId}`)
  revalidatePath('/inventory')
}

export async function updateThreshold(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireAdmin()

  const parsed = moneyField.safeParse(formData.get('threshold'))
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  await db.organization.update({
    where: { id: user.organizationId },
    data: { discrepancyThresholdCents: parsed.data },
  })

  revalidatePath('/stands')
  revalidatePath('/dashboard')
  return {}
}
