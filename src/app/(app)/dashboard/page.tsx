import Link from 'next/link'
import { requireReadAccess } from '@/lib/auth'
import { db } from '@/lib/db'
import { formatCents } from '@/lib/money'
import { getClosedShiftSummaries, getLowStockItems } from '@/lib/queries'
import { Alert, Badge, Card, EmptyState, PageHeader } from '@/components/ui'

function formatDate(date: Date) {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default async function DashboardPage() {
  const user = await requireReadAccess()
  const orgId = user.organizationId

  const [summaries, lowStock, upcoming] = await Promise.all([
    getClosedShiftSummaries(orgId),
    getLowStockItems(orgId),
    db.event.findMany({
      where: { organizationId: orgId, startsAt: { gte: new Date() } },
      include: {
        shifts: {
          include: {
            stand: { select: { name: true } },
            assignments: { include: { user: { select: { name: true } } } },
          },
        },
      },
      orderBy: { startsAt: 'asc' },
      take: 5,
    }),
  ])

  const revenueCents = summaries.reduce((s, x) => s + x.salesCents, 0)
  const flagged = summaries.filter((s) => s.isFlagged)
  const netDiscrepancyCents = summaries.reduce((s, x) => s + x.discrepancyCents, 0)

  return (
    <>
      <PageHeader
        title="Season summary"
        subtitle={`${summaries.length} shift${summaries.length === 1 ? '' : 's'} closed to date`}
      />

      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Total revenue" value={formatCents(revenueCents)} />
        <Stat label="Shifts closed" value={String(summaries.length)} />
        <Stat
          label="Flagged shifts"
          value={String(flagged.length)}
          tone={flagged.length > 0 ? 'flag' : 'ok'}
        />
        <Stat
          label="Net over / short"
          value={formatCents(netDiscrepancyCents)}
          tone={netDiscrepancyCents < 0 ? 'flag' : 'ok'}
        />
      </div>

      {flagged.length > 0 ? (
        <section className="mb-8">
          <h2 className="mb-3 text-lg font-semibold">Open discrepancy alerts</h2>
          <div className="space-y-3">
            {flagged.map((s) => (
              <Alert key={s.shiftId}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <strong>{s.eventName}</strong> — {s.standName} was{' '}
                    <strong>
                      {s.discrepancyCents < 0 ? 'short' : 'over'} {formatCents(Math.abs(s.discrepancyCents))}
                    </strong>
                    <div className="mt-1 text-xs opacity-80">
                      Expected {formatCents(s.expectedClosingCents)}, counted{' '}
                      {formatCents(s.actualClosingCents)}
                      {s.volunteers.length > 0 ? ` · ${s.volunteers.join(', ')}` : ''}
                    </div>
                  </div>
                  <Link href={`/reports?shift=${s.shiftId}`} className="text-xs underline">
                    View
                  </Link>
                </div>
              </Alert>
            ))}
          </div>
        </section>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <section>
          <h2 className="mb-3 text-lg font-semibold">Upcoming events</h2>
          {upcoming.length === 0 ? (
            <EmptyState title="No upcoming events">
              <Link href="/events" className="text-brand underline">
                Schedule an event
              </Link>
            </EmptyState>
          ) : (
            <div className="space-y-3">
              {upcoming.map((event) => (
                <Card key={event.id}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium">{event.name}</p>
                      <p className="text-sm text-muted">{formatDate(event.startsAt)}</p>
                    </div>
                    <Badge tone="brand">
                      {event.shifts.length} shift{event.shifts.length === 1 ? '' : 's'}
                    </Badge>
                  </div>
                  {event.shifts.length > 0 ? (
                    <ul className="mt-3 space-y-1 text-sm text-muted">
                      {event.shifts.map((shift) => (
                        <li key={shift.id}>
                          {shift.stand.name} —{' '}
                          {shift.assignments.length > 0
                            ? shift.assignments.map((a) => a.user.name).join(', ')
                            : 'no volunteers assigned'}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </Card>
              ))}
            </div>
          )}
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold">Low stock</h2>
          {lowStock.length === 0 ? (
            <EmptyState title="Everything is above its reorder threshold" />
          ) : (
            <Card>
              <ul className="divide-y divide-line">
                {lowStock.map((item) => (
                  <li key={item.id} className="flex items-center justify-between py-2.5 first:pt-0 last:pb-0">
                    <div>
                      <p className="font-medium">{item.name}</p>
                      <p className="text-xs text-muted">{item.stand.name}</p>
                    </div>
                    <Badge tone="warn">
                      {item.currentStock} {item.unit} left
                    </Badge>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </section>
      </div>
    </>
  )
}

function Stat({
  label,
  value,
  tone = 'muted',
}: {
  label: string
  value: string
  tone?: 'muted' | 'flag' | 'ok'
}) {
  const toneClass = { muted: 'text-ink', flag: 'text-flag', ok: 'text-ok' }[tone]
  return (
    <Card>
      <p className="text-sm text-muted">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${toneClass}`}>{value}</p>
    </Card>
  )
}
