import type { ContentUnit, DB, Product, StockMovement } from "@/types";
import { nowISO, todayISO, isValidDate } from "@/lib/calculations/dates";
import { computeStock } from "@/lib/calculations/stock";
import { baseUnitOf, toBase } from "@/lib/calculations/units";
import { alreadyProcessed, assert, isPositive, markProcessed, uid } from "@/lib/services/common";

export interface ProductInput {
  name: string;
  category: string;
  brand: string;
  description: string;
  packagingUnit: string;
  contentQuantity: number;
  contentUnit: ContentUnit;
  minimumStock: number;
  defaultSupplier: string;
  notes: string;
  active: boolean;
}

function validateProduct(input: ProductInput) {
  assert(input.name.trim().length > 0, "Informe o nome do produto.");
  assert(input.packagingUnit.trim().length > 0, "Informe a unidade de controle (ex.: frasco).");
  assert(isPositive(input.contentQuantity), "O conteúdo da embalagem deve ser maior que zero.");
  assert(Number.isFinite(input.minimumStock) && input.minimumStock >= 0, "O estoque mínimo não pode ser negativo.");
}

export function hasHistory(db: DB, productId: string): boolean {
  return (
    db.movements.some((m) => m.productId === productId) ||
    db.purchaseItems.some((i) => i.productId === productId) ||
    db.consumptionItems.some((c) => c.productId === productId) ||
    db.recipeItems.some((r) => r.productId === productId)
  );
}

export function createProduct(
  db: DB,
  input: ProductInput,
  opts: { submissionId?: string; initialPackages?: number } = {},
): { db: DB; result?: Product } {
  if (alreadyProcessed(db, opts.submissionId)) return { db };
  validateProduct(input);
  const dup = db.products.find(
    (p) => p.name.trim().toLowerCase() === input.name.trim().toLowerCase() && p.brand.trim().toLowerCase() === input.brand.trim().toLowerCase(),
  );
  assert(!dup, "Já existe um produto com este nome e marca.");
  const now = nowISO();
  const product: Product = {
    id: uid(),
    ...input,
    name: input.name.trim(),
    brand: input.brand.trim(),
    packagingQuantity: 1,
    createdAt: now,
    updatedAt: now,
  };
  const movements = [...db.movements];
  const init = opts.initialPackages ?? 0;
  assert(Number.isFinite(init) && init >= 0, "O estoque inicial não pode ser negativo.");
  if (init > 0) {
    movements.push({
      id: uid(),
      productId: product.id,
      movementType: "ajuste_positivo",
      quantity: init * toBase(input.contentQuantity, input.contentUnit),
      unit: baseUnitOf(input.contentUnit),
      unitCost: null,
      movementDate: todayISO(),
      sourceType: "estoque_inicial",
      sourceId: null,
      notes: "Estoque inicial informado no cadastro",
      createdAt: now,
    });
  }
  return {
    db: { ...db, products: [...db.products, product], movements, processedSubmissions: markProcessed(db, opts.submissionId) },
    result: product,
  };
}

export function updateProduct(db: DB, id: string, input: ProductInput): { db: DB } {
  validateProduct(input);
  const current = db.products.find((p) => p.id === id);
  assert(current, "Produto não encontrado.");
  if (baseUnitOf(current.contentUnit) !== baseUnitOf(input.contentUnit)) {
    assert(!hasHistory(db, id), "Não é possível trocar para uma unidade incompatível em um produto com histórico. Cadastre um novo produto.");
  }
  const dup = db.products.find(
    (p) => p.id !== id && p.name.trim().toLowerCase() === input.name.trim().toLowerCase() && p.brand.trim().toLowerCase() === input.brand.trim().toLowerCase(),
  );
  assert(!dup, "Já existe outro produto com este nome e marca.");
  return {
    db: {
      ...db,
      products: db.products.map((p) => (p.id === id ? { ...p, ...input, name: input.name.trim(), brand: input.brand.trim(), updatedAt: nowISO() } : p)),
    },
  };
}

export function setProductActive(db: DB, id: string, active: boolean): { db: DB } {
  assert(db.products.some((p) => p.id === id), "Produto não encontrado.");
  return { db: { ...db, products: db.products.map((p) => (p.id === id ? { ...p, active, updatedAt: nowISO() } : p)) } };
}

export function deleteProduct(db: DB, id: string): { db: DB } {
  assert(!hasHistory(db, id), "Este produto tem histórico. Inative-o em vez de excluir.");
  return { db: { ...db, products: db.products.filter((p) => p.id !== id) } };
}

export interface AdjustInput {
  productId: string;
  direction: "in" | "out";
  quantity: number; // in `unit`
  unit: ContentUnit;
  date: string;
  reason: string;
  allowNegative?: boolean;
  submissionId?: string;
}

export function adjustStock(db: DB, a: AdjustInput): { db: DB } {
  if (alreadyProcessed(db, a.submissionId)) return { db };
  const p = db.products.find((x) => x.id === a.productId);
  assert(p, "Produto não encontrado.");
  assert(isPositive(a.quantity), "A quantidade do ajuste deve ser maior que zero.");
  assert(isValidDate(a.date), "Data inválida.");
  assert(a.reason.trim().length > 0, "Informe o motivo do ajuste.");
  const base = baseUnitOf(p.contentUnit);
  const q = toBase(a.quantity, a.unit, base);
  const signed = a.direction === "in" ? q : -q;
  const current = computeStock(db.movements.filter((m) => m.productId === p.id)).quantity;
  if (current + signed < 0) assert(a.allowNegative, "O ajuste deixaria o estoque negativo. Confirme explicitamente para continuar.");
  const m: StockMovement = {
    id: uid(),
    productId: p.id,
    movementType: a.direction === "in" ? "ajuste_positivo" : "ajuste_negativo",
    quantity: signed,
    unit: base,
    unitCost: null,
    movementDate: a.date,
    sourceType: "ajuste",
    sourceId: null,
    notes: a.reason.trim(),
    createdAt: nowISO(),
  };
  return { db: { ...db, movements: [...db.movements, m], processedSubmissions: markProcessed(db, a.submissionId) } };
}
