import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { AlertTriangle, ArrowRight, Plus, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  BarRow,
  EmptyState,
  PageHeader,
  Panel,
  PeriodSelect,
  StatCard,
  StatusPill,
} from "@/components/common";
import { OnboardingDialog } from "@/components/onboarding";
import { useDB } from "@/lib/storage/db";
import { monthLabel, periodStart, todayISO, type PeriodKey } from "@/lib/calculations/dates";
import { formatMoney, formatNumber, formatPercent } from "@/lib/calculations/money";
import { formatDate } from "@/lib/calculations/dates";
import {
  dashboardKpis,
  monthlyTotals,
  priceMovers,
  procedureUsage,
  productViews,
  purchaseRows,
  spendingBySupplier,
} from "@/lib/selectors";

const TITLE = "Visão geral do estúdio";
const DESCRIPTION =
  "Gastos em compras, valor em estoque, custo de consumo por procedimento e produtos que precisam de atenção, em uma só tela.";

export const Route = createFileRoute("/")({
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
  component: Dashboard,
});

const SEVERITY = { negativo: 0, sem_estoque: 1, baixo: 2, ok: 3 } as const;

function Dashboard() {
  const db = useDB();
  const [period, setPeriod] = useState<PeriodKey>("3m");
  const from = periodStart(period);
  const to = todayISO();

  const kpis = dashboardKpis(db, from, to);
  const views = productViews(db, from, to);
  const months = monthlyTotals(db, from, to).slice(-12);
  const maxSpent = Math.max(...months.map((m) => m.spent), 1);
  const attention = views
    .filter((v) => v.product.active && v.status !== "ok")
    .sort((a, b) => SEVERITY[a.status] - SEVERITY[b.status] || a.product.name.localeCompare(b.product.name, "pt-BR"));
  const topConsumed = views
    .filter((v) => v.consumed.cost > 0)
    .sort((a, b) => b.consumed.cost - a.consumed.cost)
    .slice(0, 6);
  const suppliers = spendingBySupplier(db, from, to, 6);
  const procedures = procedureUsage(db, from, to).slice(0, 6);
  const movers = priceMovers(db, 4);
  const purchases = purchaseRows(db).slice(0, 5);
  const sessions = db.sessions
    .filter((s) => s.status === "confirmado")
    .sort((a, b) => b.sessionDate.localeCompare(a.sessionDate))
    .slice(0, 5);

  const alerts = kpis.lowStock + kpis.noStock + kpis.negativeStock;

  return (
    <>
      <OnboardingDialog />
      <PageHeader
        title={TITLE}
        description="O resumo do estúdio: o que foi comprado, quanto está parado em estoque e quanto cada atendimento consome."
        actions={
          <>
            <PeriodSelect value={period} onChange={setPeriod} />
            <Button asChild>
              <Link to="/compras" search={{ new: "1" }}>
                <Plus className="size-4" />
                Nova compra
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to="/consumo" search={{ new: "1" }}>
                <Plus className="size-4" />
                Atendimento
              </Link>
            </Button>
          </>
        }
      />

      {db.products.length === 0 ? (
        <EmptyState
          title="Comece cadastrando seus produtos"
          description="Cadastre os produtos que você usa no estúdio. Depois registre as compras e os atendimentos: o resto do sistema se monta a partir desses cadastros."
          action={
            <>
              <Button asChild>
                <Link to="/produtos" search={{ new: "1" }}>
                  Cadastrar produto
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
              <Button variant="outline" asChild>
                <Link to="/configuracoes">Organizar categorias</Link>
              </Button>
            </>
          }
        />
      ) : (
        <div className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <StatCard
              label="Gastos em compras"
              value={formatMoney(kpis.spent)}
              hint={`${kpis.purchases} compra${kpis.purchases === 1 ? "" : "s"} no período`}
            />
            <StatCard
              label="Valor parado em estoque"
              value={formatMoney(kpis.stockValue)}
              hint={`${kpis.activeProducts} produto${kpis.activeProducts === 1 ? "" : "s"} ativo${kpis.activeProducts === 1 ? "" : "s"}`}
            />
            <StatCard
              label="Custo do consumo"
              value={formatMoney(kpis.consumptionCost)}
              hint={
                kpis.consumptionUnknown > 0
                  ? `${kpis.consumptionUnknown} lançamento(s) sem custo conhecido`
                  : "todos os itens com custo conhecido"
              }
            />
            <StatCard
              label="Custo médio por atendimento"
              value={formatMoney(kpis.costPerAttendance)}
              hint={`${formatNumber(kpis.attendanceCount)} atendimento${kpis.attendanceCount === 1 ? "" : "s"}`}
            />
            <StatCard
              label="Alertas de estoque"
              value={String(alerts)}
              tone={alerts > 0 ? "warning" : "success"}
              hint={
                alerts > 0
                  ? `${kpis.lowStock} baixo · ${kpis.noStock} sem estoque · ${kpis.negativeStock} negativo`
                  : "nenhum produto precisando de atenção"
              }
            />
            {movers[0] ? (
              <StatCard
                label="Maior variação de preço"
                value={formatPercent(movers[0].change)}
                tone={(movers[0].change ?? 0) > 0 ? "destructive" : "success"}
                hint={`${movers[0].product.name} · último ${formatMoney(movers[0].stats.last?.normalizedUnitCost)}`}
              />
            ) : (
              <StatCard label="Maior variação de preço" value="—" hint="registre duas compras para comparar" />
            )}
          </div>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
            <Panel
              title="Compras por mês"
              description="Quanto foi gasto em cada mês, considerando apenas compras ativas."
            >
              {months.every((m) => m.spent === 0) ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  Nenhuma compra registrada neste período.
                </p>
              ) : (
                <>
                  <div className="flex h-44 items-stretch gap-1.5 overflow-x-auto pb-1">
                    {months.map((m) => {
                      const pct = maxSpent > 0 ? Math.max(2, (m.spent / maxSpent) * 100) : 2;
                      return (
                        <div key={m.month} className="flex min-w-9 flex-1 flex-col items-center">
                          <div className="flex w-full flex-1 items-end">
                            <div
                              className="w-full rounded-t-md bg-primary"
                              style={{ height: `${pct}%` }}
                              title={`${monthLabel(m.month)}: ${formatMoney(m.spent)}`}
                            />
                          </div>
                          <span className="mt-2 text-[0.65rem] text-muted-foreground numeric">{monthLabel(m.month)}</span>
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2 text-xs text-muted-foreground">
                    <StatusPill tone="muted">
                      Total do período: {formatMoney(months.reduce((a, m) => a + m.spent, 0))}
                    </StatusPill>
                    <StatusPill tone="muted">
                      Média mensal: {formatMoney(months.length ? months.reduce((a, m) => a + m.spent, 0) / months.length : 0)}
                    </StatusPill>
                  </div>
                </>
              )}
            </Panel>

            <Panel
              title="Precisa de atenção"
              description="Produtos ativos no limite, zerados ou com saldo negativo."
              action={
                <Button variant="ghost" size="sm" asChild>
                  <Link to="/produtos">
                    Ver produtos
                    <ArrowRight className="size-4" />
                  </Link>
                </Button>
              }
            >
              {attention.length === 0 ? (
                <p className="flex items-center gap-2 rounded-lg bg-success-soft px-3 py-4 text-sm text-success">
                  <Sparkles className="size-4" />
                  Nenhum produto abaixo do estoque mínimo.
                </p>
              ) : (
                <ul className="divide-y">
                  {attention.slice(0, 6).map((v) => (
                    <li key={v.product.id} className="flex items-center justify-between gap-3 py-2.5">
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{v.product.name}</span>
                        <span className="block text-xs text-muted-foreground numeric">
                          {formatNumber(v.packages)} {v.product.packagingUnit} · mínimo{" "}
                          {formatNumber(v.product.minimumStock)}
                        </span>
                      </span>
                      <StatusPill tone={v.status === "negativo" ? "destructive" : "warning"}>
                        {v.status === "negativo" ? "Negativo" : v.status === "sem_estoque" ? "Sem estoque" : "Baixo"}
                      </StatusPill>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Panel title="Consumo por produto" description="Custo do que foi efetivamente usado nos atendimentos do período.">
              {topConsumed.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">Nenhum atendimento registrado no período.</p>
              ) : (
                <div className="space-y-1">
                  {topConsumed.map((v) => (
                    <BarRow
                      key={v.product.id}
                      label={v.product.name}
                      detail={formatMoney(v.consumed.cost)}
                      value={v.consumed.cost}
                      max={topConsumed[0]!.consumed.cost}
                    />
                  ))}
                </div>
              )}
            </Panel>

            <Panel title="Onde o dinheiro foi" description="Compras do período separadas por fornecedor.">
              {suppliers.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">Nenhuma compra no período.</p>
              ) : (
                <div className="space-y-1">
                  {suppliers.map((s) => (
                    <BarRow
                      key={s.key}
                      label={s.label}
                      detail={formatMoney(s.total)}
                      value={s.total}
                      max={suppliers[0]!.total}
                      tone="success"
                    />
                  ))}
                </div>
              )}
            </Panel>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Panel
              title="Procedimentos mais feitos"
              description="Quantidade de atendimentos confirmados no período."
              action={
                <Button variant="ghost" size="sm" asChild>
                  <Link to="/procedimentos">
                    Ver fichas
                    <ArrowRight className="size-4" />
                  </Link>
                </Button>
              }
            >
              {procedures.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">Nenhum atendimento confirmado no período.</p>
              ) : (
                <div className="space-y-1">
                  {procedures.map((p) => (
                    <BarRow
                      key={p.procedureId}
                      label={p.name}
                      detail={`${formatNumber(p.attendances)} atend.`}
                      value={p.attendances}
                      max={procedures[0]!.attendances}
                      tone="warning"
                    />
                  ))}
                </div>
              )}
            </Panel>

            <Panel title="Preços que mudaram" description="Comparação entre a última e a penúltima compra de cada produto.">
              {movers.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  Cadastre ao menos duas compras do mesmo produto para ver a variação.
                </p>
              ) : (
                <ul className="divide-y">
                  {movers.map((m) => (
                    <li key={m.product.id} className="flex items-center justify-between gap-3 py-2.5">
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{m.product.name}</span>
                        <span className="block text-xs text-muted-foreground numeric">
                          {formatMoney(m.stats.previous?.normalizedUnitCost)} → {formatMoney(m.stats.last?.normalizedUnitCost)}
                        </span>
                      </span>
                      <StatusPill tone={(m.change ?? 0) > 0 ? "destructive" : "success"}>{formatPercent(m.change)}</StatusPill>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Panel
              title="Últimas compras"
              action={
                <Button variant="ghost" size="sm" asChild>
                  <Link to="/compras">
                    Ver todas
                    <ArrowRight className="size-4" />
                  </Link>
                </Button>
              }
            >
              {purchases.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">Nenhuma compra registrada ainda.</p>
              ) : (
                <ul className="divide-y">
                  {purchases.map((r) => (
                    <li key={r.purchase.id} className="flex items-center justify-between gap-3 py-2.5">
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">
                          {r.purchase.supplier || "Sem fornecedor"}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {formatDate(r.purchase.purchaseDate)} · {r.items.length} item{r.items.length === 1 ? "" : "s"}
                        </span>
                      </span>
                      <span className="shrink-0 text-sm font-semibold numeric">{formatMoney(r.purchase.totalAmount)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            <Panel
              title="Últimos atendimentos"
              action={
                <Button variant="ghost" size="sm" asChild>
                  <Link to="/consumo">
                    Ver todos
                    <ArrowRight className="size-4" />
                  </Link>
                </Button>
              }
            >
              {sessions.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">Nenhum atendimento registrado ainda.</p>
              ) : (
                <ul className="divide-y">
                  {sessions.map((s) => (
                    <li key={s.id} className="flex items-center justify-between gap-3 py-2.5">
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{s.procedureNameSnapshot}</span>
                        <span className="block text-xs text-muted-foreground">{formatDate(s.sessionDate)}</span>
                      </span>
                      <StatusPill tone="muted">
                        {formatNumber(s.quantity)} atend.
                      </StatusPill>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>

          {kpis.negativeStock > 0 ? (
            <p className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm text-destructive">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              Existem produtos com saldo negativo. Isso acontece quando o consumo registrado foi maior do que a entrada
             已知. Revise as compras ou faça um ajuste de estoque em Produtos.
            </p>
          ) : null}
        </div>
      )}
    </>
  );
}
