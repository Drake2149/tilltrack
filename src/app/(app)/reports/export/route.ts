import { getCurrentUser } from '@/lib/auth'
import { getClosedShiftSummaries, getItemPerformance } from '@/lib/queries'
import { csvResponse, toCsv } from '@/lib/csv'

const dollars = (cents: number) => (cents / 100).toFixed(2)

// en-CA renders as YYYY-MM-DD in local time, so exported dates match the dates
// shown on screen rather than shifting across midnight in UTC.
const isoDate = (date: Date) => date.toLocaleDateString('en-CA')

export async function GET(request: Request) {
  const user = await getCurrentUser()
  if (!user || user.role === 'VOLUNTEER') {
    return new Response('Unauthorized', { status: 401 })
  }

  const url = new URL(request.url)
  const report = url.searchParams.get('report') ?? 'shifts'
  const standId = url.searchParams.get('stand') || undefined
  const fromParam = url.searchParams.get('from')
  const toParam = url.searchParams.get('to')

  const from = fromParam ? new Date(fromParam) : undefined
  const to = toParam ? new Date(`${toParam}T23:59:59`) : undefined
  const opts = { from, to, standId }

  if (report === 'items') {
    const items = await getItemPerformance(user.organizationId, opts)
    const csv = toCsv(
      ['Item', 'Stand', 'Quantity sold', 'Revenue', 'Cost', 'Profit'],
      items.map((i) => [
        i.name,
        i.standName,
        i.quantitySold,
        dollars(i.revenueCents),
        dollars(i.costCents),
        dollars(i.profitCents),
      ]),
    )
    return csvResponse('tilltrack-items.csv', csv)
  }

  const summaries = await getClosedShiftSummaries(user.organizationId, {
    ...opts,
    flaggedOnly: report === 'discrepancies',
  })

  const csv = toCsv(
    [
      'Event',
      'Date',
      'Stand',
      'Volunteers',
      'Opening float',
      'Sales',
      'Expected closing',
      'Actual closing',
      'Over / short',
      'Flagged',
    ],
    summaries.map((s) => [
      s.eventName,
      isoDate(s.eventStartsAt),
      s.standName,
      s.volunteers.join('; '),
      dollars(s.openingCents),
      dollars(s.salesCents),
      dollars(s.expectedClosingCents),
      dollars(s.actualClosingCents),
      dollars(s.discrepancyCents),
      s.isFlagged ? 'YES' : '',
    ]),
  )

  return csvResponse(
    report === 'discrepancies' ? 'tilltrack-discrepancies.csv' : 'tilltrack-shifts.csv',
    csv,
  )
}
