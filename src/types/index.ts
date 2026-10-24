// Domain types. Money is always stored in integer cents (BRL centavos).
// Stock quantities are always stored in the product's BASE unit (ml, g or un).

export type ContentUnit = "ml" | "l" | "g" | "kg" | "un";
export type BaseUnit = "ml" | "g" | "un";

export interface Product {
  id: string;
  name: string;
  category: string;
  brand: string;
  description: string;
  packagingQuantity: number; // packages per purchase unit (usually 1)
  packagingUnit: string; // frasco, pote, pacote, caixa...
  contentQuantity: number; // content per package, in contentUnit
  contentUnit: ContentUnit;
  minimumStock: number; // in packages
  defaultSupplier: string;
  notes: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export type PurchaseStatus = "ativa" | "cancelada" | "corrigida";

export interface Purchase {
  id: string;
  purchaseDate: string; // YYYY-MM-DD
  supplier: string;
  reference: string;
  notes: string;
  shippingCents: number; // extra acquisition costs, distributed proportionally across items
  totalAmount: number; // cents (items net + shipping)
  status: PurchaseStatus;
  replacesId?: string;
  replacedById?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PurchaseItem {
  id: string;
  purchaseId: string;
  productId: string;
  productNameSnapshot: string;
  packageQuantity: number; // packages bought
  contentQuantity: number; // content per package (in contentUnit)
  contentUnit: ContentUnit;
  totalPaid: number; // cents, gross for this item
  discount: number; // cents
  allocatedShipping: number; // cents
  unitCost: number; // cents per package (net + shipping share)
  normalizedUnitCost: number; // cents per base unit (fractional allowed)
  baseQuantity: number; // total content in base unit
  createdAt: string;
}

export type MovementType = "entrada_compra" | "saida_consumo" | "ajuste_positivo" | "ajuste_negativo" | "reversao";
export type MovementSource = "compra" | "atendimento" | "ajuste" | "estoque_inicial";

export interface StockMovement {
  id: string;
  productId: string;
  movementType: MovementType;
  quantity: number; // signed, base unit
  unit: BaseUnit;
  unitCost: number | null; // cents per base unit, when known
  movementDate: string; // YYYY-MM-DD
  sourceType: MovementSource;
  sourceId: string | null;
  notes: string;
  createdAt: string;
}

export interface Procedure {
  id: string;
  name: string;
  description: string;
  estimatedDuration: number | null; // minutes
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProcedureRecipeItem {
  id: string;
  procedureId: string;
  productId: string;
  quantity: number;
  unit: ContentUnit;
}

export type SessionStatus = "confirmado" | "cancelado" | "corrigido";

export interface ServiceSession {
  id: string;
  procedureId: string;
  procedureNameSnapshot: string;
  sessionDate: string;
  quantity: number;
  status: SessionStatus;
  notes: string;
  replacesId?: string;
  createdAt: string;
}

export interface ServiceConsumptionItem {
  id: string;
  sessionId: string;
  productId: string;
  quantity: number; // base unit, total for the session
  estimatedQuantity: number; // base unit, from recipe × quantity
  unit: BaseUnit;
  unitCostAtConsumption: number | null; // cents per base unit
  totalCost: number | null; // cents
}

export interface Settings {
  businessName: string;
  currency: "BRL";
  schemaVersion: number;
  categories: string[];
  packagingUnits: string[];
  pageSize: number;
  lastBackupAt: string | null;
  onboardingDismissed: boolean;
}

export interface DB {
  schemaVersion: number;
  settings: Settings;
  products: Product[];
  purchases: Purchase[];
  purchaseItems: PurchaseItem[];
  movements: StockMovement[];
  procedures: Procedure[];
  recipeItems: ProcedureRecipeItem[];
  sessions: ServiceSession[];
  consumptionItems: ServiceConsumptionItem[];
  processedSubmissions: string[]; // idempotency keys
}
