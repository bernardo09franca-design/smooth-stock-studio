import type { DB, MovementType, Product, Purchase, PurchaseItem, ServiceSession } from "@/types";
import { monthKey, monthRange, todayISO } from "@/lib/calculations/dates";
import { priceObservations, priceStats, type PriceObservation, type PriceStats } from "@/lib/calculations/prices";
import { packagesFromBase, stockByProduct, stockStatus, type StockState, type StockStatus } from "@/lib/calculations/stock";
import { round6 } from "@/lib/calculations/units";

/*
 * Read-only derived views. Everything here is computed from the stored records;
 * nothing is cached in localStorage, so a screen can never show a stale number.
 * Only records that still "count" are included: active purchases and
 * confirmed sessions (cancelled/corrected ones are excluded and already reversed
 * in the stock movements).
 */

export const ALL_TIME = "0000-01-01";

export function activePurchases(db: DB): Purchase[] {
  return db.purchases.filter((p) => p.status === "ativa");
}

export function confirmedSessions(db: DB): ServiceSession[] {
  return db.sessions.filter((s) => s.status === "confirmado");
}

function inRange(date: string, from: string, to: string): boolean {
  return date >= from && date <= to;
}

export interface ConsumptionTotals {
  qty: number; // base unit
  estimated: number; // base unit
  cost: number; // cents, known parts only
  unknownCost: number; // count of lines without a cost
  sessions: number;
}

export function consumptionByProduct(db: DB, from: string, to: string): Map<string, ConsumptionTotals> {
  const sessions = new Map(
    confirmedSessions(db)
      .filter((s) => inRange(s.sessionDate, from, to))
      .map((s) => [s.id, s]),
  );
  const out = new Map<string, ConsumptionTotals>();
  for (const item of db.consumptionItems) {
    if (!sessions.has(item.sessionId)) continue;
    const cur = out.get(item.productId) ?? { qty: 0, estimated: 0, cost: 0, unknownCost: 0, sessions: 0 };
    cur.qty = round6(cur.qty + item.quantity);
    cur.estimated = round6(cur.estimated + item.estimatedQuantity);
    cur.cost += item.totalCost ?? 0;
    if (item.totalCost === null) cur.unknownCost += 1;
    cur.sessions += 1;
    out.set(item.productId, cur);
  }
  return out;
}

export interface PurchaseTotals {
  packages: number;
  total: number; // cents
  count: number;
}

export function purchasesByProduct(db: DB, from: string, to: string): Map<string, PurchaseTotals> {
  const active = new Map(activePurchases(db).map((p) => [p.id, p]));
  const out = new Map<string, PurchaseTotals>();
  for (const item of db.purchaseItems) {
    const purchase = active.get(item.purchaseId);
    if (!purchase || !inRange(purchase.purchaseDate, from, to)) continue;
    const cur = out.get(item.productId) ?? { packages: 0, total: 0, count: 0 };
    cur.packages += item.packageQuantity;
    cur.total += item.unitCost * item.packageQuantity;
    cur.count += 1;
    out.set(item.productId, cur);
  }
  return out;
}

export interface ProductView {
  product: Product;
  stock: StockState;
  status: StockStatus;
  packages: number;
  stockValue: number; // cents
  stats: PriceStats;
  lastPurchase: PriceObservation | null;
  consumed: ConsumptionTotals;
  bought: PurchaseTotals;
}

export function productViews(db: DB, from: string = ALL_TIME, to: string = todayISO()): ProductView[] {
  const stock = stockByProduct(db);
  const consumption = consumptionByProduct(db, from, to);
  const bought = purchasesByProduct(db, from, to);
  return db.products.map((product) => {
    const obs = priceObservations(db, product);
    const st = stock.get(product.id) ?? { quantity: 0, avgCost: null };
    return {
      product,
      stock: st,
      status: stockStatus(product, st.quantity),
      packages: packagesFromBase(product, st.quantity),
      stockValue: st.quantity > 0 && st.avgCost !== null ? round6(st.quantity * st.avgCost) : 0,
      stats: priceStats(obs),
      lastPurchase: obs.at(-1) ?? null,
      consumed: consumption.get(product.id) ?? { qty: 0, estimated: 0, cost: 0, unknownCost: 0, sessions: 0 },
      bought: bought.get(product.id) ?? { packages: 0, total: 0, count: 0 },
    };
  });
}

export interface Kpis {
  spent: number;
  purchases: number;
  sessions: number;
  attendanceCount: number;
  consumptionCost: number;
  consumptionUnknown: number;
  stockValue: number;
  lowStock: number;
  noStock: number;
  negativeStock: number;
  activeProducts: number;
  costPerAttendance: number | null;
}

