import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { AlertTriangle, DatabaseBackup, Download, Plus, Trash2, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ConfirmDialog,
  Field,
  PageHeader,
  Panel,
  SelectField,
  StatusPill,
  save,
} from "@/components/common";
import { commit, emptyDB, getLoadError, replaceAll, useDB } from "@/lib/storage/db";
import { formatDateTime, formatNumber } from "@/lib/calculations/money";
import { exportBackup, parseBackup, readFileAsText, restoreBackup } from "@/lib/services/backup";
import type { DB } from "@/types";

const TITLE = "Configurações e backup";
const DESCRIPTION =
  "Ajuste as listas usadas nos cadastros, a quantidade de linhas das tabelas e mantenha uma cópia de segurança dos dados do estúdio.";

export const Route = createFileRoute("/configuracoes")({
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
  component: SettingsPage,
});

function SettingsPage() {
  const db = useDB();
  const loadError = getLoadError();
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(db.settings.businessName);
  const [newCategory, setNewCategory] = useState("");
  const [newPackaging, setNewPackaging] = useState("");
  const [incoming, setIncoming] = useState<{ text: string; preview: DB } | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [wiping, setWiping] = useState(false);
  const [wipeWord, setWipeWord] = useState("");

  function pickFile(file: File) {
    setImportError(null);
    void readFileAsText(file)
      .then((text) => {
        const preview = parseBackup(text);
        setIncoming({ text, preview });
      })
      .catch((e: unknown) => setImportError(e instanceof Error ? e.message : "Não foi possível ler o arquivo."));
  }

  const counts: { label: string; value: number }[] = [
    { label: "Produtos", value: db.products.length },
    { label: "Compras", value: db.purchases.length },
    { label: "Itens de compra", value: db.purchaseItems.length },
    { label: "Movimentações", value: db.movements.length },
    { label: "Procedimentos", value: db.procedures.length },
    { label: "Atendimentos", value: db.sessions.length },
  ];

  return (
    <>
      <PageHeader title={TITLE} description={DESCRIPTION} />

      {loadError ? (
        <p className="mb-6 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          {loadError} Importe um backup abaixo para recuperar os dados.
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Identificação" description="Aparece no topo do sistema.">
          <div className="grid gap-4">
            <Field label="Nome do estúdio">
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Meu Estúdio" />
            </Field>
            <Field label="Linhas por página" hint="Vale para as tabelas de produtos, compras e atendimentos.">
              <SelectField
                value={String(db.settings.pageSize)}
                onChange={(v) => save((d) => ({ db: { ...d, settings: { ...d.settings, pageSize: Number(v) } } }), "Tamanho de página atualizado")}
                options={[10, 25, 50, 100].map((n) => ({ value: String(n), label: `${n} linhas` }))}
              />
            </Field>
            <div>
              <Button
                onClick={() =>
                  save((d) => ({ db: { ...d, settings: { ...d.settings, businessName: name.trim() || "Meu Estúdio" } } }), "Nome atualizado")
                }
              >
                Salvar identificação
              </Button>
            </div>
          </div>
        </Panel>

        <Panel title="Backup dos dados" description="Uma cópia em arquivo com tudo o que está salvo neste navegador.">
          <div className="grid gap-4">
            <p className="text-sm text-muted-foreground">
              Último backup:{" "}
              <span className="font-medium text-foreground">{db.settings.lastBackupAt ? formatDateTime(db.settings.lastBackupAt) : "nunca"}</span>
            </p>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => exportBackup(db)}>
                <Download className="size-4" />
                Exportar backup
              </Button>
              <Button variant="outline" onClick={() => fileRef.current?.click()}>
                <Upload className="size-4" />
                Importar backup
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) pickFile(file);
                  e.target.value = "";
                }}
              />
            </div>
            {importError ? (
              <p className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                {importError}
              </p>
            ) : null}
            <p className="flex items-start gap-2 rounded-lg bg-muted/50 px-3 py-2.5 text-xs text-muted-foreground">
              <DatabaseBackup className="mt-0.5 size-3.5 shrink-0" />
              Guarde o arquivo em um lugar seguro. Ao importar, os dados atuais são substituídos, mas uma cópia de
              segurança é guardada antes.
            </p>
          </div>
        </Panel>

        <Panel title="Categorias" description="Lista usada no cadastro de produtos.">
          <div className="mb-3 flex gap-2">
            <Input
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              placeholder="Nova categoria"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const v = newCategory.trim();
                  if (v && !db.settings.categories.includes(v)) {
                    save((d) => ({ db: { ...d, settings: { ...d.settings, categories: [...d.settings.categories, v] } } }), "Categoria adicionada");
                    setNewCategory("");
                  }
                }
              }}
            />
            <Button
              onClick={() => {
                const v = newCategory.trim();
                if (!v || db.settings.categories.includes(v)) return;
                save((d) => ({ db: { ...d, settings: { ...d.settings, categories: [...d.settings.categories, v] } } }), "Categoria adicionada");
                setNewCategory("");
              }}
            >
              <Plus className="size-4" />
              Adicionar
            </Button>
          </div>
          <ul className="flex flex-wrap gap-2">
            {db.settings.categories.map((c) => (
              <li key={c}>
                <button
                  onClick={() =>
                    save(
                      (d) => ({ db: { ...d, settings: { ...d.settings, categories: d.settings.categories.filter((x) => x !== c) } } }),
                      "Categoria removida",
                    )
                  }
                  className="inline-flex items-center gap-1.5 rounded-full border bg-card px-3 py-1 text-sm hover:border-destructive/40 hover:text-destructive"
                >
                  {c}
                  <Trash2 className="size-3" />
                </button>
              </li>
            ))}
            {db.settings.categories.length === 0 ? <li className="text-sm text-muted-foreground">Nenhuma categoria.</li> : null}
          </ul>
        </Panel>

        <Panel title="Unidades de controle" description="Como você conta as embalagens: frasco, pote, pacote…">
          <div className="mb-3 flex gap-2">
            <Input
              value={newPackaging}
              onChange={(e) => setNewPackaging(e.target.value)}
              placeholder="Nova unidade"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const v = newPackaging.trim();
                  if (v && !db.settings.packagingUnits.includes(v)) {
                    save((d) => ({ db: { ...d, settings: { ...d.settings, packagingUnits: [...d.settings.packagingUnits, v] } } }), "Unidade adicionada");
                    setNewPackaging("");
                  }
                }
              }}
            />
            <Button
              onClick={() => {
                const v = newPackaging.trim();
                if (!v || db.settings.packagingUnits.includes(v)) return;
                save((d) => ({ db: { ...d, settings: { ...d.settings, packagingUnits: [...d.settings.packagingUnits, v] } } }), "Unidade adicionada");
                setNewPackaging("");
              }}
            >
              <Plus className="size-4" />
              Adicionar
            </Button>
          </div>
          <ul className="flex flex-wrap gap-2">
            {db.settings.packagingUnits.map((c) => (
              <li key={c}>
                <button
                  onClick={() =>
                    save(
                      (d) => ({ db: { ...d, settings: { ...d.settings, packagingUnits: d.settings.packagingUnits.filter((x) => x !== c) } } }),
                      "Unidade removida",
                    )
                  }
                  className="inline-flex items-center gap-1.5 rounded-full border bg-card px-3 py-1 text-sm hover:border-destructive/40 hover:text-destructive"
                >
                  {c}
                  <Trash2 className="size-3" />
                </button>
              </li>
            ))}
            {db.settings.packagingUnits.length === 0 ? <li className="text-sm text-muted-foreground">Nenhuma unidade.</li> : null}
          </ul>
        </Panel>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Panel title="Como os dados são guardados" description="Nada é enviado para fora do navegador.">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Registro</TableHead>
                <TableHead className="text-right">Quantidade</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {counts.map((c) => (
                <TableRow key={c.label}>
                  <TableCell className="font-medium">{c.label}</TableCell>
                  <TableCell className="text-right numeric">{formatNumber(c.value, 0)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <p className="mt-3 text-xs text-muted-foreground">
            O estoque nunca é digitado: ele é sempre o resultado das movimentações (compras, atendimentos e ajustes).
          </p>
        </Panel>

        <Panel title="Zona de risco" description="Ações que não podem ser desfeitas.">
          <p className="text-sm text-muted-foreground">
            Apaga produtos, compras, atendimentos e ajustes deste navegador. Exporte um backup antes.
          </p>
          <div className="mt-3">
            <Button variant="destructive" onClick={() => setWiping(true)}>
              <Trash2 className="size-4" />
              Apagar todos os dados
            </Button>
          </div>
        </Panel>
      </div>

      <ConfirmDialog
        open={incoming !== null}
        onOpenChange={(o) => (o ? undefined : setIncoming(null))}
        title="Importar backup"
        description={
          incoming
            ? `O arquivo tem ${incoming.preview.products.length} produto(s), ${incoming.preview.purchases.length} compra(s) e ${incoming.preview.sessions.length} atendimento(s). Isso substitui os dados atuais.`
            : undefined
        }
        confirmLabel="Importar e substituir"
        tone="destructive"
        onConfirm={() => {
          if (!incoming) return;
          try {
            restoreBackup(incoming.text);
            setIncoming(null);
          } catch (e) {
            setImportError(e instanceof Error ? e.message : "Falha ao importar.");
            setIncoming(null);
          }
        }}
      />

      <ConfirmDialog
        open={wiping}
        onOpenChange={(o) => {
          if (!o) {
            setWiping(false);
            setWipeWord("");
          }
        }}
        title="Apagar todos os dados"
        description="Digite APAGAR para confirmar. Os dados do estúdio serão removidos deste navegador."
        confirmLabel="Apagar tudo"
        tone="destructive"
        onConfirm={() => {
          if (wipeWord.trim().toUpperCase() !== "APAGAR") return;
          replaceAll({ ...emptyDB(), settings: { ...db.settings, lastBackupAt: db.settings.lastBackupAt } });
          setWiping(false);
          setWipeWord("");
        }}
      >
        <Field label="Confirmação">
          <Input value={wipeWord} onChange={(e) => setWipeWord(e.target.value)} placeholder="APAGAR" />
        </Field>
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <StatusPill tone="warning">Sem volta</StatusPill>
          Esta ação não pode ser desfeita sem um backup.
        </p>
      </ConfirmDialog>
    </>
  );
}
