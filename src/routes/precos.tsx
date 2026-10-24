import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Download, Search, TrendingDown, TrendingUp } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState, PageHeader, Panel, StatCard, StatusPill } from "@/components/common";
import { useDB } from "@/lib/storage/db";
import { formatDate, monthLabel, todayISO } from "@/lib/calculations/dates";
import { formatMoney, formatNumber, formatPercent, formatUnitCost } from "@/lib/calculations/money";
import { baseUnitOf } from "@/lib/calculations/units";
import { monthlyPrices, priceObservations, priceStats } from "@/lib/calculations/prices";
import { priceMovers } from "@/lib/selectors";
import { exportCsv, priceHistoryCsv } from "@/lib/services/reports";
import { cn } from "@/lib/utils";

const TITLE = "Análise de preços";
const DESCRIPTION =
  "O histórico de cada produto comparado em uma base comum: quanto custou a unidade (ml, g ou peça) em cada compra, independente do tamanho da embalagem.";

export const Route = createFileRoute("/precos")({
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
  component: PricesPage,
});

function PricesPage() {
  const db = useDB();
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState("");

  const products = useMemo(
    () => db.products.slice().sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
    [db.products],
  );
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q
      ? products.filter((p) => `${p.name} ${p.brand} ${p.category}`.toLowerCase().includes(q))
      : products;
  }, [products, query]);

  const product = products.find((p) => p.id === selectedId) ?? products[0] ?? null;
  const obs = product ? priceObservations(db, product) : [];
  const stats = priceStats(obs);
  const base = product ? baseUnitOf(product.contentUnit) : "";
  const from = obs[0]?.date ?? todayISO();
  const months = product ? monthlyPrices(obs, from, todayISO()) : [];
  const movers = priceMovers(db, 6);

  return (
    <>
      <PageHeader
        title={TITLE}
        description={DESCRIPTION}
        actions={
          product && obs.length ? (
            <Button variant="outline" onClick={() => exportCsv(`precos-${product.name}`, priceHistoryCsv(db, product.id))}>
              <Download className="size-4" />
              Planilha
            </Button>
          ) : null
        }
      />

      {products.length === 0 ? (
        <EmptyState
          title="Cadastre produtos para analisar preços"
          description="A comparação começa depois que você registra ao menos duas compras do mesmo produto."
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]">
          <Panel className="lg:sticky lg:top-6 lg:self-start">
            <div className="relative mb-3">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar produto" className="pl-9" />
            </div>
            {filtered.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Nada encontrado.</p>
            ) : (
              <ul className="max-h-[28rem] divide-y overflow-y-auto">
                {filtered.map((p) => (
                  <li key={p.id}>
                    <button
                      onClick={() => setSelectedId(p.id)}
                      className={cn(
                        "w-full rounded-md px-2 py-2 text-left text-sm transition-colors hover:bg-accent",
                        product?.id === p.id && "bg-accent font-semibold",
                      )}
                    >
                      <span className="block truncate">{p.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">{p.brand || p.category || "—"}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <div className="min-w-0 space-y-6">
            {!product ? null : obs.length === 0 ? (
              <Panel title={product.name}>
                <p className="py-8 text-center text-sm text-muted-foreground">
                  Nenhuma compra ativa registrada para este produto ainda.
                </p>
              </Panel>
            ) : (
              <>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  <StatCard
                    label="Último custo"
                    value={formatUnitCost(stats.last?.normalizedUnitCost, base)}
                    hint={stats.last ? `em ${formatDate(stats.last.date)}` : undefined}
                  />
                  <StatCard
                    label="Variação última compra"
                    value={formatPercent(stats.changePct)}
                    tone={(stats.changePct ?? 0) > 0 ? "destructive" : "success"}
                    hint={stats.previous ? `antes: ${formatUnitCost(stats.previous.normalizedUnitCost, base)}` : "primeira compra"}
                  />
                  <StatCard
                    label="Melhor preço"
                    value={formatUnitCost(stats.min?.normalizedUnitCost, base)}
                    tone="success"
                    hint={stats.min ? formatDate(stats.min.date) : undefined}
                  />
                  <StatCard
                    label="Pior preço"
                    value={formatUnitCost(stats.max?.normalizedUnitCost, base)}
                    tone="destructive"
                    hint={stats.max ? formatDate(stats.max.date) : undefined}
                  />
                  <StatCard
                    label="Total gasto"
                    value={formatMoney(stats.totalSpent)}
                    hint={`${formatNumber(stats.totalPackages, 0)} embalagens em ${stats.count} compra${stats.count === 1 ? "" : "s"}`}
                  />
                  <StatCard
                    label="Embalagem atual"
                    value={formatNumber(product.contentQuantity, 2)}
                    hint={`${product.contentUnit} por ${product.packagingUnit} · ${formatUnitCost(
                      stats.last ? stats.last.standardPackageCost : null,
                      product.packagingUnit,
                    )}`}
                  />
                </div>

                <Panel
                  title="Preço médio por mês"
                  description="Média ponderada pela quantidade comprada. Meses sem compra ficam em branco."
                >
                  <div className="flex h-40 items-stretch gap-1.5 overflow-x-auto pb-1">
                    {months.map((m) => {
                      const max = Math.max(...months.map((x) => x.avgNormalized ?? 0), 1);
                      const pct = m.avgNormalized ? Math.max(3, ((m.avgNormalized - (stats.min?.normalizedUnitCost ?? 0)) / Math.max(max - (stats.min?.normalizedUnitCost ?? 0), 0.0001)) * 90 + 8) : 0;
                      return (
                        <div key={m.month} className="flex min-w-9 flex-1 flex-col items-center">
                          <div className="flex w-full flex-1 items-end">
                            <div
                              className={cn("w-full rounded-t-md", m.avgNormalized === null ? "bg-muted" : "bg-primary")}
                              style={{ height: `${pct}%` }}
                              title={
                                m.avgNormalized === null
                                  ? `${monthLabel(m.month)}: sem compras`
                                  : `${monthLabel(m.month)}: ${formatMoney(m.avgNormalized)}/${base}`
                              }
                            />
                          </div>
                          <span className="mt-2 text-[0.65rem] text-muted-foreground numeric">{monthLabel(m.month)}</span>
                        </div>
                      );
                    })}
                  </div>
                </Panel>

                <Panel title="Histórico de compras" description="Cada linha é uma compra ativa deste produto.">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Data</TableHead>
                          <TableHead>Fornecedor</TableHead>
                          <TableHead className="text-right">Embalagens</TableHead>
                          <TableHead className="text-right">Conteúdo</TableHead>
                          <TableHead className="text-right">Custo/embalagem</TableHead>
                          <TableHead className="text-right">Custo/{base}</TableHead>
                          <TableHead className="text-right">Variação</TableHead>
                          <TableHead className="text-right">Total</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {obs.map((o, i) => {
                          const prev = i > 0 ? obs[i - 1] : null;
                          const delta = prev
                            ? ((o.normalizedUnitCost - prev.normalizedUnitCost) / prev.normalizedUnitCost) * 100
                            : null;
                          return (
                            <TableRow key={o.itemId}>
                              <TableCell className="numeric">{formatDate(o.date)}</TableCell>
                              <TableCell className="font-medium">{o.supplier || "Sem fornecedor"}</TableCell>
                              <TableCell className="text-right numeric">{formatNumber(o.packageQuantity, 2)}</TableCell>
                              <TableCell className="text-right numeric">{o.packageContentLabel}</TableCell>
                              <TableCell className="text-right numeric">{formatMoney(o.packageCost)}</TableCell>
                              <TableCell className="text-right numeric">{formatMoney(o.normalizedUnitCost)}</TableCell>
                              <TableCell className="text-right">
                                {delta === null ? (
                                  <span className="text-muted-foreground">—</span>
                                ) : (
                                  <StatusPill tone={delta > 0 ? "destructive" : "success"}>{formatPercent(delta)}</StatusPill>
                                )}
                              </TableCell>
                              <TableCell className="text-right numeric">{formatMoney(o.effectiveTotal)}</TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </Panel>
              </>
            )}

            <Panel title="Produtos que mais mudaram de preço" description="Comparação entre a última e a penúltima compra de cada produto.">
              {movers.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  Registre duas compras do mesmo produto para ver a variação.
                </p>
              ) : (
                <ul className="divide-y">
                  {movers.map((m) => (
                    <li key={m.product.id} className="flex items-center justify-between gap-3 py-2.5">
                      <button
                        className="min-w-0 text-left"
                        onClick={() => setSelectedId(m.product.id)}
                      >
                        <span className="block truncate text-sm font-medium">{m.product.name}</span>
                        <span className="block text-xs text-muted-foreground numeric">
                          {formatUnitCost(m.stats.previous?.normalizedUnitCost, baseUnitOf(m.product.contentUnit))} →{" "}
                          {formatUnitCost(m.stats.last?.normalizedUnitCost, baseUnitOf(m.product.contentUnit))}
                        </span>
                      </button>
                      <span
                        className={cn(
                          "flex shrink-0 items-center gap-1 text-sm font-semibold numeric",
                          (m.change ?? 0) > 0 ? "text-destructive" : "text-success",
                        )}
                      >
                        {(m.change ?? 0) > 0 ? <TrendingUp className="size-4" /> : <TrendingDown className="size-4" />}
                        {formatPercent(m.change)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>
        </div>
      )}
    </>
  );
}
