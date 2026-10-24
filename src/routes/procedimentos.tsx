import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Download, MoreHorizontal, Pencil, Plus, Power, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
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
  StatusPill,
  useSubmission,
  save,
} from "@/components/common";
import { useDB } from "@/lib/storage/db";
import { formatMoney, formatNumber, formatUnitCost } from "@/lib/calculations/money";
import { UNIT_LABEL, baseUnitOf, compatibleUnits, toBase } from "@/lib/calculations/units";
import { stockByProduct } from "@/lib/calculations/stock";
import { deleteProcedure, recipeCost, saveProcedure, type ProcedureInput } from "@/features/procedures/service";
import { exportCsv, proceduresCsv } from "@/lib/services/reports";
import type { ContentUnit, Procedure } from "@/types";

const TITLE = "Procedimentos";
const DESCRIPTION =
  "Cada procedimento guarda sua ficha de insumos. Assim o sistema sabe quanto deveria custar cada atendimento e compara com o que foi realmente usado.";

export const Route = createFileRoute("/procedimentos")({
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
  component: ProceduresPage,
});

function num(s: string): number {
  const n = Number(String(s).trim().replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
}

interface RecipeRow {
  productId: string;
  quantity: string;
  unit: ContentUnit;
}

function ProceduresPage() {
  const db = useDB();
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Procedure | "new" | null>(null);
  const [costOf, setCostOf] = useState<Procedure | null>(null);
  const [removing, setRemoving] = useState<Procedure | null>(null);

  const stock = useMemo(() => stockByProduct(db), [db]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return db.procedures
      .filter((p) => !q || p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q))
      .map((procedure) => ({
        procedure,
        recipe: db.recipeItems.filter((r) => r.procedureId === procedure.id),
        cost: recipeCost(db, procedure.id),
      }))
      .sort((a, b) => a.procedure.name.localeCompare(b.procedure.name, "pt-BR"));
  }, [db, query]);

  return (
    <>
      <PageHeader
        title={TITLE}
        description={DESCRIPTION}
        actions={
          <>
            <Button variant="outline" onClick={() => exportCsv("procedimentos", proceduresCsv(db))}>
              <Download className="size-4" />
              Planilha
            </Button>
            <Button onClick={() => setEditing("new")} disabled={db.products.length === 0}>
              <Plus className="size-4" />
              Novo procedimento
            </Button>
          </>
        }
      />

      {db.procedures.length === 0 ? (
        <EmptyState
          title="Nenhum procedimento cadastrado"
          description={
            db.products.length === 0
              ? "Cadastre os produtos primeiro — a ficha de um procedimento é feita com eles."
              : "Monte a ficha de cada procedimento com os insumos e a quantidade usada em um atendimento."
          }
          action={
            <Button onClick={() => setEditing("new")} disabled={db.products.length === 0}>
              <Plus className="size-4" />
              Criar procedimento
            </Button>
          }
        />
      ) : (
        <Panel>
          <div className="mb-4">
            <SearchInput value={query} onChange={setQuery} placeholder="Buscar procedimento" className="sm:max-w-sm" />
          </div>

          {rows.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">Nenhum procedimento com esse nome.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Procedimento</TableHead>
                    <TableHead className="text-right">Duração</TableHead>
                    <TableHead className="text-right">Insumos</TableHead>
                    <TableHead className="text-right">Custo estimado</TableHead>
                    <TableHead>Situação</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.procedure.id} className={r.procedure.active ? "" : "opacity-60"}>
                      <TableCell>
                        <div className="font-medium">{r.procedure.name}</div>
                        {r.procedure.description ? (
                          <div className="max-w-sm truncate text-xs text-muted-foreground">{r.procedure.description}</div>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-right numeric">
                        {r.procedure.estimatedDuration ? `${formatNumber(r.procedure.estimatedDuration, 0)} min` : "—"}
                      </TableCell>
                      <TableCell className="text-right numeric">{r.recipe.length}</TableCell>
                      <TableCell className="text-right numeric">
                        {r.cost.total !== null ? formatMoney(r.cost.total) : `${formatMoney(r.cost.partial)}*`}
                      </TableCell>
                      <TableCell>
                        <StatusPill tone={r.procedure.active ? "success" : "muted"}>
                          {r.procedure.active ? "Ativo" : "Inativo"}
                        </StatusPill>
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger className="inline-flex size-8 items-center justify-center rounded-md border bg-card hover:bg-accent">
                            <MoreHorizontal className="size-4" />
                            <span className="sr-only">Ações de {r.procedure.name}</span>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onSelect={() => setEditing(r.procedure)}>
                              <Pencil className="size-4" />
                              Editar ficha
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => setCostOf(r.procedure)}>
                              <Plus className="size-4" />
                              Ver custo detalhado
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onSelect={() =>
                                save(
                                  (d) =>
                                    saveProcedure(
                                      d,
                                      {
                                        name: r.procedure.name,
                                        description: r.procedure.description,
                                        estimatedDuration: r.procedure.estimatedDuration,
                                        active: !r.procedure.active,
                                        recipe: d.recipeItems
                                          .filter((x) => x.procedureId === r.procedure.id)
                                          .map((x) => ({ productId: x.productId, quantity: x.quantity, unit: x.unit })),
                                      },
                                      r.procedure.id,
                                    ),
                                  r.procedure.active ? "Procedimento inativado" : "Procedimento ativado",
                                )
                              }
                            >
                              <Power className="size-4" />
                              {r.procedure.active ? "Inativar" : "Ativar"}
                            </DropdownMenuItem>
                            {!db.sessions.some((s) => s.procedureId === r.procedure.id) ? (
                              <DropdownMenuItem className="text-destructive" onSelect={() => setRemoving(r.procedure)}>
                                <Trash2 className="size-4" />
                                Excluir
                              </DropdownMenuItem>
                            ) : null}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          <p className="mt-3 text-xs text-muted-foreground">
            * Quando algum insumo ainda não tem custo conhecido (nenhuma compra), o total aparece parcial.
          </p>
        </Panel>
      )}

      {editing !== null ? (
        <ProcedureForm key={editing === "new" ? "new" : editing.id} procedure={editing === "new" ? null : editing} onClose={() => setEditing(null)} />
      ) : null}

      {costOf ? <CostDialog key={costOf.id} procedure={costOf} onClose={() => setCostOf(null)} /> : null}

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(o) => (o ? undefined : setRemoving(null))}
        title="Excluir procedimento"
        description={removing ? `"${removing.name}" e sua ficha de insumos serão removidos.` : undefined}
        confirmLabel="Excluir"
        tone="destructive"
        onConfirm={() => {
          if (!removing) return;
          save((d) => deleteProcedure(d, removing.id), "Procedimento excluído");
          setRemoving(null);
        }}
      />
    </>
  );
}

