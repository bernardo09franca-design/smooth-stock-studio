import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Fragment, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Download, Pencil, Plus, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  ConfirmDialog,
  EmptyState,
  Field,
  PageHeader,
  Panel,
  ProductSelect,
  SearchInput,
  SelectField,
  StatusPill,
  TablePager,
  usePagination,
  useSubmission,
  save,
} from "@/components/common";
import { useDB } from "@/lib/storage/db";
import { formatDate, todayISO } from "@/lib/calculations/dates";
import { formatMoney, formatNumber, parseMoney } from "@/lib/calculations/money";
import { computePurchase, type PurchaseItemInput } from "@/lib/calculations/purchase";
import { stockByProduct } from "@/lib/calculations/stock";
import { UNIT_LABEL, baseUnitOf, compatibleUnits } from "@/lib/calculations/units";
import {
  cancelPurchase,
  correctPurchase,
  createPurchase,
  type PurchaseInput,
} from "@/features/purchases/service";
import { purchaseRows, suppliersOf } from "@/lib/selectors";
import { exportCsv, purchasesCsv } from "@/lib/services/reports";
import type { ContentUnit, Purchase } from "@/types";

const TITLE = "Compras";
const DESCRIPTION =
  "Registre quanto pagou, o desconto e o frete. O sistema rateia o frete entre os itens, calcula o custo real por embalagem e por unidade e dá entrada no estoque.";

export const Route = createFileRoute("/compras")({
  ssr: false,
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  validateSearch: (raw: Record<string, unknown>) => ({ new: typeof raw.new === "string" ? raw.new : undefined }),
  component: PurchasesPage,
});

