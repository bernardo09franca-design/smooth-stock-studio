import type { ContentUnit } from "@/types";
import { allocateCents } from "./money";
import { toBase } from "./units";

export interface PurchaseItemInput {
  packageQuantity: number;
  contentQuantity: number;
  contentUnit: ContentUnit;
  totalPaid: number; // cents
  discount: number; // cents
}

export interface ComputedItem {
  net: number; // cents paid after discount
  allocatedShipping: number; // cents
  effective: number; // net + shipping
  unitCost: number; // cents per package
  baseQuantity: number;
  normalizedUnitCost: number; // cents per base unit
}

/** Pure cost math for purchase items. Shipping is distributed proportionally to each item's net value. */
export function computePurchase(items: PurchaseItemInput[], shippingCents = 0) {
  const nets = items.map((i) => i.totalPaid - i.discount);
  const shares = allocateCents(shippingCents, nets.map((n) => Math.max(n, 0)));
  const computed: ComputedItem[] = items.map((i, idx) => {
    const net = nets[idx];
    const effective = net + shares[idx];
    const baseQuantity = i.packageQuantity * toBase(i.contentQuantity, i.contentUnit);
    return {
      net,
      allocatedShipping: shares[idx],
      effective,
      unitCost: i.packageQuantity > 0 ? effective / i.packageQuantity : 0,
      baseQuantity,
      normalizedUnitCost: baseQuantity > 0 ? effective / baseQuantity : 0,
    };
  });
  const itemsTotal = nets.reduce((a, b) => a + b, 0);
  return { items: computed, itemsTotal, total: itemsTotal + shippingCents };
}
