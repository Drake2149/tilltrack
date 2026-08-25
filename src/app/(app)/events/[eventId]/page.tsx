import { notFound } from 'next/navigation'
import Link from 'next/link'
import { requireAdmin } from '@/lib/auth'
import { db } from '@/lib/db'
import { Badge, Card, EmptyState, Field, Input, PageHeader, Select } from '@/components/ui'
import { ActionForm } from '@/components/action-form'
import { createShift, deleteShift, toggleAssignment } from '../actions'

function toLocalInput(date: Date) {
  const offset = date.getTimezoneOffset() * 60000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

function formatTime(date: Date) {
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ eventId: string }>
}) {
  const { eventId } = await params
  const admin = await requireAdmin()

  const [event, stands, people] = await Promise.all([
    db.event.findFirst({
      where: { id: eventId, organizationId: admin.organizationId },
      include: {
        shifts: {
          include: {
            stand: { select: { name: true } },
            assignments: { select: { userId: true } },
            _count: { select: { saleEntries: true, tillCounts: true } },
          },
          orderBy: { startsAt: 'asc' },
        },
      },
    }),
    db.stand.findMany({
      where: { organizationId: admin.organizationId, active: true },
      orderBy: { name: 'asc' },
    }),
    db.user.findMany({
      where: { organizationId: admin.organizationId, active: true, role: { not: 'VIEWER' } },
      orderBy: { name: 'asc' },
    }),
  ])

  if (!event) notFound()

  const defaultStart = toLocalInput(event.startsAt)
  const defaultEnd = toLocalInput(new Date(event.startsAt.getTime() + 4 * 60 * 60 * 1000))

  return (
    <>
      <PageHeader
        title={event.name}
        subtitle={event.startsAt.toLocaleString('en-US', {
          weekday: 'long',
          month: 'long',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
        })}
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div>
          <h2 className="mb-3 text-lg font-semibold">Shifts</h2>

          {event.shifts.length === 0 ? (
            <EmptyState title="No shifts yet">
              Add a shift for each stand you&apos;re opening.
            </EmptyState>
          ) : (
            <div className="space-y-4">
              {event.shifts.map((shift) => {
                const assigned = new Set(shift.assignments.map((a) => a.userId))
                const hasActivity = shift._count.saleEntries > 0 || shift._count.tillCounts > 0

                return (
                  <Card key={shift.id}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold">
                          {shift.stand.name}
                          {shift.name ? <span className="text-muted"> · {shift.name}</span> : null}
                        </p>
                        <p className="text-sm text-muted">
                          {formatTime(shift.startsAt)} – {formatTime(shift.endsAt)}
                        </p>
                      </div>

                      <div className="flex items-center gap-3">
                        <Badge
                          tone={
                            shift.status === 'CLOSED'
                              ? 'ok'
                              : shift.status === 'OPEN'
                                ? 'brand'
                                : 'muted'
                          }
                        >
                          {shift.status === 'CLOSED'
                            ? 'Closed'
                            : shift.status === 'OPEN'
                              ? 'In progress'
                              : 'Scheduled'}
                        </Badge>

                        {hasActivity ? (
                          <Link href={`/shift/${shift.id}`} className="text-xs text-brand underline">
                            View
                          </Link>
                        ) : (
                          <form action={deleteShift}>
                            <input type="hidden" name="shiftId" value={shift.id} />
                            <button
                              type="submit"
                              className="text-xs text-muted underline hover:text-flag"
                            >
                              Delete
                            </button>
                          </form>
                        )}
                      </div>
                    </div>

                    <div className="mt-4">
                      <p className="mb-2 text-sm font-medium">Assigned volunteers</p>
                      <div className="flex flex-wrap gap-2">
                        {people.map((person) => {
                          const isOn = assigned.has(person.id)
                          return (
                            <form key={person.id} action={toggleAssignment}>
                              <input type="hidden" name="shiftId" value={shift.id} />
                              <input type="hidden" name="userId" value={person.id} />
                              <button
                                type="submit"
                                className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
                                  isOn
                                    ? 'border-brand bg-brand text-white'
                                    : 'border-line bg-surface text-muted hover:border-brand hover:text-ink'
                                }`}
                              >
                                {isOn ? '✓ ' : '+ '}
                                {person.name}
                              </button>
                            </form>
                          )
                        })}
                      </div>
                      {people.length === 0 ? (
                        <p className="text-sm text-muted">
                          No volunteers yet —{' '}
                          <Link href="/people" className="text-brand underline">
                            add people first
                          </Link>
                          .
                        </p>
                      ) : null}
                    </div>
                  </Card>
                )
              })}
            </div>
          )}
        </div>

        <Card className="h-fit">
          <h2 className="mb-4 font-semibold">Add a shift</h2>

          {stands.length === 0 ? (
            <p className="text-sm text-muted">
              Create a{' '}
              <Link href="/stands" className="text-brand underline">
                stand
              </Link>{' '}
              first.
            </p>
          ) : (
            <ActionForm action={createShift} submitLabel="Add shift">
              <input type="hidden" name="eventId" value={event.id} />
              <div className="space-y-3">
                <Field label="Stand">
                  <Select name="standId" required>
                    {stands.map((stand) => (
                      <option key={stand.id} value={stand.id}>
                        {stand.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Label" hint="Optional, e.g. First half">
                  <Input name="name" placeholder="Main shift" />
                </Field>
                <Field label="Starts">
                  <Input name="startsAt" type="datetime-local" defaultValue={defaultStart} required />
                </Field>
                <Field label="Ends">
                  <Input name="endsAt" type="datetime-local" defaultValue={defaultEnd} required />
                </Field>
              </div>
            </ActionForm>
          )}
        </Card>
      </div>
    </>
  )
}