function num(s: string): number {
  const n = Number(String(s).trim().replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
}

const STATUS_TONE = { ativa: "success", cancelada: "destructive", corrigida: "muted" } as const;

interface ItemRow {
  productId: string;
  packageQuantity: string;
  contentQuantity: string;
  unit: ContentUnit;
  totalPaid: string;
  discount: string;
}

function PurchasesPage() {
  const db = useDB();
  const navigate = useNavigate();
  const search = Route.useSearch();

  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("todos");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [form, setForm] = useState<{ mode: "new" } | { mode: "correct"; purchase: Purchase } | null>(null);
  const [cancelling, setCancelling] = useState<Purchase | null>(null);

  useEffect(() => {
    if (search.new === "1") {
      setForm({ mode: "new" });
      void navigate({ to: "/compras", search: { new: undefined } });
    }
  }, [search.new, navigate]);

  const rows = useMemo(
    () => purchaseRows(db, { search: query, status }),
    [db, query, status],
  );
  const pager = usePagination(rows, db.settings.pageSize);

  return (
    <>
      <PageHeader
        title={TITLE}
        description={DESCRIPTION}
        actions={
          <>
            <Button variant="outline" onClick={() => exportCsv("compras", purchasesCsv(db))}>
              <Download className="size-4" />
              Planilha
            </Button>
            <Button onClick={() => setForm({ mode: "new" })} disabled={db.products.length === 0}>
              <Plus className="size-4" />
              Nova compra
            </Button>
          </>
        }
      />

      {db.purchases.length === 0 ? (
        <EmptyState
          title="Nenhuma compra registrada"
          description={
            db.products.length === 0
              ? "Cadastre os produtos primeiro. Depois é só informar o que pagou em cada compra."
              : "Registre a primeira compra: data, fornecedor, itens e valores pagos."
          }
          action={
            <Button onClick={() => setForm({ mode: "new" })} disabled={db.products.length === 0}>
              <Plus className="size-4" />
              Registrar compra
            </Button>
          }
        />
      ) : (
        <Panel>
          <div className="mb-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_12rem]">
            <SearchInput value={query} onChange={setQuery} placeholder="Buscar por fornecedor, referência ou produto" />
            <SelectField
              value={status}
              onChange={setStatus}
              options={[
                { value: "todos", label: "Todas as situações" },
                { value: "ativa", label: "Ativas" },
                { value: "cancelada", label: "Canceladas" },
                { value: "corrigida", label: "Corrigidas" },
              ]}
            />
          </div>

          {pager.slice.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">Nenhuma compra com esses filtros.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8" />
                    <TableHead>Data</TableHead>
                    <TableHead>Fornecedor</TableHead>
                    <TableHead>Referência</TableHead>
                    <TableHead className="text-right">Itens</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead>Situação</TableHead>
                    <TableHead className="w-32" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pager.slice.map((r) => (
                    <Fragment key={r.purchase.id}>
                      <TableRow>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setExpanded(expanded === r.purchase.id ? null : r.purchase.id)}
                          >
                            {expanded === r.purchase.id ? (
                              <ChevronDown className="size-4" />
                            ) : (
                              <ChevronRight className="size-4" />
                            )}
                            <span className="sr-only">Expandir compra</span>
                          </Button>
                        </TableCell>
                        <TableCell className="numeric">{formatDate(r.purchase.purchaseDate)}</TableCell>
                        <TableCell className="font-medium">{r.purchase.supplier || "Sem fornecedor"}</TableCell>
                        <TableCell className="text-muted-foreground">{r.purchase.reference || "—"}</TableCell>
                        <TableCell className="text-right numeric">{r.items.length}</TableCell>
                        <TableCell className="text-right numeric font-semibold">{formatMoney(r.purchase.totalAmount)}</TableCell>
                        <TableCell>
                          <StatusPill tone={STATUS_TONE[r.purchase.status]}>{r.purchase.status}</StatusPill>
                        </TableCell>
                        <TableCell>
                          <div className="flex justify-end gap-1">
                            {r.purchase.status === "ativa" ? (
                              <>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setForm({ mode: "correct", purchase: r.purchase })}
                                >
                                  <Pencil className="size-4" />
                                  Corrigir
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-destructive"
                                  onClick={() => setCancelling(r.purchase)}
                                >
                                  <Trash2 className="size-4" />
                                  Cancelar
                                </Button>
                              </>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                      {expanded === r.purchase.id ? (
                        <TableRow key={`${r.purchase.id}-items`}>
                          <TableCell colSpan={8} className="bg-muted/30 p-0">
                            <div className="p-4">
                              {r.purchase.notes ? (
                                <p className="mb-3 text-xs text-muted-foreground">{r.purchase.notes}</p>
                              ) : null}
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead>Produto</TableHead>
                                    <TableHead className="text-right">Embalagens</TableHead>
                                    <TableHead className="text-right">Conteúdo</TableHead>
                                    <TableHead className="text-right">Pago</TableHead>
                                    <TableHead className="text-right">Desconto</TableHead>
                                    <TableHead className="text-right">Frete</TableHead>
                                    <TableHead className="text-right">Custo/embalagem</TableHead>
                                    <TableHead className="text-right">Custo/unidade</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {r.items.map((it) => (
                                    <TableRow key={it.id}>
                                      <TableCell className="font-medium">{it.productNameSnapshot}</TableCell>
                                      <TableCell className="text-right numeric">{formatNumber(it.packageQuantity, 2)}</TableCell>
                                      <TableCell className="text-right numeric">
                                        {formatNumber(it.contentQuantity, 2)} {it.contentUnit}
                                      </TableCell>
                                      <TableCell className="text-right numeric">{formatMoney(it.totalPaid)}</TableCell>
                                      <TableCell className="text-right numeric">{formatMoney(it.discount)}</TableCell>
                                      <TableCell className="text-right numeric">{formatMoney(it.allocatedShipping)}</TableCell>
                                      <TableCell className="text-right numeric">{formatMoney(it.unitCost)}</TableCell>
                                      <TableCell className="text-right numeric">
                                        {formatMoney(it.normalizedUnitCost)}/{baseUnitOf(it.contentUnit)}
                                      </TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                              {r.purchase.shippingCents > 0 ? (
                                <p className="mt-2 text-xs text-muted-foreground">
                                  Frete e custos adicionais: {formatMoney(r.purchase.shippingCents)}, rateados entre os
                                  itens proporcionalmente ao valor pago.
                                </p>
                              ) : null}
                            </div>
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </Fragment>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          <TablePager
            from={pager.from}
            to={pager.to}
            total={pager.total}
            page={pager.page}
            pageCount={pager.pageCount}
            onPage={pager.setPage}
          />
        </Panel>
      )}

      {form ? (
        <PurchaseForm
          key={form.mode === "new" ? "new" : form.purchase.id}
          original={form.mode === "correct" ? form.purchase : null}
          onClose={() => setForm(null)}
        />
      ) : null}

      {cancelling ? <CancelDialog purchase={cancelling} onClose={() => setCancelling(null)} /> : null}
    </>
  );
}

function PurchaseForm({ original, onClose }: { original: Purchase | null; onClose: () => void }) {
  const db = useDB();
  const { key, reset } = useSubmission();
  const products = useMemo(() => db.products.filter((p) => p.active), [db.products]);
  const byId = useMemo(() => new Map(db.products.map((p) => [p.id, p])), [db.products]);

  const [date, setDate] = useState(original?.purchaseDate ?? todayISO());
  const [supplier, setSupplier] = useState(original?.supplier ?? "");
  const [reference, setReference] = useState(original?.reference ?? "");
  const [notes, setNotes] = useState(original?.notes ?? "");
  const [shipping, setShipping] = useState(original ? (original.shippingCents / 100).toFixed(2).replace(".", ",") : "0,00");
  const [allowNegative, setAllowNegative] = useState(false);
  const [rows, setRows] = useState<ItemRow[]>(() =>
    original
      ? db.purchaseItems
          .filter((i) => i.purchaseId === original.id)
          .map((i) => ({
            productId: i.productId,
            packageQuantity: String(i.packageQuantity),
            contentQuantity: String(i.contentQuantity),
            unit: i.contentUnit,
            totalPaid: (i.totalPaid / 100).toFixed(2).replace(".", ","),
            discount: (i.discount / 100).toFixed(2).replace(".", ","),
          }))
      : [],
  );

  function addRow() {
    const first = products[0];
    setRows((cur) => [
      ...cur,
      {
        productId: "",
        packageQuantity: "1",
        contentQuantity: first ? String(first.contentQuantity) : "",
        unit: first?.contentUnit ?? "ml",
        totalPaid: "",
        discount: "0,00",
      },
    ]);
  }

  function updateRow(i: number, patch: Partial<ItemRow>) {
    setRows((cur) => cur.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  const parsed: PurchaseItemInput[] = rows.map((r) => ({
    packageQuantity: num(r.packageQuantity),
    contentQuantity: num(r.contentQuantity),
    contentUnit: r.unit,
    totalPaid: parseMoney(r.totalPaid) ?? 0,
    discount: parseMoney(r.discount) ?? 0,
  }));
  const calc = computePurchase(parsed, parseMoney(shipping) ?? 0);

  function submit() {
    const input: PurchaseInput = {
      purchaseDate: date,
      supplier,
      reference,
      notes,
      shippingCents: parseMoney(shipping) ?? 0,
      items: rows.map((r) => ({
        productId: r.productId,
        packageQuantity: num(r.packageQuantity),
        contentQuantity: num(r.contentQuantity),
        contentUnit: r.unit,
        totalPaid: parseMoney(r.totalPaid) ?? 0,
        discount: parseMoney(r.discount) ?? 0,
      })),
    };
    if (original) {
      const saved = save(
        (d) => correctPurchase(d, original.id, input, key, allowNegative),
        "Compra corrigida — a versão anterior foi estornada",
      );
      if (saved) reset();
    } else {
      const saved = save((d) => createPurchase(d, input, key), "Compra registrada e estoque atualizado");
      if (saved) reset();
    }
    onClose();
  }

  return (
    <Dialog open onOpenChange={(o) => (o ? undefined : onClose())}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{original ? "Corrigir compra" : "Nova compra"}</DialogTitle>
          <DialogDescription>
            {original
              ? "A compra original será estornada e esta nova versão entra no lugar. O estoque é ajustado automaticamente."
              : "Informe o que pagou por cada item. O frete é dividido entre eles conforme o valor de cada um."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-4">
            <Field label="Data *">
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
            <Field label="Fornecedor">
              <Input
                list="fornecedores-compra"
                value={supplier}
                onChange={(e) => setSupplier(e.target.value)}
                placeholder="Studio Cosméticos"
              />
              <datalist id="fornecedores-compra">
                {suppliersOf(db).map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </Field>
            <Field label="Nota / referência">
              <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="NF 1234" />
            </Field>
            <Field label="Frete e extras (R$)">
              <Input inputMode="decimal" value={shipping} onChange={(e) => setShipping(e.target.value)} placeholder="0,00" />
            </Field>
          </div>

          <div className="rounded-lg border bg-muted/30 p-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-semibold">Itens da compra</p>
              <Button variant="outline" size="sm" onClick={addRow} disabled={products.length === 0}>
                <Plus className="size-4" />
                Adicionar item
              </Button>
            </div>

            {rows.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Nenhum item ainda. Adicione os produtos comprados.
              </p>
            ) : (
              <ul className="space-y-3">
                {rows.map((r, i) => {
                  const p = byId.get(r.productId);
                  const c = calc.items[i];
                  return (
                    <li key={i} className="rounded-md border bg-card p-3">
                      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_6rem_7rem_6rem_6rem_auto] sm:items-end">
                        <Field label="Produto">
                          <ProductSelect
                            products={products}
                            value={r.productId}
                            onChange={(v) => {
                              const prod = byId.get(v);
                              updateRow(i, {
                                productId: v,
                                contentQuantity: prod ? String(prod.contentQuantity) : r.contentQuantity,
                                unit: prod ? prod.contentUnit : r.unit,
                              });
                            }}
                          />
                        </Field>
                        <Field label="Embalagens">
                          <Input inputMode="decimal" value={r.packageQuantity} onChange={(e) => updateRow(i, { packageQuantity: e.target.value })} />
                        </Field>
                        <Field label="Conteúdo">
                          <div className="flex gap-1">
                            <Input inputMode="decimal" value={r.contentQuantity} onChange={(e) => updateRow(i, { contentQuantity: e.target.value })} />
                            <SelectField
                              className="w-16"
                              value={r.unit}
                              onChange={(v) => updateRow(i, { unit: v as ContentUnit })}
                              options={compatibleUnits(p?.contentUnit ?? "ml").map((u) => ({ value: u, label: UNIT_LABEL[u] }))}
                            />
                          </div>
                        </Field>
                        <Field label="Pago (R$)">
                          <Input inputMode="decimal" value={r.totalPaid} onChange={(e) => updateRow(i, { totalPaid: e.target.value })} placeholder="0,00" />
                        </Field>
                        <Field label="Desconto (R$)">
                          <Input inputMode="decimal" value={r.discount} onChange={(e) => updateRow(i, { discount: e.target.value })} placeholder="0,00" />
                        </Field>
                        <Button variant="ghost" size="icon" onClick={() => setRows((cur) => cur.filter((_, idx) => idx !== i))}>
                          <X className="size-4" />
                          <span className="sr-only">Remover item</span>
                        </Button>
                      </div>
                      {c ? (
                        <p className="mt-2 text-xs text-muted-foreground numeric">
                          Líquido {formatMoney(c.net)} · frete rateado {formatMoney(c.allocatedShipping)} · custo por
                          embalagem {formatMoney(c.unitCost)} · custo por {p ? baseUnitOf(p.contentUnit) : "unidade"}{" "}
                          {formatMoney(c.normalizedUnitCost)}
                        </p>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <Field label="Observações">
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Pagamento via pix, entrega em 5 dias…" />
          </Field>

          {original ? (
            <label className="flex items-start gap-3 rounded-lg border border-warning/40 bg-warning-soft p-3 text-sm">
              <Checkbox checked={allowNegative} onCheckedChange={(c) => setAllowNegative(Boolean(c))} />
              <span>
                Autorizo saldo negativo se a correção estornar estoque que já foi consumido desde a compra original.
              </span>
            </label>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-muted/50 px-3 py-2.5 text-sm">
            <span className="text-muted-foreground">
              Soma dos itens: <span className="font-semibold text-foreground numeric">{formatMoney(calc.itemsTotal)}</span>
            </span>
            <span className="text-muted-foreground">
              Frete: <span className="font-semibold text-foreground numeric">{formatMoney(parseMoney(shipping) ?? 0)}</span>
            </span>
            <span className="text-base font-semibold numeric">
              Total: {formatMoney(calc.total)}
            </span>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={submit}>{original ? "Salvar correção" : "Registrar compra"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CancelDialog({ purchase, onClose }: { purchase: Purchase; onClose: () => void }) {
  const db = useDB();
  const [reason, setReason] = useState("");
  const [date, setDate] = useState(todayISO());
  const [allowNegative, setAllowNegative] = useState(false);

  const stock = useMemo(() => stockByProduct(db), [db]);
  const items = useMemo(() => db.purchaseItems.filter((i) => i.purchaseId === purchase.id), [db.purchaseItems, purchase.id]);
  const negatives = items
    .filter((i) => (stock.get(i.productId)?.quantity ?? 0) - i.baseQuantity < 0)
    .map((i) => i.productNameSnapshot);

  function submit() {
    save(
      (d) => cancelPurchase(d, purchase.id, reason, { date, allowNegative }),
      "Compra cancelada — o estoque foi estornado",
    );
    onClose();
  }

  return (
    <Dialog open onOpenChange={(o) => (o ? undefined : onClose())}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Cancelar compra</DialogTitle>
          <DialogDescription>
            {purchase.supplier || "Sem fornecedor"} · {formatDate(purchase.purchaseDate)} · {formatMoney(purchase.totalAmount)}.
            Tudo o que entrou com esta compra será estornado do estoque.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <Field label="Motivo *">
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Compra devolvida, erro de lançamento…" />
          </Field>
          <Field label="Data do estorno">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>

          {negatives.length ? (
            <label className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
              <Checkbox checked={allowNegative} onCheckedChange={(c) => setAllowNegative(Boolean(c))} />
              <span className="text-destructive">
                O cancelamento deixa saldo negativo em: {negatives.join(", ")}. O consumo desses produtos já foi maior
                do que a entrada que será estornada.
              </span>
            </label>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Voltar
          </Button>
          <Button variant="destructive" onClick={submit}>
            Cancelar compra
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
