import { describe, expect, it } from "vitest";

import { allocateCents, formatMoney, parseMoney, percentChange, toCents } from "@/lib/calculations/money";
import { areCompatible, baseUnitOf, compatibleUnits, toBase } from "@/lib/calculations/units";
import { computePurchase } from "@/lib/calculations/purchase";
import { computeStock, packagesFromBase, stockStatus } from "@/lib/calculations/stock";
import { monthlyPrices, priceObservations, priceStats } from "@/lib/calculations/prices";
import { emptyDB } from "@/lib/storage/db";
import { createProduct, type ProductInput } from "@/features/products/service";
import { createPurchase, type PurchaseInput } from "@/features/purchases/service";
import type { DB, Product, StockMovement } from "@/types";

const brl = (s: string) => s.replace(/\u00a0/g, " ");

function productInput(over: Partial<ProductInput> = {}): ProductInput {
  return {
    name: "Loção",
    category: "Cera",
    brand: "Marca",
    description: "",
    packagingUnit: "frasco",
    contentQuantity: 500,
    contentUnit: "ml",
    minimumStock: 2,
    defaultSupplier: "",
    notes: "",
    active: true,
    ...over,
  };
}

/** One product, optionally with one active purchase (cents). */
function withPurchase(input: Partial<PurchaseInput> = {}, product: Partial<ProductInput> = {}): { db: DB; product: Product } {
  const created = createProduct(emptyDB(), productInput(product));
  const db = created.db;
  const purchase = createPurchase(db, {
    purchaseDate: "2025-01-10",
    supplier: "Distribuidora",
    reference: "NF-1",
    notes: "",
    shippingCents: 0,
    items: [{ productId: db.products[0]!.id, packageQuantity: 2, contentQuantity: 500, contentUnit: "ml", totalPaid: 4000, discount: 0 }],
    ...input,
  });
  return { db: purchase.db, product: db.products[0]! };
}

