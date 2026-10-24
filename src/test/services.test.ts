import { describe, expect, it } from "vitest";

import { emptyDB } from "@/lib/storage/db";
import { createProduct, adjustStock, deleteProduct, updateProduct, type ProductInput } from "@/features/products/service";
import { createPurchase, cancelPurchase, correctPurchase, type PurchaseInput } from "@/features/purchases/service";
import { saveProcedure, registerSession, cancelSession, correctSession, recipeCost, deleteProcedure, type SessionInput } from "@/features/procedures/service";
import { buildBackup, parseBackup } from "@/lib/services/backup";
import { stockByProduct } from "@/lib/calculations/stock";
import type { DB, Product } from "@/types";

const base: ProductInput = {
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
};

function studio(): { db: DB; product: Product } {
  const created = createProduct(emptyDB(), base);
  const db = created.db;
  return { db, product: db.products[0]! };
}

function purchaseOf(db: DB, product: Product, over: Partial<PurchaseInput> = {}): DB {
  return createPurchase(db, {
    purchaseDate: "2025-01-10",
    supplier: "Distribuidora",
    reference: "NF-1",
    notes: "",
    shippingCents: 0,
    items: [{ productId: product.id, packageQuantity: 2, contentQuantity: 500, contentUnit: "ml", totalPaid: 4000, discount: 0 }],
    ...over,
  }).db;
}

describe("products", () => {
  it("rejects a product without a name or packaging unit", () => {
    expect(() => createProduct(emptyDB(), { ...base, name: "  " })).toThrow(/nome/i);
    expect(() => createProduct(emptyDB(), { ...base, packagingUnit: "" })).toThrow(/unidade de controle/i);
  });

  it("does not create the same product twice", () => {
    const { db } = studio();
    expect(() => createProduct(db, base)).toThrow(/já existe/i);
  });

  it("inactivating keeps the product and its history", () => {
    const { db, product } = studio();
    const next = createPurchase(db, {
      purchaseDate: "2025-01-10",
      supplier: "",
      reference: "",
      notes: "",
      shippingCents: 0,
      items: [{ productId: product.id, packageQuantity: 1, contentQuantity: 500, contentUnit: "ml", totalPaid: 2000, discount: 0 }],
    }).db;
    const inactivated = { ...next, products: next.products.map((p) => ({ ...p, active: false })) };
    expect(inactivated.products[0]?.active).toBe(false);
    expect(inactivated.movements).toHaveLength(1);
  });

  it("refuses to delete a product that has history, but allows a clean one", () => {
    const { db, product } = studio();
    const withHistory = purchaseOf(db, product);
    expect(() => deleteProduct(withHistory, product.id)).toThrow(/histórico/i);
    const { db: clean, product: cleanProduct } = studio();
    expect(deleteProduct(clean, cleanProduct.id).products).toHaveLength(0);
  });

  it("blocks a unit change that would corrupt history", () => {
    const { db, product } = studio();
    const withHistory = purchaseOf(db, product);
    expect(() => updateProduct(withHistory, product.id, { ...base, contentUnit: "g" })).toThrow(/unidade incompatível/i);
  });
});

