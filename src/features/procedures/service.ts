import type { ContentUnit, DB, Procedure, ProcedureRecipeItem, ServiceConsumptionItem, ServiceSession, StockMovement } from "@/types";
import { isValidDate, nowISO } from "@/lib/calculations/dates";
import { stockByProduct } from "@/lib/calculations/stock";
import { areCompatible, baseUnitOf, round6, toBase } from "@/lib/calculations/units";
import { alreadyProcessed, assert, isPositive, markProcessed, uid } from "@/lib/services/common";

export interface ProcedureInput {
  name: string;
  description: string;
  estimatedDuration: number | null;
  active: boolean;
  recipe: { productId: string; quantity: number; unit: ContentUnit }[];
}

function validateProcedure(db: DB, input: ProcedureInput, id?: string) {
  assert(input.name.trim(), "Informe o nome do procedimento.");
  assert(input.estimatedDuration === null || (Number.isFinite(input.estimatedDuration) && input.estimatedDuration > 0), "Duração inválida.");
  assert(
    !db.procedures.some((p) => p.id !== id && p.name.trim().toLowerCase() === input.name.trim().toLowerCase()),
    "Já existe um procedimento com este nome.",
  );
  const seen = new Set<string>();
  input.recipe.forEach((r, i) => {
    const p = db.products.find((x) => x.id === r.productId);
    assert(p, `Insumo ${i + 1}: selecione um produto.`);
    assert(!seen.has(r.productId), `O produto "${p.name}" aparece mais de uma vez na ficha.`);
    seen.add(r.productId);
    assert(isPositive(r.quantity), `Insumo ${i + 1}: a quantidade deve ser maior que zero.`);
    assert(areCompatible(r.unit, p.contentUnit), `Insumo ${i + 1}: unidade incompatível com o produto (${p.contentUnit}).`);
  });
}

export function saveProcedure(db: DB, input: ProcedureInput, id?: string, submissionId?: string): { db: DB; result?: Procedure } {
  if (alreadyProcessed(db, submissionId)) return { db };
  validateProcedure(db, input, id);
  const now = nowISO();
  let proc: Procedure;
  let procedures: Procedure[];
  if (id) {
    const cur = db.procedures.find((p) => p.id === id);
    assert(cur, "Procedimento não encontrado.");
    proc = { ...cur, name: input.name.trim(), description: input.description.trim(), estimatedDuration: input.estimatedDuration, active: input.active, updatedAt: now };
    procedures = db.procedures.map((p) => (p.id === id ? proc : p));
  } else {
    proc = { id: uid(), name: input.name.trim(), description: input.description.trim(), estimatedDuration: input.estimatedDuration, active: input.active, createdAt: now, updatedAt: now };
    procedures = [...db.procedures, proc];
  }
  // The recipe is a template; sessions keep their own snapshot, so replacing it does not alter history.
  const recipe: ProcedureRecipeItem[] = input.recipe.map((r) => ({ id: uid(), procedureId: proc.id, productId: r.productId, quantity: r.quantity, unit: r.unit }));
  return {
    db: { ...db, procedures, recipeItems: [...db.recipeItems.filter((r) => r.procedureId !== proc.id), ...recipe], processedSubmissions: markProcessed(db, submissionId) },
    result: proc,
  };
}

export interface RecipeCost {
  total: number | null; // cents, null when incomplete
  partial: number; // sum of known parts
  missing: string[]; // product names without a known cost
  lines: { productId: string; name: string; baseQty: number; unit: string; unitCost: number | null; cost: number | null }[];
}

/** Estimated cost of a procedure (per attendance) using current reference (average) costs. */
export function recipeCost(db: DB, procedureId: string, multiplier = 1): RecipeCost {
  const stock = stockByProduct(db);
  const lines = db.recipeItems
    .filter((r) => r.procedureId === procedureId)
    .map((r) => {
      const p = db.products.find((x) => x.id === r.productId);
      const baseQty = p ? toBase(r.quantity, r.unit) * multiplier : 0;
      const uc = p ? (stock.get(p.id)?.avgCost ?? null) : null;
      return { productId: r.productId, name: p?.name ?? "Produto removido", baseQty, unit: p ? baseUnitOf(p.contentUnit) : "", unitCost: uc, cost: uc === null ? null : baseQty * uc };
    });
  const missing = lines.filter((l) => l.cost === null).map((l) => l.name);
  const partial = lines.reduce((a, l) => a + (l.cost ?? 0), 0);
  return { total: missing.length ? null : partial, partial, missing, lines };
}

export interface SessionInput {
  procedureId: string;
  sessionDate: string;
  quantity: number;
  notes: string;
  items: { productId: string; quantity: number; unit: ContentUnit; estimatedQuantity: number }[]; // quantity/estimated in `unit`
  allowNegative?: boolean;
  negativeJustification?: string;
}

