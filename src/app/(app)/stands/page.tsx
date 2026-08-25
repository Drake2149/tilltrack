import Link from 'next/link'
import { requireAdmin } from '@/lib/auth'
import { db } from '@/lib/db'
import { formatCents } from '@/lib/money'
import { Badge, Card, EmptyState, Field, Input, PageHeader } from '@/components/ui'
import { ActionForm } from '@/components/action-form'
import { createStand, updateThreshold } from './actions'

export default async function StandsPage() {
  const user = await requireAdmin()

  const [stands, org] = await Promise.all([
    db.stand.findMany({
      where: { organizationId: user.organizationId, active: true },
      include: {
        _count: { select: { menuItems: true, inventoryItems: true } },
      },
      orderBy: { name: 'asc' },
    }),
    db.organization.findUniqueOrThrow({
      where: { id: user.organizationId },
      select: { discrepancyThresholdCents: true },
    }),
  ])

  return (
    <>
      <PageHeader title="Stands" subtitle="Each stand has its own menu and inventory." />

      {stands.length === 0 ? (
        <EmptyState title="No stands yet">
          Add your first concession location below.
        </EmptyState>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {stands.map((stand) => (
            <Link key={stand.id} href={`/stands/${stand.id}`}>
              <Card className="h-full transition-colors hover:border-brand">
                <p className="font-semibold">{stand.name}</p>
                <p className="mt-1 text-sm text-muted">
                  {stand._count.menuItems} menu item{stand._count.menuItems === 1 ? '' : 's'} ·{' '}
                  {stand._count.inventoryItems} inventory item
                  {stand._count.inventoryItems === 1 ? '' : 's'}
                </p>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="mb-4 font-semibold">Add a stand</h2>
          <ActionForm action={createStand} submitLabel="Create stand">
            <Field label="Stand name">
              <Input name="name" placeholder="Football Concession" required />
            </Field>
          </ActionForm>
        </Card>

        <Card>
          <h2 className="font-semibold">Discrepancy threshold</h2>
          <p className="mb-4 mt-1 text-sm text-muted">
            Shifts are flagged when the closing count is off by more than this. Currently{' '}
            <Badge tone="brand">{formatCents(org.discrepancyThresholdCents)}</Badge>
          </p>
          <ActionForm action={updateThreshold} submitLabel="Save threshold">
            <Field label="Flag when off by more than" hint="Applies to shifts closed from now on.">
              <Input
                name="threshold"
                inputMode="decimal"
                defaultValue={(org.discrepancyThresholdCents / 100).toFixed(2)}
                required
              />
            </Field>
          </ActionForm>
        </Card>
      </div>
    </>
  )
}
