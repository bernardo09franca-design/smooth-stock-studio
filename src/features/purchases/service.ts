import type { ContentUnit, DB, Purchase, PurchaseItem, StockMovement } from "@/types";
import { isValidDate, nowISO } from "@/lib/calculations/dates";
import { computePurchase } from "@/lib/calculations/purchase";
import { stockByProduct } from "@/lib/calculations/stock";
import { areCompatible, baseUnitOf } from "@/lib/calculations/units";
import { alreadyProcessed, assert, isPositive, markProcessed, uid } from "@/lib/services/common";

export interface PurchaseInput {
  purchaseDate: string;
  supplier: string;
  reference: string;
  notes: string;
  shippingCents: number;
  items: { productId: string; packageQuantity: number; contentQuantity: number; contentUnit: ContentUnit; totalPaid: number; discount: number }[];
}

function buildPurchase(db: DB, input: PurchaseInput, replacesId?: string) {
  assert(isValidDate(input.purchaseDate), "Informe uma data de compra válida.");
  assert(input.items.length > 0, "Adicione pelo menos um item à compra.");
  assert(Number.isInteger(input.shippingCents) && input.shippingCents >= 0, "Frete/custos adicionais inválidos.");
  input.items.forEach((it, i) => {
    const n = i + 1;
    const p = db.products.find((x) => x.id === it.productId);
    assert(p, `Item ${n}: selecione um produto.`);
    assert(isPositive(it.packageQuantity), `Item ${n}: a quantidade de embalagens deve ser maior que zero.`);
    assert(isPositive(it.contentQuantity), `Item ${n}: o conteúdo por embalagem deve ser maior que zero.`);
    assert(areCompatible(it.contentUnit, p.contentUnit), `Item ${n}: unidade ${it.contentUnit} é incompatível com ${p.contentUnit} do produto.`);
    assert(Number.isInteger(it.totalPaid) && it.totalPaid > 0, `Item ${n}: informe o valor pago.`);
    assert(Number.isInteger(it.discount) && it.discount >= 0, `Item ${n}: desconto inválido.`);
    assert(it.discount < it.totalPaid, `Item ${n}: o desconto não pode ser maior ou igual ao valor pago.`);
  });
  const calc = computePurchase(input.items, input.shippingCents);
  const now = nowISO();
  const purchase: Purchase = {
    id: uid(),
    purchaseDate: input.purchaseDate,
    supplier: input.supplier.trim(),
    reference: input.reference.trim(),
    notes: input.notes.trim(),
    shippingCents: input.shippingCents,
    totalAmount: calc.total,
    status: "ativa",
    replacesId,
    createdAt: now,
    updatedAt: now,
  };
  const items: PurchaseItem[] = input.items.map((it, i) => {
    const p = db.products.find((x) => x.id === it.productId)!;
    const c = calc.items[i]!;
    return {
      id: uid(),
      purchaseId: purchase.id,
      productId: it.productId,
      productNameSnapshot: p.name,
      packageQuantity: it.packageQuantity,
      contentQuantity: it.contentQuantity,
      contentUnit: it.contentUnit,
      totalPaid: it.totalPaid,
      discount: it.discount,
      allocatedShipping: c.allocatedShipping,
      unitCost: c.unitCost,
      normalizedUnitCost: c.normalizedUnitCost,
      baseQuantity: c.baseQuantity,
      createdAt: now,
    };
  });
  const movements: StockMovement[] = items.map((it) => ({
    id: uid(),
    productId: it.productId,
    movementType: "entrada_compra",
    quantity: it.baseQuantity,
    unit: baseUnitOf(it.contentUnit),
    unitCost: it.normalizedUnitCost,
    movementDate: purchase.purchaseDate,
    sourceType: "compra",
    sourceId: purchase.id,
    notes: `Compra ${purchase.reference || ""}`.trim(),
    createdAt: now,
  }));
  return { purchase, items, movements };
}

