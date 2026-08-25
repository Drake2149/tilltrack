'use client'

import { useMemo, useState } from 'react'
import { formatCents, parseMoneyToCents } from '@/lib/money'
import type { ShiftModeMenuItem } from './shift-mode'

export type CompletedOrder = {
  lines: { menuItemId: string; quantity: number }[]
  totalCents: number
  tenderedCents: number | null
}

/**
 * Rings up one customer at a time. The volunteer taps what the customer asked
 * for, the app adds it up, and — once they punch in the cash handed over — tells
 * them the change. No mental arithmetic at the window.
 */
export function OrderPad({
  menuItems,
  onComplete,
  ordersThisShift,
  salesCents,
  onFinishShift,
}: {
  menuItems: ShiftModeMenuItem[]
  onComplete: (order: CompletedOrder) => Promise<void>
  ordersThisShift: number
  salesCents: number
  onFinishShift: () => void
}) {
  const [cart, setCart] = useState<Record<string, number>>({})
  const [stage, setStage] = useState<'building' | 'paying'>('building')
  const [tendered, setTendered] = useState('')
  const [busy, setBusy] = useState(false)
  const [justSaved, setJustSaved] = useState<string | null>(null)

  const itemById = useMemo(() => new Map(menuItems.map((i) => [i.id, i])), [menuItems])

  const lines = Object.entries(cart)
    .filter(([, qty]) => qty > 0)
    .map(([menuItemId, quantity]) => ({ menuItemId, quantity }))

  const totalCents = lines.reduce(
    (sum, l) => sum + l.quantity * (itemById.get(l.menuItemId)?.priceCents ?? 0),
    0,
  )
  const itemCount = lines.reduce((n, l) => n + l.quantity, 0)

  const tenderedCents = tendered.trim() === '' ? null : parseMoneyToCents(tendered)
  const changeCents = tenderedCents === null ? null : tenderedCents - totalCents
  const shortBy = changeCents !== null && changeCents < 0 ? Math.abs(changeCents) : 0

  const add = (id: string) => {
    setJustSaved(null)
    setCart((prev) => ({ ...prev, [id]: (prev[id] ?? 0) + 1 }))
  }

  const remove = (id: string) => {
    setCart((prev) => {
      const next = { ...prev }
      const qty = (next[id] ?? 0) - 1
      if (qty <= 0) delete next[id]
      else next[id] = qty
      return next
    })
  }

  const clearOrder = () => {
    setCart({})
    setTendered('')
    setStage('building')
  }

  const complete = async () => {
    if (lines.length === 0) return
    setBusy(true)
    await onComplete({
      lines,
      totalCents,
      tenderedCents: tenderedCents !== null && tenderedCents >= totalCents ? tenderedCents : null,
    })
    setBusy(false)
    setJustSaved(
      changeCents !== null && changeCents > 0
        ? `Sale saved — you gave ${formatCents(changeCents)} change`
        : 'Sale saved',
    )
    clearOrder()
  }

  // Bills a volunteer is most likely to be handed, plus exact change.
  const quickTenders = [totalCents, 500, 1000, 2000, 5000].filter(
    (cents, index, all) => cents >= totalCents && all.indexOf(cents) === index,
  )

  if (stage === 'paying') {
    return (
      <div className="px-4 py-5 pb-40">
        <button
          type="button"
          onClick={() => setStage('building')}
          className="tap-target mb-4 text-sm text-muted underline"
        >
          Back to order
        </button>

        <div className="rounded-2xl border border-line bg-surface p-5 text-center">
          <p className="text-sm text-muted">Customer owes</p>
          <p className="mt-1 text-5xl font-bold tabular-nums">{formatCents(totalCents)}</p>
          <p className="mt-2 text-sm text-muted">
            {itemCount} item{itemCount === 1 ? '' : 's'}
          </p>
        </div>

        <div className="mt-5">
          <label htmlFor="tendered" className="mb-2 block text-sm font-medium">
            Cash handed over
          </label>
          <div className="flex items-center gap-2 rounded-xl border border-line bg-surface px-4 py-3 focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/20">
            <span className="text-2xl text-muted">$</span>
            <input
              id="tendered"
              value={tendered}
              onChange={(e) => setTendered(e.target.value)}
              inputMode="decimal"
              placeholder="0.00"
              className="w-full bg-transparent text-3xl font-semibold tabular-nums outline-none"
            />
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {quickTenders.map((cents) => (
              <button
                key={cents}
                type="button"
                onClick={() => setTendered((cents / 100).toFixed(2))}
                className="tap-target rounded-lg border border-line bg-surface px-4 py-2.5 text-sm font-medium"
              >
                {cents === totalCents ? 'Exact' : formatCents(cents)}
              </button>
            ))}
          </div>
        </div>

        {changeCents !== null ? (
          <div
            className={`mt-5 rounded-2xl border px-4 py-6 text-center ${
              shortBy > 0
                ? 'border-warn/30 bg-warn-bg text-warn'
                : 'border-ok/30 bg-ok-bg text-ok'
            }`}
          >
            {shortBy > 0 ? (
              <>
                <p className="text-sm font-medium">Still owed</p>
                <p className="mt-1 text-4xl font-bold tabular-nums">{formatCents(shortBy)}</p>
              </>
            ) : (
              <>
                <p className="text-sm font-medium">Give back</p>
                <p className="mt-1 text-5xl font-bold tabular-nums">{formatCents(changeCents)}</p>
              </>
            )}
          </div>
        ) : null}

        <button
          type="button"
          onClick={() => void complete()}
          disabled={busy || shortBy > 0}
          className="tap-target mt-5 w-full rounded-xl bg-brand px-5 py-5 text-lg font-semibold text-white disabled:opacity-50"
        >
          {busy ? 'Saving...' : 'Done — next customer'}
        </button>

        {shortBy > 0 ? (
          <p className="mt-2 text-center text-sm text-muted">
            Enter at least {formatCents(totalCents)} to finish, or go back and change the order.
          </p>
        ) : null}
      </div>
    )
  }

  return (
    <>
      <div className="px-4 py-4 pb-64">
        {justSaved ? (
          <div className="mb-4 rounded-lg border border-ok/30 bg-ok-bg px-4 py-3 text-center text-sm font-medium text-ok">
            {justSaved}
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          {menuItems.map((item) => {
            const qty = cart[item.id] ?? 0
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => add(item.id)}
                aria-label={`Add ${item.name}, ${formatCents(item.priceCents)}`}
                className={`tap-target relative flex min-h-24 flex-col items-start justify-between rounded-xl border p-3 text-left active:scale-[0.98] ${
                  qty > 0 ? 'border-brand bg-brand/5' : 'border-line bg-surface'
                }`}
              >
                <span className="pr-7 text-sm font-semibold leading-tight">{item.name}</span>
                <span className="text-sm text-muted">{formatCents(item.priceCents)}</span>

                {qty > 0 ? (
                  <span className="absolute right-2 top-2 flex h-7 min-w-7 items-center justify-center rounded-full bg-brand px-1.5 text-sm font-bold text-white tabular-nums">
                    {qty}
                  </span>
                ) : null}
              </button>
            )
          })}
        </div>

        {menuItems.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line bg-surface px-4 py-8 text-center text-sm text-muted">
            No menu items set up for this stand yet. Ask your treasurer to add them.
          </p>
        ) : null}
      </div>

      <div className="fixed inset-x-0 bottom-0 border-t border-line bg-surface">
        {lines.length > 0 ? (
          <ul className="max-h-44 overflow-y-auto border-b border-line px-4 py-2">
            {lines.map((line) => {
              const item = itemById.get(line.menuItemId)
              if (!item) return null
              return (
                <li key={line.menuItemId} className="flex items-center justify-between gap-3 py-1.5">
                  <span className="min-w-0 flex-1 truncate text-sm">
                    <span className="font-semibold tabular-nums">{line.quantity}&times;</span>{' '}
                    {item.name}
                  </span>
                  <span className="text-sm tabular-nums text-muted">
                    {formatCents(line.quantity * item.priceCents)}
                  </span>
                  <button
                    type="button"
                    onClick={() => remove(line.menuItemId)}
                    aria-label={`Remove one ${item.name}`}
                    className="tap-target flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-line text-lg leading-none text-muted"
                  >
                    &minus;
                  </button>
                </li>
              )
            })}
          </ul>
        ) : null}

        <div className="flex items-center gap-3 px-4 py-3">
          <div className="min-w-0 flex-1">
            {lines.length > 0 ? (
              <>
                <p className="text-xs text-muted">
                  {itemCount} item{itemCount === 1 ? '' : 's'} ·{' '}
                  <button type="button" onClick={clearOrder} className="underline">
                    clear
                  </button>
                </p>
                <p className="text-2xl font-bold tabular-nums">{formatCents(totalCents)}</p>
              </>
            ) : (
              <p className="text-sm text-muted">
                {ordersThisShift} sale{ordersThisShift === 1 ? '' : 's'} ·{' '}
                {formatCents(salesCents)} so far
              </p>
            )}
          </div>

          {lines.length > 0 ? (
            <button
              type="button"
              onClick={() => setStage('paying')}
              className="tap-target shrink-0 rounded-xl bg-brand px-6 py-4 text-base font-semibold text-white"
            >
              Take payment
            </button>
          ) : (
            <button
              type="button"
              onClick={onFinishShift}
              className="tap-target shrink-0 rounded-xl border border-line px-5 py-3 text-sm font-medium"
            >
              End shift
            </button>
          )}
        </div>
      </div>
    </>
  )
}
