import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { reconcile } from '@/lib/shift-math'

const orderSchema = z.object({
  clientId: z.string().uuid(),
  totalCents: z.number().int().min(0),
  tenderedCents: z.number().int().min(0).nullable(),
  recordedAt: z.string().datetime(),
  lines: z
    .array(
      z.object({
        menuItemId: z.string(),
        quantity: z.number().int().min(1),
      }),
    )
    .min(1)
    .max(100),
})

const tillCountSchema = z.object({
  clientId: z.string().uuid(),
  type: z.enum(['OPENING', 'CLOSING']),
  amountCents: z.number().int().min(0),
  countedAt: z.string().datetime(),
})

const payloadSchema = z.object({
  shiftId: z.string(),
  orders: z.array(orderSchema).max(200).default([]),
  tillCounts: z.array(tillCountSchema).max(2).default([]),
})

/**
 * Replay endpoint for Shift Mode's offline queue. Each order carries a
 * client-generated clientId and is skipped if already stored, so a phone that
 * loses signal mid-POST can resend the same batch without double-charging.
 */
export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = payloadSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
  }

  const { shiftId, orders, tillCounts } = parsed.data

  const shift = await db.shift.findFirst({
    where: { id: shiftId, organizationId: user.organizationId },
    include: { assignments: { select: { userId: true } } },
  })
  if (!shift) return NextResponse.json({ error: 'Shift not found' }, { status: 404 })

  const isAssigned = shift.assignments.some((a) => a.userId === user.id)
  if (!isAssigned && user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Not assigned to this shift' }, { status: 403 })
  }

  if (orders.length > 0) {
    const menuItemIds = [...new Set(orders.flatMap((o) => o.lines.map((l) => l.menuItemId)))]
    const menuItems = await db.menuItem.findMany({
      where: {
        id: { in: menuItemIds },
        organizationId: user.organizationId,
        standId: shift.standId,
      },
      select: { id: true, priceCents: true, costCents: true },
    })
    const itemById = new Map(menuItems.map((m) => [m.id, m]))

    const alreadyStored = await db.order.findMany({
      where: { clientId: { in: orders.map((o) => o.clientId) } },
      select: { clientId: true },
    })
    const storedIds = new Set(alreadyStored.map((o) => o.clientId))

    for (const order of orders) {
      if (storedIds.has(order.clientId)) continue

      const lines = order.lines.flatMap((line) => {
        const item = itemById.get(line.menuItemId)
        if (!item) return []
        return [
          {
            organizationId: user.organizationId,
            shiftId: shift.id,
            menuItemId: line.menuItemId,
            quantity: line.quantity,
            unitPriceCents: item.priceCents,
            unitCostCents: item.costCents,
            recordedById: user.id,
            recordedAt: new Date(order.recordedAt),
            // Deterministic so a replayed order can't create duplicate lines.
            clientId: `${order.clientId}:${line.menuItemId}`,
          },
        ]
      })

      if (lines.length === 0) continue

      // Trust the server's prices, not the phone's, so a stale menu on a device
      // that's been offline for a week can't undercharge.
      const totalCents = lines.reduce((sum, l) => sum + l.quantity * l.unitPriceCents, 0)
      const tendered = order.tenderedCents

      await db.order.create({
        data: {
          organizationId: user.organizationId,
          shiftId: shift.id,
          totalCents,
          tenderedCents: tendered,
          changeCents: tendered === null ? null : tendered - totalCents,
          recordedById: user.id,
          recordedAt: new Date(order.recordedAt),
          clientId: order.clientId,
          lines: { create: lines },
        },
      })
    }
  }

  for (const count of tillCounts) {
    // Counts may legitimately be re-submitted from a retry queue; the first
    // write wins so a volunteer can't overwrite a recorded count.
    const existing = await db.tillCount.findFirst({
      where: { shiftId: shift.id, type: count.type },
    })
    if (existing) continue

    await db.tillCount.create({
      data: {
        organizationId: user.organizationId,
        shiftId: shift.id,
        type: count.type,
        amountCents: count.amountCents,
        countedById: user.id,
        countedAt: new Date(count.countedAt),
        clientId: count.clientId,
      },
    })

    if (count.type === 'OPENING' && shift.status === 'SCHEDULED') {
      await db.shift.update({
        where: { id: shift.id },
        data: { status: 'OPEN', openedAt: new Date(count.countedAt) },
      })
    }

    if (count.type === 'CLOSING') {
      const org = await db.organization.findUniqueOrThrow({
        where: { id: user.organizationId },
        select: { discrepancyThresholdCents: true },
      })
      await db.shift.update({
        where: { id: shift.id },
        data: {
          status: 'CLOSED',
          closedAt: new Date(count.countedAt),
          thresholdCentsAtClose: org.discrepancyThresholdCents,
        },
      })
    }
  }

  const [fresh, org] = await Promise.all([
    db.shift.findUniqueOrThrow({
      where: { id: shift.id },
      include: {
        tillCounts: true,
        saleEntries: { select: { quantity: true, unitPriceCents: true, menuItemId: true } },
        _count: { select: { orders: true } },
      },
    }),
    db.organization.findUniqueOrThrow({
      where: { id: user.organizationId },
      select: { discrepancyThresholdCents: true },
    }),
  ])

  const opening = fresh.tillCounts.find((t) => t.type === 'OPENING')?.amountCents ?? 0
  const closing = fresh.tillCounts.find((t) => t.type === 'CLOSING')?.amountCents ?? 0
  const salesCents = fresh.saleEntries.reduce((s, e) => s + e.quantity * e.unitPriceCents, 0)

  const soldByItem: Record<string, number> = {}
  for (const entry of fresh.saleEntries) {
    soldByItem[entry.menuItemId] = (soldByItem[entry.menuItemId] ?? 0) + entry.quantity
  }

  return NextResponse.json({
    ok: true,
    shift: {
      id: fresh.id,
      status: fresh.status,
      hasOpeningCount: fresh.tillCounts.some((t) => t.type === 'OPENING'),
      hasClosingCount: fresh.tillCounts.some((t) => t.type === 'CLOSING'),
      soldByItem,
      orderCount: fresh._count.orders,
      ...reconcile({
        openingCents: opening,
        salesCents,
        actualClosingCents: closing,
        thresholdCents: fresh.thresholdCentsAtClose ?? org.discrepancyThresholdCents,
      }),
    },
  })
}