/** Create = validate → purchase + items + entry movements, all in one atomic state change. */
export function createPurchase(db: DB, input: PurchaseInput, submissionId?: string): { db: DB; result?: Purchase } {
  if (alreadyProcessed(db, submissionId)) return { db };
  const { purchase, items, movements } = buildPurchase(db, input);
  return {
    db: {
      ...db,
      purchases: [...db.purchases, purchase],
      purchaseItems: [...db.purchaseItems, ...items],
      movements: [...db.movements, ...movements],
      processedSubmissions: markProcessed(db, submissionId),
    },
    result: purchase,
  };
}

function reversalMovements(db: DB, purchaseId: string, note: string, date: string): StockMovement[] {
  const now = nowISO();
  return db.movements
    .filter((m) => m.sourceType === "compra" && m.sourceId === purchaseId && m.movementType === "entrada_compra")
    .map((m) => ({
      id: uid(),
      productId: m.productId,
      movementType: "reversao" as const,
      quantity: -m.quantity,
      unit: m.unit,
      unitCost: m.unitCost,
      movementDate: date,
      sourceType: "compra" as const,
      sourceId: purchaseId,
      notes: note,
      createdAt: now,
    }));
}

function negativeAfter(db: DB, extra: StockMovement[]): string[] {
  const stock = stockByProduct({ ...db, movements: [...db.movements, ...extra] });
  const ids = new Set(extra.map((m) => m.productId));
  return [...ids].filter((id) => (stock.get(id)?.quantity ?? 0) < 0).map((id) => db.products.find((p) => p.id === id)?.name ?? id);
}

export function cancelPurchase(db: DB, id: string, reason: string, opts: { allowNegative?: boolean; date: string }): { db: DB } {
  const p = db.purchases.find((x) => x.id === id);
  assert(p, "Compra não encontrada.");
  assert(p.status === "ativa", "Esta compra já foi cancelada ou corrigida.");
  assert(reason.trim().length > 0, "Informe o motivo do cancelamento.");
  const rev = reversalMovements(db, id, `Cancelamento de compra: ${reason.trim()}`, opts.date);
  const neg = negativeAfter(db, rev);
  if (neg.length) assert(opts.allowNegative, `O cancelamento deixará estoque negativo em: ${neg.join(", ")}. Confirme para continuar.`);
  return {
    db: {
      ...db,
      purchases: db.purchases.map((x) => (x.id === id ? { ...x, status: "cancelada", notes: [x.notes, `Cancelada: ${reason.trim()}`].filter(Boolean).join(" · "), updatedAt: nowISO() } : x)),
      movements: [...db.movements, ...rev],
    },
  };
}

/** Correction = reverse the original entries + create a new purchase that references it. Atomic. */
export function correctPurchase(db: DB, id: string, input: PurchaseInput, submissionId?: string, allowNegative = false): { db: DB; result?: Purchase } {
  if (alreadyProcessed(db, submissionId)) return { db };
  const orig = db.purchases.find((x) => x.id === id);
  assert(orig, "Compra não encontrada.");
  assert(orig.status === "ativa", "Somente compras ativas podem ser corrigidas.");
  const rev = reversalMovements(db, id, "Correção de compra (estorno da versão anterior)", input.purchaseDate);
  const { purchase, items, movements } = buildPurchase(db, input, id);
  const neg = negativeAfter(db, [...rev, ...movements]);
  if (neg.length) assert(allowNegative, `A correção deixará estoque negativo em: ${neg.join(", ")}.`);
  return {
    db: {
      ...db,
      purchases: [...db.purchases.map((x) => (x.id === id ? { ...x, status: "corrigida" as const, replacedById: purchase.id, updatedAt: nowISO() } : x)), purchase],
      purchaseItems: [...db.purchaseItems, ...items],
      movements: [...db.movements, ...rev, ...movements],
      processedSubmissions: markProcessed(db, submissionId),
    },
    result: purchase,
  };
}