describe("purchases", () => {
  it("raises stock by the content received, not by the package count", () => {
    const { db, product } = studio();
    const next = purchaseOf(db, product);
    expect(stockByProduct(next).get(product.id)?.quantity).toBe(1000);
    expect(next.movements.filter((m) => m.movementType === "entrada_compra")).toHaveLength(1);
  });

  it("registers the same submission only once", () => {
    const { db, product } = studio();
    const input: PurchaseInput = {
      purchaseDate: "2025-01-10",
      supplier: "",
      reference: "",
      notes: "",
      shippingCents: 0,
      items: [{ productId: product.id, packageQuantity: 2, contentQuantity: 500, contentUnit: "ml", totalPaid: 4000, discount: 0 }],
    };
    const first = createPurchase(db, input, "chave-1");
    const second = createPurchase(first.db, input, "chave-1");
    expect(second.db.movements).toHaveLength(first.db.movements.length);
    expect(second.db.purchases).toHaveLength(1);
  });

  it("cancelling returns stock and never duplicates entries", () => {
    const { db, product } = studio();
    const next = purchaseOf(db, product);
    const cancelled = cancelPurchase(next, next.purchases[0]!.id, "Erro de lançamento", { date: "2025-01-11" });
    expect(stockByProduct(cancelled.db).get(product.id)?.quantity).toBe(0);
    expect(cancelled.db.movements.filter((m) => m.movementType === "reversao")).toHaveLength(1);
    expect(cancelled.db.purchases[0]?.status).toBe("cancelada");
    expect(() => cancelPurchase(cancelled.db, next.purchases[0]!.id, "de novo", { date: "2025-01-12" })).toThrow(/já foi cancelada/i);
  });

  it("correcting swaps the value once and keeps the original for history", () => {
    const { db, product } = studio();
    const next = purchaseOf(db, product);
    const corrected = correctPurchase(
      next,
      next.purchases[0]!.id,
      {
        purchaseDate: "2025-01-10",
        supplier: "Distribuidora",
        reference: "NF-1",
        notes: "",
        shippingCents: 0,
        items: [{ productId: product.id, packageQuantity: 2, contentQuantity: 500, contentUnit: "ml", totalPaid: 6000, discount: 0 }],
      },
      "chave-2",
    );
    expect(stockByProduct(corrected.db).get(product.id)?.quantity).toBe(1000);
    expect(stockByProduct(corrected.db).get(product.id)?.avgCost).toBe(6);
    expect(corrected.db.purchases.find((p) => p.id === next.purchases[0]!.id)?.status).toBe("corrigida");
    expect(corrected.db.movements.filter((m) => m.movementType === "entrada_compra")).toHaveLength(2);
    // the original amount is preserved untouched
    expect(corrected.db.purchaseItems.find((i) => i.purchaseId === next.purchases[0]!.id)?.totalPaid).toBe(4000);
  });

  it("requires explicit consent before a cancellation drives stock negative", () => {
    const { db, product } = studio();
    const next = purchaseOf(db, product);
    const consumed = registerSession(
      next,
      {
        procedureId: saveProcedure(next, { name: "Tratamento A", description: "", estimatedDuration: null, active: true, recipe: [{ productId: product.id, quantity: 20, unit: "ml" }] }).db.procedures[0]!.id,
        sessionDate: "2025-01-12",
        quantity: 1,
        notes: "",
        items: [{ productId: product.id, quantity: 1000, unit: "ml", estimatedQuantity: 20 }],
      },
    ).db;
    expect(() => cancelPurchase(consumed, next.purchases[0]!.id, "Erro", { date: "2025-01-13" })).toThrow(/negativo/i);
    const forced = cancelPurchase(consumed, next.purchases[0]!.id, "Erro", { date: "2025-01-13", allowNegative: true });
    expect(stockByProduct(forced.db).get(product.id)?.quantity).toBe(-1000);
  });

  it("rejects invalid amounts and incompatible units", () => {
    const { db, product } = studio();
    expect(() =>
      createPurchase(db, {
        purchaseDate: "2025-01-10",
        supplier: "",
        reference: "",
        notes: "",
        shippingCents: 0,
        items: [{ productId: product.id, packageQuantity: 1, contentQuantity: 500, contentUnit: "g", totalPaid: 2000, discount: 0 }],
      }),
    ).toThrow(/incompatível/i);
    expect(() =>
      createPurchase(db, {
        purchaseDate: "2025-01-10",
        supplier: "",
        reference: "",
        notes: "",
        shippingCents: 0,
        items: [{ productId: product.id, packageQuantity: 1, contentQuantity: 500, contentUnit: "ml", totalPaid: 2000, discount: 2000 }],
      }),
    ).toThrow(/desconto/i);
  });
});

