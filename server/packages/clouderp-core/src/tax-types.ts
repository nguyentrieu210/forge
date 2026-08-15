import type { JsonObject } from "../../contracts/src/index.js";
import type { DecimalInput } from "../../money/src/index.js";

export type TaxChargeType = "On Net Total" | "On Previous Row Total" | "Actual" | "On Item Quantity";
export type TaxAddDeduct = "Add" | "Deduct";

export interface TaxRow extends JsonObject {
  row_id: string;
  account: string;
  rate: DecimalInput;
  charge_type?: TaxChargeType;
  included_in_print_rate?: boolean;
  add_deduct_tax?: TaxAddDeduct;
  /** Positive input amount for Actual charge type. Kept separate from signed canonical tax_amount. */
  actual_tax_amount?: DecimalInput;
  /** Signed canonical tax amount after Add/Deduct normalization. */
  tax_amount?: DecimalInput;
  tax_amount_minor?: number;
  total?: string;
  total_minor?: number;
}

