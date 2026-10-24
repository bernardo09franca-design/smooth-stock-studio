import { useSyncExternalStore } from "react";
import type { DB, Settings } from "@/types";
import { dbSchema } from "@/lib/validation/schemas";

/*
 * Centralized persistence layer. The whole dataset lives under ONE localStorage key
 * so every operation is written atomically (one setItem). Screens never touch
 * localStorage directly: they read via useDB() and write via commit().
 * To migrate to a remote database later, replace load/persist with an adapter.
 */

export const STORAGE_KEY = "estudio-produtos:db";
export const SCHEMA_VERSION = 1;

export const DEFAULT_CATEGORIES = ["Cera", "Pré-depilação", "Pós-depilação", "Descartáveis", "Higienização", "Tratamentos", "Outros"];
export const DEFAULT_PACKAGING = ["frasco", "embalagem", "pacote", "pote", "caixa", "rolo", "unidade", "bisnaga", "refil"];

export function defaultSettings(): Settings {
  return {
    businessName: "Meu Estúdio",
    currency: "BRL",
    schemaVersion: SCHEMA_VERSION,
    categories: [...DEFAULT_CATEGORIES],
    packagingUnits: [...DEFAULT_PACKAGING],
    pageSize: 25,
    lastBackupAt: null,
    onboardingDismissed: false,
  };
}

export function emptyDB(): DB {
  return {
    schemaVersion: SCHEMA_VERSION,
    settings: defaultSettings(),
    products: [],
    purchases: [],
    purchaseItems: [],
    movements: [],
    procedures: [],
    recipeItems: [],
    sessions: [],
    consumptionItems: [],
    processedSubmissions: [],
  };
}

/** Migrates older/partial shapes into the current schema. Throws when unusable. */
export function migrate(raw: unknown): DB {
  if (!raw || typeof raw !== "object") throw new Error("Estrutura de dados inválida.");
  const r = raw as Partial<DB>;
  const version = typeof r.schemaVersion === "number" ? r.schemaVersion : 0;
  if (version > SCHEMA_VERSION) throw new Error(`Versão de dados (${version}) mais nova que a suportada (${SCHEMA_VERSION}).`);
  const base = emptyDB();
  const merged = {
    ...base,
    ...r,
    schemaVersion: SCHEMA_VERSION,
    settings: { ...base.settings, ...(r.settings ?? {}), schemaVersion: SCHEMA_VERSION },
  };
  const parsed = dbSchema.safeParse(merged);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new Error(`Dados inválidos em "${issue.path.join(".")}": ${issue.message}`);
  }
  return parsed.data as DB;
}

let state: DB = emptyDB();
let loaded = false;
let loadError: string | null = null;
const listeners = new Set<() => void>();
const SERVER_SNAPSHOT = emptyDB();

function loadOnce() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) state = migrate(JSON.parse(raw));
  } catch (e) {
    // Never wipe storage on error: keep the raw copy and work in memory read-only-ish.
    loadError = e instanceof Error ? e.message : "Falha ao ler os dados salvos.";
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) window.localStorage.setItem(`${STORAGE_KEY}:corrompido:${Date.now()}`, raw);
    } catch {
      /* ignore */
    }
  }
}

export function getLoadError() {
  loadOnce();
  return loadError;
}

export function getDB(): DB {
  loadOnce();
  return state;
}

function persist(next: DB) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch (e) {
    const quota = e instanceof DOMException && (e.name === "QuotaExceededError" || e.code === 22);
    throw new Error(
      quota
        ? "Espaço de armazenamento do navegador esgotado. Exporte um backup e libere espaço."
        : "Não foi possível salvar os dados no navegador.",
    );
  }
}

/**
 * Applies a pure transformation and persists it atomically.
 * If the transform throws or saving fails, the previous state is kept intact.
 */
export function commit<T = void>(fn: (db: DB) => { db: DB; result?: T }): T | undefined {
  loadOnce();
  if (loadError) throw new Error("Os dados salvos não puderam ser lidos. Restaure um backup em Configurações antes de continuar.");
  const { db: next, result } = fn(state);
  if (next === state) return result;
  persist(next);
  state = next;
  listeners.forEach((l) => l());
  return result;
}

/** Replaces everything (backup restore). Clears a previous load error. */
export function replaceAll(next: DB) {
  persist(next);
  state = next;
  loadError = null;
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY && e.newValue) {
      try {
        state = migrate(JSON.parse(e.newValue));
        listeners.forEach((x) => x());
      } catch {
        /* ignore foreign writes */
      }
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(l);
    window.removeEventListener("storage", onStorage);
  };
}

export function useDB(): DB {
  return useSyncExternalStore(subscribe, getDB, () => SERVER_SNAPSHOT);
}
