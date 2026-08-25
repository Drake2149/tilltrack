import 'server-only'

import { db } from './db'
import { reconcile, type Reconciliation } from './shift-math'

export type ShiftSummary = Reconciliation & {
  shiftId: string
  shiftName: string | null
  standName: string
  eventName: string
  eventStartsAt: Date
  closedAt: Date | null
  volunteers: string[]
  orderCount: number
}

/**
 * Reconciles closed shifts in one pass. Uses the threshold snapshotted at close
 * time when present so a later settings change doesn't silently un-flag history.
 */
export async function getClosedShiftSummaries(
  organizationId: string,
  opts: { from?: Date; to?: Date; standId?: string; flaggedOnly?: boolean } = {},
): Promise<ShiftSummary[]> {
  const org = await db.organization.findUniqueOrThrow({
    where: { id: organizationId },
    select: { discrepancyThresholdCents: true },
  })

  const shifts = await db.shift.findMany({
    where: {
      organizationId,
      status: 'CLOSED',
      ...(opts.standId ? { standId: opts.standId } : {}),
      ...(opts.from || opts.to
        ? { event: { startsAt: { ...(opts.from ? { gte: opts.from } : {}), ...(opts.to ? { lte: opts.to } : {}) } } }
        : {}),
    },
    include: {
      stand: { select: { name: true } },
      event: { select: { name: true, startsAt: true } },
      tillCounts: true,
      saleEntries: { select: { quantity: true, unitPriceCents: true } },
      assignments: { include: { user: { select: { name: true } } } },
      _count: { select: { orders: true } },
    },
    orderBy: { event: { startsAt: 'desc' } },
  })

  const summaries = shifts.map((shift) => {
    const opening = shift.tillCounts.find((t) => t.type === 'OPENING')?.amountCents ?? 0
    const closing = shift.tillCounts.find((t) => t.type === 'CLOSING')?.amountCents ?? 0
    const salesCents = shift.saleEntries.reduce((s, e) => s + e.quantity * e.unitPriceCents, 0)

    return {
      shiftId: shift.id,
      shiftName: shift.name,
      standName: shift.stand.name,
      eventName: shift.event.name,
      eventStartsAt: shift.event.startsAt,
      closedAt: shift.closedAt,
      volunteers: shift.assignments.map((a) => a.user.name),
      orderCount: shift._count.orders,
      ...reconcile({
        openingCents: opening,
        salesCents,
        actualClosingCents: closing,
        thresholdCents: shift.thresholdCentsAtClose ?? org.discrepancyThresholdCents,
      }),
    }
  })

  return opts.flaggedOnly ? summaries.filter((s) => s.isFlagged) : summaries
}

export type ItemPerformance = {
  menuItemId: string
  name: string
  standName: string
  quantitySold: number
  revenueCents: number
  costCents: number
  profitCents: number
}

export async function getItemPerformance(
  organizationId: string,
  opts: { from?: Date; to?: Date; standId?: string } = {},
): Promise<ItemPerformance[]> {
  const entries = await db.saleEntry.findMany({
    where: {
      organizationId,
      ...(opts.standId ? { shift: { standId: opts.standId } } : {}),
      ...(opts.from || opts.to
        ? { shift: { event: { startsAt: { ...(opts.from ? { gte: opts.from } : {}), ...(opts.to ? { lte: opts.to } : {}) } } } }
        : {}),
    },
    select: {
      quantity: true,
      unitPriceCents: true,
      unitCostCents: true,
      menuItemId: true,
      menuItem: { select: { name: true, stand: { select: { name: true } } } },
    },
  })

  const byItem = new Map<string, ItemPerformance>()

  for (const entry of entries) {
    const current = byItem.get(entry.menuItemId) ?? {
      menuItemId: entry.menuItemId,
      name: entry.menuItem.name,
      standName: entry.menuItem.stand.name,
      quantitySold: 0,
      revenueCents: 0,
      costCents: 0,
      profitCents: 0,
    }

    current.quantitySold += entry.quantity
    current.revenueCents += entry.quantity * entry.unitPriceCents
    current.costCents += entry.quantity * entry.unitCostCents
    current.profitCents = current.revenueCents - current.costCents
    byItem.set(entry.menuItemId, current)
  }

  return [...byItem.values()].sort((a, b) => b.revenueCents - a.revenueCents)
}

export async function getLowStockItems(organizationId: string) {
  const items = await db.inventoryItem.findMany({
    where: { organizationId, active: true },
    include: { stand: { select: { name: true } } },
    orderBy: { name: 'asc' },
  })
  return items.filter((i) => i.currentStock <= i.reorderThreshold)
}
