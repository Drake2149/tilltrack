import Link from 'next/link'
import { requireAdmin } from '@/lib/auth'
import { db } from '@/lib/db'
import { Badge, Card, EmptyState, Field, Input, PageHeader } from '@/components/ui'
import { ActionForm } from '@/components/action-form'
import { createEvent } from './actions'

function formatWhen(date: Date) {
  return date.toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export default async function EventsPage() {
  const user = await requireAdmin()

  const events = await db.event.findMany({
    where: { organizationId: user.organizationId },
    include: {
      shifts: {
        include: {
          stand: { select: { name: true } },
          _count: { select: { assignments: true } },
        },
      },
    },
    orderBy: { startsAt: 'desc' },
  })

  const now = new Date()
  const upcoming = events.filter((e) => e.startsAt >= now)
  const past = events.filter((e) => e.startsAt < now)

  return (
    <>
      <PageHeader title="Events" subtitle="Create a game, then add the shifts your stands will run." />

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div>
          <h2 className="mb-3 text-lg font-semibold">Upcoming</h2>
          {upcoming.length === 0 ? (
            <EmptyState title="Nothing scheduled yet" />
          ) : (
            <div className="mb-8 space-y-3">
              {upcoming.map((event) => (
                <EventCard key={event.id} event={event} />
              ))}
            </div>
          )}

          {past.length > 0 ? (
            <>
              <h2 className="mb-3 text-lg font-semibold">Past</h2>
              <div className="space-y-3">
                {past.map((event) => (
                  <EventCard key={event.id} event={event} />
                ))}
              </div>
            </>
          ) : null}
        </div>

        <Card className="h-fit">
          <h2 className="mb-4 font-semibold">Add an event</h2>
          <ActionForm action={createEvent} submitLabel="Create event">
            <div className="space-y-3">
              <Field label="Event name">
                <Input name="name" placeholder="Homecoming vs. Riverton" required />
              </Field>
              <Field label="Starts">
                <Input name="startsAt" type="datetime-local" required />
              </Field>
            </div>
          </ActionForm>
        </Card>
      </div>
    </>
  )
}

type EventWithShifts = {
  id: string
  name: string
  startsAt: Date
  shifts: {
    id: string
    status: string
    stand: { name: string }
    _count: { assignments: number }
  }[]
}

function EventCard({ event }: { event: EventWithShifts }) {
  const unstaffed = event.shifts.filter((s) => s._count.assignments === 0).length

  return (
    <Link href={`/events/${event.id}`}>
      <Card className="transition-colors hover:border-brand">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-semibold">{event.name}</p>
            <p className="text-sm text-muted">{formatWhen(event.startsAt)}</p>
          </div>
          <div className="flex items-center gap-2">
            {unstaffed > 0 ? <Badge tone="warn">{unstaffed} unstaffed</Badge> : null}
            <Badge tone="muted">
              {event.shifts.length} shift{event.shifts.length === 1 ? '' : 's'}
            </Badge>
          </div>
        </div>

        {event.shifts.length > 0 ? (
          <p className="mt-2 text-sm text-muted">
            {event.shifts.map((s) => s.stand.name).join(', ')}
          </p>
        ) : null}
      </Card>
    </Link>
  )
}
