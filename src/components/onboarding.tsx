import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ArrowRight, CheckCircle2, DatabaseBackup, Package, ShoppingCart, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { commit, useDB } from "@/lib/storage/db";

const STEPS = [
  {
    icon: Package,
    title: "Cadastre seus produtos",
    text: "Nome, marca, categoria e o conteúdo de cada embalagem (ex.: 500 ml por frasco). Isso permite comparar preços entre embalagens diferentes.",
  },
  {
    icon: ShoppingCart,
    title: "Registre as compras",
    text: "Informe quanto pagou, o desconto e o frete. O sistema calcula o custo real por embalagem e por unidade, e atualiza o estoque.",
  },
  {
    icon: Sparkles,
    title: "Anote os atendimentos",
    text: "Cada procedimento consome insumos. Registre o que foi realmente usado e veja o custo por atendimento e o que está sendo desperdiçado.",
  },
];

export function OnboardingDialog() {
  const db = useDB();
  const navigate = useNavigate();
  const [closed, setClosed] = useState(false);
  const open = !db.settings.onboardingDismissed && !closed;

  function dismiss() {
    commit((current) => ({ db: { ...current, settings: { ...current.settings, onboardingDismissed: true } } }));
    setClosed(true);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? undefined : dismiss())}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-2xl">Bem-vinda ao controle do seu estúdio</DialogTitle>
          <DialogDescription>
            Em poucos minutos você passa a saber o que mais usa, o que mais compra, quanto cada coisa custa e quanto
            consome em cada procedimento.
          </DialogDescription>
        </DialogHeader>

        <ol className="space-y-3">
          {STEPS.map((step, i) => {
            const Icon = step.icon;
            return (
              <li key={step.title} className="flex gap-3 rounded-lg border bg-card p-3">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="size-4" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">
                    {i + 1}. {step.title}
                  </span>
                  <span className="block text-sm text-muted-foreground">{step.text}</span>
                </span>
              </li>
            );
          })}
        </ol>

        <p className="flex items-start gap-2 rounded-lg bg-muted/60 px-3 py-2.5 text-xs text-muted-foreground">
          <DatabaseBackup className="mt-0.5 size-3.5 shrink-0" />
          Tudo fica guardado neste navegador, nada é enviado para fora. Quando o cadastro estiver completo, exporte um
          backup em Configurações para não perder nada.
        </p>

        <DialogFooter className="gap-2 sm:justify-start">
          <Button
            onClick={() => {
              dismiss();
              void navigate({ to: "/produtos" });
            }}
          >
            Cadastrar o primeiro produto
            <ArrowRight className="size-4" />
          </Button>
          <Button variant="ghost" onClick={dismiss}>
            <CheckCircle2 className="size-4" />
            Só dar uma olhada
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
