import type { JsonObject } from "../../contracts/src/index.js";

export interface PricingContext {
  itemCode: string;
  qtyMicros: number;
  postingDate: string;
  priceList: string;
  documentCurrency: string;
  uom?: string;
  /**
   * Optional commercial variant of an Item Price. Missing/blank means STANDARD so
   * existing Price List + Item + UOM records remain backward-compatible.
   */
  priceVariant?: string;
  /**
   * Existing callers default to true. New commercial composition may request the raw
   * Item Price so discount/adjustment authorities are applied exactly once downstream.
   */
  applyPricingRules?: boolean;
  partyType?: "Customer" | "Supplier";
  party?: string;
  customerGroup?: string;
  supplierGroup?: string;
}

export interface ResolvedPrice extends JsonObject {
  rate_minor: number;
  rate: string;
  currency: string;
  currency_scale: number;
  item_price: string;
  /** Canonical variant selected by the server (STANDARD when legacy data has no field). */
  price_variant: string;
  pricing_rule?: string;
  discount_percentage?: string;
}