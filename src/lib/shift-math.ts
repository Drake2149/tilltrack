export type SaleLike = { quantity: number; unitPriceCents: number; unitCostCents?: number }

export function salesRevenueCents(sales: SaleLike[]): number {
  return sales.reduce((sum, s) => sum + s.quantity * s.unitPriceCents, 0)
}

export function salesCostCents(sales: SaleLike[]): number {
  return sales.reduce((sum, s) => sum + s.quantity * (s.unitCostCents ?? 0), 0)
}

export type Reconciliation = {
  openingCents: number
  salesCents: number
  expectedClosingCents: number
  actualClosingCents: number
  discrepancyCents: number
  isFlagged: boolean
}

/**
 * Spec §5:
 *   expectedClosing = openingCash + sales
 *   discrepancy     = closingCash - expectedClosing
 *   flag if abs(discrepancy) > threshold
 */
export function reconcile(args: {
  openingCents: number
  salesCents: number
  actualClosingCents: number
  thresholdCents: number
}): Reconciliation {
  const expectedClosingCents = args.openingCents + args.salesCents
  const discrepancyCents = args.actualClosingCents - expectedClosingCents
  return {
    openingCents: args.openingCents,
    salesCents: args.salesCents,
    expectedClosingCents,
    actualClosingCents: args.actualClosingCents,
    discrepancyCents,
    isFlagged: Math.abs(discrepancyCents) > args.thresholdCents,
  }
}

export function isLowStock(currentStock: number, reorderThreshold: number): boolean {
  return currentStock <= reorderThreshold
}
