import Link from 'next/link'
import { requireReadAccess } from '@/lib/auth'
import { db } from '@/lib/db'
import { formatCents } from '@/lib/money'
import { getClosedShiftSummaries, getItemPerformance } from '@/lib/queries'
import { Badge, Card, EmptyState, PageHeader } from '@/components/ui'

type SearchParams = Promise<{ from?: string; to?: string; stand?: string }>

export default async function ReportsPage({ searchParams }: { searchParams: SearchParams }) {
  const { from, to, stand } = await searchParams
  const user = await requireReadAccess()

  const fromDate = from ? new Date(from) : undefined
  const toDate = to ? new Date(`${to}T23:59:59`) : undefined
  const opts = { from: fromDate, to: toDate, standId: stand || undefined }

  const [summaries, items, stands] = await Promise.all([
    getClosedShiftSummaries(user.organizationId, opts),
    getItemPerformance(user.organizationId, opts),
    db.stand.findMany({
      where: { organizationId: user.organizationId },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    }),
  ])

  const totals = summaries.reduce(
    (acc, s) => ({
      revenue: acc.revenue + s.salesCents,
      discrepancy: acc.discrepancy + s.discrepancyCents,
    }),
    { revenue: 0, discrepancy: 0 },
  )
  const profitCents = items.reduce((sum, i) => sum + i.profitCents, 0)
  const flagged = summaries.filter((s) => s.isFlagged)

  const query = new URLSearchParams()
  if (from) query.set('from', from)
  if (to) query.set('to', to)
  if (stand) query.set('stand', stand)
  const qs = query.toString()

  return (
    <>
      <PageHeader
        title="Reports"
        subtitle="Everything a board meeting needs, exportable to CSV."
      />

      <Card className="mb-6">
        <form method="get" className="flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">From</span>
            <input
              type="date"
              name="from"
              defaultValue={from}
              className="rounded-lg border border-line bg-surface px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">To</span>
            <input
              type="date"
              name="to"
              defaultValue={to}
              className="rounded-lg border border-line bg-surface px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Stand</span>
            <select
              name="stand"
              defaultValue={stand ?? ''}
              className="rounded-lg border border-line bg-surface px-3 py-2 text-sm"
            >
              <option value="">All stands</option>
              {stands.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>

          <button
            type="submit"
            className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white"
          >
            Apply
          </button>
          {qs ? (
            <Link href="/reports" className="text-sm text-muted underline">
              Clear
            </Link>
          ) : null}
        </form>
      </Card>

      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Revenue" value={formatCents(totals.revenue)} />
        <Stat label="Gross profit" value={formatCents(profitCents)} />
        <Stat label="Shifts closed" value={String(summaries.length)} />
        <Stat
          label="Net over / short"
          value={formatCents(totals.discrepancy)}
          tone={totals.discrepancy < 0 ? 'flag' : 'ok'}
        />
      </div>

      <Section
        title="Revenue by shift"
        exportHref={`/reports/export?report=shifts${qs ? `&${qs}` : ''}`}
      >
        {summaries.length === 0 ? (
          <EmptyState title="No closed shifts in this range" />
        ) : (
          <Table
            headers={['Event', 'Stand', 'Sales', 'Expected', 'Counted', 'Over / short']}
            rows={summaries.map((s) => [
              <span key="e">
                <span className="font-medium">{s.eventName}</span>
                <span className="block text-xs text-muted">
                  {s.eventStartsAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  {s.volunteers.length > 0 ? ` · ${s.volunteers.join(', ')}` : ''}
                </span>
              </span>,
              s.standName,
              formatCents(s.salesCents),
              formatCents(s.expectedClosingCents),
              formatCents(s.actualClosingCents),
              <span key="d" className={s.isFlagged ? 'font-semibold text-flag' : ''}>
                {formatCents(s.discrepancyCents)}
                {s.isFlagged ? ' ⚑' : ''}
              </span>,
            ])}
          />
        )}
      </Section>

      <Section
        title="Profit by item"
        exportHref={`/reports/export?report=items${qs ? `&${qs}` : ''}`}
      >
        {items.length === 0 ? (
          <EmptyState title="No sales recorded in this range" />
        ) : (
          <Table
            headers={['Item', 'Stand', 'Sold', 'Revenue', 'Cost', 'Profit']}
            rows={items.map((i) => [
              i.name,
              i.standName,
              String(i.quantitySold),
              formatCents(i.revenueCents),
              formatCents(i.costCents),
              formatCents(i.profitCents),
            ])}
          />
        )}
      </Section>

      <Section
        title="Discrepancy log"
        exportHref={`/reports/export?report=discrepancies${qs ? `&${qs}` : ''}`}
      >
        {flagged.length === 0 ? (
          <EmptyState title="No flagged shifts — every till balanced within the threshold" />
        ) : (
          <Table
            headers={['Event', 'Stand', 'Volunteers', 'Over / short']}
            rows={flagged.map((s) => [
              s.eventName,
              s.standName,
              s.volunteers.join(', ') || '—',
              <Badge key="b" tone="flag">
                {s.discrepancyCents < 0 ? 'Short' : 'Over'}{' '}
                {formatCents(Math.abs(s.discrepancyCents))}
              </Badge>,
            ])}
          />
        )}
      </Section>
    </>
  )
}

function Section({
  title,
  exportHref,
  children,
}: {
  title: string
  exportHref: string
  children: React.ReactNode
}) {
  return (
    <section className="mb-10">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">{title}</h2>
        <a
          href={exportHref}
          className="rounded-lg border border-line bg-surface px-3 py-1.5 text-sm hover:bg-canvas"
        >
          Export CSV
        </a>
      </div>
      {children}
    </section>
  )
}

function Table({ headers, rows }: { headers: string[]; rows: React.ReactNode[][] }) {
  return (
    <Card className="overflow-x-auto p-0">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b border-line text-left">
            {headers.map((h) => (
              <th key={h} className="px-4 py-3 font-medium text-muted">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-line last:border-b-0">
              {row.map((cell, j) => (
                <td key={j} className="px-4 py-3 tabular-nums">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
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
