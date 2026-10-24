import type { DB } from "@/types";
import { formatDate } from "@/lib/calculations/dates";
import { formatMoney } from "@/lib/calculations/money";
import { baseUnitOf } from "@/lib/calculations/units";
import { downloadFile } from "@/lib/services/backup";
import {
  MOVEMENT_LABEL,
  priceObservations,
  productViews,
  purchaseRows,
  type ProductView,
} from "@/lib/selectors";
import { recipeCost } from "@/features/procedures/service";

/*
 * Spreadsheet export: comma-separated values with a UTF-8 BOM and ";" as the
 * separator, so Brazilian Excel opens it with correct accents and decimals.
 */

export interface CsvColumn<T> {
  header: string;
  value: (row: T) => string | number | null | undefined;
}

function cell(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") {
    if (!Number.isFinite(v)) return "";
    return Number.isInteger(v) ? String(v) : v.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
  }
  const s = String(v);
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv<T>(columns: CsvColumn<T>[], rows: T[]): string {
  const lines = [columns.map((c) => cell(c.header)).join(";")];
  for (const row of rows) lines.push(columns.map((c) => cell(c.value(row))).join(";"));
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

export function moneyCell(cents: number | null | undefined): string {
  if (cents === null || cents === undefined || !Number.isFinite(cents)) return "";
  return (cents / 100).toFixed(2).replace(".", ",");
}

function stamp(): string {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, "0")}-${String(d.getMonth() + 1).padStart(2, "0")}-${d.getFullYear()}`;
}

export function exportCsv(filename: string, csv: string) {
  downloadFile(`${filename}_${stamp()}.csv`, csv, "text/csv");
}

const reais = (cents: number | null | undefined) => (cents === null || cents === undefined ? "" : formatMoney(cents));

export function productsCsv(db: DB): string {
  const views = productViews(db);
  return toCsv<ProductView>(
    [
      { header: "Produto", value: (v) => v.product.name },
      { header: "Marca", value: (v) => v.product.brand },
      { header: "Categoria", value: (v) => v.product.category },
      { header: "Embalagem", value: (v) => `${v.product.contentQuantity} ${v.product.contentUnit} / ${v.product.packagingUnit}` },
      { header: "Situação", value: (v) => v.status },
      { header: "Em estoque (embalagens)", value: (v) => Number(v.packages.toFixed(3)) },
      { header: "Em estoque (base)", value: (v) => Number(v.stock.quantity.toFixed(3)) },
      { header: "Unidade base", value: (v) => baseUnitOf(v.product.contentUnit) },
      { header: "Estoque mínimo (embalagens)", value: (v) => v.product.minimumStock },
      { header: "Custo médio unitário (R$)", value: (v) => (v.stock.avgCost === null ? "" : moneyCell(v.stock.avgCost)) },
      { header: "Valor em estoque (R$)", value: (v) => moneyCell(v.stockValue) },
      { header: "Última compra", value: (v) => (v.lastPurchase ? formatDate(v.lastPurchase.date) : "") },
      { header: "Último custo unitário (R$)", value: (v) => (v.lastPurchase ? moneyCell(v.lastPurchase.normalizedUnitCost) : "") },
      { header: "Fornecedor padrão", value: (v) => v.product.defaultSupplier },
      { header: "Ativo", value: (v) => (v.product.active ? "sim" : "não") },
    ],
    views,
  );
}

export function purchasesCsv(db: DB): string {
  const rows = purchaseRows(db);
  return toCsv<{ purchase: (typeof rows)[number]["purchase"]; item: (typeof rows)[number]["items"][number] | null }>(
    [
      { header: "Data", value: (r) => formatDate(r.purchase.purchaseDate) },
      { header: "Fornecedor", value: (r) => r.purchase.supplier },
      { header: "Referência", value: (r) => r.purchase.reference },
      { header: "Situação", value: (r) => r.purchase.status },
      { header: "Produto", value: (r) => r.item?.productNameSnapshot ?? "" },
      { header: "Embalagens", value: (r) => r.item?.packageQuantity ?? "" },
      { header: "Conteúdo", value: (r) => (r.item ? `${r.item.contentQuantity} ${r.item.contentUnit}` : "") },
      { header: "Pago (R$)", value: (r) => (r.item ? moneyCell(r.item.totalPaid) : "") },
      { header: "Desconto (R$)", value: (r) => (r.item ? moneyCell(r.item.discount) : "") },
      { header: "Frete rateado (R$)", value: (r) => (r.item ? moneyCell(r.item.allocatedShipping) : "") },
      { header: "Custo por embalagem (R$)", value: (r) => (r.item ? moneyCell(r.item.unitCost) : "") },
      { header: "Custo por unidade base (R$)", value: (r) => (r.item ? moneyCell(r.item.normalizedUnitCost) : "") },
      { header: "Total da compra (R$)", value: (r) => (r.item ? "" : reais(r.purchase.totalAmount)) },
    ],
    rows.flatMap((r) => (r.items.length ? r.items.map((item) => ({ purchase: r.purchase, item })) : [{ purchase: r.purchase, item: null }])),
  );
}

export function consumptionCsv(db: DB, from: string, to: string): string {
  const sessions = db.sessions.filter((s) => s.status === "confirmado" && s.sessionDate >= from && s.sessionDate <= to);
  const byId = new Map(db.products.map((p) => [p.id, p]));
  type Row = { session: (typeof sessions)[number]; item: DB["consumptionItems"][number] | null };
  const rows: Row[] = sessions.flatMap((session) => {
    const items = db.consumptionItems.filter((c) => c.sessionId === session.id);
    return items.length ? items.map((item) => ({ session, item })) : [{ session, item: null }];
  });
  return toCsv<Row>(
    [
      { header: "Data", value: (r) => formatDate(r.session.sessionDate) },
      { header: "Procedimento", value: (r) => r.session.procedureNameSnapshot },
      { header: "Atendimentos", value: (r) => r.session.quantity },
      { header: "Produto", value: (r) => (r.item ? byId.get(r.item.productId)?.name ?? r.item.productId : "") },
      { header: "Consumido (base)", value: (r) => (r.item ? Number(r.item.quantity.toFixed(3)) : "") },
      { header: "Esperado (receita)", value: (r) => (r.item ? Number(r.item.estimatedQuantity.toFixed(3)) : "") },
      { header: "Diferença", value: (r) => (r.item ? Number((r.item.quantity - r.item.estimatedQuantity).toFixed(3)) : "") },
      { header: "Unidade", value: (r) => r.item?.unit ?? "" },
      { header: "Custo unitário na época (R$)", value: (r) => (r.item ? moneyCell(r.item.unitCostAtConsumption) : "") },
      { header: "Custo (R$)", value: (r) => (r.item ? moneyCell(r.item.totalCost) : "") },
    ],
    rows,
  );
}

export function priceHistoryCsv(db: DB, productId: string): string {
  const product = db.products.find((p) => p.id === productId);
  if (!product) throw new Error("Produto não encontrado.");
  const obs = priceObservations(db, product);
  return toCsv<(typeof obs)[number]>(
    [
      { header: "Data", value: (o) => formatDate(o.date) },
      { header: "Fornecedor", value: (o) => o.supplier },
      { header: "Referência", value: (o) => o.reference },
      { header: "Embalagens", value: (o) => o.packageQuantity },
      { header: "Conteúdo por embalagem", value: (o) => o.packageContentLabel },
      { header: "Custo por embalagem (R$)", value: (o) => moneyCell(o.packageCost) },
      { header: "Custo por unidade base (R$)", value: (o) => moneyCell(o.normalizedUnitCost) },
      { header: "Custo na embalagem atual (R$)", value: (o) => moneyCell(o.standardPackageCost) },
      { header: "Total pago (R$)", value: (o) => moneyCell(o.effectiveTotal) },
    ],
    obs,
  );
}

export function proceduresCsv(db: DB): string {
  const byId = new Map(db.products.map((p) => [p.id, p]));
  type Row = { procedure: DB["procedures"][number]; recipe: DB["recipeItems"][number] | null };
  const rows: Row[] = db.procedures.flatMap((procedure) => {
    const recipe = db.recipeItems.filter((r) => r.procedureId === procedure.id);
    return recipe.length ? recipe.map((item) => ({ procedure, recipe: item })) : [{ procedure, recipe: null }];
  });
  return toCsv<Row>(
    [
      { header: "Procedimento", value: (r) => r.procedure.name },
      { header: "Duração (min)", value: (r) => r.procedure.estimatedDuration ?? "" },
      { header: "Ativo", value: (r) => (r.procedure.active ? "sim" : "não") },
      { header: "Insumo", value: (r) => (r.recipe ? byId.get(r.recipe.productId)?.name ?? "" : "") },
      { header: "Quantidade", value: (r) => r.recipe?.quantity ?? "" },
      { header: "Unidade", value: (r) => r.recipe?.unit ?? "" },
      {
        header: "Custo estimado por atendimento (R$)",
        value: (r) => (r.recipe ? "" : moneyCell(recipeCost(db, r.procedure.id).total)),
      },
    ],
    rows,
  );
}

export function movementsCsv(db: DB, productId: string): string {
  const movements = db.movements.filter((m) => m.productId === productId);
  return toCsv<(typeof movements)[number]>(
    [
      { header: "Data", value: (m) => formatDate(m.movementDate) },
      { header: "Tipo", value: (m) => MOVEMENT_LABEL[m.movementType] },
      { header: "Quantidade", value: (m) => Number(m.quantity.toFixed(3)) },
      { header: "Unidade", value: (m) => m.unit },
      { header: "Custo unitário (R$)", value: (m) => moneyCell(m.unitCost) },
      { header: "Origem", value: (m) => m.sourceType },
      { header: "Observação", value: (m) => m.notes },
    ],
    movements,
  );
}
