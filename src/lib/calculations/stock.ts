import type { DB, Product, StockMovement } from "@/types";
import { baseUnitOf, round6, toBase } from "./units";

/*
 * Stock is DERIVED from movements (single source of truth).
 * Reference cost = moving weighted average cost (custo médio ponderado):
 *  - movements with a known unitCost and positive quantity (purchases) enter at their cost;
 *  - outflows (consumption, negative adjustments) leave at the current average, keeping it unchanged;
 *  - reversals of purchases (negative, with unitCost) remove that exact value;
 *  - positive adjustments without cost enter at the current average (or stay unvalued if none).
 */

export function packageBaseSize(p: Pick<Product, "contentQuantity" | "contentUnit">): number {
  return toBase(p.contentQuantity, p.contentUnit);
}

export function sortMovements(ms: StockMovement[]): StockMovement[] {
  return [...ms].sort((a, b) =>
    a.movementDate === b.movementDate ? a.createdAt.localeCompare(b.createdAt) : a.movementDate.localeCompare(b.movementDate),
  );
}

export interface StockState {
  quantity: number; // base unit
  avgCost: number | null; // cents per base unit
}

export function computeStock(movements: StockMovement[]): StockState {
  let qty = 0;
  let value = 0; // cents (fractional)
  let avg: number | null = null;
  for (const m of sortMovements(movements)) {
    const q = m.quantity;
    if (q > 0 && m.unitCost !== null) {
      const baseQty = Math.max(qty, 0);
      value = (avg ?? 0) * baseQty + q * m.unitCost;
      qty = qty + q;
      avg = value / (baseQty + q);
    } else if (q < 0 && m.movementType === "reversao" && m.unitCost !== null) {
      const remaining = qty + q;
      if (remaining > 0 && avg !== null) {
        const v = avg * qty + q * m.unitCost;
        avg = v > 0 ? v / remaining : avg;
      }
      qty = remaining;
    } else {
      qty += q;
    }
    qty = round6(qty);
  }
  return { quantity: qty, avgCost: avg };
}

export function stockByProduct(db: DB): Map<string, StockState> {
  const groups = new Map<string, StockMovement[]>();
  for (const m of db.movements) {
    const arr = groups.get(m.productId) ?? [];
    arr.push(m);
    groups.set(m.productId, arr);
  }
  const out = new Map<string, StockState>();
  for (const p of db.products) out.set(p.id, computeStock(groups.get(p.id) ?? []));
  return out;
}

export type StockStatus = "ok" | "baixo" | "sem_estoque" | "negativo";

export function stockStatus(p: Product, baseQty: number): StockStatus {
  if (baseQty < 0) return "negativo";
  if (baseQty === 0) return "sem_estoque";
  const pkgs = baseQty / packageBaseSize(p);
  if (pkgs <= p.minimumStock) return "baixo";
  return "ok";
}

export const STATUS_LABEL: Record<StockStatus, string> = {
  ok: "Em estoque",
  baixo: "Estoque baixo",
  sem_estoque: "Sem estoque",
  negativo: "Negativo",
};

export function packagesFromBase(p: Product, baseQty: number): number {
  return round6(baseQty / packageBaseSize(p));
}

export function baseUnitLabel(p: Product) {
  return baseUnitOf(p.contentUnit);
}
