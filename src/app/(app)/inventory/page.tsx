import { requireUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { Badge, Card, EmptyState, PageHeader } from '@/components/ui'
import { StockRow } from './stock-row'

export default async function InventoryPage() {
  const user = await requireUser()

  const stands = await db.stand.findMany({
    where: { organizationId: user.organizationId, active: true },
    include: {
      inventoryItems: { where: { active: true }, orderBy: { name: 'asc' } },
    },
    orderBy: { name: 'asc' },
  })

  const recent = await db.inventoryTransaction.findMany({
    where: { organizationId: user.organizationId },
    include: {
      inventoryItem: { select: { name: true, unit: true } },
      recordedBy: { select: { name: true } },
    },
    orderBy: { recordedAt: 'desc' },
    take: 15,
  })

  const hasItems = stands.some((s) => s.inventoryItems.length > 0)

  return (
    <>
      <PageHeader title="Inventory" subtitle="Log restocks and waste as they happen." />

      {!hasItems ? (
        <EmptyState title="No inventory items yet">
          Add them from a stand&apos;s setup page.
        </EmptyState>
      ) : (
        <div className="space-y-8">
          {stands
            .filter((stand) => stand.inventoryItems.length > 0)
            .map((stand) => (
              <section key={stand.id}>
                <h2 className="mb-3 text-lg font-semibold">{stand.name}</h2>
                <Card>
                  <ul className="divide-y divide-line">
                    {stand.inventoryItems.map((item) => (
                      <StockRow
                        key={item.id}
                        canEdit={user.role !== 'VIEWER'}
                        item={{
                          id: item.id,
                          name: item.name,
                          unit: item.unit,
                          currentStock: item.currentStock,
                          reorderThreshold: item.reorderThreshold,
                        }}
                      />
                    ))}
                  </ul>
                </Card>
              </section>
            ))}
        </div>
      )}

      {recent.length > 0 ? (
        <section className="mt-10">
          <h2 className="mb-3 text-lg font-semibold">Recent activity</h2>
          <Card>
            <ul className="divide-y divide-line text-sm">
              {recent.map((txn) => (
                <li key={txn.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 first:pt-0 last:pb-0">
                  <div>
                    <span className="font-medium">{txn.inventoryItem.name}</span>
                    <span className="text-muted">
                      {' '}
                      · {txn.recordedBy.name} ·{' '}
                      {txn.recordedAt.toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </span>
                    {txn.note ? <p className="text-xs text-muted">{txn.note}</p> : null}
                  </div>
                  <Badge tone={txn.quantityDelta > 0 ? 'ok' : 'warn'}>
                    {txn.quantityDelta > 0 ? '+' : ''}
                    {txn.quantityDelta} {txn.inventoryItem.unit}
                  </Badge>
                </li>
              ))}
            </ul>
          </Card>
        </section>
      ) : null}
    </>
  )
}
