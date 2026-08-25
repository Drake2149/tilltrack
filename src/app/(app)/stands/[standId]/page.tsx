import { notFound } from 'next/navigation'
import { requireAdmin } from '@/lib/auth'
import { db } from '@/lib/db'
import { Badge, Card, EmptyState, Field, Input, PageHeader } from '@/components/ui'
import { ActionForm } from '@/components/action-form'
import { addInventoryItem, addMenuItem, archiveInventoryItem } from '../actions'
import { MenuItemRow } from './menu-item-row'

export default async function StandDetailPage({
  params,
}: {
  params: Promise<{ standId: string }>
}) {
  const { standId } = await params
  const user = await requireAdmin()

  const stand = await db.stand.findFirst({
    where: { id: standId, organizationId: user.organizationId },
    include: {
      menuItems: {
        where: { active: true },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      },
      inventoryItems: { where: { active: true }, orderBy: { name: 'asc' } },
    },
  })

  if (!stand) notFound()

  return (
    <>
      <PageHeader title={stand.name} subtitle="Menu and inventory for this stand." />

      <div className="grid gap-8 lg:grid-cols-2">
        <section>
          <h2 className="mb-3 text-lg font-semibold">Menu</h2>

          {stand.menuItems.length === 0 ? (
            <EmptyState title="No menu items yet">
              Volunteers tap these buttons to log sales, so add everything you sell.
            </EmptyState>
          ) : (
            <Card className="mb-4">
              <ul className="divide-y divide-line">
                {stand.menuItems.map((item) => (
                  <MenuItemRow
                    key={item.id}
                    id={item.id}
                    name={item.name}
                    priceCents={item.priceCents}
                    costCents={item.costCents}
                  />
                ))}
              </ul>
            </Card>
          )}

          <Card>
            <h3 className="mb-4 font-semibold">Add menu item</h3>
            <ActionForm action={addMenuItem} submitLabel="Add item">
              <input type="hidden" name="standId" value={stand.id} />
              <div className="space-y-3">
                <Field label="Item name">
                  <Input name="name" placeholder="Hot Dog" required />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Sale price">
                    <Input name="price" inputMode="decimal" placeholder="3.00" required />
                  </Field>
                  <Field label="Unit cost" hint="Optional — drives profit reports.">
                    <Input name="cost" inputMode="decimal" placeholder="0.90" />
                  </Field>
                </div>
              </div>
            </ActionForm>
          </Card>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold">Inventory</h2>

          {stand.inventoryItems.length === 0 ? (
            <EmptyState title="No inventory items yet">
              Track the supplies you restock between games.
            </EmptyState>
          ) : (
            <Card className="mb-4">
              <ul className="divide-y divide-line">
                {stand.inventoryItems.map((item) => (
                  <li key={item.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                    <div>
                      <p className="font-medium">{item.name}</p>
                      <p className="text-xs text-muted">
                        {item.currentStock} {item.unit} on hand · reorder at {item.reorderThreshold}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      {item.currentStock <= item.reorderThreshold ? (
                        <Badge tone="warn">Low</Badge>
                      ) : null}
                      <form action={archiveInventoryItem}>
                        <input type="hidden" name="id" value={item.id} />
                        <button type="submit" className="text-xs text-muted underline hover:text-flag">
                          Remove
                        </button>
                      </form>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card>
            <h3 className="mb-4 font-semibold">Add inventory item</h3>
            <ActionForm action={addInventoryItem} submitLabel="Add item">
              <input type="hidden" name="standId" value={stand.id} />
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Item name">
                    <Input name="name" placeholder="Hot dog buns" required />
                  </Field>
                  <Field label="Unit">
                    <Input name="unit" placeholder="pack" defaultValue="each" />
                  </Field>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <Field label="On hand">
                    <Input name="currentStock" type="number" min="0" defaultValue="0" />
                  </Field>
                  <Field label="Reorder at">
                    <Input name="reorderThreshold" type="number" min="0" defaultValue="0" />
                  </Field>
                  <Field label="Unit cost">
                    <Input name="unitCost" inputMode="decimal" placeholder="2.50" />
                  </Field>
                </div>
              </div>
            </ActionForm>
          </Card>
        </section>
      </div>
    </>
  )
}