export function dashboardKpis(db: DB, from: string, to: string): Kpis {
  const views = productViews(db, from, to);
  const purchases = activePurchases(db).filter((p) => inRange(p.purchaseDate, from, to));
  const sessions = confirmedSessions(db).filter((s) => inRange(s.sessionDate, from, to));
  const attendanceCount = sessions.reduce((a, s) => a + s.quantity, 0);
  const consumptionCost = views.reduce((a, v) => a + v.consumed.cost, 0);
  return {
    spent: purchases.reduce((a, p) => a + p.totalAmount, 0),
    purchases: purchases.length,
    sessions: sessions.length,
    attendanceCount,
    consumptionCost,
    consumptionUnknown: views.reduce((a, v) => a + v.consumed.unknownCost, 0),
    stockValue: views.reduce((a, v) => a + v.stockValue, 0),
    lowStock: views.filter((v) => v.product.active && v.status === "baixo").length,
    noStock: views.filter((v) => v.product.active && v.status === "sem_estoque").length,
    negativeStock: views.filter((v) => v.status === "negativo").length,
    activeProducts: db.products.filter((p) => p.active).length,
    costPerAttendance: attendanceCount > 0 ? consumptionCost / attendanceCount : null,
  };
}

export interface MonthPoint {
  month: string;
  spent: number;
  consumed: number;
}

/** Months without records stay at zero here (a real "nothing happened" month), never null. */
export function monthlyTotals(db: DB, from: string, to: string): MonthPoint[] {
  const months = monthRange(from === ALL_TIME ? firstDate(db, "purchase") ?? to : from, to);
  const purchases = activePurchases(db);
  const sessions = confirmedSessions(db);
  return months.map((m) => ({
    month: m,
    spent: purchases.filter((p) => monthKey(p.purchaseDate) === m).reduce((a, p) => a + p.totalAmount, 0),
    consumed: db.consumptionItems
      .filter((c) => sessions.some((s) => s.id === c.sessionId && monthKey(s.sessionDate) === m))
      .reduce((a, c) => a + (c.totalCost ?? 0), 0),
  }));
}

function firstDate(db: DB, kind: "purchase" | "session"): string | null {
  const dates =
    kind === "purchase"
      ? db.purchases.map((p) => p.purchaseDate)
      : db.sessions.map((s) => s.sessionDate);
  return dates.length ? dates.slice().sort()[0] ?? null : null;
}

export interface RankRow {
  key: string;
  label: string;
  total: number; // cents
  detail: string;
}

export function spendingBySupplier(db: DB, from: string, to: string, limit = 6): RankRow[] {
  const map = new Map<string, { total: number; count: number }>();
  for (const p of activePurchases(db)) {
    if (!inRange(p.purchaseDate, from, to)) continue;
    const key = p.supplier.trim() || "Sem fornecedor";
    const cur = map.get(key) ?? { total: 0, count: 0 };
    cur.total += p.totalAmount;
    cur.count += 1;
    map.set(key, cur);
  }
  return [...map.entries()]
    .map(([key, v]) => ({ key, label: key, total: v.total, detail: `${v.count} compra${v.count === 1 ? "" : "s"}` }))
    .sort((a, b) => b.total - a.total)
    .slice(0, limit);
}

export function spendingByCategory(db: DB, from: string, to: string, limit = 8): RankRow[] {
  const byId = new Map(db.products.map((p) => [p.id, p]));
  const active = new Map(activePurchases(db).map((p) => [p.id, p]));
  const map = new Map<string, { total: number; packages: number }>();
  for (const item of db.purchaseItems) {
    const purchase = active.get(item.purchaseId);
    if (!purchase || !inRange(purchase.purchaseDate, from, to)) continue;
    const product = byId.get(item.productId);
    const key = product?.category.trim() || "Sem categoria";
    const cur = map.get(key) ?? { total: 0, packages: 0 };
    cur.total += item.unitCost * item.packageQuantity;
    cur.packages += item.packageQuantity;
    map.set(key, cur);
  }
  return [...map.entries()]
    .map(([key, v]) => ({ key, label: key, total: v.total, detail: `${v.packages} embalagem${v.packages === 1 ? "" : "ns"}` }))
    .sort((a, b) => b.total - a.total)
    .slice(0, limit);
}

export interface MoverRow {
  product: Product;
  stats: PriceStats;
  change: number | null;
}

/** Products whose last two purchases differ the most (up or down). */
export function priceMovers(db: DB, limit = 5): MoverRow[] {
  const rows: MoverRow[] = [];
  for (const product of db.products) {
    const stats = priceStats(priceObservations(db, product));
    if (!stats.last || !stats.previous) continue;
    rows.push({ product, stats, change: stats.changePct });
  }
  return rows
    .filter((r) => r.change !== null && Math.abs(r.change ?? 0) > 0.0001)
    .sort((a, b) => Math.abs(b.change ?? 0) - Math.abs(a.change ?? 0))
    .slice(0, limit);
}

