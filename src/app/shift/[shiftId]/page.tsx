import { notFound } from 'next/navigation'
import { requireUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { ShiftMode } from './shift-mode'

export default async function ShiftPage({ params }: { params: Promise<{ shiftId: string }> }) {
  const { shiftId } = await params
  const user = await requireUser()

  const shift = await db.shift.findFirst({
    where: { id: shiftId, organizationId: user.organizationId },
    include: {
      stand: {
        select: {
          name: true,
          menuItems: {
            where: { active: true },
            orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
            select: { id: true, name: true, priceCents: true },
          },
        },
      },
      event: { select: { name: true } },
      tillCounts: true,
      saleEntries: { select: { quantity: true, unitPriceCents: true } },
      assignments: { select: { userId: true } },
      organization: { select: { discrepancyThresholdCents: true } },
      _count: { select: { orders: true } },
    },
  })

  if (!shift) notFound()

  const isAssigned = shift.assignments.some((a) => a.userId === user.id)
  if (!isAssigned && user.role !== 'ADMIN') notFound()

  const salesCents = shift.saleEntries.reduce((s, e) => s + e.quantity * e.unitPriceCents, 0)

  return (
    <ShiftMode
      shiftId={shift.id}
      standName={shift.stand.name}
      eventName={shift.event.name}
      thresholdCents={shift.thresholdCentsAtClose ?? shift.organization.discrepancyThresholdCents}
      initial={{
        status: shift.status,
        openingCents: shift.tillCounts.find((t) => t.type === 'OPENING')?.amountCents ?? 0,
        actualClosingCents: shift.tillCounts.find((t) => t.type === 'CLOSING')?.amountCents ?? 0,
        salesCents,
        orderCount: shift._count.orders,
      }}
      menuItems={shift.stand.menuItems}
    />
  )
}