describe("procedures and consumption", () => {
  function withRecipe() {
    const { db, product } = studio();
    const bought = purchaseOf(db, product);
    const proc = saveProcedure(bought, {
      name: "Tratamento A",
      description: "",
      estimatedDuration: 30,
      active: true,
      recipe: [{ productId: product.id, quantity: 20, unit: "ml" }],
    });
    return { db: proc.db, product, procedure: proc.result! };
  }

  function sessionOf(procedureId: string, product: Product, over: Partial<SessionInput> = {}): SessionInput {
    return {
      procedureId,
      sessionDate: "2025-01-15",
      quantity: 1,
      notes: "",
      items: [{ productId: product.id, quantity: 20, unit: "ml", estimatedQuantity: 20 }],
      ...over,
    };
  }

  it("calculates the estimated cost of a recipe from current costs", () => {
    const { db, procedure } = withRecipe();
    const cost = recipeCost(db, procedure.id);
    expect(cost.total).toBe(80); // 20 ml × R$ 0,04
    expect(cost.missing).toEqual([]);
    expect(recipeCost(db, procedure.id, 3).total).toBe(240);
  });

  it("reports an incomplete cost instead of assuming zero", () => {
    const { db, product, procedure } = withRecipe();
    const noCost = createProduct(db, { ...base, name: "Pó calmante", contentUnit: "g", contentQuantity: 250 });
    const withSecond = saveProcedure(noCost.db, {
      name: "Tratamento A",
      description: "",
      estimatedDuration: 30,
      active: true,
      recipe: [
        { productId: product.id, quantity: 20, unit: "ml" },
        { productId: noCost.result!.id, quantity: 5, unit: "g" },
      ],
    });
    const cost = recipeCost(withSecond.db, procedure.id);
    expect(cost.total).toBeNull();
    expect(cost.partial).toBe(80);
    expect(cost.missing).toEqual(["Pó calmante"]);
  });

  it("registering an attendance lowers stock by the real amount used", () => {
    const { db, product, procedure } = withRecipe();
    const next = registerSession(db, sessionOf(procedure.id, product, { items: [{ productId: product.id, quantity: 25, unit: "ml", estimatedQuantity: 20 }] }));
    expect(stockByProduct(next.db).get(product.id)?.quantity).toBe(975);
    expect(next.db.consumptionItems[0]?.quantity).toBe(25);
    expect(next.db.consumptionItems[0]?.estimatedQuantity).toBe(20);
    expect(next.db.consumptionItems[0]?.totalCost).toBe(100);
  });

  it("keeps the cost recorded on the day, even when prices change later", () => {
    const { db, product, procedure } = withRecipe();
    const booked = registerSession(db, sessionOf(procedure.id, product), "sess-1");
    const before = booked.db.consumptionItems[0]!;
    const later = purchaseOf(booked.db, product, {
      purchaseDate: "2025-02-10",
      items: [{ productId: product.id, packageQuantity: 2, contentQuantity: 500, contentUnit: "ml", totalPaid: 8000, discount: 0 }],
    });
    const kept = later.consumptionItems.find((c) => c.id === before.id)!;
    expect(kept.unitCostAtConsumption).toBe(4);
    expect(kept.totalCost).toBe(80);
    expect(stockByProduct(later).get(product.id)?.avgCost).toBe(6);
  });

  it("registering the same attendance twice does not double the stock drop", () => {
    const { db, product, procedure } = withRecipe();
    const first = registerSession(db, sessionOf(procedure.id, product), "sess-2");
    const second = registerSession(first.db, sessionOf(procedure.id, product), "sess-2");
    expect(second.db.sessions).toHaveLength(1);
    expect(stockByProduct(second.db).get(product.id)?.quantity).toBe(980);
  });

  it("cancelling an attendance puts the products back", () => {
    const { db, product, procedure } = withRecipe();
    const booked = registerSession(db, sessionOf(procedure.id, product), "sess-3");
    const cancelled = cancelSession(booked.db, booked.result!.id, "Cliente desmarcou", "2025-01-16");
    expect(stockByProduct(cancelled.db).get(product.id)?.quantity).toBe(1000);
    expect(cancelled.db.sessions[0]?.status).toBe("cancelado");
    expect(cancelled.db.movements.filter((m) => m.movementType === "reversao")).toHaveLength(1);
  });

  it("correcting an attendance moves stock only by the difference", () => {
    const { db, product, procedure } = withRecipe();
    const booked = registerSession(db, sessionOf(procedure.id, product), "sess-4");
    const fixed = correctSession(
      booked.db,
      booked.result!.id,
      sessionOf(procedure.id, product, { items: [{ productId: product.id, quantity: 30, unit: "ml", estimatedQuantity: 20 }] }),
      "sess-4-fix",
    );
    expect(stockByProduct(fixed.db).get(product.id)?.quantity).toBe(970);
    expect(fixed.db.sessions.filter((s) => s.status === "confirmado")).toHaveLength(1);
    expect(fixed.db.sessions.filter((s) => s.status === "corrigido")).toHaveLength(1);
  });

  it("needs an explicit authorisation and a reason to go below zero", () => {
    const { db, product, procedure } = withRecipe();
    expect(() => registerSession(db, sessionOf(procedure.id, product, { items: [{ productId: product.id, quantity: 1500, unit: "ml", estimatedQuantity: 20 }] }))).toThrow(
      /estoque insuficiente/i,
    );
    expect(() =>
      registerSession(db, sessionOf(procedure.id, product, { items: [{ productId: product.id, quantity: 1500, unit: "ml", estimatedQuantity: 20 }], allowNegative: true })),
    ).toThrow(/justificativa/i);
    const ok = registerSession(
      db,
      sessionOf(procedure.id, product, {
        items: [{ productId: product.id, quantity: 1500, unit: "ml", estimatedQuantity: 20 }],
        allowNegative: true,
        negativeJustification: "Compra chega amanhã",
      }),
    );
    expect(stockByProduct(ok.db).get(product.id)?.quantity).toBe(-500);
  });

  it("refuses to delete a procedure that already has attendances", () => {
    const { db, product, procedure } = withRecipe();
    const booked = registerSession(db, sessionOf(procedure.id, product), "sess-5");
    expect(() => deleteProcedure(booked.db, procedure.id)).toThrow(/atendimentos registrados/i);
  });
});

