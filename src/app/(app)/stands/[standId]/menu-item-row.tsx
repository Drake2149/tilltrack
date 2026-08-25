'use client'

import { useState } from 'react'
import { ActionForm } from '@/components/action-form'
import { Field, Input } from '@/components/ui'
import { formatCents } from '@/lib/money'
import { archiveMenuItem, updateMenuItem } from '../actions'

export type MenuItemRowProps = {
  id: string
  name: string
  priceCents: number
  costCents: number
}

/**
 * A menu item that can be corrected in place. Prices genuinely change during a
 * season and names arrive with typos, so this has to be editable by a treasurer
 * without anyone touching code.
 */
export function MenuItemRow({ id, name, priceCents, costCents }: MenuItemRowProps) {
  const [isEditing, setIsEditing] = useState(false)

  if (isEditing) {
    return (
      <li className="py-3 first:pt-0 last:pb-0">
        <ActionForm
          action={updateMenuItem}
          submitLabel="Save changes"
          resetOnSuccess={false}
          onSuccess={() => setIsEditing(false)}
        >
          <input type="hidden" name="id" value={id} />
          <div className="space-y-3">
            <Field label="Item name">
              <Input name="name" defaultValue={name} required />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Sale price">
                <Input
                  name="price"
                  inputMode="decimal"
                  defaultValue={(priceCents / 100).toFixed(2)}
                  required
                />
              </Field>
              <Field label="Unit cost" hint="Optional — drives profit reports.">
                <Input
                  name="cost"
                  inputMode="decimal"
                  defaultValue={costCents > 0 ? (costCents / 100).toFixed(2) : ''}
                  placeholder="0.90"
                />
              </Field>
            </div>
          </div>
        </ActionForm>

        <button
          type="button"
          onClick={() => setIsEditing(false)}
          className="mt-2 text-xs text-muted underline"
        >
          Cancel
        </button>
      </li>
    )
  }

  return (
    <li className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
      <div className="min-w-0">
        <p className="font-medium">{name}</p>
        <p className="text-xs text-muted">
          {formatCents(priceCents)}
          {costCents > 0
            ? ` · costs ${formatCents(costCents)} · margin ${formatCents(priceCents - costCents)}`
            : ' · no cost recorded'}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-3">
        <button
          type="button"
          onClick={() => setIsEditing(true)}
          className="text-xs text-muted underline hover:text-ink"
        >
          Edit
        </button>
        <form action={archiveMenuItem}>
          <input type="hidden" name="id" value={id} />
          <button type="submit" className="text-xs text-muted underline hover:text-flag">
            Remove
          </button>
        </form>
      </div>
    </li>
  )
}
