'use client'

/**
 * Durable outbox for Shift Mode.
 *
 * Concession stands lose signal constantly, so every completed order and till
 * count is written to IndexedDB first and POSTed second. Nothing is removed from
 * the outbox until the server has acknowledged it, which means closing the
 * browser mid-game or walking out of coverage cannot lose recorded cash.
 */

const DB_NAME = 'tilltrack'
const DB_VERSION = 1
const STORE = 'outbox'

export type OrderLine = { menuItemId: string; quantity: number }

export type QueuedOrder = {
  kind: 'order'
  clientId: string
  shiftId: string
  lines: OrderLine[]
  totalCents: number
  tenderedCents: number | null
  recordedAt: string
}

export type QueuedTillCount = {
  kind: 'tillCount'
  clientId: string
  shiftId: string
  type: 'OPENING' | 'CLOSING'
  amountCents: number
  countedAt: string
}

export type QueuedItem = QueuedOrder | QueuedTillCount

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(STORE)) {
        database.createObjectStore(STORE, { keyPath: 'clientId' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (database) =>
      new Promise<T>((resolve, reject) => {
        const transaction = database.transaction(STORE, mode)
        const request = run(transaction.objectStore(STORE))
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      }),
  )
}

export function enqueue(item: QueuedItem): Promise<unknown> {
  return tx('readwrite', (store) => store.put(item))
}

export function readQueue(shiftId: string): Promise<QueuedItem[]> {
  return tx<QueuedItem[]>('readonly', (store) => store.getAll() as IDBRequest<QueuedItem[]>).then(
    (items) => items.filter((i) => i.shiftId === shiftId),
  )
}

export async function removeMany(clientIds: string[]): Promise<void> {
  if (clientIds.length === 0) return
  const database = await openDb()
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE, 'readwrite')
    const store = transaction.objectStore(STORE)
    for (const id of clientIds) store.delete(id)
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
  })
}

export type ShiftSnapshot = {
  status: 'SCHEDULED' | 'OPEN' | 'CLOSED'
  hasOpeningCount: boolean
  hasClosingCount: boolean
  soldByItem: Record<string, number>
  orderCount: number
  openingCents: number
  salesCents: number
  expectedClosingCents: number
  actualClosingCents: number
  discrepancyCents: number
  isFlagged: boolean
}

export type SyncResult = {
  status: 'synced' | 'offline' | 'error'
  shift?: ShiftSnapshot
  message?: string
}

/** Flushes everything queued for a shift. Safe to call repeatedly. */
export async function flush(shiftId: string): Promise<SyncResult> {
  const queued = await readQueue(shiftId)

  const orders = queued.filter((i): i is QueuedOrder => i.kind === 'order')
  const tillCounts = queued.filter((i): i is QueuedTillCount => i.kind === 'tillCount')

  try {
    const response = await fetch('/api/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        shiftId,
        orders: orders.map(({ clientId, lines, totalCents, tenderedCents, recordedAt }) => ({
          clientId,
          lines,
          totalCents,
          tenderedCents,
          recordedAt,
        })),
        tillCounts: tillCounts.map(({ clientId, type, amountCents, countedAt }) => ({
          clientId,
          type,
          amountCents,
          countedAt,
        })),
      }),
    })

    if (!response.ok) {
      const body = await response.json().catch(() => ({}))
      return { status: 'error', message: body.error ?? `Sync failed (${response.status})` }
    }

    const data = await response.json()
    await removeMany(queued.map((i) => i.clientId))
    return { status: 'synced', shift: data.shift }
  } catch {
    // Network unreachable — the outbox keeps the records for the next attempt.
    return { status: 'offline' }
  }
}

export function newClientId(): string {
  return crypto.randomUUID()
}
