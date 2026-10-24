import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Download, History, MoreHorizontal, Pencil, Plus, Power, Trash2 } from "lucide-react";

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
  SearchInput,
  SelectField,
  StockBadge,
  StatusPill,
  TablePager,
  usePagination,
  useSubmission,
  save,
} from "@/components/common";
import { useDB } from "@/lib/storage/db";
import { formatDate, todayISO } from "@/lib/calculations/dates";
import { formatMoney, formatNumber, formatUnitCost } from "@/lib/calculations/money";
import { CONTENT_UNITS, UNIT_LABEL, baseUnitOf, compatibleUnits } from "@/lib/calculations/units";
import {
  adjustStock,
  createProduct,
  deleteProduct,
  hasHistory,
  setProductActive,
  updateProduct,
  type ProductInput,
} from "@/features/products/service";
import { MOVEMENT_LABEL, MOVEMENT_TONE, productViews, suppliersOf, type ProductView } from "@/lib/selectors";
import { exportCsv, movementsCsv, productsCsv } from "@/lib/services/reports";
import type { ContentUnit, Product } from "@/types";

const TITLE = "Produtos e estoque";
const DESCRIPTION =
  "Cadastro completo de cada produto, saldo atualizado automaticamente pelas compras e atendimentos, e ajustes manuais com motivo registrado.";

export const Route = createFileRoute("/produtos")({
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
  component: ProductsPage,
});

