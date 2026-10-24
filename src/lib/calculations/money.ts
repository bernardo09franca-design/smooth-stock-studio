// All money values are integer cents. Conversions and rounding live here.

export function toCents(reais: number): number {
  if (!Number.isFinite(reais)) throw new Error("Valor monetário inválido.");
  return Math.round(reais * 100 + Number.EPSILON * Math.sign(reais));
}

/** Parses "19,90", "1.234,56", "19.90" → cents. Returns null when invalid. */
export function parseMoney(input: string): number | null {
  const s = input.trim().replace(/\s|R\$/g, "");
  if (!s) return null;
  let norm = s;
  if (s.includes(",")) norm = s.replace(/\./g, "").replace(",", ".");
  if (!/^-?\d+(\.\d+)?$/.test(norm)) return null;
  const n = Number(norm);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function formatMoney(cents: number | null | undefined): string {
  if (cents === null || cents === undefined || !Number.isFinite(cents)) return "—";
  return brl.format(cents / 100);
}

/** For fractional cents per unit (e.g. R$ 0,0400 por ml). */
export function formatUnitCost(centsPerUnit: number | null | undefined, unit: string): string {
  if (centsPerUnit === null || centsPerUnit === undefined || !Number.isFinite(centsPerUnit)) return "—";
  const reais = centsPerUnit / 100;
  const digits = reais >= 1 ? 2 : 4;
  return `${new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: digits, maximumFractionDigits: digits }).format(reais)}/${unit}`;
}

/** Distributes `total` cents across weights without losing a cent (largest remainder). */
export function allocateCents(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (total === 0 || sum <= 0) return weights.map(() => 0);
  const raw = weights.map((w) => (total * w) / sum);
  const floors = raw.map(Math.floor);
  let rest = total - floors.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => ({ i, frac: r - Math.floor(r) })).sort((a, b) => b.frac - a.frac);
  for (const o of order) {
    if (rest <= 0) break;
    floors[o.i] = (floors[o.i] ?? 0) + 1;
    rest -= 1;
  }
  return floors;
}

export function percentChange(prev: number, curr: number): number | null {
  if (!prev) return null;
  return ((curr - prev) / prev) * 100;
}

export function formatPercent(p: number | null): string {
  if (p === null || !Number.isFinite(p)) return "—";
  const s = p > 0 ? "+" : "";
  return `${s}${p.toLocaleString("pt-BR", { maximumFractionDigits: 1, minimumFractionDigits: 1 })}%`;
}

export function formatNumber(n: number, max = 2): string {
  return n.toLocaleString("pt-BR", { maximumFractionDigits: max });
}
