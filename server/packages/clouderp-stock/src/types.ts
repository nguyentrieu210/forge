import type { JsonObject } from "../../contracts/src/index.js";
import type { DecimalInput } from "../../money/src/index.js";

export interface SerialBatchBundleRow extends JsonObject {
  row_id: string;
  qty: DecimalInput;
  qty_micros?: number;
  serial_no?: string;
  batch_no?: string;
}

export interface SerialBatchBundleData extends JsonObject {
  item_code: string;
  warehouse: string;
  type: "Inward" | "Outward";
  posting_at: string;
  entries: SerialBatchBundleRow[];
  total_qty?: string;
  total_qty_micros?: number;
}

export interface RepostItemValuationData extends JsonObject {
  company: string;
  item_code: string;
  warehouse: string;
  posting_at: string;
  stock_account: string;
  difference_account: string;
  valuation_method?: "FIFO" | "Moving Average";
  current_stock_value_minor?: number;
  expected_stock_value_minor?: number;
  adjustment_minor?: number;
  currency?: string;
  currency_scale?: number;
}
