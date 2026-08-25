'use client'

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import Link from 'next/link'
import { formatCents, parseMoneyToCents } from '@/lib/money'
import { enqueue, flush, newClientId, readQueue, type SyncResult } from '@/lib/offline-queue'
import { OrderPad, type CompletedOrder } from './order-pad'

export type ShiftModeMenuItem = {
  id: string
  name: string
  priceCents: number
}

export type ShiftModeProps = {
  shiftId: string
  standName: string
  eventName: string
  thresholdCents: number
  initial: {
    status: 'SCHEDULED' | 'OPEN' | 'CLOSED'
    openingCents: number
    actualClosingCents: number
    salesCents: number
    orderCount: number
  }
  menuItems: ShiftModeMenuItem[]
}

type Phase = 'opening' | 'selling' | 'closing' | 'done'

function subscribeToConnectivity(onChange: () => void) {
  window.addEventListener('online', onChange)
  window.addEventListener('offline', onChange)
  return () => {
    window.removeEventListener('online', onChange)
    window.removeEventListener('offline', onChange)
  }
}

export function ShiftMode(props: ShiftModeProps) {
  const { shiftId, menuItems, thresholdCents } = props

  const [phase, setPhase] = useState<Phase>(() => {
    if (props.initial.status === 'CLOSED') return 'done'
    if (props.initial.status === 'OPEN') return 'selling'
    return 'opening'
  })

  const [salesCents, setSalesCents] = useState(props.initial.salesCents)
  const [orderCount, setOrderCount] = useState(props.initial.orderCount)
  const [openingCents, setOpeningCents] = useState(props.initial.openingCents)
  const [closingCents, setClosingCents] = useState(props.initial.actualClosingCents)

  const [pendingCount, setPendingCount] = useState(0)
  // navigator.onLine only reports whether an interface is up. Stadium wifi
  // routinely stays "connected" while dropping every request, so reachability is
  // tracked from what the last sync attempt actually did.
  const [isReachable, setIsReachable] = useState(true)
  const [syncMessage, setSyncMessage] = useState<string | null>(null)

  const isOnline = useSyncExternalStore(
    subscribeToConnectivity,
    () => navigator.onLine,
    () => true,
  )

  const refreshPending = useCallback(async () => {
    const queue = await readQueue(shiftId)
    setPendingCount(queue.length)
  }, [shiftId])

  const applyResult = useCallback((result: SyncResult) => {
    if (result.status === 'synced' && result.shift) {
      setSalesCents(result.shift.salesCents)
      setOrderCount(result.shift.orderCount)
      setOpeningCents(result.shift.openingCents)
      setClosingCents(result.shift.actualClosingCents)
      setIsReachable(true)
      setSyncMessage(null)
      if (result.shift.status === 'CLOSED') setPhase('done')
      else if (result.shift.status === 'OPEN') setPhase((p) => (p === 'opening' ? 'selling' : p))
    } else if (result.status === 'offline') {
      setIsReachable(false)
    } else if (result.status === 'error') {
      setIsReachable(true)
      setSyncMessage(result.message ?? 'Sync failed')
    }
  }, [])

  const sync = useCallback(async () => {
    const result = await flush(shiftId)
    applyResult(result)
    await refreshPending()
    return result
  }, [shiftId, applyResult, refreshPending])

  // Attempt a flush on mount and immediately whenever connectivity flips, then
  // keep polling regardless: captive portals and stadium wifi can stay "online"
  // while dropping every request, so the timer is the real safety net.
  useEffect(() => {
    const initial = setTimeout(() => void sync(), 0)
    const timer = setInterval(() => void sync(), 20000)
    return () => {
      clearTimeout(initial)
      clearInterval(timer)
    }
  }, [isOnline, sync])

  const recordOrder = async (order: CompletedOrder) => {
    // Count it locally straight away so the running total is right even with no
    // signal; the server's numbers overwrite these on the next successful sync.
    setSalesCents((c) => c + order.totalCents)
    setOrderCount((n) => n + 1)

    await enqueue({
      kind: 'order',
      clientId: newClientId(),
      shiftId,
      lines: order.lines,
      totalCents: order.totalCents,
      tenderedCents: order.tenderedCents,
      recordedAt: new Date().toISOString(),
    })
    await refreshPending()
    void sync()
  }

  const expectedClosingCents = openingCents + salesCents
  const discrepancyCents = closingCents - expectedClosingCents
  const isFlagged = Math.abs(discrepancyCents) > thresholdCents

  return (
    <div className="min-h-dvh bg-canvas">
      <header className="sticky top-0 z-10 border-b border-line bg-surface px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate font-semibold">{props.standName}</p>
            <p className="truncate text-xs text-muted">{props.eventName}</p>
          </div>
          <SyncBadge
            pending={pendingCount}
            isConnected={isOnline && isReachable}
            hasError={syncMessage !== null}
          />
        </div>
        {syncMessage ? <p className="mt-2 text-xs text-flag">{syncMessage}</p> : null}
      </header>

      {phase === 'opening' ? (
        <CountStep
          key="opening"
          title="Count the opening float"
          help="Count the cash in the till before you sell anything. This is what the closing count gets measured against."
          confirmLabel="Start shift"
          onSubmit={async (cents) => {
            await enqueue({
              kind: 'tillCount',
              clientId: newClientId(),
              shiftId,
              type: 'OPENING',
              amountCents: cents,
              countedAt: new Date().toISOString(),
            })
            setOpeningCents(cents)
            setPhase('selling')
            await refreshPending()
            void sync()
          }}
        />
      ) : null}

      {phase === 'selling' ? (
        <OrderPad
          menuItems={menuItems}
          onComplete={recordOrder}
          ordersThisShift={orderCount}
          salesCents={salesCents}
          onFinishShift={() => setPhase('closing')}
        />
      ) : null}

      {phase === 'closing' ? (
        <CountStep
          key="closing"
          title="Count the closing drawer"
          help={`Count everything in the till now, including the opening float. Expected: ${formatCents(expectedClosingCents)}`}
          confirmLabel="Close shift"
          onBack={() => setPhase('selling')}
          onSubmit={async (cents) => {
            await enqueue({
              kind: 'tillCount',
              clientId: newClientId(),
              shiftId,
              type: 'CLOSING',
              amountCents: cents,
              countedAt: new Date().toISOString(),
            })
            setClosingCents(cents)
            setPhase('done')
            await refreshPending()
            void sync()
          }}
        />
      ) : null}

      {phase === 'done' ? (
        <ClosedSummary
          openingCents={openingCents}
          salesCents={salesCents}
          orderCount={orderCount}
          expectedClosingCents={expectedClosingCents}
          closingCents={closingCents}
          discrepancyCents={discrepancyCents}
          isFlagged={isFlagged}
          thresholdCents={thresholdCents}
          pendingCount={pendingCount}
        />
      ) : null}
    </div>
  )
}

