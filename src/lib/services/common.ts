import type { DB } from "@/types";

export class ValidationError extends Error {}

export function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Idempotency: a form submission key may be processed only once. */
export function alreadyProcessed(db: DB, key: string | undefined): boolean {
  return !!key && db.processedSubmissions.includes(key);
}

export function markProcessed(db: DB, key: string | undefined): string[] {
  if (!key) return db.processedSubmissions;
  // keep the list bounded
  return [...db.processedSubmissions.slice(-2000), key];
}

export function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new ValidationError(msg);
}

export function isPositive(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n) && n > 0;
}
