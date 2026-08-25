/**
 * Escapes a cell for CSV. The leading-character guard stops Excel and Sheets
 * from evaluating a value like "=1+1" or "+A1" as a formula when a treasurer
 * opens an exported report.
 */
function escapeCell(value: string | number): string {
  const raw = String(value ?? '')
  // A plain negative number must stay numeric — quoting "-40.00" as text would
  // stop a treasurer from summing the over/short column.
  const isNumeric = /^-?\d+(\.\d+)?$/.test(raw)
  const guarded = !isNumeric && /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw
  return `"${guarded.replace(/"/g, '""')}"`
}

export function toCsv(headers: string[], rows: (string | number)[][]): string {
  const lines = [headers.map(escapeCell).join(',')]
  for (const row of rows) lines.push(row.map(escapeCell).join(','))
  return lines.join('\r\n')
}

export function csvResponse(filename: string, csv: string): Response {
  // BOM so Excel reads UTF-8 correctly.
  return new Response(`﻿${csv}`, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
