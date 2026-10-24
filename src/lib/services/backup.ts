import type { DB } from "@/types";
import { backupSchema } from "@/lib/validation/schemas";
import { commit, migrate, replaceAll, SCHEMA_VERSION } from "@/lib/storage/db";

/*
 * Backup = one JSON file with the whole dataset. Import validates the shape
 * before touching anything, and the current data is kept as a safety copy so a
 * bad restore never leaves the studio without its records.
 */

export const BACKUP_APP = "estudio-produtos";

export function buildBackup(db: DB) {
  return {
    app: BACKUP_APP,
    exportedAt: new Date().toISOString(),
    schemaVersion: SCHEMA_VERSION,
    data: db,
  };
}

export function backupFileName(prefix = "backup"): string {
  const d = new Date();
  const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}_${String(
    d.getHours(),
  ).padStart(2, "0")}${String(d.getMinutes()).padStart(2, "0")}`;
  return `${prefix}_${stamp}.json`;
}

export function downloadFile(filename: string, text: string, mime: string) {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportBackup(db: DB): string {
  const json = JSON.stringify(buildBackup(db), null, 2);
  downloadFile(backupFileName(), json, "application/json");
  const at = new Date().toISOString();
  commit((current) => ({ db: { ...current, settings: { ...current.settings, lastBackupAt: at } } }));
  return at;
}

/** Reads a backup file and returns the dataset, without applying it. */
export function parseBackup(text: string): DB {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("O arquivo não é um JSON válido.");
  }
  const parsed = backupSchema.safeParse(raw);
  if (!parsed.success) throw new Error("Este arquivo não é um backup do sistema de produtos.");
  if (parsed.data.app !== BACKUP_APP) throw new Error("Este backup foi gerado por outro sistema.");
  return migrate(parsed.data.data);
}

/** Replaces the whole dataset with the backup content, keeping a safety copy. */
export function restoreBackup(text: string): DB {
  const next = parseBackup(text);
  try {
    const current = JSON.parse(window.localStorage.getItem("estudio-produtos:db") ?? "null");
    if (current) window.localStorage.setItem(`estudio-produtos:pre-restore:${Date.now()}`, JSON.stringify(current));
  } catch {
    /* the safety copy is best-effort */
  }
  replaceAll(next);
  return next;
}

export function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Não foi possível ler o arquivo."));
    reader.readAsText(file, "utf-8");
  });
}
