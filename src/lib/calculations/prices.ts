import type { DB, Product } from "@/types";
import { monthKey, monthRange } from "./dates";
import { percentChange } from "./money";
import { baseUnitOf, toBase } from "./units";

export interface PriceObservation {
  itemId: string;
  purchaseId: string;
  date: string;
  supplier: string;
  reference: string;
  packageQuantity: number;
  packageContentLabel: string;
  packageCost: number; // cents per package as bought
  normalizedUnitCost: number; // cents per base unit — the comparable figure
  standardPackageCost: number; // normalized × current package size (comparable "per package")
  baseQuantity: number;
  effectiveTotal: number;
}

/** Price history is derived from ACTIVE purchases only (cancelled/corrected ones are excluded). */
export function priceObservations(db: DB, product: Product): PriceObservation[] {
  const active = new Map(db.purchases.filter((p) => p.status === "ativa").map((p) => [p.id, p]));
  const stdSize = toBase(product.contentQuantity, product.contentUnit);
  const base = baseUnitOf(product.contentUnit);
  return db.purchaseItems
    .filter((i) => i.productId === product.id && active.has(i.purchaseId) && baseUnitOf(i.contentUnit) === base)
    .map((i) => {
      const p = active.get(i.purchaseId)!;
      return {
        itemId: i.id,
        purchaseId: p.id,
        date: p.purchaseDate,
        supplier: p.supplier,
        reference: p.reference,
        packageQuantity: i.packageQuantity,
        packageContentLabel: `${i.contentQuantity} ${i.contentUnit}`,
        packageCost: i.unitCost,
        normalizedUnitCost: i.normalizedUnitCost,
        standardPackageCost: i.normalizedUnitCost * stdSize,
        baseQuantity: i.baseQuantity,
        effectiveTotal: i.unitCost * i.packageQuantity,
      };
    })
    .sort((a, b) => (a.date === b.date ? a.itemId.localeCompare(b.itemId) : a.date.localeCompare(b.date)));
}

export interface PriceStats {
  count: number;
  last: PriceObservation | null;
  previous: PriceObservation | null;
  changePct: number | null; // last vs previous, on normalized cost
  min: PriceObservation | null;
  max: PriceObservation | null;
  totalBaseQuantity: number;
  totalPackages: number;
  totalSpent: number;
}

export function priceStats(obs: PriceObservation[]): PriceStats {
  const last = obs.at(-1) ?? null;
  const previous = obs.length > 1 ? obs[obs.length - 2] : null;
  let min: PriceObservation | null = null;
  let max: PriceObservation | null = null;
  for (const o of obs) {
    if (!min || o.normalizedUnitCost < min.normalizedUnitCost) min = o;
    if (!max || o.normalizedUnitCost > max.normalizedUnitCost) max = o;
  }
  return {
    count: obs.length,
    last,
    previous,
    changePct: last && previous ? percentChange(previous.normalizedUnitCost, last.normalizedUnitCost) : null,
    min,
    max,
    totalBaseQuantity: obs.reduce((a, o) => a + o.baseQuantity, 0),
    totalPackages: obs.reduce((a, o) => a + o.packageQuantity, 0),
    totalSpent: obs.reduce((a, o) => a + o.effectiveTotal, 0),
  };
}

export interface MonthlyPoint {
  month: string;
  /** Weighted average cost per base unit in the month (total paid / total qty). null = no purchase. */
  avgNormalized: number | null;
  count: number;
}

/** Monthly consolidation (weighted average). Months without purchases are null, never zero. */
export function monthlyPrices(obs: PriceObservation[], from: string, to: string): MonthlyPoint[] {
  const months = monthRange(from, to);
  return months.map((m) => {
    const inMonth = obs.filter((o) => monthKey(o.date) === m);
    if (!inMonth.length) return { month: m, avgNormalized: null, count: 0 };
    const total = inMonth.reduce((a, o) => a + o.effectiveTotal, 0);
    const qty = inMonth.reduce((a, o) => a + o.baseQuantity, 0);
    return { month: m, avgNormalized: total / qty, count: inMonth.length };
  });
}
