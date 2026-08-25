import Link from 'next/link'
import { requireRole } from '@/lib/auth'
import { db } from '@/lib/db'
import { Badge, ButtonLink, Card, EmptyState, PageHeader } from '@/components/ui'

function formatWhen(date: Date) {
  return date.toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export default async function ShiftsPage() {
  const user = await requireRole('ADMIN', 'VOLUNTEER')

  // Admins need to be able to open any stand's shift; volunteers only see theirs.
  const shifts = await db.shift.findMany({
    where: {
      organizationId: user.organizationId,
      ...(user.role === 'ADMIN' ? {} : { assignments: { some: { userId: user.id } } }),
    },
    include: {
      stand: { select: { name: true } },
      event: { select: { name: true, startsAt: true } },
      assignments: { include: { user: { select: { name: true } } } },
    },
    orderBy: { startsAt: 'asc' },
  })

  const active = shifts.filter((s) => s.status !== 'CLOSED')
  const closed = shifts.filter((s) => s.status === 'CLOSED')

  return (
    <>
      <PageHeader
        title="My shifts"
        subtitle="Open a shift when you get to the stand. It keeps working if you lose signal."
      />

      {active.length === 0 ? (
        <EmptyState title="No shifts assigned to you right now">
          Your treasurer assigns volunteers when they schedule an event.
        </EmptyState>
      ) : (
        <div className="space-y-3">
          {active.map((shift) => (
            <Card key={shift.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">{shift.event.name}</p>
                  <p className="text-sm text-muted">
                    {shift.stand.name}
                    {shift.name ? ` · ${shift.name}` : ''} · {formatWhen(shift.startsAt)}
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    With: {shift.assignments.map((a) => a.user.name).join(', ') || 'unassigned'}
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <Badge tone={shift.status === 'OPEN' ? 'brand' : 'muted'}>
                    {shift.status === 'OPEN' ? 'In progress' : 'Scheduled'}
                  </Badge>
                  <ButtonLink href={`/shift/${shift.id}`}>
                    {shift.status === 'OPEN' ? 'Resume' : 'Start shift'}
                  </ButtonLink>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {closed.length > 0 ? (
        <section className="mt-10">
          <h2 className="mb-3 text-lg font-semibold">Past shifts</h2>
          <div className="space-y-2">
            {closed.map((shift) => (
              <Link
                key={shift.id}
                href={`/shift/${shift.id}`}
                className="block rounded-lg border border-line bg-surface px-4 py-3 text-sm hover:bg-canvas"
              >
                <span className="font-medium">{shift.event.name}</span>
                <span className="text-muted"> · {shift.stand.name} · {formatWhen(shift.startsAt)}</span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </>
  )
}