function ProcedureForm({ procedure, onClose }: { procedure: Procedure | null; onClose: () => void }) {
  const db = useDB();
  const { key, reset } = useSubmission();
  const products = useMemo(() => db.products.filter((p) => p.active), [db.products]);
  const byId = useMemo(() => new Map(db.products.map((p) => [p.id, p])), [db.products]);
  const stock = useMemo(() => stockByProduct(db), [db]);

  const [name, setName] = useState(procedure?.name ?? "");
  const [description, setDescription] = useState(procedure?.description ?? "");
  const [duration, setDuration] = useState(procedure?.estimatedDuration ? String(procedure.estimatedDuration) : "");
  const [active, setActive] = useState(procedure?.active ?? true);
  const [rows, setRows] = useState<RecipeRow[]>(() =>
    procedure
      ? db.recipeItems
          .filter((r) => r.procedureId === procedure.id)
          .map((r) => ({ productId: r.productId, quantity: String(r.quantity), unit: r.unit }))
      : [],
  );

  const estimate = rows.reduce((total, r) => {
    const p = byId.get(r.productId);
    const uc = p ? stock.get(p.id)?.avgCost : null;
    const q = num(r.quantity || "0");
    if (!p || uc === null || !Number.isFinite(q) || uc === undefined) return total;
    return total + toBase(q, r.unit) * uc;
  }, 0);

  function updateRow(i: number, patch: Partial<RecipeRow>) {
    setRows((cur) => cur.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  function submit() {
    const input: ProcedureInput = {
      name,
      description,
      estimatedDuration: duration.trim() ? num(duration) : null,
      active,
      recipe: rows
        .filter((r) => r.productId)
        .map((r) => ({ productId: r.productId, quantity: num(r.quantity), unit: r.unit })),
    };
    const saved = save((d) => saveProcedure(d, input, procedure?.id, key), procedure ? "Ficha atualizada" : "Procedimento criado");
    if (saved) reset();
    onClose();
  }

  return (
    <Dialog open onOpenChange={(o) => (o ? undefined : onClose())}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{procedure ? "Editar procedimento" : "Novo procedimento"}</DialogTitle>
          <DialogDescription>
            A ficha é uma referência: o que o atendimento deveria consumir. Ao registrar um atendimento você informa o
            que foi realmente usado.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_8rem]">
            <Field label="Nome *">
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Depilação a laser - axila" />
            </Field>
            <Field label="Duração (min)">
              <Input inputMode="numeric" value={duration} onChange={(e) => setDuration(e.target.value)} placeholder="30" />
            </Field>
          </div>
          <Field label="Descrição">
            <Textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Passo a passo resumido, produtos de apoio, observações de segurança."
            />
          </Field>

          <div className="rounded-lg border bg-muted/30 p-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-semibold">Ficha de insumos</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setRows((cur) => [...cur, { productId: "", quantity: "", unit: "ml" }])}
                disabled={products.length === 0}
              >
                <Plus className="size-4" />
                Adicionar insumo
              </Button>
            </div>

            {rows.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                Nenhum insumo ainda. Adicione os produtos usados em um atendimento.
              </p>
            ) : (
              <ul className="space-y-2">
                {rows.map((r, i) => {
                  const p = byId.get(r.productId);
                  return (
                    <li key={i} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_7rem_7rem_auto] sm:items-center">
                      <ProductSelect
                        products={products}
                        value={r.productId}
                        onChange={(v) => {
                          const prod = byId.get(v);
                          updateRow(i, { productId: v, unit: prod ? prod.contentUnit : r.unit });
                        }}
                      />
                      <Input
                        inputMode="decimal"
                        value={r.quantity}
                        onChange={(e) => updateRow(i, { quantity: e.target.value })}
                        placeholder="0"
                      />
                      <SelectFieldLocal
                        value={r.unit}
                        onChange={(v) => updateRow(i, { unit: v as ContentUnit })}
                        options={compatibleUnits(p?.contentUnit ?? "ml").map((u) => ({ value: u, label: UNIT_LABEL[u] }))}
                      />
                      <Button variant="ghost" size="icon" onClick={() => setRows((cur) => cur.filter((_, idx) => idx !== i))}>
                        <X className="size-4" />
                        <span className="sr-only">Remover linha</span>
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}

            <p className="mt-3 text-sm text-muted-foreground">
              Custo estimado por atendimento com o custo médio atual:{" "}
              <span className="font-semibold text-foreground numeric">{formatMoney(estimate)}</span>
            </p>
          </div>

          <label className="flex items-center gap-3 text-sm">
            <Switch checked={active} onCheckedChange={(c) => setActive(Boolean(c))} />
            Procedimento ativo
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={submit}>{procedure ? "Salvar alterações" : "Criar procedimento"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SelectFieldLocal({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <Field label="" className="[&>label]:hidden">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-full rounded-md border border-input bg-card px-3 text-sm shadow-soft"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Field>
  );
}

function CostDialog({ procedure, onClose }: { procedure: Procedure; onClose: () => void }) {
  const db = useDB();
  const cost = recipeCost(db, procedure.id);

  return (
    <Dialog open onOpenChange={(o) => (o ? undefined : onClose())}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Custo de {procedure.name}</DialogTitle>
          <DialogDescription>
            Quantidade da ficha multiplicada pelo custo médio atual de cada produto (por unidade base).
          </DialogDescription>
        </DialogHeader>

        {cost.lines.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Esta ficha ainda não tem insumos.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Insumo</TableHead>
                <TableHead className="text-right">Quantidade</TableHead>
                <TableHead className="text-right">Custo unitário</TableHead>
                <TableHead className="text-right">Custo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {cost.lines.map((l, i) => (
                <TableRow key={`${l.productId}-${i}`}>
                  <TableCell className="font-medium">{l.name}</TableCell>
                  <TableCell className="text-right numeric">
                    {formatNumber(l.baseQty, 2)} {l.unit}
                  </TableCell>
                  <TableCell className="text-right numeric">{formatUnitCost(l.unitCost, l.unit)}</TableCell>
                  <TableCell className="text-right numeric">{formatMoney(l.cost)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        <div className="rounded-lg bg-muted/50 px-3 py-2.5 text-sm">
          <span className="font-semibold">
            {cost.total !== null ? `Custo por atendimento: ${formatMoney(cost.total)}` : `Parcial conhecido: ${formatMoney(cost.partial)}`}
          </span>
          {cost.missing.length ? (
            <p className="mt-1 text-xs text-muted-foreground">Sem custo conhecido: {cost.missing.join(", ")}</p>
          ) : null}
        </div>

        <DialogFooter>
          <Button onClick={onClose}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
