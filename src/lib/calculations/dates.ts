export function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function nowISO(): string {
  return new Date().toISOString();
}

export function isValidDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(new Date(s + "T00:00:00").getTime());
}

export function formatDate(s: string | null | undefined): string {
  if (!s) return "—";
  const ymd = s.slice(0, 10);
  const [y, m, d] = ymd.split("-");
  if (!y || !m || !d) return "—";
  return `${d}/${m}/${y}`;
}

export function formatDateTime(s: string | null | undefined): string {
  if (!s) return "—";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
export function monthKey(date: string): string {
  return date.slice(0, 7);
}
export function monthLabel(key: string): string {
  const [y, m] = key.split("-");
  return `${MONTHS[Number(m) - 1]}/${y.slice(2)}`;
}

export type PeriodKey = "1m" | "3m" | "6m" | "12m" | "all";
export const PERIODS: { key: PeriodKey; label: string }[] = [
  { key: "1m", label: "Mês atual" },
  { key: "3m", label: "Últimos 3 meses" },
  { key: "6m", label: "Últimos 6 meses" },
  { key: "12m", label: "Últimos 12 meses" },
  { key: "all", label: "Todo o período" },
];

/** Returns inclusive start date (YYYY-MM-DD) for a period, based on `today`. */
export function periodStart(p: PeriodKey, today = todayISO()): string {
  if (p === "all") return "0000-01-01";
  const months = { "1m": 0, "3m": 2, "6m": 5, "12m": 11 }[p];
  const [y, m] = today.split("-").map(Number);
  const d = new Date(y, m - 1 - months, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

/** List of month keys between two dates inclusive. */
export function monthRange(from: string, to: string): string[] {
  const out: string[] = [];
  let [y, m] = from.slice(0, 7).split("-").map(Number);
  const [ty, tm] = to.slice(0, 7).split("-").map(Number);
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
    if (out.length > 240) break;
  }
  return out;
}