function buildSession(db: DB, input: SessionInput, replacesId?: string) {
  const proc = db.procedures.find((p) => p.id === input.procedureId);
  assert(proc, "Selecione um procedimento.");
  assert(isValidDate(input.sessionDate), "Data inválida.");
  assert(Number.isInteger(input.quantity) && input.quantity > 0, "A quantidade de atendimentos deve ser um número inteiro maior que zero.");
  assert(input.items.length > 0, "Informe pelo menos um produto consumido.");
  const stock = stockByProduct(db);
  const now = nowISO();
  const session: ServiceSession = {
    id: uid(),
    procedureId: proc.id,
    procedureNameSnapshot: proc.name,
    sessionDate: input.sessionDate,
    quantity: input.quantity,
    status: "confirmado",
    notes: [input.notes.trim(), input.allowNegative && input.negativeJustification ? `Estoque negativo autorizado: ${input.negativeJustification.trim()}` : ""].filter(Boolean).join(" · "),
    replacesId,
    createdAt: now,
  };
  const items: ServiceConsumptionItem[] = input.items.map((it, i) => {
    const p = db.products.find((x) => x.id === it.productId);
    assert(p, `Produto ${i + 1} não encontrado.`);
    assert(Number.isFinite(it.quantity) && it.quantity >= 0, `${p.name}: quantidade consumida inválida.`);
    const base = baseUnitOf(p.contentUnit);
    const q = toBase(it.quantity, it.unit, base);
    const est = toBase(it.estimatedQuantity, it.unit, base);
    const uc = stock.get(p.id)?.avgCost ?? null;
    return {
      id: uid(),
      sessionId: session.id,
      productId: p.id,
      quantity: q,
      estimatedQuantity: est,
      unit: base,
      unitCostAtConsumption: uc,
      totalCost: uc === null ? null : round6(q * uc),
    };
  });
  const movements: StockMovement[] = items
    .filter((c) => c.quantity > 0)
    .map((c) => ({
      id: uid(),
      productId: c.productId,
      movementType: "saida_consumo",
      quantity: -c.quantity,
      unit: c.unit,
      unitCost: c.unitCostAtConsumption,
      movementDate: session.sessionDate,
      sourceType: "atendimento",
      sourceId: session.id,
      notes: proc.name,
      createdAt: now,
    }));
  return { session, items, movements };
}

function negativeProducts(db: DB, extra: StockMovement[]): string[] {
  const stock = stockByProduct({ ...db, movements: [...db.movements, ...extra] });
  return [...new Set(extra.map((m) => m.productId))].filter((id) => (stock.get(id)?.quantity ?? 0) < 0).map((id) => db.products.find((p) => p.id === id)?.name ?? id);
}

function checkNegative(db: DB, extra: StockMovement[], input: { allowNegative?: boolean; negativeJustification?: string }) {
  const neg = negativeProducts(db, extra);
  if (neg.length) {
    assert(input.allowNegative, `Estoque insuficiente para: ${neg.join(", ")}. Autorize explicitamente o estoque negativo para continuar.`);
    assert(input.negativeJustification?.trim(), "Informe a justificativa para permitir estoque negativo.");
  }
}

export function registerSession(db: DB, input: SessionInput, submissionId?: string): { db: DB; result?: ServiceSession } {
  if (alreadyProcessed(db, submissionId)) return { db };
  const { session, items, movements } = buildSession(db, input);
  checkNegative(db, movements, input);
  return {
    db: {
      ...db,
      sessions: [...db.sessions, session],
      consumptionItems: [...db.consumptionItems, ...items],
      movements: [...db.movements, ...movements],
      processedSubmissions: markProcessed(db, submissionId),
    },
    result: session,
  };
}

function sessionReversals(db: DB, sessionId: string, note: string, date: string): StockMovement[] {
  const now = nowISO();
  return db.movements
    .filter((m) => m.sourceType === "atendimento" && m.sourceId === sessionId && m.movementType === "saida_consumo")
    .map((m) => ({ ...m, id: uid(), movementType: "reversao" as const, quantity: -m.quantity, movementDate: date, notes: note, createdAt: now }));
}

export function cancelSession(db: DB, id: string, reason: string, date: string): { db: DB } {
  const s = db.sessions.find((x) => x.id === id);
  assert(s, "Atendimento não encontrado.");
  assert(s.status === "confirmado", "Este atendimento já foi cancelado ou corrigido.");
  assert(reason.trim(), "Informe o motivo do cancelamento.");
  const rev = sessionReversals(db, id, `Cancelamento de atendimento: ${reason.trim()}`, date);
  return {
    db: {
      ...db,
      sessions: db.sessions.map((x) => (x.id === id ? { ...x, status: "cancelado" as const, notes: [x.notes, `Cancelado: ${reason.trim()}`].filter(Boolean).join(" · ") } : x)),
      movements: [...db.movements, ...rev],
    },
  };
}

export function correctSession(db: DB, id: string, input: SessionInput, submissionId?: string): { db: DB; result?: ServiceSession } {
  if (alreadyProcessed(db, submissionId)) return { db };
  const s = db.sessions.find((x) => x.id === id);
  assert(s, "Atendimento não encontrado.");
  assert(s.status === "confirmado", "Somente atendimentos confirmados podem ser corrigidos.");
  const rev = sessionReversals(db, id, "Correção de atendimento (estorno da versão anterior)", input.sessionDate);
  const afterRev = { ...db, movements: [...db.movements, ...rev] };
  const { session, items, movements } = buildSession(afterRev, input, id);
  checkNegative(afterRev, movements, input);
  return {
    db: {
      ...db,
      sessions: [...db.sessions.map((x) => (x.id === id ? { ...x, status: "corrigido" as const } : x)), session],
      consumptionItems: [...db.consumptionItems, ...items],
      movements: [...db.movements, ...rev, ...movements],
      processedSubmissions: markProcessed(db, submissionId),
    },
    result: session,
  };
}
