import type { BaseUnit, ContentUnit } from "@/types";

const FACTORS: Record<ContentUnit, { base: BaseUnit; factor: number }> = {
  ml: { base: "ml", factor: 1 },
  l: { base: "ml", factor: 1000 },
  g: { base: "g", factor: 1 },
  kg: { base: "g", factor: 1000 },
  un: { base: "un", factor: 1 },
};

export const CONTENT_UNITS: ContentUnit[] = ["ml", "l", "g", "kg", "un"];

export const UNIT_LABEL: Record<ContentUnit, string> = {
  ml: "ml",
  l: "litro(s)",
  g: "g",
  kg: "kg",
  un: "unidade(s)",
};

export function baseUnitOf(u: ContentUnit): BaseUnit {
  return FACTORS[u].base;
}

export function areCompatible(a: ContentUnit, b: ContentUnit): boolean {
  return FACTORS[a].base === FACTORS[b].base;
}

/** Units the user may pick when entering a quantity for a product with content unit `u`. */
export function compatibleUnits(u: ContentUnit): ContentUnit[] {
  return CONTENT_UNITS.filter((x) => areCompatible(x, u));
}

/** Converts to base unit. Throws for incompatible units (e.g. g → ml without density). */
export function toBase(qty: number, from: ContentUnit, expectedBase?: BaseUnit): number {
  const f = FACTORS[from];
  if (expectedBase && f.base !== expectedBase) {
    throw new Error(`Unidade incompatível: ${from} não pode ser convertida para ${expectedBase}.`);
  }
  return round6(qty * f.factor);
}

export function round6(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}
