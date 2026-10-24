import { useState, type ReactNode } from "react";
import { Link, useHydrated, useRouterState } from "@tanstack/react-router";
import {
  ClipboardList,
  LayoutDashboard,
  Package,
  Settings,
  ShoppingCart,
  Sparkles,
  TrendingUp,
  Menu,
  ShieldCheck,
} from "lucide-react";

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useDB } from "@/lib/storage/db";
import { stockByProduct, stockStatus } from "@/lib/calculations/stock";
import { cn } from "@/lib/utils";

type RoutePath = "/" | "/produtos" | "/compras" | "/precos" | "/procedimentos" | "/consumo" | "/configuracoes";

const NAV: { to: RoutePath; label: string; icon: typeof Package; hint: string }[] = [
  { to: "/", label: "Visão geral", icon: LayoutDashboard, hint: "Resumo do estúdio" },
  { to: "/produtos", label: "Produtos e estoque", icon: Package, hint: "Cadastro, saldo e ajustes" },
  { to: "/compras", label: "Compras", icon: ShoppingCart, hint: "Entradas e histórico" },
  { to: "/precos", label: "Análise de preços", icon: TrendingUp, hint: "Variação por produto" },
  { to: "/procedimentos", label: "Procedimentos", icon: Sparkles, hint: "Fichas e insumos" },
  { to: "/consumo", label: "Atendimentos", icon: ClipboardList, hint: "Consumo registrado" },
  { to: "/configuracoes", label: "Configurações", icon: Settings, hint: "Backup e categorias" },
];

function isActive(pathname: string, to: RoutePath): boolean {
  return to === "/" ? pathname === "/" : pathname === to || pathname.startsWith(`${to}/`);
}

function NavList({ pathname, lowStock }: { pathname: string; lowStock: number }) {
  return (
    <nav className="space-y-1">
      {NAV.map((item) => {
        const active = isActive(pathname, item.to);
        const Icon = item.icon;
        return (
          <Link
            key={item.to}
            to={item.to}
            className={cn(
              "group flex items-start gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors",
              active
                ? "bg-sidebar-accent font-semibold text-sidebar-accent-foreground"
                : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
            )}
          >
            <Icon className={cn("mt-0.5 size-4 shrink-0", active ? "text-primary" : "text-muted-foreground")} />
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2">
                {item.label}
                {item.to === "/produtos" && lowStock > 0 ? (
                  <span className="rounded-full bg-warning px-1.5 py-0.5 text-[0.65rem] leading-none font-semibold text-warning-foreground numeric">
                    {lowStock}
                  </span>
                ) : null}
              </span>
              <span className="block truncate text-xs font-normal text-muted-foreground">{item.hint}</span>
            </span>
          </Link>
        );
      })}
    </nav>
  );
}

function Brand({ name }: { name: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-soft">
        <Sparkles className="size-4" />
      </span>
      <span className="min-w-0">
        <span className="font-display block truncate text-base leading-tight font-semibold">{name}</span>
        <span className="block truncate text-xs text-muted-foreground">Produtos e consumo</span>
      </span>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const hydrated = useHydrated();
  const db = useDB();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [open, setOpen] = useState(false);

  const businessName = hydrated ? db.settings.businessName : "Meu Estúdio";
  const stock = stockByProduct(db);
  const lowStock = hydrated
    ? db.products.filter((p) => {
        if (!p.active) return false;
        const status = stockStatus(p, stock.get(p.id)?.quantity ?? 0);
        return status !== "ok";
      }).length
    : 0;

  return (
    <div className="min-h-screen bg-background lg:grid lg:grid-cols-[18rem_minmax(0,1fr)]">
      <aside className="sticky top-0 hidden h-screen flex-col border-r border-sidebar-border bg-sidebar px-4 py-6 lg:flex">
        <div className="px-2">
          <Brand name={businessName} />
        </div>
        <div className="mt-8 min-h-0 flex-1 overflow-y-auto">
          <NavList pathname={pathname} lowStock={lowStock} />
        </div>
        <p className="mt-6 flex items-start gap-2 rounded-lg bg-sidebar-accent/60 px-3 py-2.5 text-xs text-sidebar-foreground/80">
          <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-primary" />
          Seus dados ficam salvos neste navegador. Faça backup em Configurações.
        </p>
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b bg-background/95 px-4 py-3 backdrop-blur lg:hidden">
          <Brand name={businessName} />
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger className="inline-flex size-9 items-center justify-center rounded-lg border bg-card text-foreground shadow-soft">
              <Menu className="size-4" />
              <span className="sr-only">Abrir menu</span>
            </SheetTrigger>
            <SheetContent side="right" className="w-[19rem] bg-sidebar p-0">
              <SheetHeader className="border-b px-4 py-4 text-left">
                <SheetTitle className="font-display text-base">{businessName}</SheetTitle>
                <SheetDescription className="text-xs">Navegação do sistema</SheetDescription>
              </SheetHeader>
              <div className="px-3 py-4">
                <NavList pathname={pathname} lowStock={lowStock} />
              </div>
            </SheetContent>
          </Sheet>
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-9">{children}</main>
      </div>
    </div>
  );
}
