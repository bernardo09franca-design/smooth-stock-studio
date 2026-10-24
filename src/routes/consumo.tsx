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
  BarRow,
  EmptyState,
  Field,
  PageHeader,
  Panel,
  PeriodSelect,
  ProductSelect,
  SelectField,
  StatCard,
  StatusPill,
  TablePager,
  usePagination,
  useSubmission,
  save,
} from "@/components/common";
import { useDB } from "@/lib/storage/db";
import { formatDate, periodStart, todayISO, type PeriodKey } from "@/lib/calculations/dates";
import { formatMoney, formatNumber } from "@/lib/calculations/money";
import { stockByProduct } from "@/lib/calculations/stock";
import { UNIT_LABEL, compatibleUnits, toBase } from "@/lib/calculations/units";
import {
  cancelSession,
  correctSession,
  registerSession,
  type SessionInput,
} from "@/features/procedures/service";
import { consumptionByProduct, procedureUsage, wastageByProduct } from "@/lib/selectors";
import { exportCsv, consumptionCsv } from "@/lib/services/reports";
import type { ContentUnit, ServiceSession } from "@/types";

const TITLE = "Atendimentos e consumo";
const DESCRIPTION =
  "Registre o que foi realmente usado em cada atendimento. O sistema compara com a ficha do procedimento, dá baixa no estoque e mostra o custo do que foi consumido.";

export const Route = createFileRoute("/consumo")({
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
  component: ConsumptionPage,
});