export interface ProcedureUsageRow {
  procedureId: string;
  name: string;
  sessions: number;
  attendances: number;
  cost: number;
  lastDate: string | null;
}

export function procedureUsage(db: DB, from: string, to: string): ProcedureUsageRow[] {
  const sessions = confirmedSessions(db).filter((s) => inRange(s.sessionDate, from, to));
  const map = new Map<string, ProcedureUsageRow>();
  for (const s of sessions) {
    const cur =
      map.get(s.procedureId) ??
      ({
        procedureId: s.procedureId,
        name: s.procedureNameSnapshot,
        sessions: 0,
        attendances: 0,
        cost: 0,
        lastDate: null,
      } satisfies ProcedureUsageRow);
    cur.sessions += 1;
    cur.attendances += s.quantity;
    if (!cur.lastDate || s.sessionDate > cur.lastDate) cur.lastDate = s.sessionDate;
    map.set(s.procedureId, cur);
  }
  for (const item of db.consumptionItems) {
    const row = [...map.values()].find((r) => sessions.some((s) => s.id === item.sessionId && s.procedureId === r.procedureId));
    if (row) row.cost += item.totalCost ?? 0;
  }
  return [...map.values()].sort((a, b) => b.attendances - a.attendances);
}

export interface WastageRow {
  product: Product;
  qty: number;
  estimated: number;
  diff: number; // base unit, positive = used more than the recipe says
  diffPct: number | null;
}

export function wastageByProduct(db: DB, from: string, to: string, limit = 6): WastageRow[] {
  const byId = new Map(db.products.map((p) => [p.id, p]));
  const rows: WastageRow[] = [];
  for (const [productId, c] of consumptionByProduct(db, from, to)) {
    const product = byId.get(productId);
    if (!product || c.estimated <= 0) continue;
    const diff = round6(c.qty - c.estimated);
    rows.push({ product, qty: c.qty, estimated: c.estimated, diff, diffPct: c.estimated ? (diff / c.estimated) * 100 : null });
  }
  return rows.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff)).slice(0, limit);
}

export interface PurchaseRow {
  purchase: Purchase;
  items: PurchaseItem[];
  productNames: string;
}

export function purchaseRows(db: DB, opts: { from?: string; to?: string; search?: string; status?: string } = {}): PurchaseRow[] {
  const byId = new Map(db.products.map((p) => [p.id, p]));
  const search = (opts.search ?? "").trim().toLowerCase();
  const rows: PurchaseRow[] = [];
  for (const purchase of db.purchases) {
    if (opts.status && opts.status !== "todos" && purchase.status !== opts.status) continue;
    if (opts.from && purchase.purchaseDate < opts.from) continue;
    if (opts.to && purchase.purchaseDate > opts.to) continue;
    const items = db.purchaseItems.filter((i) => i.purchaseId === purchase.id);
    const productNames = items
      .map((i) => i.productNameSnapshot || byId.get(i.productId)?.name || "")
      .filter(Boolean)
      .join(", ");
    if (search) {
      const haystack = `${purchase.supplier} ${purchase.reference} ${purchase.notes} ${productNames}`.toLowerCase();
      if (!haystack.includes(search)) continue;
    }
    rows.push({ purchase, items, productNames });
  }
  return rows.sort((a, b) =>
    a.purchase.purchaseDate === b.purchase.purchaseDate
      ? a.purchase.createdAt.localeCompare(b.purchase.createdAt)
      : b.purchase.purchaseDate.localeCompare(a.purchase.purchaseDate),
  );
}

export const MOVEMENT_LABEL: Record<MovementType, string> = {
  entrada_compra: "Entrada por compra",
  saida_consumo: "Saída por consumo",
  ajuste_positivo: "Ajuste de entrada",
  ajuste_negativo: "Ajuste de saída",
  reversao: "Estorno",
};

export const MOVEMENT_TONE: Record<MovementType, "success" | "warning" | "destructive" | "muted"> = {
  entrada_compra: "success",
  saida_consumo: "warning",
  ajuste_positivo: "success",
  ajuste_negativo: "warning",
  reversao: "destructive",
};

export function suppliersOf(db: DB): string[] {
  const set = new Set<string>();
  db.purchases.forEach((p) => p.supplier.trim() && set.add(p.supplier.trim()));
  db.products.forEach((p) => p.defaultSupplier.trim() && set.add(p.defaultSupplier.trim()));
  return [...set].sort((a, b) => a.localeCompare(b, "pt-BR"));
}
