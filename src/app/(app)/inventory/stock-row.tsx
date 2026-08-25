'use client'

import { useActionState, useState } from 'react'
import { Badge, Input, Select } from '@/components/ui'
import { recordTransaction, type ActionState } from './actions'

export function StockRow({
  item,
  canEdit,
}: {
  canEdit: boolean
  item: {
    id: string
    name: string
    unit: string
    currentStock: number
    reorderThreshold: number
  }
}) {
  const [open, setOpen] = useState(false)
  const [state, action, pending] = useActionState<ActionState, FormData>(recordTransaction, {})
  const isLow = item.currentStock <= item.reorderThreshold

  return (
    <li className="py-3 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-medium">{item.name}</p>
          <p className="text-xs text-muted">
            {item.currentStock} {item.unit} on hand · reorder at {item.reorderThreshold}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {isLow ? <Badge tone="warn">Low stock</Badge> : null}
          {canEdit ? (
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className="rounded-lg border border-line px-3 py-1.5 text-sm hover:bg-canvas"
            >
              {open ? 'Cancel' : 'Update'}
            </button>
          ) : null}
        </div>
      </div>

      {open ? (
        <form action={action} className="mt-3 rounded-lg bg-canvas p-3">
          <input type="hidden" name="inventoryItemId" value={item.id} />

          <div className="grid gap-2 sm:grid-cols-[130px_110px_1fr_auto]">
            <Select name="type" defaultValue="RESTOCK" aria-label="Movement type">
              <option value="RESTOCK">Restock</option>
              <option value="WASTE">Waste</option>
              <option value="ADJUSTMENT">Correction</option>
            </Select>
            <Input
              name="quantity"
              type="number"
              placeholder="Qty"
              aria-label="Quantity"
              required
            />
            <Input name="note" placeholder="Note (optional)" aria-label="Note" />
            <button
              type="submit"
              disabled={pending}
              className="rounded-lg bg-brand px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
            >
              {pending ? 'Saving...' : 'Save'}
            </button>
          </div>

          {state.error ? <p className="mt-2 text-sm text-flag">{state.error}</p> : null}
          {state.notice ? <p className="mt-2 text-sm text-ok">{state.notice}</p> : null}
        </form>
      ) : null}
    </li>
  )
}