function SyncBadge({
  pending,
  isConnected,
  hasError,
}: {
  pending: number
  isConnected: boolean
  hasError: boolean
}) {
  const config = !isConnected
    ? {
        label: pending > 0 ? `Offline · ${pending} waiting` : 'Offline',
        className: 'bg-warn-bg text-warn border-warn/30',
      }
    : hasError
      ? { label: 'Sync problem', className: 'bg-flag-bg text-flag border-flag/30' }
      : pending > 0
        ? { label: 'Saving...', className: 'bg-canvas text-muted border-line' }
        : { label: 'Saved', className: 'bg-ok-bg text-ok border-ok/30' }

  return (
    <span
      className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-medium ${config.className}`}
      role="status"
      aria-live="polite"
    >
      {config.label}
    </span>
  )
}

function CountStep({
  title,
  help,
  confirmLabel,
  onSubmit,
  onBack,
}: {
  title: string
  help: string
  confirmLabel: string
  onSubmit: (cents: number) => Promise<void>
  onBack?: () => void
}) {
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const submit = async () => {
    const cents = parseMoneyToCents(value)
    if (cents === null || cents < 0) {
      setError('Enter the amount as a number, for example 150.00')
      return
    }
    setBusy(true)
    setError(null)
    await onSubmit(cents)
    setBusy(false)
  }

  return (
    <div className="px-4 py-8">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="mt-2 text-sm text-muted">{help}</p>

      <div className="mt-6">
        <label className="mb-2 block text-sm font-medium" htmlFor="amount">
          Amount in the till
        </label>
        <div className="flex items-center gap-2 rounded-xl border border-line bg-surface px-4 py-3 focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/20">
          <span className="text-2xl text-muted">$</span>
          <input
            id="amount"
            ref={inputRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void submit()
            }}
            inputMode="decimal"
            placeholder="0.00"
            className="w-full bg-transparent text-3xl font-semibold tabular-nums outline-none"
          />
        </div>
        {error ? <p className="mt-2 text-sm text-flag">{error}</p> : null}
      </div>

      <div className="mt-6 flex gap-3">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            className="tap-target rounded-xl border border-line bg-surface px-5 py-4 font-medium"
          >
            Back
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => void submit()}
          disabled={busy}
          className="tap-target flex-1 rounded-xl bg-brand px-5 py-4 text-lg font-semibold text-white disabled:opacity-50"
        >
          {busy ? 'Saving...' : confirmLabel}
        </button>
      </div>
    </div>
  )
}

function ClosedSummary({
  openingCents,
  salesCents,
  orderCount,
  expectedClosingCents,
  closingCents,
  discrepancyCents,
  isFlagged,
  thresholdCents,
  pendingCount,
}: {
  openingCents: number
  salesCents: number
  orderCount: number
  expectedClosingCents: number
  closingCents: number
  discrepancyCents: number
  isFlagged: boolean
  thresholdCents: number
  pendingCount: number
}) {
  const over = discrepancyCents > 0
  const exact = discrepancyCents === 0

  return (
    <div className="px-4 py-8">
      <h1 className="text-2xl font-semibold">Shift closed</h1>

      <div className="mt-6 rounded-xl border border-line bg-surface">
        <Row label="Opening float" value={formatCents(openingCents)} />
        <Row
          label={`Sales (${orderCount} customer${orderCount === 1 ? '' : 's'})`}
          value={formatCents(salesCents)}
        />
        <Row label="Expected in till" value={formatCents(expectedClosingCents)} strong />
        <Row label="Actually counted" value={formatCents(closingCents)} strong />
      </div>

      <div
        className={`mt-4 rounded-xl border px-4 py-5 text-center ${
          exact
            ? 'border-ok/30 bg-ok-bg text-ok'
            : isFlagged
              ? 'border-flag/30 bg-flag-bg text-flag'
              : 'border-warn/30 bg-warn-bg text-warn'
        }`}
      >
        <p className="text-sm font-medium">
          {exact ? 'Balanced exactly' : over ? 'Over by' : 'Short by'}
        </p>
        {!exact ? (
          <p className="mt-1 text-3xl font-bold tabular-nums">
            {formatCents(Math.abs(discrepancyCents))}
          </p>
        ) : null}
        <p className="mt-2 text-xs opacity-80">
          {isFlagged
            ? `Flagged for review — over the ${formatCents(thresholdCents)} threshold. Your treasurer has been notified on their dashboard.`
            : `Within the ${formatCents(thresholdCents)} threshold.`}
        </p>
      </div>

      {pendingCount > 0 ? (
        <p className="mt-4 rounded-lg border border-warn/30 bg-warn-bg px-4 py-3 text-sm text-warn">
          {pendingCount} record{pendingCount === 1 ? '' : 's'} still waiting to upload. Keep this
          page open until you have signal — nothing is lost.
        </p>
      ) : null}

      <Link
        href="/shifts"
        className="tap-target mt-6 block rounded-xl bg-brand px-5 py-4 text-center text-lg font-semibold text-white"
      >
        Done
      </Link>
    </div>
  )
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between border-b border-line px-4 py-3 last:border-b-0">
      <span className={strong ? 'font-medium' : 'text-muted'}>{label}</span>
      <span className={`tabular-nums ${strong ? 'font-semibold' : ''}`}>{value}</span>
    </div>
  )
}