describe("money", () => {
  it("parses Brazilian amount strings into integer cents", () => {
    expect(parseMoney("19,90")).toBe(1990);
    expect(parseMoney("R$ 1.234,56")).toBe(123456);
    expect(parseMoney("19.90")).toBe(1990);
    expect(parseMoney("")).toBeNull();
    expect(parseMoney("abc")).toBeNull();
  });

  it("formats cents as Brazilian reais", () => {
    expect(brl(formatMoney(1990))).toBe("R$ 19,90");
    expect(formatMoney(null)).toBe("—");
  });

  it("rounds float amounts to the nearest cent", () => {
    expect(toCents(0.1 + 0.2)).toBe(30);
    expect(toCents(19.9)).toBe(1990);
  });

  it("distributes cents without losing or inventing any", () => {
    const parts = allocateCents(100, [1, 1, 1]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(100);
    const weighted = allocateCents(1000, [3, 1]);
    expect(weighted).toEqual([750, 250]);
    expect(allocateCents(0, [5, 5])).toEqual([0, 0]);
  });

  it("computes percentage variation", () => {
    expect(percentChange(4, 6)).toBe(50);
    expect(percentChange(0, 5)).toBeNull();
  });
});

describe("units", () => {
  it("converts compatible units to a common base", () => {
    expect(toBase(1, "l")).toBe(1000);
    expect(toBase(1, "kg")).toBe(1000);
    expect(baseUnitOf("l")).toBe("ml");
    expect(baseUnitOf("kg")).toBe("g");
  });

  it("never mixes grams with millilitres", () => {
    expect(areCompatible("g", "ml")).toBe(false);
    expect(() => toBase(100, "g", "ml")).toThrow();
    expect(compatibleUnits("ml")).toEqual(["ml", "l"]);
    expect(compatibleUnits("un")).toEqual(["un"]);
  });
});

describe("purchase cost math", () => {
  it("matches the worked example: 2 frascos de 500 ml por R$ 40,00", () => {
    const { items, total } = computePurchase([{ packageQuantity: 2, contentQuantity: 500, contentUnit: "ml", totalPaid: 4000, discount: 0 }]);
    expect(items[0]?.unitCost).toBe(2000); // R$ 20,00 por frasco
    expect(items[0]?.baseQuantity).toBe(1000); // 1.000 ml
    expect(items[0]?.normalizedUnitCost).toBe(4); // R$ 0,04 por ml
    expect(total).toBe(4000);
  });

  it("uses the amount actually paid, after discount, and spreads shipping without losing a cent", () => {
    const items = [
      { packageQuantity: 1, contentQuantity: 500, contentUnit: "ml" as const, totalPaid: 3000, discount: 500 },
      { packageQuantity: 1, contentQuantity: 1000, contentUnit: "ml" as const, totalPaid: 6000, discount: 0 },
    ];
    const { items: computed, total } = computePurchase(items, 100);
    expect(computed[0]?.net).toBe(2500);
    expect(computed[1]?.net).toBe(6000);
    expect(computed[0]?.allocatedShipping).toBe(29);
    expect(computed[1]?.allocatedShipping).toBe(71);
    expect(total).toBe(2500 + 6000 + 100);
    // cost per ml includes the shipping share: (2500 + 29) / 500
    expect(computed[0]?.normalizedUnitCost).toBeCloseTo(2529 / 500, 6);
  });

  it("does not count the same purchase value twice", () => {
    const { items, total } = computePurchase([{ packageQuantity: 3, contentQuantity: 250, contentUnit: "g", totalPaid: 9000, discount: 0 }]);
    expect(items[0]?.unitCost).toBe(3000);
    expect(items[0]?.normalizedUnitCost).toBe(12); // 9000 / 750 g
    expect(total).toBe(9000);
  });
});

describe("stock", () => {
  const mv = (over: Partial<StockMovement>): StockMovement => ({
    id: Math.random().toString(36).slice(2),
    productId: "p1",
    movementType: "entrada_compra",
    quantity: 1000,
    unit: "ml",
    unitCost: 4,
    movementDate: "2025-01-10",
    sourceType: "compra",
    sourceId: "c1",
    notes: "",
    createdAt: "2025-01-10T10:00:00.000Z",
    ...over,
  });

  it("uses moving weighted average cost across equivalent purchases", () => {
    const s = computeStock([mv({ quantity: 1000, unitCost: 4 }), mv({ movementDate: "2025-02-10", quantity: 1000, unitCost: 6 })]);
    expect(s.quantity).toBe(2000);
    expect(s.avgCost).toBe(5); // (4000 + 6000) / 2000
  });

  it("lets consumption leave at the current average without changing it", () => {
    const s = computeStock([
      mv({ quantity: 1000, unitCost: 4 }),
      mv({ quantity: 1000, unitCost: 6 }),
      mv({ movementType: "saida_consumo", quantity: -500, unitCost: 5, movementDate: "2025-03-01", sourceType: "atendimento" }),
    ]);
    expect(s.quantity).toBe(1500);
    expect(s.avgCost).toBe(5);
  });

  it("reverses a purchase exactly, restoring both quantity and average", () => {
    const s = computeStock([
      mv({ quantity: 1000, unitCost: 4 }),
      mv({ movementDate: "2025-02-10", quantity: 1000, unitCost: 6 }),
      mv({ movementType: "reversao", quantity: -1000, unitCost: 6, movementDate: "2025-02-20" }),
    ]);
    expect(s.quantity).toBe(1000);
    expect(s.avgCost).toBe(4);
  });

  it("keeps unvalued initial stock unpriced instead of inventing a cost", () => {
    const s = computeStock([mv({ movementType: "ajuste_positivo", quantity: 300, unitCost: null, sourceType: "estoque_inicial" })]);
    expect(s.quantity).toBe(300);
    expect(s.avgCost).toBeNull();
  });

  it("classifies the stock situation against the minimum", () => {
    const product = createProduct(emptyDB(), productInput({ minimumStock: 2 })).db.products[0]!;
    expect(stockStatus(product, 0)).toBe("sem_estoque");
    expect(stockStatus(product, -5)).toBe("negativo");
    expect(stockStatus(product, 1000)).toBe("baixo"); // 2 frascos = no mínimo
    expect(stockStatus(product, 1500)).toBe("ok");
    expect(packagesFromBase(product, 1500)).toBe(3);
  });
});

describe("price history", () => {
  it("compares different package sizes on a common base", () => {
    const created = createProduct(emptyDB(), productInput());
    const product = created.db.products[0]!;
    const first = createPurchase(created.db, {
      purchaseDate: "2025-01-10",
      supplier: "Distribuidora",
      reference: "NF-1",
      notes: "",
      shippingCents: 0,
      items: [{ productId: product.id, packageQuantity: 1, contentQuantity: 500, contentUnit: "ml", totalPaid: 2000, discount: 0 }],
    });
    const second = createPurchase(first.db, {
      purchaseDate: "2025-02-10",
      supplier: "Distribuidora",
      reference: "NF-2",
      notes: "",
      shippingCents: 0,
      items: [{ productId: product.id, packageQuantity: 1, contentQuantity: 1, contentUnit: "l", totalPaid: 3600, discount: 0 }],
    });
    const obs = priceObservations(second.db, product);
    expect(obs).toHaveLength(2);
    expect(obs[0]?.normalizedUnitCost).toBe(4); // R$ 0,04/ml
    expect(obs[1]?.normalizedUnitCost).toBe(3.6); // R$ 0,036/ml
    const stats = priceStats(obs);
    expect(stats.min?.normalizedUnitCost).toBe(3.6);
    expect(stats.max?.normalizedUnitCost).toBe(4);
    expect(stats.last?.normalizedUnitCost).toBe(3.6);
    expect(stats.changePct).toBeCloseTo(-10, 6);
  });

  it("shows months without purchases as missing, never as zero", () => {
    const { db, product } = withPurchase({ purchaseDate: "2025-01-10" });
    const second = createPurchase(db, {
      purchaseDate: "2025-03-05",
      supplier: "Distribuidora",
      reference: "NF-2",
      notes: "",
      shippingCents: 0,
      items: [{ productId: product.id, packageQuantity: 2, contentQuantity: 500, contentUnit: "ml", totalPaid: 6000, discount: 0 }],
    });
    const obs = priceObservations(second.db, product);
    const months = monthlyPrices(obs, "2025-01-01", "2025-03-31");
    expect(months.map((m) => m.month)).toEqual(["2025-01", "2025-02", "2025-03"]);
    expect(months[1]?.avgNormalized).toBeNull();
    expect(months[1]?.count).toBe(0);
    expect(months[0]?.avgNormalized).toBe(4);
    expect(months[2]?.avgNormalized).toBe(6);
  });

  it("excludes cancelled purchases from the history", () => {
    const { db, product } = withPurchase();
    const obs = priceObservations({ ...db, purchases: db.purchases.map((p) => ({ ...p, status: "cancelada" as const })) }, product);
    expect(obs).toHaveLength(0);
  });

  it("records the real date and supplier of each purchase", () => {
    const { db, product } = withPurchase({ purchaseDate: "2025-04-02", supplier: "Casa da Estética", reference: "NF-77" });
    const obs = priceObservations(db, product);
    expect(obs[0]?.date).toBe("2025-04-02");
    expect(obs[0]?.supplier).toBe("Casa da Estética");
    expect(obs[0]?.reference).toBe("NF-77");
    expect(obs[0]?.packageContentLabel).toBe("500 ml");
    expect(obs[0]?.packageCost).toBe(2000);
  });
});