function num(s: string): number {
  const n = Number(String(s).trim().replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
}

function ProductsPage() {
  const db = useDB();
  const navigate = useNavigate();
  const search = Route.useSearch();

  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("todas");
  const [status, setStatus] = useState("todos");
  const [showInactive, setShowInactive] = useState(false);
  const [editing, setEditing] = useState<Product | "new" | null>(null);
  const [adjusting, setAdjusting] = useState<ProductView | null>(null);
  const [movementsOf, setMovementsOf] = useState<Product | null>(null);
  const [removing, setRemoving] = useState<Product | null>(null);

  useEffect(() => {
    if (search.new === "1") {
      setEditing("new");
      void navigate({ to: "/produtos", search: { new: undefined } });
    }
  }, [search.new, navigate]);

  const all = useMemo(() => productViews(db), [db]);

  const categories = useMemo(() => {
    const set = new Set<string>(db.settings.categories);
    db.products.forEach((p) => p.category.trim() && set.add(p.category.trim()));
    return [...set].sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [db.settings.categories, db.products]);

  const filtered = all
    .filter((v) => {
      if (!showInactive && !v.product.active) return false;
      if (category !== "todas" && v.product.category !== category) return false;
      if (status !== "todos" && v.status !== status) return false;
      const q = query.trim().toLowerCase();
      if (!q) return true;
      return `${v.product.name} ${v.product.brand} ${v.product.category} ${v.product.defaultSupplier}`
        .toLowerCase()
        .includes(q);
    })
    .sort((a, b) => a.product.name.localeCompare(b.product.name, "pt-BR"));

  const pager = usePagination(filtered, db.settings.pageSize);

  return (
    <>
      <PageHeader
        title={TITLE}
        description={DESCRIPTION}
        actions={
          <>
            <Button variant="outline" onClick={() => exportCsv("produtos", productsCsv(db))}>
              <Download className="size-4" />
              Planilha
            </Button>
            <Button onClick={() => setEditing("new")}>
              <Plus className="size-4" />
              Novo produto
            </Button>
          </>
        }
      />

      {db.products.length === 0 ? (
        <EmptyState
          title="Nenhum produto cadastrado"
          description="Cadastre os produtos que você usa. Informe o conteúdo de cada embalagem (ex.: 500 ml) para que o sistema consiga comparar preços e calcular o custo por unidade."
          action={
            <Button onClick={() => setEditing("new")}>
              <Plus className="size-4" />
              Cadastrar produto
            </Button>
          }
        />
      ) : (
        <Panel>
          <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_12rem_12rem_auto]">
            <SearchInput value={query} onChange={setQuery} placeholder="Buscar por nome, marca ou fornecedor" />
            <SelectField
              value={category}
              onChange={setCategory}
              options={[{ value: "todas", label: "Todas as categorias" }, ...categories.map((c) => ({ value: c, label: c }))]}
            />
            <SelectField
              value={status}
              onChange={setStatus}
              options={[
                { value: "todos", label: "Todas as situações" },
                { value: "ok", label: "Em estoque" },
                { value: "baixo", label: "Estoque baixo" },
                { value: "sem_estoque", label: "Sem estoque" },
                { value: "negativo", label: "Negativo" },
              ]}
            />
            <label className="flex items-center gap-2 self-center text-sm text-muted-foreground">
              <Switch checked={showInactive} onCheckedChange={(c) => setShowInactive(Boolean(c))} />
              Inativos
            </label>
          </div>

          {filtered.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Nenhum produto com esses filtros. Ajuste a busca ou a situação.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Produto</TableHead>
                    <TableHead className="text-right">Em estoque</TableHead>
                    <TableHead>Situação</TableHead>
                    <TableHead className="text-right">Custo médio</TableHead>
                    <TableHead className="text-right">Último preço</TableHead>
                    <TableHead className="text-right">Valor em estoque</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pager.slice.map((v) => (
                    <TableRow key={v.product.id} className={v.product.active ? "" : "opacity-60"}>
                      <TableCell>
                        <div className="font-medium">{v.product.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {[v.product.brand, v.product.category].filter(Boolean).join(" · ") || "sem categoria"}
                        </div>
                      </TableCell>
                      <TableCell className="text-right numeric">
                        {formatNumber(v.packages, 2)} {v.product.packagingUnit}
                        <div className="text-xs text-muted-foreground">
                          {formatNumber(v.stock.quantity, 2)} {baseUnitOf(v.product.contentUnit)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <StockBadge status={v.status} />
                      </TableCell>
                      <TableCell className="text-right numeric">
                        {formatUnitCost(v.stock.avgCost, baseUnitOf(v.product.contentUnit))}
                      </TableCell>
                      <TableCell className="text-right numeric">
                        {v.lastPurchase ? (
                          <>
                            {formatMoney(v.lastPurchase.normalizedUnitCost)}
                            <div className="text-xs text-muted-foreground">{formatDate(v.lastPurchase.date)}</div>
                          </>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell className="text-right numeric">{formatMoney(v.stockValue)}</TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger className="inline-flex size-8 items-center justify-center rounded-md border bg-card hover:bg-accent">
                            <MoreHorizontal className="size-4" />
                            <span className="sr-only">Ações de {v.product.name}</span>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onSelect={() => setEditing(v.product)}>
                              <Pencil className="size-4" />
                              Editar cadastro
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => setAdjusting(v)}>
                              <Plus className="size-4" />
                              Ajustar estoque
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => setMovementsOf(v.product)}>
                              <History className="size-4" />
                              Movimentações
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onSelect={() => save((d) => setProductActive(d, v.product.id, !v.product.active), v.product.active ? "Produto inativado" : "Produto reativado")}>
                              <Power className="size-4" />
                              {v.product.active ? "Inativar" : "Reativar"}
                            </DropdownMenuItem>
                            {hasHistory(db, v.product.id) ? null : (
                              <DropdownMenuItem className="text-destructive" onSelect={() => setRemoving(v.product)}>
                                <Trash2 className="size-4" />
                                Excluir
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
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

      {editing !== null ? (
        <ProductForm
          key={editing === "new" ? "new" : editing.id}
          product={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
        />
      ) : null}

      {adjusting ? <AdjustForm key={adjusting.product.id} view={adjusting} onClose={() => setAdjusting(null)} /> : null}

      {movementsOf ? (
        <MovementsDialog key={movementsOf.id} product={movementsOf} onClose={() => setMovementsOf(null)} />
      ) : null}

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(o) => (o ? undefined : setRemoving(null))}
        title="Excluir produto"
        description={removing ? `O produto "${removing.name}" será removido do cadastro. Essa ação não pode ser desfeita.` : undefined}
        confirmLabel="Excluir"
        tone="destructive"
        onConfirm={() => {
          if (!removing) return;
          const ok = save((d) => deleteProduct(d, removing.id), "Produto excluído");
          setRemoving(null);
          return ok;
        }}
      />
    </>
  );
}

type FormState = {
  name: string;
  category: string;
  brand: string;
  description: string;
  packagingUnit: string;
  contentQuantity: string;
  contentUnit: ContentUnit;
  minimumStock: string;
  defaultSupplier: string;
  notes: string;
  active: boolean;
  initialStock: string;
};

function ProductForm({ product, onClose }: { product: Product | null; onClose: () => void }) {
  const db = useDB();
  const { key, reset } = useSubmission();
  const [f, setF] = useState<FormState>(() => ({
    name: product?.name ?? "",
    category: product?.category ?? "",
    brand: product?.brand ?? "",
    description: product?.description ?? "",
    packagingUnit: product?.packagingUnit ?? db.settings.packagingUnits[0] ?? "frasco",
    contentQuantity: product ? String(product.contentQuantity) : "",
    contentUnit: product?.contentUnit ?? "ml",
    minimumStock: product ? String(product.minimumStock) : "0",
    defaultSupplier: product?.defaultSupplier ?? "",
    notes: product?.notes ?? "",
    active: product?.active ?? true,
    initialStock: "0",
  }));

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((cur) => ({ ...cur, [k]: v }));

  function submit() {
    const input: ProductInput = {
      name: f.name,
      category: f.category.trim(),
      brand: f.brand,
      description: f.description,
      packagingUnit: f.packagingUnit.trim(),
      contentQuantity: num(f.contentQuantity),
      contentUnit: f.contentUnit,
      minimumStock: num(f.minimumStock || "0"),
      defaultSupplier: f.defaultSupplier,
      notes: f.notes,
      active: f.active,
    };
    if (product) {
      save((d) => updateProduct(d, product.id, input), "Cadastro atualizado");
    } else {
      const created = save(
        (d) => createProduct(d, input, { submissionId: key, initialPackages: num(f.initialStock || "0") || 0 }),
        "Produto cadastrado",
      );
      if (created) reset();
    }
    onClose();
  }

  return (
    <Dialog open onOpenChange={(o) => (o ? undefined : onClose())}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{product ? "Editar produto" : "Novo produto"}</DialogTitle>
          <DialogDescription>
            O conteúdo da embalagem é o que permite comparar preços de embalagens diferentes e calcular o custo por
            unidade.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nome *" className="sm:col-span-2">
            <Input value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="Cera hot creme de azuleno" />
          </Field>
          <Field label="Categoria">
            <Input
              list="categorias-produto"
              value={f.category}
              onChange={(e) => set("category", e.target.value)}
              placeholder="Cera"
            />
            <datalist id="categorias-produto">
              {db.settings.categories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </Field>
          <Field label="Marca">
            <Input value={f.brand} onChange={(e) => set("brand", e.target.value)} placeholder="Depileflac" />
          </Field>
          <Field label="Unidade de controle *" hint="Como você conta: frasco, pote, pacote…">
            <Input
              list="embalagens-produto"
              value={f.packagingUnit}
              onChange={(e) => set("packagingUnit", e.target.value)}
              placeholder="frasco"
            />
            <datalist id="embalagens-produto">
              {db.settings.packagingUnits.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </Field>
          <Field label="Conteúdo por embalagem *">
            <div className="flex gap-2">
              <Input
                inputMode="decimal"
                value={f.contentQuantity}
                onChange={(e) => set("contentQuantity", e.target.value)}
                placeholder="500"
              />
              <SelectField
                className="w-28"
                value={f.contentUnit}
                onChange={(v) => set("contentUnit", v as ContentUnit)}
                options={CONTENT_UNITS.map((u) => ({ value: u, label: UNIT_LABEL[u] }))}
              />
            </div>
          </Field>
          <Field label="Estoque mínimo (embalagens)" hint="Abaixo disso o produto entra na lista de atenção.">
            <Input inputMode="decimal" value={f.minimumStock} onChange={(e) => set("minimumStock", e.target.value)} />
          </Field>
          <Field label="Fornecedor padrão">
            <Input
              list="fornecedores-produto"
              value={f.defaultSupplier}
              onChange={(e) => set("defaultSupplier", e.target.value)}
              placeholder="Studio Cosméticos"
            />
            <datalist id="fornecedores-produto">
              {suppliersOf(db).map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </Field>
          <Field label="Observações" className="sm:col-span-2">
            <Textarea
              rows={2}
              value={f.notes}
              onChange={(e) => set("notes", e.target.value)}
              placeholder="Rende cerca de 12 atendimentos de perna inteira."
            />
          </Field>
          {!product ? (
            <Field label="Estoque inicial (embalagens)" hint="Só para quem está começando a usar o sistema agora.">
              <Input inputMode="decimal" value={f.initialStock} onChange={(e) => set("initialStock", e.target.value)} />
            </Field>
          ) : null}
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          {product ? (
            <label className="flex items-center gap-3 text-sm text-muted-foreground">
              <Switch checked={f.active} onCheckedChange={(c) => set("active", Boolean(c))} />
              Produto ativo
            </label>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button onClick={submit}>{product ? "Salvar alterações" : "Cadastrar produto"}</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AdjustForm({ view, onClose }: { view: ProductView; onClose: () => void }) {
  const { key, reset } = useSubmission();
  const [direction, setDirection] = useState<"in" | "out">("in");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState<ContentUnit>(view.product.contentUnit);
  const [date, setDate] = useState(todayISO());
  const [reason, setReason] = useState("");
  const [allowNegative, setAllowNegative] = useState(false);

  const base = baseUnitOf(view.product.contentUnit);
  const q = num(quantity || "0");
  const predicted = view.stock.quantity + (direction === "in" ? q : -q);
  const wouldGoNegative = Number.isFinite(q) && predicted < 0;

  function submit() {
    const ok = save(
      (d) =>
        adjustStock(d, {
          productId: view.product.id,
          direction,
          quantity: num(quantity),
          unit,
          date,
          reason,
          allowNegative,
          submissionId: key,
        }),
      "Ajuste registrado",
    );
    if (ok !== null) reset();
    onClose();
  }

  return (
    <Dialog open onOpenChange={(o) => (o ? undefined : onClose())}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Ajustar estoque de {view.product.name}</DialogTitle>
          <DialogDescription>
            Saldo atual: {formatNumber(view.stock.quantity, 2)} {base}. Use o ajuste para perdas, sobras,
            doações ou correções de contagem.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <Field label="Direção">
            <SelectField
              value={direction}
              onChange={(v) => setDirection(v as "in" | "out")}
              options={[
                { value: "in", label: "Entrada (soma ao estoque)" },
                { value: "out", label: "Saída (diminui o estoque)" },
              ]}
            />
          </Field>
          <Field label="Quantidade *">
            <div className="flex gap-2">
              <Input inputMode="decimal" value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="0" />
              <SelectField
                className="w-28"
                value={unit}
                onChange={(v) => setUnit(v as ContentUnit)}
                options={compatibleUnits(view.product.contentUnit).map((u) => ({ value: u, label: UNIT_LABEL[u] }))}
              />
            </div>
          </Field>
          <Field label="Data">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Motivo *">
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Perda por queda, sobra do atendimento, contagem…"
            />
          </Field>

          {wouldGoNegative ? (
            <label className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
              <Checkbox checked={allowNegative} onCheckedChange={(c) => setAllowNegative(Boolean(c))} />
              <span className="text-destructive">
                Este ajuste deixa o saldo em {formatNumber(predicted, 2)} {base}. Autorize o saldo negativo e deixe
                claro o motivo no campo acima.
              </span>
            </label>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={submit}>Registrar ajuste</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MovementsDialog({ product, onClose }: { product: Product; onClose: () => void }) {
  const db = useDB();
  const movements = db.movements
    .filter((m) => m.productId === product.id)
    .sort((a, b) => b.movementDate.localeCompare(a.movementDate) || b.createdAt.localeCompare(a.createdAt));

  return (
    <Dialog open onOpenChange={(o) => (o ? undefined : onClose())}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Movimentações de {product.name}</DialogTitle>
          <DialogDescription>
            Tudo o que alterou o saldo deste produto, na ordem em que aconteceu.
          </DialogDescription>
        </DialogHeader>

        {movements.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma movimentação ainda.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead className="text-right">Quantidade</TableHead>
                  <TableHead className="text-right">Custo unitário</TableHead>
                  <TableHead>Observação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {movements.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="numeric">{formatDate(m.movementDate)}</TableCell>
                    <TableCell>
                      <StatusPill tone={MOVEMENT_TONE[m.movementType]}>{MOVEMENT_LABEL[m.movementType]}</StatusPill>
                    </TableCell>
                    <TableCell className="text-right numeric">
                      {m.quantity > 0 ? "+" : ""}
                      {formatNumber(m.quantity, 2)} {m.unit}
                    </TableCell>
                    <TableCell className="text-right numeric">{formatUnitCost(m.unitCost, m.unit)}</TableCell>
                    <TableCell className="max-w-60 text-xs text-muted-foreground">{m.notes || "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => exportCsv(`movimentacoes-${product.name}`, movementsCsv(db, product.id))}>
            <Download className="size-4" />
            Exportar planilha
          </Button>
          <Button onClick={onClose}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
