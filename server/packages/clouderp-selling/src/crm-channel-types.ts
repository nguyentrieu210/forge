import type { JsonObject } from "../../contracts/src/index.js";

export type CrmChannelPartnerType = "Distributor" | "Dealer";
export type CrmChannelPartnerStatus = "Active" | "Inactive";

export interface CrmChannelPartnerData extends JsonObject {
  company: string;
  partner_name: string;
  partner_type: CrmChannelPartnerType;
  customer: string;
  territory?: string | undefined;
  assigned_to?: string | undefined;
  latitude?: string | number | undefined;
  longitude?: string | number | undefined;
  checkin_radius_m?: string | number | undefined;
  status?: CrmChannelPartnerStatus | undefined;
  notes?: string | undefined;
}

export type CrmSalesRouteStatus = "Draft" | "Active" | "Closed";

export interface CrmSalesRouteData extends JsonObject {
  company: string;
  route_name: string;
  salesperson: string;
  territory?: string | undefined;
  start_date: string;
  end_date: string;
  status?: CrmSalesRouteStatus | undefined;
  notes?: string | undefined;
}

export interface CrmSalesRouteStopData extends JsonObject {
  company: string;
  sales_route: string;
  sequence: number;
  partner: string;
  planned_date: string;
  notes?: string | undefined;
}

export type CrmFieldCheckInResult = "Inside Radius" | "Outside Radius" | "Location Unconfigured";

export interface CrmFieldCheckInData extends JsonObject {
  company: string;
  sales_route?: string | undefined;
  route_stop?: string | undefined;
  partner: string;
  salesperson: string;
  checked_in_at?: string | undefined;
  latitude: string | number;
  longitude: string | number;
  distance_m?: string | undefined;
  result?: CrmFieldCheckInResult | undefined;
  crm_activity?: string | undefined;
  notes?: string | undefined;
}

export type CrmSellOutStatus = "Draft" | "Confirmed" | "Cancelled";

export interface CrmSellOutLine extends JsonObject {
  row_id: string;
  item_code: string;
  qty: string | number;
  unit_price: string | number;
  qty_micros?: number | undefined;
  unit_price_minor?: number | undefined;
  amount?: string | undefined;
  amount_minor?: number | undefined;
}

export interface CrmSellOutReportData extends JsonObject {
  company: string;
  partner: string;
  report_date: string;
  currency: string;
  status?: CrmSellOutStatus | undefined;
  lines: CrmSellOutLine[];
  total_amount?: string | undefined;
  total_amount_minor?: number | undefined;
  notes?: string | undefined;
}