function num(s: string): number {
  const n = Number(String(s).trim().replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
}

interface SessionRow {
  productId: string;
  quantity: string;
  unit: ContentUnit;
  estimated: number;
}

function ConsumptionPage() {
  const db = useDB();
  const navigate = useNavigate();
  const search = Route.useSearch();

  const [period, setPeriod] = useState<PeriodKey>("3m");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [form, setForm] = useState<{ mode: "new" } | { mode: "correct"; session: ServiceSession } | null>(null);
  const [cancelling, setCancelling] = useState<ServiceSession | null>(null);

  useEffect(() => {
    if (search.new === "1") {
      setForm({ mode: "new" });
      void navigate({ to: "/consumo", search: { new: undefined } });
    }
  }, [search.new, navigate]);

  const from = periodStart(period);
  const to = todayISO();

  const sessions = useMemo(
    () =>
      db.sessions
        .slice()
        .sort((a, b) => b.sessionDate.localeCompare(a.sessionDate) || b.createdAt.localeCompare(a.createdAt)),
    [db.sessions],
  );
  const pager = usePagination(sessions, db.settings.pageSize);

  const consumption = useMemo(() => consumptionByProduct(db, from, to), [db, from, to]);
  const byId = useMemo(() => new Map(db.products.map((p) => [p.id, p])), [db.products]);
  const consumedRows = [...consumption.entries()]
    .map(([productId, c]) => ({ product: byId.get(productId), c }))
    .filter((r): r is { product: NonNullable<typeof r.product>; c: typeof r.c } => Boolean(r.product))
    .sort((a, b) => b.c.cost - a.c.cost);
  const maxCost = consumedRows[0]?.c.cost ?? 1;
  const waste = wastageByProduct(db, from, to, 6);
  const usage = procedureUsage(db, from, to).slice(0, 6);

  const totalCost = consumedRows.reduce((a, r) => a + r.c.cost, 0);
  const attendances = db.sessions
    .filter((s) => s.status === "confirmado" && s.sessionDate >= from && s.sessionDate <= to)
    .reduce((a, s) => a + s.quantity, 0);

  const canRegister = db.procedures.some((p) => p.active) && db.products.some((p) => p.active);

  return (
    <>
      <PageHeader
        title={TITLE}
        description={DESCRIPTION}
        actions={
          <>
            <PeriodSelect value={period} onChange={setPeriod} />
            <Button variant="outline" onClick={() => exportCsv("consumo", consumptionCsv(db, from, to))}>
              <Download className="size-4" />
              Planilha
            </Button>
            <Button onClick={() => setForm({ mode: "new" })} disabled={!canRegister}>
              <Plus className="size-4" />
              Registrar atendimento
            </Button>
          </>
        }
      />

      {db.sessions.length === 0 && db.procedures.length === 0 ? (
        <EmptyState
          title="Cadastre um procedimento para começar"
          description="O atendimento é sempre de um procedimento. Monte a ficha com os insumos e depois registre o que foi usado em cada sessão."
          action={
            <Button variant="outline" onClick={() => void navigate({ to: "/procedimentos" })}>
              Criar procedimento
            </Button>
          }
        />
      ) : (
        <div className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-3">
            <StatCard label="Custo do consumo" value={formatMoney(totalCost)} hint="no período selecionado" />
            <StatCard label="Atendimentos" value={formatNumber(attendances)} hint="confirmados no período" />
            <StatCard
              label="Custo médio por atendimento"
              value={attendances > 0 ? formatMoney(totalCost / attendances) : "—"}
              hint="consumo ÷ atendimentos"
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Panel title="Consumo por produto" description="O que foi efetivamente usado, com o custo da época.">
              {consumedRows.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">Nenhum consumo registrado no período.</p>
              ) : (
                <div className="space-y-1">
                  {consumedRows.slice(0, 8).map((r) => (
                    <BarRow
                      key={r.product.id}
                      label={r.product.name}
                      detail={formatMoney(r.c.cost)}
                      value={r.c.cost}
                      max={maxCost}
                    />
                  ))}
                </div>
              )}
            </Panel>

            <Panel title="Usado além da ficha" description="Diferença entre o que foi consumido e o que a ficha previa.">
              {waste.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  Nenhum produto com comparação disponível no período.
                </p>
              ) : (
                <ul className="divide-y">
                  {waste.map((w) => (
                    <li key={w.product.id} className="flex items-center justify-between gap-3 py-2.5">
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{w.product.name}</span>
                        <span className="block text-xs text-muted-foreground numeric">
                          ficha {formatNumber(w.estimated, 2)} · usado {formatNumber(w.qty, 2)} {w.product ? "" : ""}
                        </span>
                      </span>
                      <StatusPill tone={w.diff > 0 ? "warning" : "success"}>
                        {w.diff > 0 ? "+" : ""}
                        {formatNumber(w.diff, 2)} {w.product ? "" : ""}
                      </StatusPill>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>

          <Panel
            title="Atendimentos registrados"
            description="Cada lançamento pode ser corrigido ou cancelado; o estoque é estornado automaticamente."
            action={<PeriodSelect value={period} onChange={setPeriod} />}
          >
            {pager.slice.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">Nenhum atendimento registrado ainda.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8" />
                      <TableHead>Data</TableHead>
                      <TableHead>Procedimento</TableHead>
                      <TableHead className="text-right">Atendimentos</TableHead>
                      <TableHead>Situação</TableHead>
                      <TableHead className="w-32" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pager.slice.map((s) => {
                      const items = db.consumptionItems.filter((c) => c.sessionId === s.id);
                      const cost = items.reduce((a, c) => a + (c.totalCost ?? 0), 0);
                      return (
                        <Fragment key={s.id}>
                          <TableRow>
                            <TableCell>
                              <Button variant="ghost" size="icon" onClick={() => setExpanded(expanded === s.id ? null : s.id)}>
                                {expanded === s.id ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                                <span className="sr-only">Expandir atendimento</span>
                              </Button>
                            </TableCell>
                            <TableCell className="numeric">{formatDate(s.sessionDate)}</TableCell>
                            <TableCell className="font-medium">{s.procedureNameSnapshot}</TableCell>
                            <TableCell className="text-right numeric">{formatNumber(s.quantity, 0)}</TableCell>
                            <TableCell>
                              <StatusPill
                                tone={s.status === "confirmado" ? "success" : s.status === "cancelado" ? "destructive" : "muted"}
                              >
                                {s.status}
                              </StatusPill>
                            </TableCell>
                            <TableCell>
                              <div className="flex justify-end gap-1">
                                {s.status === "confirmado" ? (
                                  <>
                                    <Button variant="ghost" size="sm" onClick={() => setForm({ mode: "correct", session: s })}>
                                      <Pencil className="size-4" />
                                      Corrigir
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="text-destructive"
                                      onClick={() => setCancelling(s)}
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
                          {expanded === s.id ? (
                            <TableRow>
                              <TableCell colSpan={6} className="bg-muted/30 p-0">
                                <div className="p-4">
                                  {s.notes ? <p className="mb-3 text-xs text-muted-foreground">{s.notes}</p> : null}
                                  {items.length === 0 ? (
                                    <p className="py-4 text-center text-sm text-muted-foreground">
                                      Nenhum consumo neste lançamento.
                                    </p>
                                  ) : (
                                    <Table>
                                      <TableHeader>
                                        <TableRow>
                                          <TableHead>Produto</TableHead>
                                          <TableHead className="text-right">Consumido</TableHead>
                                          <TableHead className="text-right">Esperado</TableHead>
                                          <TableHead className="text-right">Diferença</TableHead>
                                          <TableHead className="text-right">Custo</TableHead>
                                        </TableRow>
                                      </TableHeader>
                                      <TableBody>
                                        {items.map((c) => (
                                          <TableRow key={c.id}>
                                            <TableCell className="font-medium">
                                              {byId.get(c.productId)?.name ?? "Produto removido"}
                                            </TableCell>
                                            <TableCell className="text-right numeric">
                                              {formatNumber(c.quantity, 2)} {c.unit}
                                            </TableCell>
                                            <TableCell className="text-right numeric">
                                              {formatNumber(c.estimatedQuantity, 2)} {c.unit}
                                            </TableCell>
                                            <TableCell className="text-right numeric">
                                              {c.quantity - c.estimatedQuantity > 0 ? "+" : ""}
                                              {formatNumber(c.quantity - c.estimatedQuantity, 2)}
                                            </TableCell>
                                            <TableCell className="text-right numeric">{formatMoney(c.totalCost)}</TableCell>
                                          </TableRow>
                                        ))}
                                      </TableBody>
                                    </Table>
                                  )}
                                  <p className="mt-2 text-sm font-semibold numeric">Custo do lançamento: {formatMoney(cost)}</p>
                                </div>
                              </TableCell>
                            </TableRow>
                          ) : null}
                        </Fragment>
                      );
                    })}
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

          <Panel title="Procedimentos mais feitos" description="Atendimentos confirmados no período.">
            {usage.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Nenhum atendimento confirmado no período.</p>
            ) : (
              <div className="space-y-1">
                {usage.map((p) => (
                  <BarRow
                    key={p.procedureId}
                    label={p.name}
                    detail={`${formatNumber(p.attendances)} atend. · ${formatMoney(p.cost)}`}
                    value={p.attendances}
                    max={usage[0]?.attendances ?? 1}
                    tone="success"
                  />
                ))}
              </div>
            )}
          </Panel>
        </div>
      )}

      {form ? (
        <SessionForm
          key={form.mode === "new" ? "new" : form.session.id}
          original={form.mode === "correct" ? form.session : null}
          onClose={() => setForm(null)}
        />
      ) : null}

      {cancelling ? <CancelSessionDialog session={cancelling} onClose={() => setCancelling(null)} /> : null}
    </>
  );
}

function SessionForm({ original, onClose }: { original: ServiceSession | null; onClose: () => void }) {
  const db = useDB();
  const { key, reset } = useSubmission();
  const procedures = useMemo(() => db.procedures.filter((p) => p.active), [db.procedures]);
  const products = useMemo(() => db.products.filter((p) => p.active), [db.products]);
  const byId = useMemo(() => new Map(db.products.map((p) => [p.id, p])), [db.products]);
  const stock = useMemo(() => stockByProduct(db), [db]);

  const buildRows = (procedureId: string, attendances: number): SessionRow[] =>
    db.recipeItems
      .filter((r) => r.procedureId === procedureId)
      .map((r) => ({
        productId: r.productId,
        quantity: String(r.quantity * attendances),
        unit: r.unit,
        estimated: r.quantity * attendances,
      }));

  const [procedureId, setProcedureId] = useState(original?.procedureId ?? procedures[0]?.id ?? "");
  const [date, setDate] = useState(original?.sessionDate ?? todayISO());
  const [quantity, setQuantity] = useState(original ? String(original.quantity) : "1");
  const [notes, setNotes] = useState(original?.notes ?? "");
  const [allowNegative, setAllowNegative] = useState(false);
  const [justification, setJustification] = useState("");
  const [rows, setRows] = useState<SessionRow[]>(() => {
    if (original) {
      return db.consumptionItems
        .filter((c) => c.sessionId === original.id)
        .map((c) => ({
          productId: c.productId,
          quantity: String(c.quantity),
          unit: c.unit as ContentUnit,
          estimated: c.estimatedQuantity,
        }));
    }
    return buildRows(procedures[0]?.id ?? "", 1);
  });

  const attendances = Math.max(1, Math.round(num(quantity || "1") || 1));

  function updateRow(i: number, patch: Partial<SessionRow>) {
    setRows((cur) => cur.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  const totals = rows.reduce(
    (acc, r) => {
      const p = byId.get(r.productId);
      const uc = p ? stock.get(p.id)?.avgCost : null;
      const q = toBase(num(r.quantity || "0"), r.unit);
      const e = toBase(r.estimated, r.unit);
      acc.base += q;
      acc.estimatedBase += e;
      if (uc === null || uc === undefined) acc.missing += 1;
      else acc.cost += q * uc;
      if (p && uc !== null && uc !== undefined) acc.estimatedCost += e * uc;
      return acc;
    },
    { base: 0, estimatedBase: 0, cost: 0, estimatedCost: 0, missing: 0 },
  );

  const negativeNames = useMemo(() => {
    const perProduct = new Map<string, number>();
    for (const r of rows) {
      if (!r.productId) continue;
      perProduct.set(r.productId, (perProduct.get(r.productId) ?? 0) + toBase(num(r.quantity || "0"), r.unit));
    }
    return [...perProduct.entries()]
      .filter(([id, q]) => (stock.get(id)?.quantity ?? 0) - q < 0)
      .map(([id]) => byId.get(id)?.name ?? id);
  }, [rows, stock, byId]);

  function submit() {
    const input: SessionInput = {
      procedureId,
      sessionDate: date,
      quantity: attendances,
      notes,
      allowNegative,
      negativeJustification: justification,
      items: rows
        .filter((r) => r.productId)
        .map((r) => ({
          productId: r.productId,
          quantity: num(r.quantity || "0"),
          unit: r.unit,
          estimatedQuantity: r.estimated,
        })),
    };
    if (original) {
      const saved = save((d) => correctSession(d, original.id, input, key), "Atendimento corrigido");
      if (saved) reset();
    } else {
      const saved = save((d) => registerSession(d, input, key), "Atendimento registrado e estoque baixado");
      if (saved) reset();
    }
    onClose();
  }

  return (
    <Dialog open onOpenChange={(o) => (o ? undefined : onClose())}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{original ? "Corrigir atendimento" : "Registrar atendimento"}</DialogTitle>
          <DialogDescription>
            A ficha do procedimento já traz as quantidades previstas. Ajuste para o que foi realmente usado.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Procedimento *">
              <SelectField
                value={procedureId}
                onChange={(v) => {
                  setProcedureId(v);
                  setRows(buildRows(v, attendances));
                }}
                options={procedures.map((p) => ({ value: p.id, label: p.name }))}
                placeholder={procedures.length ? "Selecione" : "Nenhum procedimento ativo"}
              />
            </Field>
            <Field label="Data *">
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
            <Field label="Qtde de atendimentos *">
              <Input
                inputMode="numeric"
                value={quantity}
                onChange={(e) => {
                  setQuantity(e.target.value);
                  setRows(buildRows(procedureId, Math.max(1, Math.round(num(e.target.value || "1") || 1))));
                }}
              />
            </Field>
          </div>

          <div className="rounded-lg border bg-muted/30 p-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-semibold">Produtos consumidos</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setRows((cur) => [...cur, { productId: "", quantity: "", unit: "ml", estimated: 0 }])}
                disabled={products.length === 0}
              >
                <Plus className="size-4" />
                Adicionar produto
              </Button>
            </div>

            {rows.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Nenhum produto na lista. Adicione manualmente ou preencha a ficha do procedimento.
              </p>
            ) : (
              <ul className="space-y-2">
                {rows.map((r, i) => {
                  const p = byId.get(r.productId);
                  const diff = toBase(num(r.quantity || "0"), r.unit) - toBase(r.estimated, r.unit);
                  return (
                    <li key={i} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_7rem_6rem_auto] sm:items-center">
                      <ProductSelect
                        products={products}
                        value={r.productId}
                        onChange={(v) => {
                          const prod = byId.get(v);
                          updateRow(i, { productId: v, unit: prod ? prod.contentUnit : r.unit });
                        }}
                      />
                      <div className="flex items-center gap-1">
                        <Input
                          inputMode="decimal"
                          value={r.quantity}
                          onChange={(e) => updateRow(i, { quantity: e.target.value })}
                          placeholder="0"
                        />
                        <SelectField
                          className="w-20"
                          value={r.unit}
                          onChange={(v) => updateRow(i, { unit: v as ContentUnit })}
                          options={compatibleUnits(p?.contentUnit ?? "ml").map((u) => ({ value: u, label: UNIT_LABEL[u] }))}
                        />
                      </div>
                      <span className="text-xs text-muted-foreground numeric">
                        {r.estimated > 0 ? (
                          <>
                            ficha {formatNumber(r.estimated, 2)}
                            {Math.abs(diff) > 0.0001 ? (
                              <span className={diff > 0 ? " text-warning" : " text-success"}>
                                {" "}
                                ({diff > 0 ? "+" : ""}
                                {formatNumber(diff, 2)})
                              </span>
                            ) : null}
                          </>
                        ) : (
                          "—"
                        )}
                      </span>
                      <Button variant="ghost" size="icon" onClick={() => setRows((cur) => cur.filter((_, idx) => idx !== i))}>
                        <X className="size-4" />
                        <span className="sr-only">Remover produto</span>
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <Field label="Observações">
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Cliente recorrente, produto substituído…" />
          </Field>

          {negativeNames.length ? (
            <div className="grid gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
              <label className="flex items-start gap-3">
                <Checkbox checked={allowNegative} onCheckedChange={(c) => setAllowNegative(Boolean(c))} />
                <span className="text-destructive">
                  Estoque insuficiente para: {negativeNames.join(", ")}. Autorize o saldo negativo para registrar mesmo
                  assim — por exemplo quando a compra ainda não foi lançada.
                </span>
              </label>
              {allowNegative ? (
                <Field label="Justificativa *">
                  <Input
                    value={justification}
                    onChange={(e) => setJustification(e.target.value)}
                    placeholder="Compra chega amanhã, erro no estoque inicial…"
                  />
                </Field>
              ) : null}
            </div>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-muted/50 px-3 py-2.5 text-sm">
            <span className="text-muted-foreground">
              Consumo: <span className="font-semibold text-foreground numeric">{formatNumber(totals.base, 2)}</span>
            </span>
            <span className="text-muted-foreground">
              Pela ficha: <span className="font-semibold text-foreground numeric">{formatNumber(totals.estimatedBase, 2)}</span>
            </span>
            <span className="font-semibold numeric">
              Custo: {formatMoney(totals.cost)}
              {totals.missing > 0 ? ` (${totals.missing} sem custo)` : ""}
            </span>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={submit}>{original ? "Salvar correção" : "Registrar atendimento"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CancelSessionDialog({ session, onClose }: { session: ServiceSession; onClose: () => void }) {
  const [reason, setReason] = useState("");
  const [date, setDate] = useState(todayISO());

  function submit() {
    save((d) => cancelSession(d, session.id, reason, date), "Atendimento cancelado e consumo estornado");
    onClose();
  }

  return (
    <Dialog open onOpenChange={(o) => (o ? undefined : onClose())}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Cancelar atendimento</DialogTitle>
          <DialogDescription>
            {session.procedureNameSnapshot} · {formatDate(session.sessionDate)}. Todo o consumo deste lançamento volta
            para o estoque.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <Field label="Motivo *">
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Cliente desmarcou, lançamento duplicado…" />
          </Field>
          <Field label="Data do estorno">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Voltar
          </Button>
          <Button variant="destructive" onClick={submit}>
            Cancelar atendimento
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
