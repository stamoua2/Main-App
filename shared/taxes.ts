// Calcul des totaux d'une estimation ou d'une facture.
// TPS et TVQ sont optionnelles (configuration de l'entreprise). Au Québec,
// depuis 2013, la TVQ se calcule sur le sous-total (pas sur TPS + sous-total).

export const TPS_RATE_DEFAULT = 0.05;
export const TVQ_RATE_DEFAULT = 0.09975;

export interface DocumentLineInput {
  quantity: number;
  unitPriceCents: number;
}

export interface TotalsOptions {
  taxesEnabled: boolean;
  tpsRate?: number;
  tvqRate?: number;
  depositCents?: number;
}

export interface Totals {
  subtotalCents: number;
  tpsCents: number;
  tvqCents: number;
  totalCents: number;
  depositCents: number;
  balanceCents: number;
}

export function lineAmountCents(line: DocumentLineInput): number {
  return Math.round(line.quantity * line.unitPriceCents);
}

export function computeTotals(
  lines: DocumentLineInput[],
  options: TotalsOptions,
): Totals {
  const subtotalCents = lines.reduce((sum, l) => sum + lineAmountCents(l), 0);
  const tpsRate = options.tpsRate ?? TPS_RATE_DEFAULT;
  const tvqRate = options.tvqRate ?? TVQ_RATE_DEFAULT;
  const tpsCents = options.taxesEnabled ? Math.round(subtotalCents * tpsRate) : 0;
  const tvqCents = options.taxesEnabled ? Math.round(subtotalCents * tvqRate) : 0;
  const totalCents = subtotalCents + tpsCents + tvqCents;
  const depositCents = Math.min(Math.max(options.depositCents ?? 0, 0), totalCents);
  return {
    subtotalCents,
    tpsCents,
    tvqCents,
    totalCents,
    depositCents,
    balanceCents: totalCents - depositCents,
  };
}
