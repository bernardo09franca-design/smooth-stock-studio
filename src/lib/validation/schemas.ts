import { z } from "zod";

const iso = z.string().min(1);
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "data inválida");
const unit = z.enum(["ml", "l", "g", "kg", "un"]);
const base = z.enum(["ml", "g", "un"]);
const cents = z.number().int("valor monetário deve ser inteiro em centavos");
const num = z.number().finite();

export const productSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  category: z.string(),
  brand: z.string(),
  description: z.string(),
  packagingQuantity: num.positive(),
  packagingUnit: z.string(),
  contentQuantity: num.positive(),
  contentUnit: unit,
  minimumStock: num.min(0),
  defaultSupplier: z.string(),
  notes: z.string(),
  active: z.boolean(),
  createdAt: iso,
  updatedAt: iso,
});

export const dbSchema = z.object({
  schemaVersion: z.number().int(),
  settings: z.object({
    businessName: z.string(),
    currency: z.literal("BRL"),
    schemaVersion: z.number().int(),
    categories: z.array(z.string()),
    packagingUnits: z.array(z.string()),
    pageSize: z.number().int().positive(),
    lastBackupAt: z.string().nullable(),
    onboardingDismissed: z.boolean(),
  }),
  products: z.array(productSchema),
  purchases: z.array(
    z.object({
      id: z.string(),
      purchaseDate: day,
      supplier: z.string(),
      reference: z.string(),
      notes: z.string(),
      shippingCents: cents.min(0),
      totalAmount: cents,
      status: z.enum(["ativa", "cancelada", "corrigida"]),
      replacesId: z.string().optional(),
      replacedById: z.string().optional(),
      createdAt: iso,
      updatedAt: iso,
    }),
  ),
  purchaseItems: z.array(
    z.object({
      id: z.string(),
      purchaseId: z.string(),
      productId: z.string(),
      productNameSnapshot: z.string(),
      packageQuantity: num.positive(),
      contentQuantity: num.positive(),
      contentUnit: unit,
      totalPaid: cents.min(0),
      discount: cents.min(0),
      allocatedShipping: cents.min(0),
      unitCost: num,
      normalizedUnitCost: num,
      baseQuantity: num.positive(),
      createdAt: iso,
    }),
  ),
  movements: z.array(
    z.object({
      id: z.string(),
      productId: z.string(),
      movementType: z.enum(["entrada_compra", "saida_consumo", "ajuste_positivo", "ajuste_negativo", "reversao"]),
      quantity: num,
      unit: base,
      unitCost: num.nullable(),
      movementDate: day,
      sourceType: z.enum(["compra", "atendimento", "ajuste", "estoque_inicial"]),
      sourceId: z.string().nullable(),
      notes: z.string(),
      createdAt: iso,
    }),
  ),
  procedures: z.array(
    z.object({
      id: z.string(),
      name: z.string().min(1),
      description: z.string(),
      estimatedDuration: num.nullable(),
      active: z.boolean(),
      createdAt: iso,
      updatedAt: iso,
    }),
  ),
  recipeItems: z.array(z.object({ id: z.string(), procedureId: z.string(), productId: z.string(), quantity: num.positive(), unit })),
  sessions: z.array(
    z.object({
      id: z.string(),
      procedureId: z.string(),
      procedureNameSnapshot: z.string(),
      sessionDate: day,
      quantity: num.positive(),
      status: z.enum(["confirmado", "cancelado", "corrigido"]),
      notes: z.string(),
      replacesId: z.string().optional(),
      createdAt: iso,
    }),
  ),
  consumptionItems: z.array(
    z.object({
      id: z.string(),
      sessionId: z.string(),
      productId: z.string(),
      quantity: num.min(0),
      estimatedQuantity: num.min(0),
      unit: base,
      unitCostAtConsumption: num.nullable(),
      totalCost: num.nullable(),
    }),
  ),
  processedSubmissions: z.array(z.string()),
});

export const backupSchema = z.object({
  app: z.literal("estudio-produtos"),
  exportedAt: z.string(),
  schemaVersion: z.number().int(),
  data: z.unknown(),
});