describe("manual adjustments", () => {
  it("records an identifiable movement and needs a reason", () => {
    const { db, product } = studio();
    expect(() => adjustStock(db, { productId: product.id, direction: "out", quantity: 10, unit: "ml", date: "2025-01-20", reason: "" })).toThrow(/motivo/i);
    const next = adjustStock(db, { productId: product.id, direction: "out", quantity: 10, unit: "ml", date: "2025-01-20", reason: "Amostra" });
    const m = next.db.movements[0]!;
    expect(m.movementType).toBe("ajuste_negativo");
    expect(m.quantity).toBe(-10);
    expect(m.notes).toBe("Amostra");
  });

  it("converts the adjustment unit before applying it", () => {
    const { db, product } = studio();
    const next = adjustStock(db, { productId: product.id, direction: "in", quantity: 1, unit: "l", date: "2025-01-20", reason: "Sobra de sala" });
    expect(stockByProduct(next.db).get(product.id)?.quantity).toBe(1000);
  });
});

describe("backup", () => {
  it("round-trips the whole dataset through the backup file", () => {
    const { db, product, procedure } = (() => {
      const s = studio();
      const bought = purchaseOf(s.db, s.product);
      const p = saveProcedure(bought, { name: "Tratamento A", description: "", estimatedDuration: null, active: true, recipe: [{ productId: s.product.id, quantity: 20, unit: "ml" }] });
      return { db: p.db, product: s.product, procedure: p.result! };
    })();
    const withSession = registerSession(db, {
      procedureId: procedure.id,
      sessionDate: "2025-01-15",
      quantity: 1,
      notes: "",
      items: [{ productId: product.id, quantity: 20, unit: "ml", estimatedQuantity: 20 }],
    }).db;

    const json = JSON.stringify(buildBackup(withSession));
    const restored = parseBackup(json);
    expect(restored.products).toHaveLength(1);
    expect(restored.purchases).toHaveLength(1);
    expect(restored.sessions).toHaveLength(1);
    expect(restored.movements).toHaveLength(withSession.movements.length);
    expect(stockByProduct(restored).get(product.id)?.quantity).toBe(980);
  });

  it("rejects files that are not a backup without touching the data", () => {
    expect(() => parseBackup("nada de json")).toThrow(/JSON válido/i);
    expect(() => parseBackup(JSON.stringify({ app: "outro", schemaVersion: 1, data: emptyDB() }))).toThrow(/outro sistema/i);
    expect(() => parseBackup(JSON.stringify({ schemaVersion: 1 }))).toThrow(/backup/i);
  });
});
